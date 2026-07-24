import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { recdb, type RecObs, type RecPotrero, type RecSesion } from './db'
import {
  asegurarRecorridaRemota,
  fetchRefs,
  guardarLluvia,
  guardarObservacion,
  pathAudio,
  subirAudio,
  type CampoRec,
  type Observacion,
} from './api'

// Lock a nivel módulo: un solo drenado a la vez (cliente único). `rerun` reintenta
// si llegó trabajo nuevo mientras drenaba; `drainPromise` deja que el que llega
// tarde (p. ej. `terminar`) espere el drenado en curso. Serializa de verdad —
// el estado de React se actualiza async y no sirve como candado.
let draining = false
let rerun = false
let drainPromise: Promise<void> | null = null

/** Observaciones de una recorrida que todavía le deben algo al servidor. */
async function pendientesDe(recorridaId: string): Promise<RecObs[]> {
  return recdb.outbox
    .where('recorrida_id')
    .equals(recorridaId)
    .filter((o) => o.estado !== 'sincronizada')
    .toArray()
}

/** ¿Esta recorrida tiene algo sin subir (observaciones o lluvia)? */
async function debeAlgo(s: RecSesion): Promise<boolean> {
  if (s.lluvia_mm != null && !s.lluvia_ok) return true
  return (await pendientesDe(s.recorrida_id)).length > 0
}

/** ¿Recorrida ABIERTA sin registrar nada (fantasma)? Se abrió y se salió sin
 *  tocar un potrero ni cargar lluvia. No merece quedar en la lista de abiertas. */
async function esFantasma(recorridaId: string): Promise<boolean> {
  const s = await recdb.recorridas.get(recorridaId)
  if (!s || s.terminada) return false
  const obs = await recdb.outbox.where('recorrida_id').equals(recorridaId).count()
  const lluviaPend = s.lluvia_mm != null && !s.lluvia_ok
  return obs === 0 && !lluviaPend
}

/** Borra la recorrida si es fantasma. Devuelve true si la borró. */
async function limpiarSiFantasma(recorridaId: string): Promise<boolean> {
  if (!(await esFantasma(recorridaId))) return false
  await recdb.recorridas.delete(recorridaId)
  return true
}

/**
 * Cierra una recorrida SOLO si está terminada y no le queda nada por subir.
 * Así "terminar" sin señal nunca borra datos: la cabecera queda en el outbox
 * esperando y se limpia sola cuando el drenado completa. Si era la activa,
 * además suelta el puntero.
 */
async function cerrarSiCorresponde(recorridaId: string): Promise<void> {
  const s = await recdb.recorridas.get(recorridaId)
  if (!s?.terminada) return
  if (await debeAlgo(s)) return
  const puntero = await recdb.meta.get('actual')
  await recdb.transaction('rw', recdb.meta, recdb.recorridas, recdb.outbox, async () => {
    await recdb.outbox.where('recorrida_id').equals(recorridaId).delete()
    await recdb.recorridas.delete(recorridaId)
    if (puntero?.recorrida_id === recorridaId) {
      await recdb.meta.put({ id: 'actual', recorrida_id: null })
    }
  })
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

/** Orden natural 1A, 2A … 10A (numeric evita que "10A" quede antes que "1A"). */
const ordenNatural = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })

