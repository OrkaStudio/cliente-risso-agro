import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { mangadb, type AnimalCache, type OutboxItem } from './db'
import { sembrarManga } from '@/features/campo/seed-offline'
import {
  asignarCaravana,
  deshacerCaravana,
  pathAudioEvento,
  subirAudioEvento,
  type CategoriaAnimal,
} from './api'
import { normalizarRfid } from './rfid'

export type Scope =
  | { kind: 'todos' }
  | { kind: 'lote'; id: string; nombre: string }
  | { kind: 'potrero'; id: string; nombre: string }

export type ScopeOption = {
  key: string
  label: string
  /** Desambiguador: dónde están esos animales. Los nombres de tropa se repiten
   *  entre campos ("Lote 1" existe en La Porteña, Los Pampas y DOS veces en
   *  Toimil), así que la etiqueta sola no alcanza para elegir. */
  detalle: string | null
  scope: Scope
  pendientes: number
}

export type AsignacionLocal = {
  rfid: string
  visual?: string
  categoria: CategoriaAnimal
  nota?: string
  audio?: Blob | null
}

function enScope(a: AnimalCache, s: Scope): boolean {
  if (s.kind === 'todos') return true
  if (s.kind === 'lote') return a.lote_id === s.id
  return a.potrero_id === s.id
}

/**
 * Qué se está caravaneando. `null` = todavía no se eligió: la manga NO sirve
 * ningún animal hasta que se elija.
 *
 * Por qué obligatorio: el animal a caravanear se toma de la cabeza de la cola
 * (nadie lo elige de a uno — con guantes eso sería un toque más por cabeza).
 * Eso vale sólo si la cola es la tropa que está pasando por la manga. Con el
 * alcance en "todos", la cabeza de la cola es un animal cualquiera del rodeo y
 * la caravana física termina anotada contra un animal de otro potrero. Pasó de
 * verdad el 01/08: dos lecturas seguidas cayeron en 11B y 10B.
 */
