import { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CloudOff,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Wifi,
  X,
} from 'lucide-react'
import {
  categoriaLabel,
  categoriasPorEspecie,
  especieLabel,
  type Especie,
} from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import { useManga, type AsignacionLocal } from './manga/use-manga'
import { actividadPorClave, type ClaveActividad } from './manga/actividades'
import { ElegirActividad } from './manga/elegir-actividad'
import { ElegirOrigen, type Origen } from './manga/elegir-origen'
import { PrearmarVacuna, type DatosVacuna } from './manga/prearmar-vacuna'
import { Trabajar } from './manga/trabajar'
import { PrearmarSalidas } from './manga/prearmar-salidas'
import { Paso } from './manga/ui-manga'
import type { ModoSalida, PlanSalidas } from './manga/salidas'
import type { EventoSesion, SesionTrabajo } from './manga/use-trabajos'
import type { AnimalSinCaravana, CategoriaAnimal } from './manga/api'
import { normalizarRfid } from './manga/rfid'
import { useScanner } from './manga/use-scanner'
import { CChip, CLabel, CSheet, NotaVoz } from './ui'

// Preferencia por lector, no por sesión: una vez que se sabe si el bastón manda
// Enter, la elección vale para siempre. Se guarda local (no es dato de negocio).
const CLAVE_AUTO = 'risso.manga.auto-confirmar'

function useAutoConfirmar(): [boolean, (v: boolean) => void] {
  // Default PRENDIDO a propósito: hasta hoy el Enter siempre asignó, y la manga
  // está en uso real. Apagarlo por defecto le cambiaría el flujo al productor
  // sin avisarle. El toggle existe para APAGARLO si el bastón que se compre
  // resulta mandar Enter de más.
  const [valor, setValor] = useState(
    () => (localStorage.getItem(CLAVE_AUTO) ?? '1') === '1',
  )
  const set = useCallback((v: boolean) => {
    setValor(v)
    localStorage.setItem(CLAVE_AUTO, v ? '1' : '0')
  }, [])
  return [valor, set]
}

// Observaciones rápidas de manga: lo que se VE del animal, un toque con
// guantes. Preñada/Vacía son excluyentes (estado reproductivo).
const OBSERVACIONES = ['Preñada', 'Vacía', 'Renga', 'Lastimada', 'Flaca', 'Apartar'] as const
const EXCLUYENTES: Record<string, string> = { 'Preñada': 'Vacía', 'Vacía': 'Preñada' }

/**
 * La manga, en tres pasos: qué se hace → de dónde salen → a trabajar.
 *
 * El orden no es caprichoso. La actividad va primera porque decide todo lo que
 * sigue (qué se prearma, qué pide cada escaneo, cómo se ve la pantalla de
 * trabajo). El origen va segundo y se elige SOBRE EL CROQUIS: el productor
 * conoce la forma de su campo y el número de la tranquera, no en qué potrero
 * quedó "Lote 1" — un nombre que además se repite entre campos.
 */
