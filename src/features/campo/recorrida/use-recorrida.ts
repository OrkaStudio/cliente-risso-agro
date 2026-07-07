import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { recdb, type RecObs, type RecPotrero } from './db'
import {
  asegurarRecorridaRemota,
  fetchRefs,
  guardarLluvia,
  guardarObservacion,
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

/**
 * Cierra la sesión local SOLO si la recorrida está terminada y no queda nada
 * por subir (ni observaciones pendientes/con error, ni lluvia). Así "terminar"
 * sin señal nunca borra datos: la sesión queda esperando y se limpia sola
 * cuando el drenado completa.
 */
async function finalizarSiCorresponde(): Promise<void> {
  const m = await recdb.meta.get('actual')
  if (!m?.terminada) return
  const sinSubir = await recdb.obs
    .filter((o) => o.estado !== 'sincronizada')
    .count()
  const lluviaPendiente = m.lluvia_mm != null && !m.lluvia_ok
  if (sinSubir > 0 || lluviaPendiente) return
  await recdb.transaction('rw', recdb.meta, recdb.potreros, recdb.obs, async () => {
    await recdb.meta.clear()
    await recdb.potreros.clear()
    await recdb.obs.clear()
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

export function useRecorrida() {
  const online = useOnline()
  // Con toArray() distinguimos "cargando" (undefined) de "sin recorrida" ([]);
  // .get() devuelve undefined en ambos casos y dejaría "Cargando…" pegado.
  const metaArr = useLiveQuery(() => recdb.meta.toArray(), [])
  const potreros = useLiveQuery(() => recdb.potreros.toArray(), [])
  const obs = useLiveQuery(() => recdb.obs.toArray(), [])
  const refsArr = useLiveQuery(() => recdb.refs.toArray(), [])
  const meta = metaArr?.[0] ?? null
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
   * UUID de cliente + potreros del cache. La fila `recorrida` remota la crea
   * (o adopta, si otro dispositivo ya la abrió hoy) el drenado.
   */
  const empezar = useCallback(
    async (campo: CampoRec) => {
      setIniciando(true)
      setError(null)
      try {
        const ps = (refs?.potreros ?? []).filter(
          (p) => p.campo_id === campo.id,
        )
        await recdb.transaction('rw', recdb.meta, recdb.potreros, recdb.obs, async () => {
          await recdb.potreros.clear()
          await recdb.obs.clear()
          await recdb.meta.put({
            id: 'actual',
            recorrida_id: crypto.randomUUID(),
            campo_id: campo.id,
            campo_nombre: campo.nombre,
            empresa_id: campo.empresa_id,
            fecha: new Date().toISOString().slice(0, 10),
            lluvia_mm: null,
            lluvia_ok: 0,
            terminada: 0,
            remota: 0,
          })
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
        })
        // Con señal, crea/adopta la recorrida remota al toque.
        void sincronizarRef.current?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo empezar la recorrida')
      } finally {
        setIniciando(false)
      }
    },
    [refs],
  )

  // Drena las observaciones pendientes (+ la lluvia). Serializado por el lock de
  // módulo; idempotente (upsert por potrero) con compare-and-set en updated_at.
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
          const m = await recdb.meta.get('actual')
          if (!m) break

          // Paso 0: la fila `recorrida` tiene que existir en el servidor antes
          // de subir observaciones (FK). Si se arrancó offline, acá se crea —
          // o se adopta la de (campo, fecha) si otro dispositivo la abrió.
          if (!m.remota) {
            try {
              const idRemoto = await asegurarRecorridaRemota(m)
              if (idRemoto !== m.recorrida_id) {
                await recdb.meta.update('actual', {
                  recorrida_id: idRemoto,
                  remota: 1,
                })
                // Re-apuntar las observaciones locales a la recorrida adoptada.
                const todas = await recdb.obs.toArray()
                for (const o of todas) {
                  await recdb.obs.update(o.potrero_id, { recorrida_id: idRemoto })
                }
              } else {
                await recdb.meta.update('actual', { remota: 1 })
              }
            } catch {
              // Sin recorrida remota no se puede subir nada: se reintenta en
              // el próximo drenado (p. ej. al volver la señal de verdad).
              break
            }
          }

          const mSync = await recdb.meta.get('actual')
          if (!mSync) break

          const pend = await recdb.obs
            .where('estado')
            .equals('pendiente')
            .toArray()
          for (const it of pend) {
            const snap = it.updated_at
            try {
              await guardarObservacion({
                recorridaId: mSync.recorrida_id,
                empresaId: mSync.empresa_id,
                obs: {
                  potrero_id: it.potrero_id,
                  pasto: it.pasto,
                  agua: it.agua,
                  electrico: it.electrico,
                  conteo: it.conteo,
                  en_tratamiento: it.en_tratamiento,
                  novedad: it.novedad,
                  cultivo: it.cultivo,
                },
              })
              // Solo marcar sincronizada si nadie editó la fila mientras subía;
              // si cambió, queda pendiente y el rerun la vuelve a subir (fresca).
              const actual = await recdb.obs.get(it.potrero_id)
              if (actual && actual.updated_at === snap) {
                await recdb.obs.update(it.potrero_id, {
                  estado: 'sincronizada',
                  error: null,
                })
              }
            } catch (e) {
              await recdb.obs.update(it.potrero_id, {
                estado: 'error',
                error: e instanceof Error ? e.message : 'Error al subir',
              })
            }
          }

          // Lluvia (si se cargó y falta subir)
          const mL = await recdb.meta.get('actual')
          if (mL && mL.lluvia_mm != null && !mL.lluvia_ok) {
            try {
              await guardarLluvia({
                campoId: mL.campo_id,
                empresaId: mL.empresa_id,
                mm: mL.lluvia_mm,
              })
              await recdb.meta.update('actual', { lluvia_ok: 1 })
            } catch {
              /* reintenta en el próximo drenado */
            }
          }
        } while (rerun)
        // Si la recorrida ya estaba terminada y este drenado subió lo último,
        // recién acá se cierra la sesión local.
        await finalizarSiCorresponde()
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

  // Rehidratar polígonos en la sesión en curso: una recorrida arrancada antes
  // de que el cache tuviera `poligono` (o antes de dibujarlos en Oficina) los
  // recibe acá — el croquis aparece sin tener que terminar y volver a empezar.
  const refsStamp = refs?.updated_at ?? 0
  const metaId = meta?.recorrida_id
  useEffect(() => {
    if (!metaId || !refsStamp) return
    const t = setTimeout(() => {
      void (async () => {
        const refsRow = await recdb.refs.get('refs')
        if (!refsRow) return
        const porId = new Map(refsRow.potreros.map((p) => [p.id, p]))
        const sesion = await recdb.potreros.toArray()
        for (const p of sesion) {
          const ref = porId.get(p.id)
          if (!ref) continue
          const patch: Partial<typeof p> = {}
          if (!p.poligono && ref.poligono) patch.poligono = ref.poligono
          if (p.ultima === undefined && ref.ultima) patch.ultima = ref.ultima
          if (Object.keys(patch).length > 0) {
            await recdb.potreros.update(p.id, patch)
          }
        }
      })()
    }, 0)
    return () => clearTimeout(t)
  }, [metaId, refsStamp])

  /** Guarda (local) la observación de un potrero y lo marca hecho. */
  const guardar = useCallback(
    async (potreroId: string, o: Omit<Observacion, 'potrero_id'>) => {
      const m = await recdb.meta.get('actual')
      if (!m) return
      await recdb.obs.put({
        potrero_id: potreroId,
        recorrida_id: m.recorrida_id,
        empresa_id: m.empresa_id,
        pasto: o.pasto,
        agua: o.agua,
        electrico: o.electrico,
        conteo: o.conteo,
        en_tratamiento: o.en_tratamiento,
        novedad: o.novedad,
        cultivo: o.cultivo,
        estado: 'pendiente',
        error: null,
        updated_at: Date.now(),
      })
      await recdb.potreros.update(potreroId, { hecho: 1 })
      void sincronizar()
    },
    [sincronizar],
  )

  const setLluvia = useCallback(async (mm: number | null) => {
    await recdb.meta.update('actual', { lluvia_mm: mm, lluvia_ok: 0 })
    void sincronizar()
  }, [sincronizar])

  /**
   * Terminar: marca la recorrida como terminada e intenta drenar. La sesión
   * local se borra SOLO cuando todo subió (finalizarSiCorresponde); si no hay
   * señal o algo falló, queda "terminada, esperando subir" — nunca se pierde
   * una observación por terminar sin señal.
   */
  const terminar = useCallback(async () => {
    await recdb.meta.update('actual', { terminada: 1 })
    await sincronizar()
    // Cubre el camino sin señal (sincronizar retorna sin drenar) y el caso
    // "ya estaba todo subido": si no queda nada pendiente, cierra la sesión.
    await finalizarSiCorresponde()
  }, [sincronizar])

  /** Descarta SOLO las observaciones que el servidor rechazó (estado error),
   *  a pedido explícito del usuario, y cierra la sesión si ya no queda nada. */
  const descartarErrores = useCallback(async () => {
    const errs = await recdb.obs.where('estado').equals('error').toArray()
    await recdb.obs.bulkDelete(errs.map((e) => e.potrero_id))
    await finalizarSiCorresponde()
  }, [])

  // Derivados
  const listaPotreros = (potreros ?? []).slice().sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es'),
  )
  const listaObs = obs ?? []
  const obsPorPotrero = new Map(listaObs.map((o) => [o.potrero_id, o]))
  const hechos = listaPotreros.filter((p) => p.hecho === 1).length
  const total = listaPotreros.length
  const sinSubir = listaObs.filter((o) => o.estado === 'pendiente').length
  const errores = listaObs.filter((o) => o.estado === 'error')
  const cargando = metaArr === undefined || refsArr === undefined

  return {
    online,
    cargando,
    iniciando,
    sincronizando,
    error,
    /** Campos del cache (refs): disponibles también sin señal. */
    campos: refs?.campos ?? [],
    /** false = nunca se cachearon campos (y sin señal no se puede empezar). */
    tieneRefs: refs !== null && (refs.campos.length > 0),
    meta: meta ?? null,
    potreros: listaPotreros,
    obsPorPotrero,
    hechos,
    total,
    sinSubir,
    errores,
    empezar,
    guardar,
    setLluvia,
    terminar,
    descartarErrores,
    sincronizar,
    cargarRefs,
  }
}

export type { RecPotrero, RecObs }
