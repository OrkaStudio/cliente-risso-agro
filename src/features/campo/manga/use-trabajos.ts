import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { mangadb, type AnimalRodeo } from './db'
import { fetchRodeo, subirEventoTrabajo } from './api'
import { normalizarRfid } from './rfid'

/**
 * Sesión de TRABAJO: el bastón identifica a un animal que ya tiene caravana y
 * se le registra lo que se le hizo.
 *
 * Es el reverso del caravaneo. Allá el escaneo CREA identidad y por eso hace
 * falta decir a qué tropa pertenece el animal; acá la ENCUENTRA, y la tropa ya
 * no se pregunta: la caravana es la identidad.
 *
 * Todo el dato del trabajo (qué vacuna, qué veterinario, qué retiro) se prearma
 * UNA vez y vale para la sesión entera. Por eso escanear no pide nada: son N
 * lecturas seguidas con el teléfono guardado, que es como se trabaja en la
 * manga de verdad.
 */

export type ResultadoEscaneo =
  | { k: 'ok'; animal: AnimalRodeo; total: number }
  /** Caravana nueva asignada a un animal que no tenía. */
  | { k: 'alta'; animal: AnimalRodeo; rfid: string }
  | { k: 'repetido'; animal: AnimalRodeo }
  | { k: 'desconocido'; rfid: string }
  | { k: 'otraCategoria'; animal: AnimalRodeo }

export type SesionTrabajo = {
  /** Tipos de `evento` a registrar por animal (uno por actividad elegida). */
  tipos: string[]
  /** `evento.datos` por tipo, ya armado en el prearmado. */
  datosPorTipo: Record<string, Record<string, unknown>>
  /** Categorías admitidas (unión de las actividades). Vacío = cualquiera. */
  soloCategorias: string[]
  /** Fecha del hecho — la de hoy salvo que se declare otra. */
  fecha: string
  /**
   * El escaneo IDENTIFICA pero no registra: falta un dato que solo el operario
   * puede dar (el resultado del tacto). El registro lo cierra `completar`.
   */
  diferido?: boolean
  /**
   * Una caravana que NO está en el rodeo se toma como alta: se le asigna al
   * siguiente animal sin caravana del alcance.
   *
   * Es el caso normal de una yerra — el ternero pasa por la manga por primera
   * vez y se lo caravanea ahí mismo. Sin esto la app avisa "desconocida" y
   * frena un trabajo que estaba bien hecho.
   */
  altaSiDesconocido?: boolean
  /** Potrero/tropa del alcance: de ahí sale el animal al que se da el alta. */
  potreroId?: string | null
  loteId?: string | null
}