export function MangaPage() {
  const m = useManga()
  const [paso, setPaso] = useState<
    'actividad' | 'origen' | 'prearmar' | 'salidas' | 'trabajo'
  >('actividad')
  const [elegidas, setElegidas] = useState<Set<ClaveActividad>>(new Set())
  const [origen, setOrigen] = useState<Origen | null>(null)
  const [vacuna, setVacuna] = useState<DatosVacuna | null>(null)
  const [plan, setPlan] = useState<PlanSalidas | null>(null)
  // Identifica la pasada. Se renueva al elegir un origen nuevo: el conteo y el
  // drenado del aparte se acotan a ella, así que arrastrarla de una pasada a
  // otra haría que los animales de ayer contaran como hechos hoy.
  const [sesionId, setSesionId] = useState(() => crypto.randomUUID())

  const titulo = [...elegidas]
    .map((c) => actividadPorClave.get(c)?.nombre ?? c)
    .join(' + ')
  // Caravanear va por su propio camino: es el único que CREA identidad, así que
  // no busca al animal sino que se la pone al siguiente de la cola.
  const esCaravaneo = elegidas.has('caravanear')
  const necesitaVacuna = elegidas.has('vacunar')
  // Destetar y apartar SEPARAN: necesitan saber qué sale por cada lado del
  // cepo antes de que entre el primer animal.
  const necesitaSalidas =
    elegidas.has('destetar') || elegidas.has('apartar') || elegidas.has('tacto')
  // De dónde va a salir el lado de cada animal durante el trabajo.
  const modoSalida: ModoSalida = elegidas.has('tacto')
    ? 'resultado' // el toque de preñada/vacía ya decide: no se pregunta dos veces
    : elegidas.has('destetar')
      ? 'categoria' // la caravana ya dice si es madre o cría
      : 'libre' // aparte por criterio propio: el lado dura hasta mover la puerta
  // Estable entre renders: es la entrada de `useTrabajos`, que la usa como
  // dependencia del capturador del bastón.
  const sesion = useMemo(
    () => sesionDe(elegidas, vacuna, origen, sesionId, necesitaSalidas),
    [elegidas, vacuna, origen, sesionId, necesitaSalidas],
  )

  const contenido = () => {
  if (paso === 'actividad') {
    return (
      <ElegirActividad
        elegidas={elegidas}
        onToggle={(c) =>
          setElegidas((prev) => {
            const next = new Set(prev)
            if (next.has(c)) next.delete(c)
            else next.add(c)
            return next
          })
        }
        onSeguir={() => setPaso('origen')}
      />
    )
  }

  if (paso === 'origen') {
    return (
      <ElegirOrigen
        titulo={titulo}
        onVolver={() => setPaso('actividad')}
        onListo={(o) => {
          setOrigen(o)
          setSesionId(crypto.randomUUID())
          // El alcance de la cola sale del croquis: la tropa si el potrero
          // tiene una elegida, el potrero entero si los animales están sueltos.
          m.setScope(
            o.loteId
              ? { kind: 'lote', id: o.loteId, nombre: o.loteNombre ?? '' }
              : { kind: 'potrero', id: o.potreroId, nombre: o.potreroNombre },
          )
          setPaso(
            necesitaVacuna ? 'prearmar' : necesitaSalidas ? 'salidas' : 'trabajo',
          )
        }}
      />
    )
  }

  if (paso === 'prearmar') {
    return (
      <PrearmarVacuna
        onVolver={() => setPaso('origen')}
        onListo={(d) => {
          setVacuna(d)
          setPaso(necesitaSalidas ? 'salidas' : 'trabajo')
        }}
      />
    )
  }

  if (paso === 'salidas') {
    return (
      <PrearmarSalidas
        titulo={titulo}
        presentes={origen?.categorias ?? []}
        potreros={origen?.potrerosDelCampo ?? []}
        campoNombre={origen?.campoNombre ?? ''}
        campoColor={origen?.campoColor ?? '#178a55'}
        origenId={origen?.potreroId ?? ''}
        esDestete={elegidas.has('destetar')}
        modo={modoSalida}
        onVolver={() => setPaso('origen')}
        onListo={(p) => {
          setPlan(p)
          setPaso('trabajo')
        }}
      />
    )
  }

  if (esCaravaneo) {
    return (
      <Caravaneo
        m={m}
        origen={origen}
        onVolver={() => {
          m.setScope(null)
          setPaso('origen')
        }}
      />
    )
  }

  return (
    <Trabajar
      titulo={titulo}
      subtitulo={origen?.loteNombre ?? origen?.campoNombre ?? 'En la manga'}
      potreroNombre={origen?.potreroNombre ?? ''}
      total={origen?.cabezas ?? 0}
      sesion={sesion}
      plan={plan ?? undefined}
      onVolver={() => setPaso('origen')}
    />
  )
  }

  // Los cuatro pasos se sienten UNA pantalla que avanza: entra desde abajo con
  // un resorte corto. Nada de fades largos — en el campo la animación confirma
  // que algo pasó, no se hace notar.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Paso k={esCaravaneo && paso === 'trabajo' ? 'caravaneo' : paso}>
        {contenido()}
      </Paso>
    </AnimatePresence>
  )
}

