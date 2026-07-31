import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CategoriaAnimal } from '../recorrida/api'
import {
  opsdb,
  deltaPorPotrero,
  deltaCategoriasPorPotrero,
  potrerosDe,
  type OpItem,
  type OpNacimiento,
  type OpMovimiento,
  type CantidadPorCategoria,
  type ModoMovimiento,
} from './db'
import { subirNacimiento, subirMovimiento } from './api'
import { sembrarRecorrida } from '../seed-offline'

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
  recorridaId: string | null
}

export type MovimientoInput = {
  empresaId: string
  potreroOrigenId: string
  potreroOrigenNombre: string
  potreroDestinoId: string
  potreroDestinoNombre: string
  loteId: string | null
  loteNombre: string | null
  /** Composición que se lleva (snapshot al declarar, siempre con números). */
  movidos: CantidadPorCategoria[]
  modo: ModoMovimiento
  recorridaId: string | null
}

/**
 * Fecha del HECHO = el día en que se declaró, en hora local del teléfono.
 *
 * No es la fecha de la recorrida: una recorrida puede quedar abierta días, y
 * entonces todo lo anotado quedaba fechado el día que se abrió (un ternero
 * nacido hoy aparecía como "hace 8 días"). Tampoco es la de la sincronización:
 * anotado sin señal el lunes y drenado el jueves tiene que quedar el lunes.
 * Se deriva acá, del `created_at` de la propia operación, para que no haya
 * forma de pasarla mal desde afuera.
 */
function fechaDelHecho(ms: number): string {
  const d = new Date(ms)
  const mm = `${d.getMonth() + 1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
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
      // ¿Alguna operación llegó realmente al servidor en esta pasada?
      let subioAlgo = false
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
              else if (op.tipo === 'movimiento') await subirMovimiento(op)
              await opsdb.outbox.update(op.cliente_id, {
                estado: 'sincronizada',
                error: null,
              })
              subioAlgo = true
            } catch (e) {
              await opsdb.outbox.update(op.cliente_id, {
                estado: 'error',
                error: e instanceof Error ? e.message : 'Error al subir',
              })
            }
          }
        } while (rerun)

        // Al sincronizar, la operación deja de contar como pendiente y su delta
        // desaparece — pero el cache de refs sigue teniendo las existencias de
        // ANTES. Sin este refresco el potrero mostraba 46, sincronizaba y
        // volvía a 45, quedando mal hasta recargar la app. Se refresca a lo
        // último, cuando ya no queda nada por subir.
        if (subioAlgo) {
          try {
            await sembrarRecorrida()
          } catch {
            // Sin señal o con el server caído el cache queda viejo, no roto:
            // el próximo sembrado (o el siguiente drenado) lo pone al día.
          }
        }
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
      const ahora = Date.now()
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
        fecha: fechaDelHecho(ahora),
        recorrida_id: input.recorridaId ?? undefined,
        estado: 'pendiente',
        error: null,
        created_at: ahora,
      }
      await opsdb.outbox.add(op)
      void sincronizar()
    },
    [sincronizar],
  )

  const registrarMovimiento = useCallback(
    async (input: MovimientoInput) => {
      const ahora = Date.now()
      const op: OpMovimiento = {
        cliente_id: crypto.randomUUID(),
        tipo: 'movimiento',
        empresa_id: input.empresaId,
        potrero_origen_id: input.potreroOrigenId,
        potrero_origen_nombre: input.potreroOrigenNombre,
        potrero_destino_id: input.potreroDestinoId,
        potrero_destino_nombre: input.potreroDestinoNombre,
        lote_id: input.loteId,
        lote_nombre: input.loteNombre,
        movidos: input.movidos,
        modo: input.modo,
        fecha: fechaDelHecho(ahora),
        recorrida_id: input.recorridaId ?? undefined,
        estado: 'pendiente',
        error: null,
        created_at: ahora,
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
  // Un movimiento toca DOS potreros, así que "las de este potrero" no puede
  // mirar un solo campo.
  const noSincronizadas = (potreroId: string): OpItem[] =>
    items.filter(
      (i) => i.estado !== 'sincronizada' && potrerosDe(i).includes(potreroId),
    )
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
    registrarMovimiento,
    sincronizar,
    descartarErrores,
  }
}
