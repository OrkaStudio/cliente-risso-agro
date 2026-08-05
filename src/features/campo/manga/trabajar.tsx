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
import {
  RESULTADOS_TACTO,
  colorLado,
  destinoLabel,
  ladoCorto,
  ladoDe,
  ladoLabel,
  salidaDe,
  type Lado,
  type PlanSalidas,
} from './salidas'
import { useTrabajos, type ResultadoEscaneo, type SesionTrabajo } from './use-trabajos'
import { CerrarTrabajo } from './cerrar-trabajo'

/**
 * Pantalla de trabajo, con la MISMA forma que el caravaneo — que es la que el
 * productor ya usa: barra de instrumento arriba, el número de caravana como
 * héroe, y abajo lo que pida el trabajo del día.
 *
 * Lo único que cambia entre trabajos es esa zona de abajo:
 *   · cero toques  → el cartel del lado (o nada, si no se aparta)
 *   · tacto        → los dos botones del resultado
 *   · aparte libre → el selector de lado, que queda puesto
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
  const [lado, setLado] = useState<Lado | null>(null)
  // Cuántos salieron por cada lado. Es el control del trabajo: en un destete,
  // madres y crías tienen que cerrar parejo.
  const [porLado, setPorLado] = useState<Partial<Record<Lado, number>>>({})
  // Modo libre: el lado lo pone el operario y DURA hasta que mueva la puerta.
  const [ladoFijo, setLadoFijo] = useState<Lado>('izq')
  // Modo resultado: el animal ya está identificado y espera el toque.
  const [esperando, setEsperando] = useState<ResultadoEscaneo | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const limpiar = useRef<ReturnType<typeof setTimeout> | null>(null)
  const salida = lado && plan ? salidaDe(plan, lado) : null

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

        // El lado sale de tres lugares distintos según el trabajo — y en dos de
        // los tres no hay que tocar nada.
        if ((r.k === 'ok' || r.k === 'alta') && plan) {
          if (plan.modo === 'categoria') {
            const l2 = ladoDe(plan, r.animal.categoria)
            setLado(l2)
            if (l2) setPorLado((p) => ({ ...p, [l2]: (p[l2] ?? 0) + 1 }))
          } else if (plan.modo === 'libre') {
            setLado(ladoFijo)
            setPorLado((p) => ({ ...p, [ladoFijo]: (p[ladoFijo] ?? 0) + 1 }))
          } else {
            // Resultado: no se resuelve hasta que el operario toque.
            setEsperando(r)
            setLado(null)
          }
        } else if (r.k !== 'ok' && r.k !== 'alta') {
          setLado(null)
        }

        if (limpiar.current) clearTimeout(limpiar.current)
        limpiar.current = setTimeout(
          () => setAviso(null),
          r.k === 'ok' || r.k === 'alta' ? 2600 : 6000,
        )
      })()
    },
  })

  /** El toque del tacto: registra el resultado Y manda al lado. Un solo gesto. */
  const responder = async (clave: string) => {
    if (!esperando || esperando.k !== 'ok' || !plan) return
    const l2 = plan.porResultado?.[clave] ?? null
    await t.completar(esperando.animal, { resultado: clave })
    if ('vibrate' in navigator) navigator.vibrate(40)
    setLado(l2)
    if (l2) setPorLado((p) => ({ ...p, [l2]: (p[l2] ?? 0) + 1 }))
    setEsperando(null)
  }

  if (cerrando) {
    return (
      <CerrarTrabajo
        titulo={titulo}
        hechos={t.hechos}
        total={total}
        porLado={porLado}
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
              <span className="c-mono block text-[32px] font-bold text-[var(--c-ok-deep)]">
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5">
        <div className="c-display truncate text-[17px] text-[var(--c-ink)]">
          {titulo}
        </div>

        {/* ===== El número de caravana: el héroe, igual que en el caravaneo ===== */}
        <div>
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

        {/* ===== Lo que pide el trabajo del día ===== */}

        {/* Tacto: dos botones grandes. El toque registra y aparta a la vez. */}
        {esperandoToque && (
          <div className="grid grid-cols-2 gap-2.5">
            {RESULTADOS_TACTO.map((r, i) => {
              const l2: Lado = i === 0 ? 'izq' : 'der'
              const c = colorLado[l2]
              return (
                <motion.button
                  key={r.clave}
                  type="button"
                  onClick={() => void responder(r.clave)}
                  whileTap={{ scale: 0.97 }}
                  className="c-display flex h-28 flex-col items-center justify-center gap-1 rounded-2xl border-4 text-[21px]"
                  style={{ borderColor: c.borde, color: c.tinta }}
                >
                  {r.label}
                  <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                    {ladoLabel[l2]}
                  </span>
                </motion.button>
              )
            })}
          </div>
        )}

        {/* Cero toques con aparte: el cartel del lado es lo único que hay que
            ejecutar, y se lee de reojo desde el cepo. */}
        {!esperandoToque && lado && salida && (
          <motion.div
            key={`${t.hechos}-${lado}`}
            initial={{ scale: 0.94, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 340, damping: 24 }}
            className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border-4 py-6"
            style={{
              borderColor: colorLado[lado].borde,
              backgroundColor: colorLado[lado].fondo,
            }}
          >
            <span
              className="c-display text-[50px] leading-none tracking-tight"
              style={{ color: colorLado[lado].tinta }}
            >
              {ladoCorto[lado]}
            </span>
            <span
              className="text-[13.5px] font-bold"
              style={{ color: colorLado[lado].tinta }}
            >
              {destinoLabel(salida.destino)}
            </span>
          </motion.div>
        )}

        {/* Aparte libre: el lado queda puesto. Se toca al mover la puerta. */}
        {plan?.modo === 'libre' && (
          <div>
            <CLabel className="mb-1.5 block">¿Por dónde salen ahora?</CLabel>
            <div className="flex gap-2">
              {plan.salidas.map((s2) => {
                const c = colorLado[s2.lado]
                const on = ladoFijo === s2.lado
                return (
                  <motion.button
                    key={s2.lado}
                    type="button"
                    onClick={() => setLadoFijo(s2.lado)}
                    whileTap={{ scale: 0.97 }}
                    className="c-display flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-3 text-[15px]"
                    style={
                      on
                        ? {
                            borderColor: c.borde,
                            backgroundColor: c.fondo,
                            color: c.tinta,
                          }
                        : {
                            borderColor: 'var(--c-line-strong)',
                            color: 'var(--c-ink-soft)',
                          }
                    }
                  >
                    {ladoLabel[s2.lado]}
                    <span className="text-[10px] font-bold opacity-70">
                      {destinoLabel(s2.destino)}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}

        {/* Un contador por salida: si al final no cierran, algo se escapó. */}
        {plan && plan.salidas.length > 0 && (
          <div className="flex gap-2">
            {plan.salidas.map((s2) => (
              <div
                key={s2.lado}
                className="flex-1 rounded-xl border bg-[var(--c-panel)] px-2 py-2 text-center"
                style={{ borderColor: colorLado[s2.lado].borde }}
              >
                <span className="c-mono block text-[20px] font-bold text-[var(--c-ink)]">
                  {porLado[s2.lado] ?? 0}
                </span>
                <span
                  className="block truncate text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: colorLado[s2.lado].tinta }}
                >
                  {ladoLabel[s2.lado]}
                </span>
              </div>
            ))}
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