/**
 * Traduce las actividades elegidas a la sesión que consume `useTrabajos`: qué
 * eventos registrar por animal y con qué `datos`.
 *
 * Un escaneo puede generar VARIOS eventos —vacunar y destetar en la misma
 * pasada son dos hechos distintos en el historial del animal, no uno— y una
 * sola actividad puede generar varios del MISMO tipo: aplicar aftosa y
 * brucelosis juntas son dos `sanidad`. Por eso es una lista con clave propia y
 * no un mapa por tipo.
 */
function sesionDe(
  elegidas: Set<ClaveActividad>,
  vacuna: DatosVacuna | null,
  origen: Origen | null,
  sesionId: string,
  conAparte: boolean,
): SesionTrabajo {
  const eventos: EventoSesion[] = []
  const soloCategorias = new Set<string>()
  const agregar = (tipo: string, datos: Record<string, unknown>) =>
    eventos.push({
      clave: `${tipo}#${eventos.filter((e) => e.tipo === tipo).length}`,
      tipo,
      datos,
    })

  for (const clave of elegidas) {
    const a = actividadPorClave.get(clave)
    if (!a) continue
    for (const c of a.soloCategorias ?? []) soloCategorias.add(c)

    if (clave === 'vacunar') {
      // Una por vacuna: en la ficha del animal tienen que poder leerse por
      // separado ("¿qué le pusiste?"), y el retiro de una no es el de la otra.
      for (const nombre of vacuna?.vacunas ?? []) {
        agregar('sanidad', {
          tratamiento: nombre,
          producto: vacuna?.producto ?? null,
          veterinario: vacuna?.veterinario ?? null,
          // `retiro_hasta` es el nombre que ya leen las señales de Hacienda: el
          // banner rojo de retiro sanitario se enciende solo con esto.
          retiro_hasta: vacuna?.retiroHasta ?? null,
          origen_ui: 'manga',
        })
      }
    } else if (clave === 'destetar') {
      agregar('destete', { origen_ui: 'manga' })
    } else if (clave === 'yerra') {
      agregar('castracion', { trabajo: 'yerra', origen_ui: 'manga' })
    } else if (clave === 'tacto') {
      // `resultado` lo completa el toque en la manga, no el prearmado.
      agregar('tacto', { origen_ui: 'manga' })
    }
  }

  return {
    eventos,
    soloCategorias: [...soloCategorias],
    fecha: new Date().toISOString().slice(0, 10),
    // El tacto no se puede prearmar: el resultado sale del animal que tenés
    // adelante, así que el registro espera al toque.
    diferido: elegidas.has('tacto'),
    // En la yerra el ternero suele pasar por la manga por PRIMERA vez: la
    // caravana no existe porque se la están poniendo en ese momento.
    altaSiDesconocido: elegidas.has('yerra') || elegidas.has('caravanear'),
    potreroId: origen?.potreroId ?? null,
    loteId: origen?.loteId ?? null,
    sesionId,
    // Apartar suelto no genera ningún `evento` —al animal solo le cambia el
    // potrero— así que sin esto el progreso se quedaría en cero y los
    // repetidos no se detectarían.
    conAparte,
  }
}