export type ScopeElegido = Scope | null

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
  const [scope, setScope] = useState<ScopeElegido>(null)
  const [descargando, setDescargando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cerrojos de re-entrada: los disparadores automáticos (señal, foreground,
  // carga inicial) pueden solaparse; el guard de estado no alcanza porque el
  // setState es asíncrono. Un ref se lee/escribe sincrónicamente.
  const descargandoRef = useRef(false)
  const sincronizandoRef = useRef(false)

  /**
   * Animales ya tomados por un caravaneo de ESTE tirón, antes de que Dexie
   * propague el `caravaneado: 1` de vuelta por la live query.
   *
   * El bug que cierra: `asignar` es asíncrono (dos awaits a Dexie) y la lista
   * de pendientes viene de `useLiveQuery`. Con el bastón en auto-confirmar, la
   * segunda lectura entra ANTES de que la primera haya propagado → las dos
   * apuntan a la misma cabeza de cola. La segunda muere en el sync contra
   * `uq_caravana_vigente_por_animal` y ese animal nunca se caravanea. Un ref se
   * lee y escribe sincrónicamente, así que la segunda lectura ya lo ve tomado
   * y agarra el siguiente. Mismo patrón que los cerrojos de arriba
   * (lecciones/2026-07-02-risso-agro-outbox-single-row-serializacion).
   */
  const tomadosRef = useRef<Set<string>>(new Set())
  // Espejo en estado del ref de arriba. Hacen falta los dos: el ref se lee
  // sincrónicamente dentro de `asignar` (que es donde se decide el animal), y
  // el estado es lo que el render puede mirar — acceder al ref durante el
  // render rompe con rendering concurrente. Además el setState es lo que hace
  // avanzar la cabeza de cola YA: el form se remonta por `key={actual.id}`, y
  // sin ese remonte el input conserva el RFID anterior y la lectura siguiente
  // se le APPENDEA (un número de 30 dígitos que encima pasa el chequeo de
  // duplicados, porque como caravana no existe en ninguna parte).
  const [tomados, setTomados] = useState<ReadonlySet<string>>(() => new Set())
  /** Pendientes del alcance, para que `asignar` elija la cabeza de cola sin
   *  depender del closure del handler. Se refresca en un effect, no en render. */
  const pendientesRef = useRef<AnimalCache[]>([])

  /** Devuelve un animal a la cola (falló el sync, o se deshizo el caravaneo). */
  const liberar = useCallback((animalId: string) => {
    tomadosRef.current.delete(animalId)
    setTomados(new Set(tomadosRef.current))
  }, [])

  /** Descarga la lista desde Supabase y la cachea local. Conserva los animales
   *  caravaneados en el teléfono (subidos o no) para que "Listos" no parpadee
   *  al refrescar; sólo repone los que siguen SIN caravana en el servidor. */
  const descargar = useCallback(async () => {
    if (descargandoRef.current) return // evita descargas superpuestas
    descargandoRef.current = true
    setDescargando(true)
    setError(null)
    try {
      // Reusa el sembrado central (preserva los caravaneados locales).
      await sembrarManga()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar la lista')
    } finally {
      setDescargando(false)
      descargandoRef.current = false
    }
  }, [])

  // Drena la cola: por cada pendiente llama al RPC; conflicto marca ese ítem y
  // sigue (no frena el resto). El animal que falló vuelve a "quedan" para corregir.
  const sincronizar = useCallback(async () => {
    if (!navigator.onLine || sincronizandoRef.current) return
    sincronizandoRef.current = true
    setSincronizando(true)
    try {
      const pendientes = await mangadb.outbox
        .where('estado')
        .equals('pendiente')
        .toArray()
      for (const item of pendientes) {
        try {
          // Nota de voz: sube antes del evento (el registro apunta al path).
          let audioPath = item.audio_path
          if (item.audio && !item.audio_subido && item.audio_id) {
            const animal = await mangadb.animales.get(item.animal_id)
            if (animal) {
              audioPath = pathAudioEvento(
                animal.empresa_id,
                item.audio_id,
                item.audio.type,
              )
              await subirAudioEvento(audioPath, item.audio)
              await mangadb.outbox.update(item.local_id!, {
                audio_subido: 1,
                audio_path: audioPath,
              })
            }
          }
          await asignarCaravana({
            animalId: item.animal_id,
            rfid: item.rfid,
            visual: item.visual,
            categoria: item.categoria,
            nota: item.nota,
            audioUrl: audioPath,
          })
          await mangadb.outbox.update(item.local_id!, {
            estado: 'sincronizada',
            error: null,
            audio: null, // ya está en storage; no acumular blobs
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Error al sincronizar'
          await mangadb.outbox.update(item.local_id!, {
            estado: 'error',
            error: msg,
          })
          // el animal vuelve a estar disponible para re-caravanear
          liberar(item.animal_id) // si no, el filtro local lo sigue ocultando
          await mangadb.animales.update(item.animal_id, { caravaneado: 0 })
        }
      }
    } finally {
      setSincronizando(false)
      sincronizandoRef.current = false
    }
  }, [liberar])

  /** Puesta al día completa, SECUENCIADA para que no se pisen: primero empuja
   *  lo cargado offline (sincronizar) y recién después baja el estado fresco
   *  del servidor (descargar). Cada uno tiene su cerrojo, así que reentrar es
   *  inofensivo. Es el disparador de "volvió la señal" y "volví a la app". */
  const refrescar = useCallback(async () => {
    if (!navigator.onLine) return
    await sincronizar()
    await descargar()
  }, [sincronizar, descargar])

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

  // Al montar / volver la señal: SOLO sincronizar (subir lo pendiente). NO se
  // re-baja la lista acá: eso lo hace el seeder central del CampoShell (al
  // login/apertura), y `descargar` hace clear()+bulkPut → la lista parpadeaba
  // (vacía→llena) cada vez que se entraba a Manga = la "doble carga". El cache
  // ya viene sembrado; si por una carrera estuviera vacío, la red de seguridad
  // de abajo lo baja. Diferido, fuera del cuerpo síncrono del effect.
  useEffect(() => {
    if (!online) return
    const t = setTimeout(() => void sincronizar(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // Refresco por oportunidad: app al frente con señal → sincroniza y baja
  // lista + RFIDs frescos (conserva los caravaneados locales sin sincronizar).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void refrescar()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    liberar(item.animal_id) // vuelve a la cabeza de la cola
    await mangadb.animales.update(item.animal_id, { caravaneado: 0 })
  }, [liberar])

  /** Asigna caravana al animal (local): encola + lo saca de "quedan" + sincroniza.
   *  Si el animal tenía un intento fallido (error), se limpia: el error viejo
   *  no queda colgado en el panel una vez corregido. */
  const asignar = useCallback(
    async (datos: AsignacionLocal) => {
      // El animal lo elige ESTA función, sincrónicamente, y no la pantalla:
      // que la UI mandara `actual.id` era justamente lo que permitía que dos
      // lecturas rápidas apuntaran al mismo animal.
      const animal = pendientesRef.current.find((a) => !tomadosRef.current.has(a.id))
      if (!animal) return null
      const animalId = animal.id
      tomadosRef.current.add(animalId)
      // La cabeza de cola cambia YA: el form se remonta y el input queda limpio.
      setTomados(new Set(tomadosRef.current))

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
        // Se guarda NORMALIZADO: es la forma canónica del número, para que el
        // mismo animal leído con otro bastón (o mañana con otro modelo) sea el
        // mismo registro y no un duplicado silencioso.
        rfid: normalizarRfid(datos.rfid),
        visual: datos.visual?.trim() || null,
        categoria: datos.categoria,
        nota: datos.nota?.trim() || null,
        audio: datos.audio ?? null,
        audio_id: datos.audio ? crypto.randomUUID() : null,
        audio_path: null,
        audio_subido: 0,
        estado: 'pendiente',
        error: null,
        created_at: Date.now(),
      })
      await mangadb.animales.update(animalId, { caravaneado: 1 })
      void sincronizar()
      return animal
    },
    [sincronizar],
  )

  // Derivados (a partir de las live queries)
  const listaAnimales = animales ?? []
  const listaOutbox = outbox ?? []
  const cargando = animales === undefined || descargando

  // Sin alcance elegido no hay cola: la manga no sirve ningún animal todavía.
  // `tomadosRef` saca los que ya se encolaron en este tirón aunque Dexie no
  // haya propagado — es lo que hace que dos lecturas seguidas caigan en dos
  // animales distintos y no en el mismo.
  const pendientesScope = scope
    ? listaAnimales.filter(
        (a) => a.caravaneado === 0 && !tomados.has(a.id) && enScope(a, scope),
      )
    : []
  const actual = pendientesScope[0] ?? null
  // Se refresca después del commit, no durante el render. Para cuando entra la
  // lectura siguiente del bastón (otro tick del event loop) ya está al día.
  useEffect(() => {
    pendientesRef.current = pendientesScope
  })
  const quedan = pendientesScope.length
  const listo = listaAnimales.filter((a) => a.caravaneado === 1).length
  const sinSincronizar = listaOutbox.filter((o) => o.estado === 'pendiente').length
  const errores = listaOutbox.filter((o) => o.estado === 'error')

  // Progreso dentro del alcance elegido (para la barra).
  const listoScope = scope
    ? listaAnimales.filter((a) => a.caravaneado === 1 && enScope(a, scope)).length
    : 0
  const totalScope = listoScope + quedan
  const progreso = totalScope > 0 ? listoScope / totalScope : 0

  // RFIDs en uso: los de la sesión (outbox) MÁS los vigentes de todo el rodeo
  // (cache de la última descarga) → el duplicado avisa al toque, aún offline,
  // en vez de fallar recién al sincronizar.
  const rfidsUsados = new Set([
    ...listaOutbox.filter((o) => o.estado !== 'error').map((o) => normalizarRfid(o.rfid)),
    // Los del cache ya vienen normalizados de `fetchSinCaravana`; se vuelve a
    // pasar por normalizar para que un cache viejo (guardado antes de este
    // cambio) también compare bien, sin obligar a re-descargar la lista.
    ...(refsArr?.[0]?.rfids ?? []).map(normalizarRfid),
  ])
  // Último caravaneo activo (para el "deshacer" y la confirmación).
  const ultimo: OutboxItem | null =
    [...listaOutbox]
      .filter((o) => o.estado === 'pendiente' || o.estado === 'sincronizada')
      .sort((a, b) => b.created_at - a.created_at)[0] ?? null

  // Opciones de alcance. Las tropas y potreros van PRIMERO y "todo el rodeo"
  // último: es el que reintroduce el problema de caravanear contra un animal de
  // otro lado, así que se elige a propósito, no por venir arriba de la lista.
  const scopeOptions: ScopeOption[] = (() => {
    const disponibles = listaAnimales.filter((a) => a.caravaneado === 0)
    const opts: ScopeOption[] = []
    const lotes = new Map<string, string>()
    const potreros = new Map<string, string>()
    for (const a of disponibles) {
      if (a.lote_id) lotes.set(a.lote_id, a.lote_nombre ?? 'Lote')
      if (a.potrero_id) potreros.set(a.potrero_id, a.potrero_nombre ?? 'Potrero')
    }
    for (const [id, nombre] of lotes) {
      const suyos = disponibles.filter((a) => a.lote_id === id)
      // En qué potreros está parada esta tropa: es lo que la distingue de otra
      // que se llama igual. Se ordena natural (1B antes que 11B).
      const donde = [...new Set(suyos.map((a) => a.potrero_nombre).filter(Boolean))]
        .sort((a, b) =>
          String(a).localeCompare(String(b), 'es', { numeric: true }),
        )
        .join(' · ')
      opts.push({
        key: `lote:${id}`,
        label: `Tropa ${nombre}`,
        detalle: donde || 'sin potrero',
        scope: { kind: 'lote', id, nombre },
        pendientes: suyos.length,
      })
    }
    for (const [id, nombre] of potreros) {
      const suyos = disponibles.filter((a) => a.potrero_id === id)
      const tropas = [...new Set(suyos.map((a) => a.lote_nombre).filter(Boolean))]
      opts.push({
        key: `potrero:${id}`,
        label: `Potrero ${nombre}`,
        detalle: tropas.length > 0 ? tropas.join(' · ') : 'sueltos',
        scope: { kind: 'potrero', id, nombre },
        pendientes: suyos.length,
      })
    }
    opts.push({
      key: 'todos',
      label: 'Todo el rodeo',
      detalle: null,
      scope: { kind: 'todos' },
      pendientes: disponibles.length,
    })
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
