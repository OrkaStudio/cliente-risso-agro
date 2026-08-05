import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CloudOff,
  RefreshCw,
  ScanLine,
  Wifi,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { categoriaLabel } from '@/features/hacienda/labels'
import { CLabel } from '../ui'
import { useScanner } from './use-scanner'
import { Puertas } from './puertas'
import {
  ordenarPorLado,
  salidaDeCategoria,
  salidaPorId,
  type PlanSalidas,
  type Salida,
} from './salidas'
import { useTrabajos, type ResultadoEscaneo, type SesionTrabajo } from './use-trabajos'
import { CerrarTrabajo } from './cerrar-trabajo'

/**
 * Pantalla de trabajo, con la MISMA forma que el caravaneo — que es la que el
 * productor ya usa: barra de instrumento arriba, el número de caravana como
 * héroe, y abajo lo que pida el trabajo del día.
 *
 * Lo que cambia entre trabajos es esa zona de abajo, y lo que NO cambia es el
 * idioma: todo lo que se toca o se lee dice **qué es el animal** —Vaquillona,
 * Preñada, Gordos— y nunca por dónde está la puerta. El lado viaja al lado del
 * nombre, con su flecha y su color, para ejecutarlo sin tener que traducirlo.
 *
 * El requisito duro sigue siendo que **el teléfono no se mira**: una mano tiene
 * el bastón y la otra está ocupada. Por eso lo que confirma es la vibración, y
 * cada resultado vibra distinto para reconocerse sin levantar la vista.
 */

const VIBRA: Record<ResultadoEscaneo['k'], number | number[]> = {
  ok: 40,
  // El alta vibra distinto y muestra a quién se le puso: leer sin querer una
  // caravana ajena la daría de alta como propia, y hay que poder verlo YA.
  alta: [50, 40, 50],
  repetido: [30, 60, 30],
  desconocido: 260,
  otraCategoria: 260,
}

/** El RFID en grupos: 15 dígitos corridos no se leen de un vistazo. */
function agrupar(rfid: string): string {
  return /^\d{15}$/.test(rfid)
    ? rfid.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4')
    : rfid
}

/** Lo resuelto para el animal que acaba de pasar: a qué grupo cayó y cómo
 *  llamarlo en el cartel. */
type Resuelto = { salida: Salida; hero: string }