/** Pantalla de trabajo del caravaneo (la única actividad construida hoy). */
function Caravaneo({
  m,
  origen,
  onVolver,
}: {
  m: ReturnType<typeof useManga>
  origen: Origen | null
  onVolver: () => void
}) {
  if (m.cargando) {
    return <p className="c-label p-8 text-center !text-[13px]">Cargando manga…</p>
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      {/* ===== Barra de instrumento: señal · cola · alcance · contadores ===== */}
      <header className="shrink-0 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-3 pt-2.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-2">
            {m.online ? (
              <Wifi className="size-4 text-[var(--c-ok-deep)]" strokeWidth={2.5} />
            ) : (
              <CloudOff className="size-4 text-[var(--c-warn)]" strokeWidth={2.5} />
            )}
            <CLabel className={cn('!text-[11px]', !m.online && '!text-[var(--c-warn)]')}>
              {m.online ? 'Señal' : 'Sin señal'}
            </CLabel>
          </span>
          <button
            type="button"
            onClick={() => void m.sincronizar()}
            disabled={!m.online || m.sinSincronizar === 0 || m.sincronizando}
            className={cn(
              'c-label rounded-md border px-2 py-1.5 !text-[10.5px]',
              m.sinSincronizar > 0
                ? 'c-hazard'
                : 'border-transparent !text-[var(--c-faint)]',
            )}
          >
            <RefreshCw
              className={cn('mr-1 inline size-3', m.sincronizando && 'animate-spin')}
            />
            {m.sinSincronizar > 0 ? `${m.sinSincronizar} sin subir` : 'Al día'}
          </button>
        </div>

        <div className="flex items-end gap-3">
          {/* De dónde salen: ya quedó decidido en el croquis, así que acá es
              contexto —no un selector—. Tocarlo vuelve al dibujo. */}
          <button
            type="button"
            onClick={onVolver}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span className="min-w-0">
              <span className="c-display block truncate text-[16px] text-[var(--c-ink)]">
                {origen ? `Potrero ${origen.potreroNombre}` : 'Manga'}
              </span>
              <CLabel className="block truncate !text-[10px]">
                {origen?.loteNombre ?? origen?.campoNombre ?? 'Elegir'}
              </CLabel>
            </span>
            <ChevronDown className="size-4 shrink-0 text-[var(--c-faint)]" />
          </button>
          <div className="flex shrink-0 items-end gap-3 pb-0.5">
            <div className="text-right leading-none">
              <span className="c-mono block text-[32px] font-bold text-[var(--c-ink)]">
                {m.quedan}
              </span>
              <CLabel className="mt-0.5">quedan</CLabel>
            </div>
            <div className="text-right leading-none">
              <span className="c-mono block text-[32px] font-bold text-[var(--c-ok-deep)]">
                {m.listo}
              </span>
              <CLabel className="mt-0.5 !text-[var(--c-ok-deep)]">listos</CLabel>
            </div>
          </div>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--c-sunk)]">
          <motion.div
            className="h-full bg-[var(--c-ok)]"
            initial={false}
            animate={{ width: `${Math.round(m.progreso * 100)}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          />
        </div>
      </header>

      {/* Último caravaneo: confirmación + deshacer */}
      {m.ultimo && (
        <div className="shrink-0 px-4 pt-2.5">
          <motion.div
            key={m.ultimo.local_id}
            className="c-stamp flex items-center justify-between gap-2 rounded-lg border border-[var(--c-ok)]/45 bg-[var(--c-ok-soft)] px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Check className="size-4 shrink-0 text-[var(--c-ok-deep)]" strokeWidth={3} />
              <span className="c-mono truncate text-[13.5px] font-bold text-[var(--c-ok-deep)]">
                {m.ultimo.rfid}
              </span>
              {m.ultimo.visual && (
                <span className="c-label shrink-0">V·{m.ultimo.visual}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => void m.deshacer()}
              className="c-label flex shrink-0 items-center gap-1 rounded-md border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-2 py-1 !text-[10.5px]"
            >
              <RotateCcw className="size-3" />
              Deshacer
            </button>
          </motion.div>
        </div>
      )}

      {m.errores.length > 0 && (
        <div className="shrink-0 px-4 pt-2.5">
          <div className="flex flex-col gap-1 rounded-lg border border-[var(--c-bad)]/45 bg-[var(--c-bad-soft)] p-2.5">
            <div className="c-label flex items-center gap-1.5 !text-[11px] !text-[var(--c-bad)]">
              <AlertTriangle className="size-3.5" />
              {m.errores.length} con problema al subir
            </div>
            <ul className="flex flex-col gap-0.5 text-[12px] text-[var(--c-ink-soft)]">
              {m.errores.slice(0, 3).map((e) => (
                <li key={e.local_id}>
                  <span className="c-mono font-semibold">{e.rfid}:</span> {e.error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ===== Cuerpo ===== */}
      {m.actual ? (
        <AnimalForm
          key={m.actual.id}
          animal={m.actual}
          rfidsUsados={m.rfidsUsados}
          onAsignar={(datos) => {
            // Confirmación háptica al asignar; el sello visual lo da "Último".
            if ('vibrate' in navigator) navigator.vibrate(50)
            // El animal lo elige el hook (cabeza de cola, tomada de forma
            // síncrona): pasarle `actual.id` desde acá era lo que permitía
            // que dos lecturas rápidas apuntaran al mismo animal.
            void m.asignar(datos)
          }}
        />
      ) : m.sinLista && !m.online ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
          <CloudOff className="size-10 text-[var(--c-faint)]" />
          <p className="c-display text-[16px] text-[var(--c-ink)]">
            Sin señal y sin lista descargada
          </p>
          <p className="text-[13.5px] text-[var(--c-ink-soft)]">
            Entrá una vez con señal para bajar los animales sin caravana; de
            ahí en más la manga anda sin conexión.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <div className="c-panel flex size-18 items-center justify-center text-[var(--c-ok-deep)]">
            <Check className="size-9" strokeWidth={2.2} />
          </div>
          <p className="c-display text-[16px] text-[var(--c-ink)]">
            No quedan animales sin caravana acá
          </p>
          <button
            type="button"
            onClick={() => void m.descargar()}
            disabled={!m.online}
            className="c-display text-[14px] uppercase text-[var(--c-ok-deep)] underline underline-offset-4 disabled:opacity-40"
          >
            Volver a cargar la lista
          </button>
        </div>
      )}
    </div>
  )
}
type AnimalFormProps = {
  animal: AnimalSinCaravana
  rfidsUsados: Set<string>
  onAsignar: (datos: AsignacionLocal) => void
}

/**
 * Form de un animal (keyado por id → arranca fresco). El RFID es el héroe (el
 * bastón teclea acá); categoría por hoja de botones grandes, notas por chips.
 * El botón Asignar vive en el footer fijo.
 */
function AnimalForm({ animal, rfidsUsados, onAsignar }: AnimalFormProps) {
  const [rfid, setRfid] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAnimal>(animal.categoria)
  const [notas, setNotas] = useState<Set<string>>(new Set())
  const [notaLibre, setNotaLibre] = useState('')
  const [audio, setAudio] = useState<Blob | null>(null)
  const [abrirNota, setAbrirNota] = useState(false)
  const [abrirCategoria, setAbrirCategoria] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [rescatada, setRescatada] = useState(false)
  const [autoConfirmar, setAutoConfirmar] = useAutoConfirmar()
  const inputRef = useRef<HTMLInputElement>(null)

  // Aviso instantáneo (sin esperar al sync): RFID ya usado en la sesión O en
  // cualquier animal del rodeo (cache de vigentes). Se compara NORMALIZADO —
  // el mismo número con o sin separadores es la misma caravana.
  const repetido = rfid.trim() !== '' && rfidsUsados.has(normalizarRfid(rfid))

  const asignar = (rfidOverride?: string) => {
    const valor = rfidOverride ?? rfid
    if (!valor.trim()) {
      setAviso('Escaneá o escribí el RFID')
      return
    }
    const limpio = normalizarRfid(valor)
    // Red de seguridad contra dos lecturas pegadas en el mismo campo: una
    // caravana ISO tiene 15 dígitos y nada legítimo llega a 20. Sin esto el
    // número concatenado se guarda igual — no lo agarra el chequeo de
    // duplicados, porque como número no existe en ninguna parte.
    if (limpio.length > 20) {
      setAviso('Parecen dos lecturas pegadas — borrá el campo y escaneá de nuevo')
      return
    }
    if (rfidsUsados.has(limpio)) {
      setAviso('Ese RFID ya está en uso en otro animal')
      return
    }
    const nota = [...notas, notaLibre.trim()].filter(Boolean).join(' · ')
    onAsignar({
      rfid: valor,
      categoria,
      nota: nota || undefined,
      audio,
    })
  }

  // Red de seguridad del bastón: si una lectura entra con el cursor FUERA del
  // campo (pasa todo el tiempo en la manga — se toca una categoría, se abre una
  // hoja, el teléfono se destraba), el teclado Bluetooth escribe al vacío y la
  // caravana se pierde sin que nadie se entere. Acá la agarramos igual, la
  // ponemos en el campo y avisamos que fue rescatada.
  useScanner({
    onLectura: (l) => {
      if (!l.esEscaneo || l.focoEnObjetivo) return // el input ya la recibió solo
      setRfid(l.crudo)
      setAviso(null)
      setRescatada(true)
      inputRef.current?.focus()
      if ('vibrate' in navigator) navigator.vibrate(50)
      if (autoConfirmar && l.terminador === 'enter') asignar(l.crudo)
    },
  })

  const toggleNota = (n: string) => {
    setNotas((prev) => {
      const next = new Set(prev)
      if (next.has(n)) {
        next.delete(n)
      } else {
        next.add(n)
        const opuesta = EXCLUYENTES[n]
        if (opuesta) next.delete(opuesta) // preñada ⊕ vacía
      }
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        {/* Contexto: qué animal estoy por caravanear */}
        <div className="flex items-center justify-between gap-2">
          <span className="c-display min-w-0 truncate text-[17px] text-[var(--c-ink)]">
            {animal.lote_nombre
              ? `Tropa ${animal.lote_nombre}`
              : (animal.potrero_nombre ?? 'Sin potrero')}
          </span>
          {/* Categoría: un toque abre la hoja de botones grandes */}
          <button
            type="button"
            onClick={() => setAbrirCategoria(true)}
            className="c-display flex shrink-0 items-center gap-1 rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 py-2 text-[14px] text-[var(--c-ink)]"
          >
            {categoriaLabel[categoria]}
            <ChevronDown className="size-4" />
          </button>
        </div>

        {/* RFID: el héroe (el bastón teclea acá) */}
        <div>
          <CLabel className={cn('mb-1.5', (aviso ?? repetido) && '!text-[var(--c-bad)]')}>
            Caravana RFID · escaneá con el bastón
          </CLabel>
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border-2 bg-[var(--c-panel)] px-4 shadow-sm transition-colors',
              aviso
                ? 'border-[var(--c-bad)]/70'
                : repetido
                  ? 'border-[var(--c-warn)]/70'
                  : 'border-[var(--c-line-strong)] focus-within:border-[var(--c-ok)]',
            )}
          >
            <ScanLine
              className={cn(
                'size-6 shrink-0',
                repetido ? 'text-[var(--c-warn)]' : 'text-[var(--c-ok-deep)]',
              )}
            />
            <input
              ref={inputRef}
              // Marca para el capturador: si el foco está acá, la lectura ya
              // entró sola y no hay que rescatarla (evita escribirla dos veces).
              data-scan-target
              value={rfid}
              onChange={(e) => {
                setRfid(e.target.value)
                if (aviso) setAviso(null)
                if (rescatada) setRescatada(false)
              }}
              onKeyDown={(e) => {
                // El Enter del bastón solo confirma si está activado el
                // auto-confirmar. Hay lectores que lo mandan siempre: sin este
                // freno, cada lectura asigna sola antes de tocar la categoría.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (autoConfirmar) asignar()
                }
              }}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="Escaneá…"
              className="c-mono h-16 min-w-0 flex-1 bg-transparent text-[24px] font-bold text-[var(--c-ink)] outline-none placeholder:text-[18px] placeholder:text-[var(--c-faint)]"
            />
            {/* Borrar. Con el bastón emparejado iOS no muestra el teclado en
                pantalla y el bastón no manda backspace: sin este botón, un
                campo con basura (dos lecturas pegadas) deja la manga trabada,
                sin ninguna forma de vaciarlo. */}
            {rfid !== '' && (
              <button
                type="button"
                aria-label="Borrar la lectura"
                onClick={() => {
                  setRfid('')
                  setAviso(null)
                  setRescatada(false)
                  inputRef.current?.focus()
                }}
                className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--c-faint)]"
              >
                <X className="size-6" strokeWidth={2.5} />
              </button>
            )}
          </div>
          {aviso ? (
            <p className="c-label mt-1 flex items-center gap-1 !text-[12px] !text-[var(--c-bad)]">
              <AlertTriangle className="size-3.5" />
              {aviso}
            </p>
          ) : repetido ? (
            <p className="c-label mt-1 flex items-center gap-1 !text-[12px] !text-[var(--c-warn)]">
              <AlertTriangle className="size-3.5" />
              Ese RFID ya está en uso
            </p>
          ) : (
            rescatada && (
              <p className="c-label mt-1 flex items-center gap-1 !text-[12px] !text-[var(--c-ok-deep)]">
                <Check className="size-3.5" />
                Lectura tomada con el cursor afuera — la agarramos igual
              </p>
            )
          )}

          {/* Auto-confirmar: depende del bastón. Hay lectores que mandan Enter
              y otros que no — se prueba en /campo/lector y se deja fijo acá. */}
          <button
            type="button"
            onClick={() => setAutoConfirmar(!autoConfirmar)}
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-[var(--c-line)] bg-[var(--c-panel)] px-2.5 py-2 text-left"
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                autoConfirmar
                  ? 'border-[var(--c-ok)] bg-[var(--c-ok)]'
                  : 'border-[var(--c-line-strong)]',
              )}
            >
              {autoConfirmar && <Check className="size-3.5 text-white" strokeWidth={3.5} />}
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--c-ink-soft)]">
              Confirmar solo al escanear
              <span className="c-label block !text-[10.5px]">
                {autoConfirmar
                  ? 'Escaneás y pasa al siguiente animal'
                  : 'Confirmás con el botón de abajo'}
              </span>
            </span>
          </button>
        </div>

        {/* Sin campo de caravana visual: en Risso se pone SOLO la electrónica
            (decisión de Lau, 03/08). El número corto no se carga a mano, así
            que el campo era un hueco muerto en el medio del flujo — y con el
            bastón emparejado ni siquiera había teclado para llenarlo. El
            soporte sigue en la RPC y en el outbox para Oficina. */}

        {/* Observación rápida: grilla SIEMPRE visible (nada de scroll para
            encontrar el botón — "¿está renga? toco Renga y sigo") */}
        <div>
          <CLabel className="mb-1.5">¿Ves algo? · un toque y seguís</CLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {OBSERVACIONES.map((n) => (
              <CChip
                key={n}
                label={n}
                selected={notas.has(n)}
                onClick={() => toggleNota(n)}
                className="h-11 text-center"
              />
            ))}
          </div>
          <NotaVoz audio={audio} onAudio={setAudio} />
          {abrirNota ? (
            <input
              value={notaLibre}
              onChange={(e) => setNotaLibre(e.target.value)}
              autoFocus
              autoComplete="off"
              placeholder="Otra nota…"
              className="mt-1.5 h-10 w-full rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 text-[14px] text-[var(--c-ink)] outline-none focus:border-[var(--c-ok)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAbrirNota(true)}
              className="c-label mt-1.5 !text-[11px] underline underline-offset-2"
            >
              + Otra nota
            </button>
          )}
        </div>
      </div>

      {/* Acción principal: footer fijo */}
      <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-bg)] px-4 pb-3.5 pt-3">
        <button
          type="button"
          onClick={() => asignar()}
          className="c-display c-hard flex h-15 w-full items-center justify-center gap-2.5 rounded-xl border border-transparent bg-[var(--c-ok)] text-[19px] text-white"
        >
          <Check className="size-6" strokeWidth={2.5} />
          Asignar → siguiente
        </button>
      </div>

      {/* Hoja de categorías: botones grandes, nada de dropdown chiquito */}
      <CSheet
        open={abrirCategoria}
        title="Categoría del animal"
        onClose={() => setAbrirCategoria(false)}
      >
        {/* Solo BOVINOS: son los únicos que llevan caravana. Ofrecer ovejas o
            yeguas acá sería ofrecer un trabajo que la manga no puede hacer. */}
        <div className="flex flex-col gap-3">
          {(['bovino'] as Especie[]).map((especie) => (
            <div key={especie}>
              <CLabel className="mb-1.5">{especieLabel[especie]}</CLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {categoriasPorEspecie[especie].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setCategoria(value)
                      setAbrirCategoria(false)
                    }}
                    className={cn(
                      'h-12 rounded-xl border text-[14px] font-semibold transition-colors',
                      categoria === value
                        ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
                        : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
                    )}
                  >
                    {categoriaLabel[value]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CSheet>
    </div>
  )
}
