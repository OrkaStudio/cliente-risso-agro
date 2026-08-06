import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { mangadb, type AnimalRodeo, type AparteItem } from './db'
import { fetchRodeo, moverAlDestino, subirEventoTrabajo } from './api'
import { normalizarRfid } from './rfid'
import type { Salida } from './salidas'

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

/**
 * Un hecho a registrar por animal. Es una LISTA y no un mapa por tipo porque
 * un mismo tipo puede repetirse en la misma pasada: aplicar aftosa y
 * brucelosis son dos `sanidad` con datos distintos, no uno.
 */
export type EventoSesion = {
  /** Único en la sesión: `sanidad#0`, `sanidad#1`, `destete#0`… */
  clave: string
  /** Valor del enum `tipo_evento`. */
  tipo: string
  /** `evento.datos` ya armado en el prearmado. */
  datos: Record<string, unknown>
}

export type SesionTrabajo = {
  /** Qué registrar por animal. Uno por actividad, o varios si la actividad
   *  produce más de un hecho (varias vacunas en una pasada). */
  eventos: EventoSesion[]
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
  /** Identifica la pasada de hoy: acota el conteo y el drenado del aparte. */
  sesionId: string
  /**
   * La sesión reparte animales en grupos. Cambia qué cuenta como "ya hecho":
   * en un aparte suelto no hay ningún `evento` que registrar —al animal solo le
   * cambia el potrero— así que el animal está hecho cuando cayó en un grupo.
   */
  conAparte?: boolean
}