export function useRecorrida() {
  const online = useOnline()
  // Con toArray() distinguimos "cargando" (undefined) de "vacío" ([]).
  const punteroArr = useLiveQuery(() => recdb.meta.toArray(), [])
  const sesiones = useLiveQuery(() => recdb.recorridas.toArray(), [])
  const outbox = useLiveQuery(() => recdb.outbox.toArray(), [])
  const refsArr = useLiveQuery(() => recdb.refs.toArray(), [])
  const activaId = punteroArr?.[0]?.recorrida_id ?? null
  const meta =
    (activaId ? (sesiones ?? []).find((s) => s.recorrida_id === activaId) : null) ??
    null
  const refs = refsArr?.[0] ?? null

  const [iniciando, setIniciando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sincronizarRef = useRef<(() => Promise<void>) | null>(null)

  /** Refresca el cache de campos+potreros (permite arrancar sin señal). */
  const cargarRefs = useCallback(async () => {
    try {
      const { campos, potreros: ps } = await fetchRefs()
      await recdb.refs.put({ id: 'refs', campos, potreros: ps, updated_at: Date.now() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los campos')
    }
  }, [])

  /**
   * Mueve el puntero a otra recorrida (o a null = hub). Antes de irse, si la que
   * dejamos era fantasma (0 obs, sin lluvia), la borra — así abrir un campo y no
   * hacer nada no deja recorridas vacías dando vueltas.
   */
  const irARecorrida = useCallback(async (rid: string | null) => {
    const prev = (await recdb.meta.get('actual'))?.recorrida_id ?? null
    if (prev && prev !== rid) await limpiarSiFantasma(prev)
    await recdb.meta.put({ id: 'actual', recorrida_id: rid })
  }, [])

  /**
   * Empezar/retomar la recorrida de un campo. Si ya hay una ABIERTA para ese
   * campo, la retoma (mueve el puntero) — NO crea otra ni pisa nada. Si no,
   * crea una nueva. Las OTRAS recorridas abiertas quedan pausadas, intactas:
   * el productor recorre varios campos cercanos en la misma salida y salta
   * entre ellos sin perder progreso (cada campo deriva su avance del outbox).
   *
   * La fila `recorrida` remota NO se crea acá: nace cuando hay una observación
   * que subir (evita recorridas fantasma con cero registros en el server).
   */
  const empezar = useCallback(
    async (campo: CampoRec) => {
      setIniciando(true)
      setError(null)
      try {
        const abiertas = await recdb.recorridas.where('terminada').equals(0).toArray()
        const existente = abiertas.find((s) => s.campo_id === campo.id)
        if (existente) {
          await irARecorrida(existente.recorrida_id)
        } else {
          const rid = crypto.randomUUID()
          const prev = (await recdb.meta.get('actual'))?.recorrida_id ?? null
          if (prev) await limpiarSiFantasma(prev)
          await recdb.recorridas.put({
            recorrida_id: rid,
            campo_id: campo.id,
            campo_nombre: campo.nombre,
            empresa_id: campo.empresa_id,
            fecha: hoyISO(),
            lluvia_mm: null,
            lluvia_ok: 0,
            terminada: 0,
            remota: 0,
          })
          await recdb.meta.put({ id: 'actual', recorrida_id: rid })
        }
        void sincronizarRef.current?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo empezar la recorrida')
      } finally {
        setIniciando(false)
      }
    },
    [irARecorrida],
  )

  /** Activar una recorrida abierta ya existente (retomar desde el hub). */
  const activar = useCallback(
    async (recorridaId: string) => {
      await irARecorrida(recorridaId)
    },
    [irARecorrida],
  )

  /**
   * Drena TODAS las recorridas con algo pendiente — no solo la activa. Eso es
   * lo que permite tener varios campos abiertos sin dejar huérfano a ninguno.
   */
  const sincronizar = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) return
    if (draining) {
      rerun = true
      await drainPromise
      return
    }
    const loop = async () => {
      try {
        do {
          rerun = false
          const todas = await recdb.recorridas.toArray()
          for (const s0 of todas) {
            let s = s0
            if (!(await debeAlgo(s))) {
              await cerrarSiCorresponde(s.recorrida_id)
              continue
            }

            // Paso 0: la fila `recorrida` tiene que existir en el server antes
            // de subir observaciones (FK). Si se arrancó offline, acá se crea —
            // o se adopta la de (campo, fecha) si otro dispositivo la abrió.
            if (!s.remota) {
              try {
                const idRemoto = await asegurarRecorridaRemota(s)
                if (idRemoto !== s.recorrida_id) {
                  const viejoId = s.recorrida_id
                  const filas = await recdb.outbox
                    .where('recorrida_id')
                    .equals(viejoId)
                    .toArray()
                  await recdb.transaction(
                    'rw',
                    recdb.meta,
                    recdb.recorridas,
                    recdb.outbox,
                    async () => {
                      await recdb.recorridas.delete(viejoId)
                      await recdb.recorridas.put({ ...s, recorrida_id: idRemoto, remota: 1 })
                      await recdb.outbox.where('recorrida_id').equals(viejoId).delete()
                      await recdb.outbox.bulkPut(
                        filas.map((f) => ({ ...f, recorrida_id: idRemoto })),
                      )
                      const p = await recdb.meta.get('actual')
                      if (p?.recorrida_id === viejoId) {
                        await recdb.meta.put({ id: 'actual', recorrida_id: idRemoto })
                      }
                    },
                  )
                  s = { ...s, recorrida_id: idRemoto, remota: 1 }
                } else {
                  await recdb.recorridas.update(s.recorrida_id, { remota: 1 })
                  s = { ...s, remota: 1 }
                }
              } catch {
                continue
              }
            }

            const pend = (await pendientesDe(s.recorrida_id)).filter(
              (o) => o.estado === 'pendiente',
            )
            for (const it of pend) {
              const snap = it.updated_at
              try {
                let audioPath = it.audio_path
                if (it.audio && !it.audio_subido) {
                  audioPath = pathAudio(s.empresa_id, s.recorrida_id, it.potrero_id, it.audio.type)
                  await subirAudio(audioPath, it.audio)
                  await recdb.outbox.update([s.recorrida_id, it.potrero_id], {
                    audio_subido: 1,
                    audio_path: audioPath,
                  })
                }
                await guardarObservacion({
                  recorridaId: s.recorrida_id,
                  empresaId: s.empresa_id,
                  obs: {
                    potrero_id: it.potrero_id,
                    pasto: it.pasto,
                    agua: it.agua,
                    electrico: it.electrico,
                    conteo: it.conteo,
                    en_tratamiento: it.en_tratamiento,
                    novedad: it.novedad,
                    cultivo: it.cultivo,
                    audio_url: audioPath,
                  },
                })
                const actual = await recdb.outbox.get([s.recorrida_id, it.potrero_id])
                if (actual && actual.updated_at === snap) {
                  await recdb.outbox.update([s.recorrida_id, it.potrero_id], {
                    estado: 'sincronizada',
                    error: null,
                    audio: null,
                  })
                }
              } catch (e) {
                await recdb.outbox.update([s.recorrida_id, it.potrero_id], {
                  estado: 'error',
                  error: e instanceof Error ? e.message : 'Error al subir',
                })
              }
            }

            const sL = await recdb.recorridas.get(s.recorrida_id)
            if (sL && sL.lluvia_mm != null && !sL.lluvia_ok) {
              try {
                await guardarLluvia({
                  campoId: sL.campo_id,
                  empresaId: sL.empresa_id,
                  mm: sL.lluvia_mm,
                })
                await recdb.recorridas.update(sL.recorrida_id, { lluvia_ok: 1 })
              } catch {
                /* reintenta */
              }
            }

            await cerrarSiCorresponde(s.recorrida_id)
          }
        } while (rerun)
      } finally {
        draining = false
        drainPromise = null
        setSincronizando(false)
      }
    }
    draining = true
    setSincronizando(true)
    drainPromise = loop()
    await drainPromise
  }, [])

  useEffect(() => {
    sincronizarRef.current = sincronizar
  }, [sincronizar])

  // Al (re)entrar con señal: refrescar el cache de campos/potreros y drenar.
  useEffect(() => {
    if (!online) return
    const t = setTimeout(() => {
      void cargarRefs()
      void sincronizar()
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // Refresco por oportunidad: cuando la app vuelve al frente (la tuvo minimizada
  // en el campo). La reconciliación Oficina→Campo ya es automática: la lista de
  // potreros se DERIVA de refs, así que un refresh de refs la actualiza sola.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void cargarRefs()
        void sincronizar()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Guarda (local) la observación de un potrero. `hecho` no se escribe: se
   *  deriva de la existencia de esta fila en el outbox. La nota de voz NO viaja
   *  acá (ver setAudio): se preserva la de la fila existente. */
  const guardar = useCallback(
    async (potreroId: string, o: Omit<Observacion, 'potrero_id' | 'audio_url'>) => {
      const rid = (await recdb.meta.get('actual'))?.recorrida_id
      if (!rid) return
      const m = await recdb.recorridas.get(rid)
      if (!m) return
      const previa = await recdb.outbox.get([rid, potreroId])
      const nombre =
        (refs?.potreros ?? []).find((p) => p.id === potreroId)?.nombre ??
        previa?.potrero_nombre
      await recdb.outbox.put({
        potrero_id: potreroId,
        recorrida_id: rid,
        empresa_id: m.empresa_id,
        potrero_nombre: nombre,
        pasto: o.pasto,
        agua: o.agua,
        electrico: o.electrico,
        conteo: o.conteo,
        en_tratamiento: o.en_tratamiento,
        novedad: o.novedad,
        cultivo: o.cultivo,
        audio: previa?.audio ?? null,
        audio_path: previa?.audio_path ?? null,
        audio_subido: previa?.audio_subido ?? 0,
        estado: 'pendiente',
        error: null,
        updated_at: Date.now(),
      })
      void sincronizar()
    },
    [sincronizar, refs],
  )

  const setAudio = useCallback(
    async (potreroId: string, blob: Blob | null) => {
      const rid = (await recdb.meta.get('actual'))?.recorrida_id
      if (!rid) return
      const m = await recdb.recorridas.get(rid)
      if (!m) return
      const previa = await recdb.outbox.get([rid, potreroId])
      const nombre =
        (refs?.potreros ?? []).find((p) => p.id === potreroId)?.nombre ??
        previa?.potrero_nombre
      await recdb.outbox.put({
        potrero_id: potreroId,
        recorrida_id: rid,
        empresa_id: m.empresa_id,
        potrero_nombre: nombre,
        pasto: previa?.pasto ?? null,
        agua: previa?.agua ?? null,
        electrico: previa?.electrico ?? null,
        conteo: previa?.conteo ?? null,
        en_tratamiento: previa?.en_tratamiento ?? false,
        novedad: previa?.novedad ?? null,
        cultivo: previa?.cultivo ?? null,
        audio: blob,
        audio_path: null,
        audio_subido: 0,
        estado: 'pendiente',
        error: null,
        updated_at: Date.now(),
      })
      void sincronizar()
    },
    [sincronizar, refs],
  )

  const setLluvia = useCallback(
    async (mm: number | null) => {
      const rid = (await recdb.meta.get('actual'))?.recorrida_id
      if (!rid) return
      await recdb.recorridas.update(rid, { lluvia_mm: mm, lluvia_ok: 0 })
      void sincronizar()
    },
    [sincronizar],
  )

  /** Pausar: deja la recorrida ABIERTA y suelta la pantalla. Si no se registró
   *  nada (fantasma), la limpia y vuelve al hub. */
  const pausar = useCallback(async () => {
    const rid = (await recdb.meta.get('actual'))?.recorrida_id
    if (rid && (await limpiarSiFantasma(rid))) {
      await recdb.meta.put({ id: 'actual', recorrida_id: null })
    }
    await sincronizar()
  }, [sincronizar])

  /** Terminar la recorrida ACTIVA (acto explícito). Las OTRAS abiertas siguen. */
  const terminar = useCallback(async () => {
    const rid = (await recdb.meta.get('actual'))?.recorrida_id
    if (!rid) return
    await recdb.recorridas.update(rid, { terminada: 1 })
    await recdb.meta.put({ id: 'actual', recorrida_id: null })
    await sincronizar()
    await cerrarSiCorresponde(rid)
  }, [sincronizar])

  const descartarErrores = useCallback(async () => {
    const errs = await recdb.outbox.where('estado').equals('error').toArray()
    await recdb.outbox.bulkDelete(
      errs.map((e) => [e.recorrida_id, e.potrero_id] as [string, string]),
    )
    for (const s of await recdb.recorridas.toArray()) {
      await cerrarSiCorresponde(s.recorrida_id)
    }
  }, [])

  // Color IDENTIDAD del campo — LA MISMA paleta que Modo Oficina, asignada por
  // posición en la lista de campos (ambos modos ordenan por nombre). Mismo
  // campo = mismo color en los dos modos: reconocible y armonioso.
  const colorCampo = useCallback(
    (campoId: string) => {
      const c = (refs?.campos ?? []).find((x) => x.id === campoId)
      return colorDeCampo(c?.color_idx ?? 0)
    },
    [refs],
  )

  // ---- Derivados ------------------------------------------------------------
  const todoElOutbox = outbox ?? []
  const delActivo = activaId
    ? todoElOutbox.filter((o) => o.recorrida_id === activaId)
    : []
  const obsPorPotrero = new Map(delActivo.map((o) => [o.potrero_id, o]))

  // Lista de potreros del campo ACTIVO, DERIVADA de refs (nunca un cache viejo)
  // + `hecho` derivado del outbox. Un potrero borrado en Oficina pero con
  // observación local se conserva (eliminado), usando el nombre snapshot.
  const activoCampoId = meta?.campo_id ?? null
  const refPotreros = (refs?.potreros ?? []).filter((p) => p.campo_id === activoCampoId)
  const refIds = new Set(refPotreros.map((p) => p.id))
  const potreros: RecPotrero[] = refPotreros.map((p) => ({
    id: p.id,
    campo_id: activoCampoId!,
    nombre: p.nombre,
    estado_ciclo: p.estado_ciclo,
    cabezas: p.cabezas,
    poligono: p.poligono,
    ultima: p.ultima,
    eliminado: 0,
    hecho: obsPorPotrero.has(p.id) ? 1 : 0,
  }))
  for (const o of delActivo) {
    if (!refIds.has(o.potrero_id)) {
      potreros.push({
        id: o.potrero_id,
        campo_id: activoCampoId ?? '',
        nombre: o.potrero_nombre ?? o.potrero_id,
        estado_ciclo: 'ganadero',
        cabezas: 0,
        poligono: null,
        ultima: null,
        eliminado: 1,
        hecho: 1,
      })
    }
  }
  potreros.sort((a, b) => ordenNatural(a.nombre, b.nombre))

  const hechos = potreros.filter((p) => p.hecho === 1).length
  const total = potreros.length

  // Recorridas ABIERTAS (pausadas o activa) con su avance — para el hub.
  const abiertas = (sesiones ?? [])
    .filter((s) => !s.terminada)
    .map((s) => {
      const totalCampo = (refs?.potreros ?? []).filter((p) => p.campo_id === s.campo_id).length
      const obsIds = new Set(
        todoElOutbox.filter((o) => o.recorrida_id === s.recorrida_id).map((o) => o.potrero_id),
      )
      return {
        recorridaId: s.recorrida_id,
        campoId: s.campo_id,
        campoNombre: s.campo_nombre,
        hechos: obsIds.size,
        total: totalCampo,
        esActiva: s.recorrida_id === activaId,
        color: colorCampo(s.campo_id),
      }
    })
    .sort((a, b) => ordenNatural(a.campoNombre, b.campoNombre))

  const sinSubir = todoElOutbox.filter((o) => o.estado === 'pendiente').length
  const errores = todoElOutbox.filter((o) => o.estado === 'error')
  const lluviaPendiente = (sesiones ?? []).some((s) => s.lluvia_mm != null && !s.lluvia_ok)
  const cargando =
    punteroArr === undefined || sesiones === undefined || refsArr === undefined

  return {
    online,
    cargando,
    iniciando,
    sincronizando,
    error,
    campos: refs?.campos ?? [],
    potrerosRef: refs?.potreros ?? [],
    tieneRefs: refs !== null && refs.campos.length > 0,
    refsActualizado: refs?.updated_at ?? null,
    meta,
    potreros,
    obsPorPotrero,
    hechos,
    total,
    /** Todas las recorridas abiertas (para el hub: pausar/retomar por campo). */
    abiertas,
    /** Color identidad de un campo (misma paleta que Modo Oficina). */
    colorCampo,
    sinSubir,
    errores,
    lluviaPendiente,
    empezar,
    activar,
    guardar,
    setAudio,
    setLluvia,
    pausar,
    terminar,
    descartarErrores,
    sincronizar,
    cargarRefs,
  }
}

export type { RecPotrero, RecObs }