export function useTrabajos(sesion: SesionTrabajo) {
  const rodeo = useLiveQuery(() => mangadb.rodeo.toArray(), [])
  const hechos = useLiveQuery(() => mangadb.trabajos.toArray(), [])
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<ResultadoEscaneo | null>(null)
  const drenandoRef = useRef(false)
  const bajandoRef = useRef(false)

  /** Índice RFID→animal, en memoria: el lookup pasa a ser O(1) por lectura.
   *  Memoizado porque es dependencia de `escanear`, que a su vez alimenta al
   *  capturador del bastón: recrearlo en cada render lo haría inestable. */
  const porRfid = useMemo(
    () => new Map((rodeo ?? []).map((a) => [a.rfid, a])),
    [rodeo],
  )

  /** Ya trabajados en ESTA sesión (por animal + tipo), para no repetir. */
  const yaHechos = useMemo(
    () =>
      new Set(
        (hechos ?? [])
          .filter((h) => sesion.tipos.includes(h.tipo))
          .map((h) => `${h.animal_id}|${h.tipo}`),
      ),
    [hechos, sesion.tipos],
  )

  const bajarRodeo = useCallback(async () => {
    if (bajandoRef.current || !navigator.onLine) return
    bajandoRef.current = true
    setBajando(true)
    try {
      const filas = await fetchRodeo()
      await mangadb.transaction('rw', mangadb.rodeo, async () => {
        await mangadb.rodeo.clear()
        await mangadb.rodeo.bulkPut(filas)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo bajar el rodeo')
    } finally {
      setBajando(false)
      bajandoRef.current = false
    }
  }, [])

  /** Drena la cola de trabajos. Un fallo marca ese ítem y sigue con el resto:
   *  una lectura mala no puede frenar las otras 199. */
  const sincronizar = useCallback(async () => {
    if (!navigator.onLine || drenandoRef.current) return
    drenandoRef.current = true
    try {
      const pendientes = await mangadb.trabajos
        .where('estado')
        .equals('pendiente')
        .toArray()
      for (const t of pendientes) {
        try {
          const animal = await mangadb.rodeo.where('animal_id').equals(t.animal_id).first()
          await subirEventoTrabajo({
            id: t.id,
            animalId: t.animal_id,
            empresaId: animal?.empresa_id ?? '',
            tipo: t.tipo,
            datos: t.datos,
            fecha: t.fecha,
          })
          await mangadb.trabajos.update(t.id, { estado: 'sincronizada', error: null })
        } catch (e) {
          await mangadb.trabajos.update(t.id, {
            estado: 'error',
            error: e instanceof Error ? e.message : 'Error al subir',
          })
        }
      }
    } finally {
      drenandoRef.current = false
    }
  }, [])

  // Cache vacío y con señal → bajarlo. Sin esto la manga no puede identificar
  // a nadie, y el aviso "entrá una vez con señal" llega tarde.
  useEffect(() => {
    if (rodeo === undefined) return
    if (rodeo.length === 0 && navigator.onLine) {
      const t = setTimeout(() => void bajarRodeo(), 0)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodeo === undefined])

  useEffect(() => {
    const alVolver = () => {
      if (navigator.onLine) void sincronizar()
    }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [sincronizar])

  /**
   * Una lectura del bastón. Devuelve QUÉ pasó para que la pantalla pueda dar
   * el feedback correcto — que en la manga es háptico y sonoro, porque el
   * teléfono está guardado y nadie mira.
   */
  /** Encola los eventos de la sesión para un animal. `extra` son los datos que
   *  no se podían prearmar (el resultado del tacto). */
  const registrar = useCallback(
    async (
      animal: AnimalRodeo,
      rfid: string,
      extra: Record<string, unknown>,
    ) => {
      const ahora = Date.now()
      await mangadb.trabajos.bulkPut(
        sesion.tipos.map((tipo, i) => ({
          // UUID de cliente: es el `evento.id`, y el reintento choca por PK.
          id: crypto.randomUUID(),
          animal_id: animal.animal_id,
          rfid,
          tipo,
          datos: { ...(sesion.datosPorTipo[tipo] ?? {}), ...extra },
          fecha: sesion.fecha,
          estado: 'pendiente' as const,
          error: null,
          created_at: ahora + i,
        })),
      )
      void sincronizar()
    },
    [sesion, sincronizar],
  )

  /**
   * Alta de caravana en el medio de un trabajo: agarra el siguiente animal SIN
   * caravana del alcance, le encola la asignación por la cola de caravaneo que
   * ya existe (probada en el campo) y lo mete al índice del rodeo para que el
   * resto de la sesión lo trate como cualquier otro.
   */
  const darAlta = useCallback(
    async (rfid: string): Promise<AnimalRodeo | null> => {
      const libres = await mangadb.animales
        .where('caravaneado')
        .equals(0)
        .toArray()
      const enAlcance = libres.filter(
        (a) =>
          (!sesion.loteId || a.lote_id === sesion.loteId) &&
          (!sesion.potreroId || a.potrero_id === sesion.potreroId) &&
          (sesion.soloCategorias.length === 0 ||
            sesion.soloCategorias.includes(a.categoria)),
      )
      const elegido = enAlcance[0]
      if (!elegido) return null

      await mangadb.outbox.add({
        animal_id: elegido.id,
        rfid,
        visual: null,
        categoria: elegido.categoria,
        nota: null,
        audio: null,
        audio_id: null,
        audio_path: null,
        audio_subido: 0,
        estado: 'pendiente',
        error: null,
        created_at: Date.now(),
      })
      await mangadb.animales.update(elegido.id, { caravaneado: 1 })

      const nuevo: AnimalRodeo = {
        rfid,
        animal_id: elegido.id,
        empresa_id: elegido.empresa_id,
        categoria: elegido.categoria,
        potrero_id: elegido.potrero_id,
        lote_id: elegido.lote_id,
      }
      await mangadb.rodeo.put(nuevo)
      await registrar(nuevo, rfid, {})
      return nuevo
    },
    [sesion.loteId, sesion.potreroId, sesion.soloCategorias, registrar],
  )

  /** Cierra un trabajo diferido con el dato que faltaba. */
  const completar = useCallback(
    async (animal: AnimalRodeo, extra: Record<string, unknown>) => {
      await registrar(animal, animal.rfid, extra)
    },
    [registrar],
  )

  const escanear = useCallback(
    async (crudo: string): Promise<ResultadoEscaneo> => {
      const rfid = normalizarRfid(crudo)
      const animal = porRfid.get(rfid)
      if (!animal) {
        // Yerra: la caravana no existe porque se la estamos poniendo AHORA.
        if (sesion.altaSiDesconocido) {
          const alta = await darAlta(rfid)
          if (alta) {
            const r: ResultadoEscaneo = { k: 'alta', animal: alta, rfid }
            setUltimo(r)
            return r
          }
        }
        const r: ResultadoEscaneo = { k: 'desconocido', rfid }
        setUltimo(r)
        return r
      }
      // Repetido: el mismo animal ya pasó por esta sesión. No es un error del
      // productor —en la manga se lee dos veces sin querer— pero registrarlo
      // otra vez ensuciaría el historial, que es append-only.
      if (sesion.tipos.every((t) => yaHechos.has(`${animal.animal_id}|${t}`))) {
        const r: ResultadoEscaneo = { k: 'repetido', animal }
        setUltimo(r)
        return r
      }
      if (
        sesion.soloCategorias.length > 0 &&
        !sesion.soloCategorias.includes(animal.categoria)
      ) {
        const r: ResultadoEscaneo = { k: 'otraCategoria', animal }
        setUltimo(r)
        return r
      }

      // Diferido: el animal quedó identificado, pero el hecho todavía no pasó
      // — falta el resultado. Registrar acá dejaría un tacto sin resultado.
      if (sesion.diferido) {
        const r: ResultadoEscaneo = { k: 'ok', animal, total: yaHechos.size + 1 }
        setUltimo(r)
        return r
      }

      await registrar(animal, rfid, {})
      const r: ResultadoEscaneo = {
        k: 'ok',
        animal,
        total: yaHechos.size / Math.max(1, sesion.tipos.length) + 1,
      }
      setUltimo(r)
      return r
    },
    [porRfid, yaHechos, sesion, registrar, darAlta],
  )

  const lista = hechos ?? []
  const deLaSesion = lista.filter((h) => sesion.tipos.includes(h.tipo))
  const animalesTocados = new Set(deLaSesion.map((h) => h.animal_id)).size

  return {
    cargando: rodeo === undefined,
    /** true = nunca se bajó el rodeo (distinto de "no hay animales"). */
    sinRodeo: rodeo !== undefined && rodeo.length === 0,
    bajando,
    error,
    bajarRodeo,
    sincronizar,
    escanear,
    completar,
    ultimo,
    /** Cuántos animales distintos se trabajaron en esta sesión. */
    hechos: animalesTocados,
    sinSubir: deLaSesion.filter((h) => h.estado === 'pendiente').length,
    conError: deLaSesion.filter((h) => h.estado === 'error').length,
  }
}
