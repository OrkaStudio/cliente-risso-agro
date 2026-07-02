import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { recdb, type RecObs, type RecPotrero } from './db'
import {
  fetchCampos,
  fetchPotreros,
  getOrCreateRecorridaHoy,
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
  const meta = metaArr?.[0] ?? null

  const [campos, setCampos] = useState<CampoRec[]>([])
  const [iniciando, setIniciando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cargar campos disponibles (para elegir cuál recorrer) si no hay recorrida.
  useEffect(() => {
    if (metaArr === undefined) return
    if (!meta && navigator.onLine && campos.length === 0) {
      fetchCampos()
        .then(setCampos)
        .catch((e) =>
          setError(e instanceof Error ? e.message : 'No se pudieron cargar los campos'),
        )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaArr === undefined, meta === null])

  /** Empezar/retomar la recorrida de hoy de un campo (con señal). */
  const empezar = useCallback(async (campo: CampoRec) => {
    setIniciando(true)
    setError(null)
    try {
      const rec = await getOrCreateRecorridaHoy(campo.id)
      const ps = await fetchPotreros(campo.id)
      await recdb.transaction('rw', recdb.meta, recdb.potreros, recdb.obs, async () => {
        await recdb.potreros.clear()
        await recdb.obs.clear()
        await recdb.meta.put({
          id: 'actual',
          recorrida_id: rec.id,
          campo_id: campo.id,
          campo_nombre: campo.nombre,
          empresa_id: rec.empresa_id,
          fecha: new Date().toISOString().slice(0, 10),
          lluvia_mm: null,
          lluvia_ok: 0,
        })
        await recdb.potreros.bulkPut(
          ps.map((p) => ({
            id: p.id,
            campo_id: campo.id,
            nombre: p.nombre,
            estado_ciclo: p.estado_ciclo,
            cabezas: p.cabezas,
            hecho: 0 as const,
          })),
        )
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo empezar la recorrida')
    } finally {
      setIniciando(false)
    }
  }, [])

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

          const pend = await recdb.obs
            .where('estado')
            .equals('pendiente')
            .toArray()
          for (const it of pend) {
            const snap = it.updated_at
            try {
              await guardarObservacion({
                recorridaId: m.recorrida_id,
                empresaId: m.empresa_id,
                obs: {
                  potrero_id: it.potrero_id,
                  pasto: it.pasto,
                  agua: it.agua,
                  electrico: it.electrico,
                  conteo: it.conteo,
                  en_tratamiento: it.en_tratamiento,
                  novedad: it.novedad,
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
    if (!online) return
    const t = setTimeout(() => void sincronizar(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

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

  /** Terminar: borra la sesión local (ya sincronizada) y vuelve al selector. */
  const terminar = useCallback(async () => {
    await sincronizar()
    await recdb.transaction('rw', recdb.meta, recdb.potreros, recdb.obs, async () => {
      await recdb.meta.clear()
      await recdb.potreros.clear()
      await recdb.obs.clear()
    })
  }, [sincronizar])

  // Derivados
  const listaPotreros = (potreros ?? []).slice().sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es'),
  )
  const listaObs = obs ?? []
  const obsPorPotrero = new Map(listaObs.map((o) => [o.potrero_id, o]))
  const hechos = listaPotreros.filter((p) => p.hecho === 1).length
  const total = listaPotreros.length
  const sinSubir = listaObs.filter((o) => o.estado === 'pendiente').length
  const errores = listaObs.filter((o) => o.estado === 'error').length
  const cargando = metaArr === undefined

  return {
    online,
    cargando,
    iniciando,
    sincronizando,
    error,
    campos,
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
    sincronizar,
  }
}

export type { RecPotrero, RecObs }