export function Trabajar({
  titulo,
  subtitulo,
  potreroNombre,
  sesion,
  total,
  plan,
  onVolver,
}: {
  titulo: string
  subtitulo: string
  potreroNombre: string
  sesion: SesionTrabajo
  /** Cuántos animales se esperan (del potrero o tropa elegidos). */
  total: number
  /** Plan de aparte. Ausente = no se aparta (vacunar solo, por ejemplo). */
  plan?: PlanSalidas
  onVolver: () => void
}) {
  const t = useTrabajos(sesion)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [aviso, setAviso] = useState<ResultadoEscaneo | null>(null)
  const [rfid, setRfid] = useState<string | null>(null)
  const [resuelto, setResuelto] = useState<Resuelto | null>(null)
  // La categoría del animal no está en el plan. Sin esto la app no muestra
  // nada y parece colgada — con el teléfono guardado, el error se descubre
  // cuando el rodeo ya está mal repartido.
  const [sinGrupo, setSinGrupo] = useState<string | null>(null)
  // Cuántos salieron por cada grupo. Es el control del trabajo: en un destete,
  // madres y crías tienen que cerrar parejo.
  const [porSalida, setPorSalida] = useState<Record<string, number>>({})
  // Modo libre: el grupo lo pone el operario y DURA hasta que mueva la puerta.
  const [grupoFijo, setGrupoFijo] = useState<string>(
    () => plan?.salidas[0]?.id ?? '',
  )
  // Modo resultado: el animal ya está identificado y espera el toque.
  const [esperando, setEsperando] = useState<ResultadoEscaneo | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const limpiar = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  /** Deja al animal en un grupo: lo anota, lo cuenta y lo muestra. */
  const mandarA = async (
    animal: ResultadoEscaneo & { k: 'ok' | 'alta' },
    salida: Salida,
    hero: string,
  ) => {
    await t.apartar(animal.animal, salida)
    setPorSalida((p) => ({ ...p, [salida.id]: (p[salida.id] ?? 0) + 1 }))
    setResuelto({ salida, hero })
  }

  // El bastón teclea a nivel documento: acá no hay ningún campo que enfocar,
  // así que TODA lectura entra por este camino.
  useScanner({
    onLectura: (l) => {
      if (!l.esEscaneo) return
      void (async () => {
        const r = await t.escanear(l.crudo)
        if ('vibrate' in navigator) navigator.vibrate(VIBRA[r.k])
        setAviso(r)
        setRfid(r.k === 'desconocido' ? r.rfid : r.animal.rfid)
        setSinGrupo(null)

        // El grupo sale de tres lugares distintos según el trabajo — y en dos
        // de los tres no hay que tocar nada.
        if ((r.k === 'ok' || r.k === 'alta') && plan) {
          if (plan.modo === 'categoria') {
            const s = salidaDeCategoria(plan, r.animal.categoria)
            if (s) {
              await mandarA(r, s, categoriaLabel[r.animal.categoria])
            } else {
              // Categoría fuera del plan: se avisa fuerte y NO se cuenta.
              if ('vibrate' in navigator) navigator.vibrate(260)
              setResuelto(null)
              setSinGrupo(categoriaLabel[r.animal.categoria])
            }
          } else if (plan.modo === 'libre') {
            const s = salidaPorId(plan, grupoFijo)
            if (s) await mandarA(r, s, s.etiqueta)
          } else {
            // Resultado: no se resuelve hasta que el operario toque.
            setEsperando(r)
            setResuelto(null)
          }
        } else if (r.k !== 'ok' && r.k !== 'alta') {
          setResuelto(null)
        }

        if (limpiar.current) clearTimeout(limpiar.current)
        limpiar.current = setTimeout(
          () => setAviso(null),
          r.k === 'ok' || r.k === 'alta' ? 2600 : 6000,
        )
      })()
    },
  })

  /**
   * El toque del tacto. Ahora se toca LA PUERTA, no un botón aparte: el mismo
   * gesto dice el resultado y manda al animal, que es como se trabaja —el
   * resultado del tacto ES el criterio del aparte—.
   */
  const responderPorSalida = async (salidaId: string) => {
    if (!esperando || esperando.k !== 'ok' || !plan) return
    const s = salidaPorId(plan, salidaId)
    if (!s) return
    // Del grupo se vuelve a la respuesta: el plan mapea resultado → grupo.
    const clave = Object.entries(plan.porResultado ?? {}).find(
      ([, id]) => id === salidaId,
    )?.[0]
    if (!clave) return
    await t.completar(esperando.animal, { resultado: clave })
    if ('vibrate' in navigator) navigator.vibrate(40)
    await mandarA(esperando, s, s.etiqueta)
    setEsperando(null)
  }

  if (cerrando) {
    return (
      <CerrarTrabajo
        titulo={titulo}
        hechos={t.hechos}
        total={total}
        porSalida={porSalida}
        plan={plan}
        sinSubir={t.sinSubir}
        conError={t.conError}
        online={online}
        onSincronizar={() => void t.sincronizar()}
        onSalir={onVolver}
      />
    )
  }

  if (t.cargando) {
    return <p className="c-label p-8 text-center !text-[13px]">Cargando el rodeo…</p>
  }

  if (t.sinRodeo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <CloudOff className="size-10 text-[var(--c-faint)]" />
        <p className="c-display text-[16px] text-[var(--c-ink)]">
          Todavía no bajaste los animales
        </p>
        <p className="text-[13.5px] text-[var(--c-ink-soft)]">
          El bastón necesita saber qué caravana es de cada animal. Entrá una vez
          con señal y después la manga anda sin conexión.
        </p>
        <button
          type="button"
          onClick={() => void t.bajarRodeo()}
          disabled={!online || t.bajando}
          className="c-display mt-1 text-[14px] uppercase text-[var(--c-ok-deep)] underline underline-offset-4 disabled:opacity-40"
        >
          {t.bajando ? 'Bajando…' : 'Bajar ahora'}
        </button>
      </div>
    )
  }

  const quedan = Math.max(0, total - t.hechos)
  const progreso = total > 0 ? t.hechos / total : 0
  const esperandoToque = plan?.modo === 'resultado' && esperando?.k === 'ok'
  const bien = aviso?.k === 'ok' || aviso?.k === 'alta'
  const salidasEnOrden = plan ? ordenarPorLado(plan.salidas) : []

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      {/* ===== Barra de instrumento: la misma del caravaneo ===== */}
      <header className="shrink-0 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-3 pt-2.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-2">
            {online ? (
              <Wifi className="size-4 text-[var(--c-ok-deep)]" strokeWidth={2.5} />
            ) : (
              <CloudOff className="size-4 text-[var(--c-warn)]" strokeWidth={2.5} />
            )}
            <CLabel className={cn('!text-[11px]', !online && '!text-[var(--c-warn)]')}>
              {online ? 'Señal' : 'Sin señal'}
            </CLabel>
          </span>
          <button
            type="button"
            onClick={() => void t.sincronizar()}
            disabled={!online || t.sinSubir === 0}
            className={cn(
              'c-label rounded-md border px-2 py-1.5 !text-[10.5px]',
              t.sinSubir > 0 ? 'c-hazard' : 'border-transparent !text-[var(--c-faint)]',
            )}
          >
            <RefreshCw className="mr-1 inline size-3" />
            {t.sinSubir > 0 ? `${t.sinSubir} sin subir` : 'Al día'}
          </button>
        </div>

        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={() => setCerrando(true)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span className="min-w-0">
              <span className="c-display block truncate text-[16px] text-[var(--c-ink)]">
                Potrero {potreroNombre}
              </span>
              <CLabel className="block truncate !text-[10px]">{subtitulo}</CLabel>
            </span>
            <ChevronDown className="size-4 shrink-0 text-[var(--c-faint)]" />
          </button>
          <div className="flex shrink-0 items-end gap-3 pb-0.5">
            <div className="text-right leading-none">
              <span className="c-mono block text-[32px] font-bold text-[var(--c-ink)]">
                {quedan}
              </span>
              <CLabel className="mt-0.5">quedan</CLabel>
            </div>
            <div className="text-right leading-none">
              <span
                data-testid="listos"
                className="c-mono block text-[32px] font-bold text-[var(--c-ok-deep)]"
              >
                {t.hechos}
              </span>
              <CLabel className="mt-0.5 !text-[var(--c-ok-deep)]">listos</CLabel>
            </div>
          </div>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--c-sunk)]">
          <motion.div
            className="h-full bg-[var(--c-ok)]"
            initial={false}
            animate={{ width: `${Math.round(progreso * 100)}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <div className="c-display shrink-0 truncate text-[17px] text-[var(--c-ink)]">
          {titulo}
        </div>

        {/* ===== El número de caravana: el héroe, igual que en el caravaneo ===== */}
        <div className="shrink-0">
          <CLabel className="mb-1.5">Caravana RFID · escaneá con el bastón</CLabel>
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border-2 bg-[var(--c-panel)] px-4 shadow-sm transition-colors',
              aviso && !bien
                ? 'border-[var(--c-bad)]/70'
                : bien
                  ? 'border-[var(--c-ok)]'
                  : 'border-[var(--c-line-strong)]',
            )}
          >
            <ScanLine
              className={cn(
                'size-6 shrink-0',
                bien ? 'text-[var(--c-ok-deep)]' : 'text-[var(--c-faint)]',
              )}
            />
            {rfid ? (
              <motion.span
                key={`${rfid}-${t.hechos}`}
                initial={{ opacity: 0.4, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                className="c-mono flex h-16 min-w-0 flex-1 items-center truncate text-[21px] font-bold text-[var(--c-ink)]"
              >
                {agrupar(rfid)}
              </motion.span>
            ) : (
              <span className="c-mono flex h-16 flex-1 items-center text-[18px] text-[var(--c-faint)]">
                Escaneá…
              </span>
            )}
          </div>

          {/* Una línea que dice qué pasó con ESE número. */}
          <p
            className={cn(
              'c-label mt-1.5 flex items-center gap-1 !text-[12px] !normal-case',
              aviso?.k === 'ok' && '!text-[var(--c-ok-deep)]',
              aviso?.k === 'alta' && '!text-[var(--c-ok-deep)]',
              aviso?.k === 'repetido' && '!text-[var(--c-warn-deep)]',
              (aviso?.k === 'desconocido' || aviso?.k === 'otraCategoria') &&
                '!text-[var(--c-bad)]',
              !aviso && '!text-[var(--c-faint)]',
            )}
          >
            {aviso?.k === 'ok' && (
              <>
                <Check className="size-3.5" strokeWidth={3} />
                {categoriaLabel[aviso.animal.categoria]} anotada
              </>
            )}
            {aviso?.k === 'alta' && (
              <>
                <Check className="size-3.5" strokeWidth={3} />
                Caravana nueva — se la pusimos a un{' '}
                {categoriaLabel[aviso.animal.categoria]}
              </>
            )}
            {aviso?.k === 'repetido' && (
              <>
                <AlertTriangle className="size-3.5" />
                Ya lo hiciste — no se anota dos veces
              </>
            )}
            {aviso?.k === 'desconocido' && (
              <>
                <AlertTriangle className="size-3.5" />
                Esa caravana no es de tus animales
              </>
            )}
            {aviso?.k === 'otraCategoria' && (
              <>
                <AlertTriangle className="size-3.5" />
                Es {categoriaLabel[aviso.animal.categoria]} — ¿leíste el de al lado?
              </>
            )}
            {!aviso && 'Podés guardar el teléfono'}
          </p>
        </div>

        {/* La categoría no está en el plan: sin este aviso la pantalla no
            cambia y parece que la app no reaccionó al escaneo. */}
        {sinGrupo && (
          <div className="shrink-0 rounded-2xl border-2 border-[var(--c-bad)]/70 bg-[var(--c-bad-soft)] px-4 py-3">
            <p className="c-display text-[15.5px] text-[var(--c-bad)]">
              {sinGrupo} no está en el plan
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--c-bad)]">
              No le asignaste grupo, así que no se apartó ni se contó.
            </p>
          </div>
        )}

        {/* ===== Las puertas del cepo ===== */}
        {salidasEnOrden.length > 0 && (
          <div className="flex min-h-[236px] flex-1 flex-col">
            <Puertas
              salidas={salidasEnOrden}
              porSalida={porSalida}
              encendida={resuelto?.salida.id ?? null}
              heroEncendida={resuelto?.hero}
              activa={plan?.modo === 'libre' ? grupoFijo : null}
              pidiendoToque={esperandoToque}
              onElegir={
                plan?.modo === 'libre'
                  ? (s) => setGrupoFijo(s.id)
                  : esperandoToque
                    ? (s) => void responderPorSalida(s.id)
                    : undefined
              }
            />
          </div>
        )}

        {t.conError > 0 && (
          <button
            type="button"
            onClick={() => void t.sincronizar()}
            className="c-label flex items-center justify-center gap-1.5 rounded-lg border border-[var(--c-bad)]/45 bg-[var(--c-bad-soft)] px-3 py-2 !text-[11px] !text-[var(--c-bad)]"
          >
            <RefreshCw className="size-3.5" />
            {t.conError} con problema · reintentar
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-bg)] px-4 pb-3.5 pt-3">
        <button
          type="button"
          onClick={() => setCerrando(true)}
          className="c-display flex h-12 w-full items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[15px] text-[var(--c-ink-soft)]"
        >
          Terminar
        </button>
      </div>
    </div>
  )
}
