import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
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

/**
 * Cierra una recorrida SOLO si está terminada y no le queda nada por subir.
 * Así "terminar" sin señal nunca borra datos: la cabecera queda en el outbox
 * esperando y se limpia sola cuando el drenado completa. Si era la activa,
 * además suelta el puntero y el cache de potreros.
 */
async function cerrarSiCorresponde(recorridaId: string): Promise<void> {
  const s = await recdb.recorridas.get(recorridaId)
  if (!s?.terminada) return
  if (await debeAlgo(s)) return
  const puntero = await recdb.meta.get('actual')
  await recdb.transaction(
    'rw',
    recdb.meta,
    recdb.recorridas,
    recdb.potreros,
    recdb.outbox,
    async () => {
      await recdb.outbox.where('recorrida_id').equals(recorridaId).delete()
      await recdb.recorridas.delete(recorridaId)
      if (puntero?.recorrida_id === recorridaId) {
        await recdb.meta.put({ id: 'actual', recorrida_id: null })
        await recdb.potreros.clear()
      }
    },
  )
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

export function useRecorrida() {
  const online = useOnline()
  // Con toArray() distinguimos "cargando" (undefined) de "sin recorrida" ([]);
  // .get() devuelve undefined en ambos casos y dejaría "Cargando…" pegado.
  const punteroArr = useLiveQuery(() => recdb.meta.toArray(), [])
  const sesiones = useLiveQuery(() => recdb.recorridas.toArray(), [])
  const potreros = useLiveQuery(() => recdb.potreros.toArray(), [])
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
  // `empezar` dispara el sync pero se declara antes que `sincronizar` → ref.
  const sincronizarRef = useRef<(() => Promise<void>) | null>(null)

  /** Refresca el cache de campos+potreros (permite arrancar sin señal). */
  const cargarRefs = useCallback(async () => {
    try {
      const { campos, potreros: ps } = await fetchRefs()
      await recdb.refs.put({ id: 'refs', campos, potreros: ps, updated_at: Date.now() })
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudieron cargar los campos',
      )
    }
  }, [])

  /**
   * Empezar la recorrida de hoy de un campo — 100% local (anda sin señal):
   * UUID de cliente + potreros del cache. La fila `recorrida` remota NO se
   * crea acá: recién nace cuando hay una observación que subir (antes se creaba
   * al elegir el campo, y por eso prod juntó 9 recorridas con cero registros).
   *
   * Si había otra recorrida abierta, se la marca terminada para que drene sola;
   * si no llegó a registrar nada, se descarta sin dejar rastro. Lo que quedó
   * sin subir NUNCA se toca — vive en el outbox, no en la sesión.
   */
  const empezar = useCallback(
    async (campo: CampoRec) => {
      setIniciando(true)
      setError(null)
      try {
        const ps = (refs?.potreros ?? []).filter(
          (p) => p.campo_id === campo.id,
        )
        const previa = await recdb.meta.get('actual')
        const previaId = previa?.recorrida_id ?? null
        const nuevaId = crypto.randomUUID()
        await recdb.transaction(
          'rw',
          recdb.meta,
          recdb.recorridas,
          recdb.potreros,
          recdb.outbox,
          async () => {
            if (previaId) {
              const quedaAlgo = await recdb.outbox
                .where('recorrida_id')
                .equals(previaId)
                .count()
              const s = await recdb.recorridas.get(previaId)
              const lluviaPend = s != null && s.lluvia_mm != null && !s.lluvia_ok
              if (quedaAlgo === 0 && !lluviaPend) {
                // Recorrida fantasma (se abrió y no se registró nada).
                await recdb.recorridas.delete(previaId)
              } else {
                await recdb.recorridas.update(previaId, { terminada: 1 })
              }
            }
            await recdb.potreros.clear()
            await recdb.recorridas.put({
              recorrida_id: nuevaId,
              campo_id: campo.id,
              campo_nombre: campo.nombre,
              empresa_id: campo.empresa_id,
              fecha: new Date().toISOString().slice(0, 10),
              lluvia_mm: null,
              lluvia_ok: 0,
              terminada: 0,
              remota: 0,
            })
            await recdb.meta.put({ id: 'actual', recorrida_id: nuevaId })
            await recdb.potreros.bulkPut(
              ps.map((p) => ({
                id: p.id,
                campo_id: campo.id,
                nombre: p.nombre,
                estado_ciclo: p.estado_ciclo,
                cabezas: p.cabezas,
                poligono: p.poligono,
                ultima: p.ultima,
                hecho: 0 as const,
              })),
            )
          },
        )
        void sincronizarRef.current?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo empezar la recorrida')
      } finally {
        setIniciando(false)
      }
    },
    [refs],
  )

  /**
   * Drena TODAS las recorridas con algo pendiente — no solo la activa. Eso es
   * lo que permite arrancar otro campo sin señal sin dejar huérfano lo anterior.
   * Serializado por el lock de módulo; idempotente (upsert por potrero) con
   * compare-and-set en updated_at.
   */
  const sincronizar = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) return
    // Ya hay un drenado en curso: pedile que reintente y esperá a que termine.
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
            // Solo las que deben algo: una recorrida abierta sin observaciones
            // no crea fila remota (fin de las recorridas fantasma).
            if (!(await debeAlgo(s))) {
              await cerrarSiCorresponde(s.recorrida_id)
              continue
            }

            // Paso 0: la fila `recorrida` tiene que existir en el servidor antes
            // de subir observaciones (FK). Si se arrancó offline, acá se crea —
            // o se adopta la de (campo, fecha) si otro dispositivo la abrió.
            if (!s.remota) {
              try {
                const idRemoto = await asegurarRecorridaRemota(s)
                if (idRemoto !== s.recorrida_id) {
                  // Re-apuntar cabecera, observaciones y puntero a la adoptada.
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
                      await recdb.recorridas.put({
                        ...s,
                        recorrida_id: idRemoto,
                        remota: 1,
                      })
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
                // Sin recorrida remota no se puede subir nada: se reintenta en
                // el próximo drenado (p. ej. al volver la señal de verdad).
                continue
              }
            }

            const pend = (await pendientesDe(s.recorrida_id)).filter(
              (o) => o.estado === 'pendiente',
            )
            for (const it of pend) {
              const snap = it.updated_at
              try {
                // Nota de voz: sube ANTES del upsert (el registro apunta al path).
                let audioPath = it.audio_path
                if (it.audio && !it.audio_subido) {
                  audioPath = pathAudio(
                    s.empresa_id,
                    s.recorrida_id,
                    it.potrero_id,
                    it.audio.type,
                  )
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
                // Solo marcar sincronizada si nadie editó la fila mientras subía;
                // si cambió, queda pendiente y el rerun la vuelve a subir (fresca).
                const actual = await recdb.outbox.get([s.recorrida_id, it.potrero_id])
                if (actual && actual.updated_at === snap) {
                  await recdb.outbox.update([s.recorrida_id, it.potrero_id], {
                    estado: 'sincronizada',
                    error: null,
                    audio: null, // ya está en storage; no acumular blobs locales
                  })
                }
              } catch (e) {
                await recdb.outbox.update([s.recorrida_id, it.potrero_id], {
                  estado: 'error',
                  error: e instanceof Error ? e.message : 'Error al subir',
                })
              }
            }

            // Lluvia (si se cargó y falta subir)
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
                /* reintenta en el próximo drenado */
              }
            }

            // Si ya estaba terminada y este drenado subió lo último, cierra.
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

  // Ref al drenado para `empezar` (declarado antes). Asignación en effect (el
  // lint prohíbe escribir refs durante el render); `empezar` corre por click,
  // siempre después del mount.
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

  // Reconciliación TOTAL de la sesión en curso con los refs frescos (spec
  // sync Oficina→Campo): lo que cambia en Oficina impacta en la recorrida
  // abierta — el croquis nunca miente. Lo cargado por el productor (obs,
  // hecho, audio) no se toca jamás.
  const refsStamp = refs?.updated_at ?? 0
  const metaId = meta?.recorrida_id
  useEffect(() => {
    if (!metaId || !refsStamp) return
    const t = setTimeout(() => {
      void (async () => {
        const puntero = await recdb.meta.get('actual')
        const m = puntero?.recorrida_id
          ? await recdb.recorridas.get(puntero.recorrida_id)
          : null
        const refsRow = await recdb.refs.get('refs')
        if (!m || !refsRow) return
        const delCampo = refsRow.potreros.filter((p) => p.campo_id === m.campo_id)
        const porId = new Map(delCampo.map((p) => [p.id, p]))
        const sesion = await recdb.potreros.toArray()
        const enSesion = new Set(sesion.map((p) => p.id))

        for (const p of sesion) {
          const ref = porId.get(p.id)
          if (ref) {
            // Pisar lo que Oficina cambió (nombre / polígono / cabezas /
            // ciclo); completar `ultima` si faltaba.
            const patch: Partial<typeof p> = {}
            if (p.nombre !== ref.nombre) patch.nombre = ref.nombre
            if (JSON.stringify(p.poligono) !== JSON.stringify(ref.poligono)) {
              patch.poligono = ref.poligono
            }
            if (p.cabezas !== ref.cabezas) patch.cabezas = ref.cabezas
            if (p.estado_ciclo !== ref.estado_ciclo) {
              patch.estado_ciclo = ref.estado_ciclo
            }
            if (p.ultima === undefined && ref.ultima) patch.ultima = ref.ultima
            if (p.eliminado) patch.eliminado = 0
            if (Object.keys(patch).length > 0) {
              await recdb.potreros.update(p.id, patch)
            }
          } else {
            // Eliminado en Oficina: sin observación local se saca; con
            // observación se conserva marcado (nada se pierde en silencio).
            const obsLocal = await recdb.outbox.get([m.recorrida_id, p.id])
            if (!obsLocal) await recdb.potreros.delete(p.id)
            else if (!p.eliminado) {
              await recdb.potreros.update(p.id, { eliminado: 1 })
            }
          }
        }
        // Nuevos en Oficina: se suman a la recorrida en curso (hecho = 0).
        for (const ref of delCampo) {
          if (!enSesion.has(ref.id)) {
            await recdb.potreros.put({
              id: ref.id,
              campo_id: m.campo_id,
              nombre: ref.nombre,
              estado_ciclo: ref.estado_ciclo,
              cabezas: ref.cabezas,
              poligono: ref.poligono,
              ultima: ref.ultima,
              eliminado: 0,
              hecho: 0,
            })
          }
        }
      })()
    }, 0)
    return () => clearTimeout(t)
  }, [metaId, refsStamp])

  // Refresco por oportunidad (spec sync): además de mount+online, cuando la
  // app vuelve al frente (el productor la tuvo minimizada en el campo).
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

  /** Guarda (local) la observación de un potrero y lo marca hecho. La nota
   *  de voz NO viaja acá (ver setAudio): se preserva la de la fila existente. */
  const guardar = useCallback(
    async (potreroId: string, o: Omit<Observacion, 'potrero_id' | 'audio_url'>) => {
      const puntero = await recdb.meta.get('actual')
      const rid = puntero?.recorrida_id
      if (!rid) return
      const m = await recdb.recorridas.get(rid)
      if (!m) return
      const previa = await recdb.outbox.get([rid, potreroId])
      await recdb.outbox.put({
        potrero_id: potreroId,
        recorrida_id: rid,
        empresa_id: m.empresa_id,
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
      await recdb.potreros.update(potreroId, { hecho: 1 })
      void sincronizar()
    },
    [sincronizar],
  )

  /** Nota de voz del potrero: setea (Blob) o borra (null). Crea la observación
   *  si todavía no existía (grabar audio ya cuenta como "recorrido"). */
  const setAudio = useCallback(
    async (potreroId: string, blob: Blob | null) => {
      const puntero = await recdb.meta.get('actual')
      const rid = puntero?.recorrida_id
      if (!rid) return
      const m = await recdb.recorridas.get(rid)
      if (!m) return
      const previa = await recdb.outbox.get([rid, potreroId])
      await recdb.outbox.put({
        potrero_id: potreroId,
        recorrida_id: rid,
        empresa_id: m.empresa_id,
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
      await recdb.potreros.update(potreroId, { hecho: 1 })
      void sincronizar()
    },
    [sincronizar],
  )

  const setLluvia = useCallback(
    async (mm: number | null) => {
      const puntero = await recdb.meta.get('actual')
      if (!puntero?.recorrida_id) return
      await recdb.recorridas.update(puntero.recorrida_id, {
        lluvia_mm: mm,
        lluvia_ok: 0,
      })
      void sincronizar()
    },
    [sincronizar],
  )

  /**
   * Pausar: deja la recorrida ABIERTA y suelta la pantalla. Es lo que hace el
   * botón de volver — irse a cargar un gasto o a la veterinaria no puede
   * cerrar la jornada. El landing la ofrece para retomar.
   */
  const pausar = useCallback(async () => {
    await sincronizar()
  }, [sincronizar])

  /**
   * Terminar: acto explícito. Marca la recorrida como terminada e intenta
   * drenar. La cabecera se borra SOLO cuando todo subió (cerrarSiCorresponde);
   * si no hay señal, queda en el outbox — nunca se pierde una observación por
   * terminar sin señal, y se puede arrancar otro campo igual.
   */
  const terminar = useCallback(async () => {
    const puntero = await recdb.meta.get('actual')
    const rid = puntero?.recorrida_id
    if (!rid) return
    await recdb.recorridas.update(rid, { terminada: 1 })
    // Soltar la pantalla al toque: lo pendiente vive en el outbox y avisa
    // desde el chip, sin bloquear (spec del ciclo de la jornada).
    await recdb.meta.put({ id: 'actual', recorrida_id: null })
    await recdb.potreros.clear()
    await sincronizar()
    await cerrarSiCorresponde(rid)
  }, [sincronizar])

  /** Descarta SOLO las observaciones que el servidor rechazó (estado error),
   *  a pedido explícito del usuario, y cierra las sesiones que ya no deben nada. */
  const descartarErrores = useCallback(async () => {
    const errs = await recdb.outbox.where('estado').equals('error').toArray()
    await recdb.outbox.bulkDelete(
      errs.map((e) => [e.recorrida_id, e.potrero_id] as [string, string]),
    )
    for (const s of await recdb.recorridas.toArray()) {
      await cerrarSiCorresponde(s.recorrida_id)
    }
  }, [])

  // Derivados
  // Orden NATURAL: 1A, 2A, … 10A (numeric evita que "10A" quede antes que
  // "1A" por comparación de texto). Tira y croquis derivan de esta lista →
  // siempre sincronizados entre sí.
  const listaPotreros = (potreros ?? []).slice().sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }),
  )
  const todoElOutbox = outbox ?? []
  const delActivo = activaId
    ? todoElOutbox.filter((o) => o.recorrida_id === activaId)
    : []
  const obsPorPotrero = new Map(delActivo.map((o) => [o.potrero_id, o]))
  const hechos = listaPotreros.filter((p) => p.hecho === 1).length
  const total = listaPotreros.length
  // Pendientes de TODAS las recorridas (incluidas las ya terminadas que
  // esperan señal) — es lo que muestra el chip "N sin subir".
  const sinSubir = todoElOutbox.filter((o) => o.estado === 'pendiente').length
  const errores = todoElOutbox.filter((o) => o.estado === 'error')
  const lluviaPendiente = (sesiones ?? []).some(
    (s) => s.lluvia_mm != null && !s.lluvia_ok,
  )
  const cargando =
    punteroArr === undefined || sesiones === undefined || refsArr === undefined

  return {
    online,
    cargando,
    iniciando,
    sincronizando,
    error,
    /** Campos del cache (refs): disponibles también sin señal. */
    campos: refs?.campos ?? [],
    /** Potreros cacheados de toda la empresa (para avisar si falta el croquis). */
    potrerosRef: refs?.potreros ?? [],
    /** false = nunca se cachearon campos (y sin señal no se puede empezar). */
    tieneRefs: refs !== null && (refs.campos.length > 0),
    /** Timestamp del último refresco de refs (frescura del cache). */
    refsActualizado: refs?.updated_at ?? null,
    meta,
    potreros: listaPotreros,
    obsPorPotrero,
    hechos,
    total,
    sinSubir,
    errores,
    lluviaPendiente,
    empezar,
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