export function useTrabajos(sesion: SesionTrabajo) {
  const rodeo = useLiveQuery(() => mangadb.rodeo.toArray(), [])
  const hechos = useLiveQuery(() => mangadb.trabajos.toArray(), [])
  const apartes = useLiveQuery(
    () => mangadb.apartes.where('sesion_id').equals(sesion.sesionId).toArray(),
    [sesion.sesionId],
  )
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

  const claves = useMemo(
    () => sesion.eventos.map((e) => e.clave),
    [sesion.eventos],
  )

  /** Ya trabajados en ESTA sesión (por animal + hecho), para no repetir. */
  const yaHechos = useMemo(
    () =>
      new Set(
        (hechos ?? [])
          .filter((h) => h.clave != null && claves.includes(h.clave))
          .map((h) => `${h.animal_id}|${h.clave}`),
      ),
    [hechos, claves],
  )

  /** Animales que ya cayeron en un grupo del aparte en esta pasada. */
  const yaApartados = useMemo(
    () => new Set((apartes ?? []).map((a) => a.animal_id)),
    [apartes],
  )

  /**
   * Lo hecho en ESTE tick, antes de que Dexie propague.
   *
   * `useLiveQuery` es asíncrono: dos lecturas del bastón en la misma tarea de
   * JS ven el set viejo y las dos pasan el chequeo de repetido. Es exactamente
   * la carrera que TASK-052 encontró en el caravaneo —dos lecturas cayendo
   * sobre el mismo animal— y acá reaparece por el otro lado: el mismo animal
   * anotado dos veces. El ref se escribe en el acto y decide; la live query lo
   * alcanza un instante después y lo confirma.
   */
  const listosRef = useRef({ eventos: new Set<string>(), apartados: new Set<string>() })

  // Sesión nueva = pizarra limpia: si no, los animales de la pasada anterior
  // seguirían contando como hechos.
  useEffect(() => {
    listosRef.current = { eventos: new Set(), apartados: new Set() }
  }, [sesion.sesionId])

  useEffect(() => {
    for (const h of hechos ?? []) {
      if (h.clave) listosRef.current.eventos.add(`${h.animal_id}|${h.clave}`)
    }
  }, [hechos])

  useEffect(() => {
    for (const a of apartes ?? []) listosRef.current.apartados.add(a.animal_id)
  }, [apartes])

  /**
   * Un animal está listo cuando se le hizo TODO lo de la sesión. Con `tipos`
   * vacío —un aparte suelto— la parte de eventos es trivialmente cierta y lo
   * que decide es haber caído en un grupo.
   *
   * Esta versión mira SOLO lo persistido, y por eso es la que cuenta el
   * progreso en pantalla: el contador tiene que decir lo que de verdad quedó
   * guardado, no lo que está en camino.
   */
  const estaListoPersistido = useCallback(
    (animalId: string) =>
      claves.every((k) => yaHechos.has(`${animalId}|${k}`)) &&
      (!sesion.conAparte || yaApartados.has(animalId)),
    [claves, sesion.conAparte, yaHechos, yaApartados],
  )

  /**
   * La misma pregunta, pero sumando lo reservado en este tick. Es la que
   * decide el "ya lo hiciste" del bastón, donde llegar tarde significa anotar
   * al mismo animal dos veces. Sólo se llama desde el handler del escaneo.
   */
  const estaListoAhora = useCallback(
    (animalId: string) =>
      claves.every(
        (k) =>
          yaHechos.has(`${animalId}|${k}`) ||
          listosRef.current.eventos.has(`${animalId}|${k}`),
      ) &&
      (!sesion.conAparte ||
        yaApartados.has(animalId) ||
        listosRef.current.apartados.has(animalId)),
    [claves, sesion.conAparte, yaHechos, yaApartados],
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

  /**
   * Manda al destino a los animales que salieron por cada grupo.
   *
   * Sube POR TANDA, no de a uno: en una manga de 200 cabezas, 200 llamadas
   * serían 200 viajes de red con el teléfono colgado de una antena rural.
   *
   * La idempotencia es por tanda y no por grupo. `mover_animales` devuelve el
   * resultado guardado cuando ve un `p_alta_id` repetido, así que reusar el
   * `alta_id` de una tanda anterior dejaría AFUERA a los animales escaneados
   * después —la RPC contestaría el resultado viejo, sin mover a nadie y sin
   * fallar—. Por eso el `alta_id` se asigna al drenar, se persiste ANTES de
   * llamar, y sólo se reusa para reintentar esa misma tanda.
   */
  const drenarApartes = useCallback(async () => {
    const pendientes = await mangadb.apartes
      .where('estado')
      .anyOf('pendiente', 'error')
      .toArray()
    const mueven = pendientes.filter(
      (a) => a.destino_k === 'potrero' && a.potrero_destino_id,
    )
    if (mueven.length === 0) return

    const tandas = new Map<string, AparteItem[]>()
    for (const a of mueven) {
      const clave = a.alta_id ?? `nuevo|${a.potrero_destino_id}`
      const previa = tandas.get(clave)
      if (previa) previa.push(a)
      else tandas.set(clave, [a])
    }

    for (const items of tandas.values()) {
      const cabeza = items[0]
      const altaId = cabeza.alta_id ?? crypto.randomUUID()
      if (!cabeza.alta_id) {
        for (const it of items) await mangadb.apartes.update(it.id, { alta_id: altaId })
      }
      try {
        const animal = await mangadb.rodeo
          .where('animal_id')
          .equals(cabeza.animal_id)
          .first()
        await moverAlDestino({
          altaId,
          empresaId: animal?.empresa_id ?? '',
          potreroDestino: cabeza.potrero_destino_id!,
          animalIds: [...new Set(items.map((i) => i.animal_id))],
          fecha: cabeza.fecha,
          contexto: {
            origen_ui: 'manga',
            sesion_id: cabeza.sesion_id,
            grupo: cabeza.etiqueta,
            salida_id: cabeza.salida_id,
          },
        })
        for (const it of items) {
          await mangadb.apartes.update(it.id, { estado: 'sincronizada', error: null })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo mover'
        for (const it of items) {
          await mangadb.apartes.update(it.id, { estado: 'error', error: msg })
        }
      }
    }
  }, [])

  /** Drena las dos colas. Un fallo marca ese ítem y sigue con el resto: una
   *  lectura mala no puede frenar las otras 199. */
  const sincronizar = useCallback(async () => {
    if (!navigator.onLine || drenandoRef.current) return
    drenandoRef.current = true
    try {
      // `error` también entra: si no, el botón "reintentar" no reintenta nada.
      const pendientes = await mangadb.trabajos
        .where('estado')
        .anyOf('pendiente', 'error')
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
      await drenarApartes()
    } finally {
      drenandoRef.current = false
    }
  }, [drenarApartes])

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
      // Antes del primer `await`: así una segunda lectura del mismo animal en
      // este mismo tick ya lo ve anotado.
      for (const e of sesion.eventos) {
        listosRef.current.eventos.add(`${animal.animal_id}|${e.clave}`)
      }
      await mangadb.trabajos.bulkPut(
        sesion.eventos.map((e, i) => ({
          // UUID de cliente: es el `evento.id`, y el reintento choca por PK.
          id: crypto.randomUUID(),
          animal_id: animal.animal_id,
          rfid,
          clave: e.clave,
          tipo: e.tipo,
          // `sesion_id` viaja en los datos para que el Historial pueda
          // agrupar la PASADA exacta y no tenga que adivinar por fecha+tipo.
          datos: { ...e.datos, sesion_id: sesion.sesionId, ...extra },
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

  /**
   * Anota que este animal salió por este grupo, y deja encaminado lo que el
   * destino implique.
   *
   * Cada destino tiene una consecuencia distinta y son de naturalezas que no se
   * mezclan:
   *   · potrero → se mueve DE VERDAD (queda pendiente para la tanda).
   *   · venta   → queda MARCADO, no dado de baja: el animal sigue vivo y en el
   *               campo hasta que se venda de verdad, y esa baja se hace en
   *               Oficina con su precio. Darlo de baja acá sacaría del stock a
   *               un animal que todavía está pastando.
   *   · manga   → encerrado, se resuelve después. No hay potrero al que
   *               moverlo, así que no cambia stock.
   *   · queda   → vuelve de donde vino: no pasó nada y no se escribe nada.
   */
  const apartar = useCallback(
    async (animal: AnimalRodeo, salida: Salida) => {
      const d = salida.destino
      const mueve = d.k === 'potrero'
      listosRef.current.apartados.add(animal.animal_id)
      await mangadb.apartes.put({
        id: crypto.randomUUID(),
        sesion_id: sesion.sesionId,
        animal_id: animal.animal_id,
        rfid: animal.rfid,
        salida_id: salida.id,
        etiqueta: salida.etiqueta,
        destino_k: d.k,
        potrero_destino_id: d.k === 'potrero' ? d.id : null,
        potrero_destino_nombre: d.k === 'potrero' ? d.nombre : null,
        fecha: sesion.fecha,
        alta_id: null,
        // Sólo el movimiento tiene algo que mandar al servidor por esta cola.
        estado: mueve ? 'pendiente' : 'sincronizada',
        error: null,
        created_at: Date.now(),
      })

      // Venta y manga sí dejan rastro en la ficha del animal, y viajan por la
      // cola de eventos que ya está probada en el campo.
      if (d.k === 'venta' || d.k === 'manga') {
        await mangadb.trabajos.put({
          id: crypto.randomUUID(),
          animal_id: animal.animal_id,
          rfid: animal.rfid,
          // La nota del aparte NO lleva `clave`: no es un hecho de la sesión
          // que haya que cumplir por animal, es la constancia de a dónde fue.
          tipo: 'nota',
          datos: {
            motivo: 'aparte',
            destino: d.k,
            grupo: salida.etiqueta,
            origen_ui: 'manga',
          },
          fecha: sesion.fecha,
          estado: 'pendiente',
          error: null,
          created_at: Date.now(),
        })
      }
      void sincronizar()
    },
    [sesion.sesionId, sesion.fecha, sincronizar],
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
      if (estaListoAhora(animal.animal_id)) {
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

      // El aparte se aplica apenas vuelve este escaneo, pero eso pasa un tick
      // más tarde. Se RESERVA el animal ya: si no, dos lecturas seguidas del
      // mismo bicho lo meterían dos veces en el grupo. (El tacto no reserva: su
      // aparte lo cierra un toque humano, donde no hay carrera posible — y
      // avisar "ya lo hiciste" antes de contestar sería mentira.)
      if (sesion.conAparte) listosRef.current.apartados.add(animal.animal_id)

      await registrar(animal, rfid, {})
      const r: ResultadoEscaneo = {
        k: 'ok',
        animal,
        total: yaHechos.size / Math.max(1, claves.length) + 1,
      }
      setUltimo(r)
      return r
    },
    [porRfid, yaHechos, claves, estaListoAhora, sesion, registrar, darAlta],
  )

  const trabajosLista = hechos ?? []
  const apartesLista = apartes ?? []
  // Progreso = animales a los que ya se les hizo TODO lo de la pasada. Se
  // cuenta con la misma regla que decide el "repetido": si divergieran, el
  // contador diría una cosa y el aviso del bastón otra.
  const candidatos = new Set([
    ...trabajosLista
      .filter((h) => h.clave != null && claves.includes(h.clave))
      .map((h) => h.animal_id),
    ...apartesLista.map((a) => a.animal_id),
  ])
  const animalesTocados = [...candidatos].filter(estaListoPersistido).length
  // Lo que falta subir se cuenta sobre las DOS colas y sin filtrar por tipo:
  // una nota de aparte que no sube es tan pendiente como un tacto que no sube,
  // y el productor necesita verla antes de irse del campo.
  const pendiente = (e: string) => e === 'pendiente'
  const fallado = (e: string) => e === 'error'

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
    apartar,
    ultimo,
    /** Cuántos animales distintos se trabajaron en esta sesión. */
    hechos: animalesTocados,
    sinSubir:
      trabajosLista.filter((h) => pendiente(h.estado)).length +
      apartesLista.filter((a) => pendiente(a.estado)).length,
    conError:
      trabajosLista.filter((h) => fallado(h.estado)).length +
      apartesLista.filter((a) => fallado(a.estado)).length,
  }
}
