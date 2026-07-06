import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { mangadb, type AnimalCache, type OutboxItem } from './db'
import {
  asignarCaravana,
  deshacerCaravana,
  fetchSinCaravana,
  type CategoriaAnimal,
} from './api'

export type Scope =
  | { kind: 'todos' }
  | { kind: 'lote'; id: string; nombre: string }
  | { kind: 'potrero'; id: string; nombre: string }

export type ScopeOption = { key: string; label: string; scope: Scope; pendientes: number }

export type AsignacionLocal = {
  rfid: string
  visual?: string
  categoria: CategoriaAnimal
  nota?: string
}

function enScope(a: AnimalCache, s: Scope): boolean {
  if (s.kind === 'todos') return true
  if (s.kind === 'lote') return a.lote_id === s.id
  return a.potrero_id === s.id
}

/** Estado online reactivo (navigator.onLine + eventos). */
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

export function useManga() {
  const online = useOnline()
  // La UI refleja Dexie en vivo (useLiveQuery): cualquier escritura en la cola
  // o el cache se ve al instante, sin sincronizar estado a mano.
  const animales = useLiveQuery(() => mangadb.animales.toArray(), [])
  const outbox = useLiveQuery(() => mangadb.outbox.toArray(), [])
  const refsArr = useLiveQuery(() => mangadb.refs.toArray(), [])
  const [scope, setScope] = useState<Scope>({ kind: 'todos' })
  const [descargando, setDescargando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Descarga la lista desde Supabase y la cachea local (pisa el cache). */
  const descargar = useCallback(async () => {
    setDescargando(true)
    setError(null)
    try {
      const { animales: frescos, rfidsEnUso } = await fetchSinCaravana()
      // Conservamos los ya caravaneados localmente que todavía no sincronizaron.
      const yaLocal = new Set(
        (await mangadb.animales.where('caravaneado').equals(1).toArray()).map(
          (a) => a.id,
        ),
      )
      await mangadb.animales.clear()
      await mangadb.animales.bulkPut(
        frescos
          .filter((a) => !yaLocal.has(a.id))
          .map((a) => ({ ...a, caravaneado: 0 as const })),
      )
      await mangadb.refs.put({
        id: 'rfids',
        rfids: rfidsEnUso,
        updated_at: Date.now(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar la lista')
    } finally {
      setDescargando(false)
    }
  }, [])

  // Drena la cola: por cada pendiente llama al RPC; conflicto marca ese ítem y
  // sigue (no frena el resto). El animal que falló vuelve a "quedan" para corregir.
  const sincronizar = useCallback(async () => {
    if (!navigator.onLine || sincronizando) return
    setSincronizando(true)
    try {
      const pendientes = await mangadb.outbox
        .where('estado')
        .equals('pendiente')
        .toArray()
      for (const item of pendientes) {
        try {
          await asignarCaravana({
            animalId: item.animal_id,
            rfid: item.rfid,
            visual: item.visual,
            categoria: item.categoria,
            nota: item.nota,
          })
          await mangadb.outbox.update(item.local_id!, {
            estado: 'sincronizada',
            error: null,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Error al sincronizar'
          await mangadb.outbox.update(item.local_id!, {
            estado: 'error',
            error: msg,
          })
          // el animal vuelve a estar disponible para re-caravanear
          await mangadb.animales.update(item.animal_id, { caravaneado: 0 })
        }
      }
    } finally {
      setSincronizando(false)
    }
  }, [sincronizando])

  // Carga inicial: si el cache local está vacío y hay señal, descarga (diferido,
  // fuera del cuerpo síncrono del effect).
  useEffect(() => {
    if (animales === undefined) return // aún cargando de Dexie
    if (animales.length === 0 && navigator.onLine && !descargando) {
      const t = setTimeout(() => void descargar(), 0)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animales === undefined])

  // Al volver la señal, drenar automáticamente (diferido, fuera del cuerpo
  // síncrono del effect).
  useEffect(() => {
    if (!online) return
    const t = setTimeout(() => void sincronizar(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  /** Deshace el último caravaneo (por mis-scan): lo saca de la cola y devuelve
   *  el animal a "quedan". Si ya se subió, lo revierte en Supabase (necesita
   *  señal). Lee fresco de Dexie para no depender de estado stale. */
  const deshacer = useCallback(async () => {
    const items = await mangadb.outbox.toArray()
    const item = items
      .filter((o) => o.estado === 'pendiente' || o.estado === 'sincronizada')
      .sort((a, b) => b.created_at - a.created_at)[0]
    if (!item) return
    if (item.estado === 'sincronizada') {
      if (!navigator.onLine) {
        setError('Sin señal: no se puede deshacer uno que ya se subió.')
        return
      }
      try {
        await deshacerCaravana(item.animal_id, item.rfid)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo deshacer')
        return
      }
    }
    await mangadb.outbox.delete(item.local_id!)
    await mangadb.animales.update(item.animal_id, { caravaneado: 0 })
  }, [])

  /** Asigna caravana al animal (local): encola + lo saca de "quedan" + sincroniza.
   *  Si el animal tenía un intento fallido (error), se limpia: el error viejo
   *  no queda colgado en el panel una vez corregido. */
  const asignar = useCallback(
    async (animalId: string, datos: AsignacionLocal) => {
      const fallidos = await mangadb.outbox
        .where('animal_id')
        .equals(animalId)
        .filter((o) => o.estado === 'error')
        .toArray()
      if (fallidos.length > 0) {
        await mangadb.outbox.bulkDelete(fallidos.map((f) => f.local_id!))
      }
      await mangadb.outbox.add({
        animal_id: animalId,
        rfid: datos.rfid.trim(),
        visual: datos.visual?.trim() || null,
        categoria: datos.categoria,
        nota: datos.nota?.trim() || null,
        estado: 'pendiente',
        error: null,
        created_at: Date.now(),
      })
      await mangadb.animales.update(animalId, { caravaneado: 1 })
      void sincronizar()
    },
    [sincronizar],
  )

  // Derivados (a partir de las live queries)
  const listaAnimales = animales ?? []
  const listaOutbox = outbox ?? []
  const cargando = animales === undefined || descargando

  const pendientesScope = listaAnimales.filter(
    (a) => a.caravaneado === 0 && enScope(a, scope),
  )
  const actual = pendientesScope[0] ?? null
  const quedan = pendientesScope.length
  const listo = listaAnimales.filter((a) => a.caravaneado === 1).length
  const sinSincronizar = listaOutbox.filter((o) => o.estado === 'pendiente').length
  const errores = listaOutbox.filter((o) => o.estado === 'error')

  // Progreso dentro del alcance elegido (para la barra).
  const listoScope = listaAnimales.filter(
    (a) => a.caravaneado === 1 && enScope(a, scope),
  ).length
  const totalScope = listoScope + quedan
  const progreso = totalScope > 0 ? listoScope / totalScope : 0

  // RFIDs en uso: los de la sesión (outbox) MÁS los vigentes de todo el rodeo
  // (cache de la última descarga) → el duplicado avisa al toque, aún offline,
  // en vez de fallar recién al sincronizar.
  const rfidsUsados = new Set([
    ...listaOutbox
      .filter((o) => o.estado !== 'error')
      .map((o) => o.rfid.trim().toLowerCase()),
    ...(refsArr?.[0]?.rfids ?? []),
  ])
  // Último caravaneo activo (para el "deshacer" y la confirmación).
  const ultimo: OutboxItem | null =
    [...listaOutbox]
      .filter((o) => o.estado === 'pendiente' || o.estado === 'sincronizada')
      .sort((a, b) => b.created_at - a.created_at)[0] ?? null

  // Opciones de alcance (Todos + lotes + potreros presentes en la lista)
  const scopeOptions: ScopeOption[] = (() => {
    const disponibles = listaAnimales.filter((a) => a.caravaneado === 0)
    const opts: ScopeOption[] = [
      {
        key: 'todos',
        label: 'Todos',
        scope: { kind: 'todos' },
        pendientes: disponibles.length,
      },
    ]
    const lotes = new Map<string, string>()
    const potreros = new Map<string, string>()
    for (const a of disponibles) {
      if (a.lote_id) lotes.set(a.lote_id, a.lote_nombre ?? 'Lote')
      if (a.potrero_id) potreros.set(a.potrero_id, a.potrero_nombre ?? 'Potrero')
    }
    for (const [id, nombre] of lotes) {
      opts.push({
        key: `lote:${id}`,
        label: `Tropa ${nombre}`,
        scope: { kind: 'lote', id, nombre },
        pendientes: disponibles.filter((a) => a.lote_id === id).length,
      })
    }
    for (const [id, nombre] of potreros) {
      opts.push({
        key: `potrero:${id}`,
        label: nombre,
        scope: { kind: 'potrero', id, nombre },
        pendientes: disponibles.filter((a) => a.potrero_id === id).length,
      })
    }
    return opts
  })()

  return {
    online,
    cargando,
    sincronizando,
    error,
    scope,
    setScope,
    scopeOptions,
    /** true = nunca se descargó la lista (distinto de "todo caravaneado"). */
    sinLista: listaAnimales.length === 0,
    actual,
    quedan,
    listo,
    progreso,
    sinSincronizar,
    errores,
    rfidsUsados,
    ultimo,
    asignar,
    deshacer,
    sincronizar,
    descargar,
  }
}
