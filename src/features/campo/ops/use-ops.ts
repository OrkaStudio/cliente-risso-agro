import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CategoriaAnimal } from '../recorrida/api'
import {
  opsdb,
  deltaPorPotrero,
  deltaCategoriasPorPotrero,
  type OpItem,
  type OpNacimiento,
} from './db'
import { subirNacimiento } from './api'

// Cola de operaciones de hacienda del campo. Mismo patrón probado que la manga
// (append-only) y la recorrida: derivar la UI de Dexie con useLiveQuery y
// serializar el drenado con un LOCK A NIVEL MÓDULO (el estado de React es async
// y no sirve como candado — lección outbox-single-row).
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

export type NacimientoInput = {
  empresaId: string
  potreroId: string
  potreroNombre: string
  loteId: string | null
  loteNombre: string | null
  categoria: CategoriaAnimal
  cantidad: number
  /** Fecha de la recorrida (el hecho), no la de la sincronización. */
  fecha: string
  recorridaId: string | null
}

export function useOps() {
  const online = useOnline()
  const itemsArr = useLiveQuery(() => opsdb.outbox.toArray(), [])
  const items = itemsArr ?? []
  const [sincronizando, setSincronizando] = useState(false)

  /** Drena la cola: por cada operación pendiente/errónea llama a su RPC. Un
   *  ítem que falla queda `error` y NO frena al resto. Append-only → no hay
   *  snapshot viejo que pisar, así que alcanza con marcar por cliente_id. */
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
          const pend = await opsdb.outbox
            .where('estado')
            .anyOf('pendiente', 'error')
            .toArray()
          for (const op of pend) {
            try {
              if (op.tipo === 'nacimiento') await subirNacimiento(op)
              await opsdb.outbox.update(op.cliente_id, {
                estado: 'sincronizada',
                error: null,
              })
            } catch (e) {
              await opsdb.outbox.update(op.cliente_id, {
                estado: 'error',
                error: e instanceof Error ? e.message : 'Error al subir',
              })
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

  // Al volver la señal (o al montar con señal): drenar lo que haya quedado.
  useEffect(() => {
    if (!online) return
    const t = setTimeout(() => void sincronizar(), 0)
    return () => clearTimeout(t)
  }, [online, sincronizar])

  const registrarNacimiento = useCallback(
    async (input: NacimientoInput) => {
      const op: OpNacimiento = {
        cliente_id: crypto.randomUUID(),
        tipo: 'nacimiento',
        empresa_id: input.empresaId,
        potrero_id: input.potreroId,
        potrero_nombre: input.potreroNombre,
        lote_id: input.loteId,
        lote_nombre: input.loteNombre,
        categoria: input.categoria,
        cantidad: input.cantidad,
        fecha: input.fecha,
        recorrida_id: input.recorridaId ?? undefined,
        estado: 'pendiente',
        error: null,
        created_at: Date.now(),
      }
      await opsdb.outbox.add(op)
      void sincronizar()
    },
    [sincronizar],
  )

  /** Descarta las operaciones que el servidor rechazó (acción explícita). */
  const descartarErrores = useCallback(async () => {
    const errs = await opsdb.outbox.where('estado').equals('error').toArray()
    await opsdb.outbox.bulkDelete(errs.map((e) => e.cliente_id))
  }, [])

  // ---- Derivados ------------------------------------------------------------
  const delta = deltaPorPotrero(items)
  const deltaCats = deltaCategoriasPorPotrero(items)
  /** Cabezas pendientes POR CATEGORÍA — el panel deriva su desglose con esto. */
  const categoriasPendientesDe = (
    potreroId: string,
  ): Map<CategoriaAnimal, number> => deltaCats.get(potreroId) ?? new Map()
  const noSincronizadas = (potreroId: string): OpItem[] =>
    items.filter((i) => i.potrero_id === potreroId && i.estado !== 'sincronizada')
  /** Cabezas recién anotadas (sin subir) por potrero — para el chip de feedback. */
  const nacidosPendientesDe = (potreroId: string): number =>
    noSincronizadas(potreroId)
      .filter((i) => i.tipo === 'nacimiento')
      .reduce((s, i) => s + i.cantidad, 0)

  return {
    online,
    sincronizando,
    /** Efecto neto por potrero de lo NO sincronizado (esperado derivado). */
    deltaPorPotrero: delta,
    sinSubir: items.filter((i) => i.estado === 'pendiente').length,
    errores: items.filter((i) => i.estado === 'error'),
    nacidosPendientesDe,
    categoriasPendientesDe,
    registrarNacimiento,
    sincronizar,
    descartarErrores,
  }
}
