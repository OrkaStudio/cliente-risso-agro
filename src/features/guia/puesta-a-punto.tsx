import * as React from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import {
  Beef,
  Check,
  ChevronUp,
  Footprints,
  MapPin,
  MapPinned,
  PencilRuler,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { useChecklist, type ItemChecklist } from '@/features/guia/checklist'
import { ejecutarEnAncla } from '@/features/guia/ejecutar'
import { usePanelAbierto } from '@/features/guia/guia-store'
import { cn } from '@/lib/utils'

/**
 * Smart checklist de puesta a punto — elemento PROPIO, separado del chat del
 * Asistente (decisión de Lau: el productor se centra en la misión, sin más
 * información alrededor). Pastilla flotante abajo a la derecha:
 *
 * - Colapsada: anillo de progreso + "Siguiente: <paso>". Un vistazo, cero lectura.
 * - Expandida: SOLO el camino de 5 pasos (íconos, detalle de una línea en el
 *   activo, acordeón opcional en el resto).
 * - Misión completa → desaparece para siempre (los ticks salen de la base).
 */

const ICONO_PASO: Record<ItemChecklist['id'], LucideIcon> = {
  campo: MapPinned,
  potreros: PencilRuler,
  hacienda: Beef,
  tropas: MapPin,
  recorrida: Footprints,
}

function claveColapsada(userId: string) {
  return `puesta-a-punto.colapsada.${userId}`
}

/** Anillo de progreso con el degradé del asistente (SVG chiquito). */
function Anillo({ hechos, total }: { hechos: number; total: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  const frac = total ? hechos / total : 0
  return (
    <svg viewBox="0 0 24 24" className="size-6 -rotate-90">
      <defs>
        <linearGradient id="anillo-pap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--field)" />
          <stop offset="60%" stopColor="var(--lima)" />
          <stop offset="100%" stopColor="var(--sky)" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--border)" strokeWidth="3.5" />
      <motion.circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="url(#anillo-pap)"
        strokeWidth="3.5"
        strokeLinecap="round"
        initial={false}
        animate={{ strokeDashoffset: c * (1 - frac) }}
        style={{ strokeDasharray: c }}
        transition={{ duration: 0.5 }}
      />
    </svg>
  )
}

export function PuestaAPunto() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const checklist = useChecklist()
  const panelAbierto = usePanelAbierto()
  const userId = user?.id ?? 'anon'

  const [colapsada, setColapsada] = React.useState(
    () => localStorage.getItem(claveColapsada(userId)) === '1',
  )
  const [expandido, setExpandido] = React.useState<string | null>(null)

  const items = checklist.data ?? []
  const hechos = items.filter((i) => i.hecho).length
  const pendientes = items.filter((i) => !i.hecho)
  const siguiente = pendientes[0]

  // Misión completa (o sin datos todavía, o panel del Asistente abierto): nada.
  if (!checklist.isSuccess || pendientes.length === 0 || panelAbierto) return null

  const setColapso = (v: boolean) => {
    setColapsada(v)
    try {
      localStorage.setItem(claveColapsada(userId), v ? '1' : '0')
    } catch {
      /* sin storage, no persiste el colapso */
    }
  }

  const irA = (item: ItemChecklist) => {
    navigate(item.ruta)
    ejecutarEnAncla(item.accion)
  }

  return createPortal(
    <MotionConfig reducedMotion="user">
      {/* Arriba a la derecha, colgando de la topbar: la misión siempre a la
          vista (decisión de Lau: checklist arriba, chat en burbuja abajo). */}
      <div className="fixed right-4 top-[86px] z-[65]">
        <AnimatePresence mode="wait" initial={false}>
          {colapsada ? (
            /* ===== Pastilla: progreso + siguiente paso, un toque ===== */
            <motion.button
              key="pill"
              type="button"
              onClick={() => setColapso(false)}
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              className="flex items-center gap-2.5 rounded-full border border-border bg-card py-2 pl-3 pr-4 shadow-[0_10px_36px_rgba(10,20,14,0.22)] transition-shadow hover:shadow-[0_12px_42px_rgba(10,20,14,0.3)]"
            >
              <Anillo hechos={hechos} total={items.length} />
              <span className="text-left leading-tight">
                <span className="block text-[10px] font-bold uppercase tracking-[0.09em] text-field-deep">
                  Tu campo, en marcha · {hechos} de {items.length}
                </span>
                <span className="block max-w-[220px] truncate text-[13px] font-semibold text-ink">
                  Siguiente: {siguiente?.titulo}
                </span>
              </span>
            </motion.button>
          ) : (
            /* ===== Expandida: SOLO el camino ===== */
            <motion.div
              key="card"
              initial={{ opacity: 0, y: -14, scale: 0.97, transformOrigin: 'top right' }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="w-[350px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_20px_60px_rgba(10,20,14,0.3)]"
            >
              <div className="h-[3px] w-full bg-gradient-to-r from-field via-lima to-sky" />
              <div className="flex items-center gap-2.5 px-4 pb-1 pt-3">
                <div className="min-w-0 flex-1">
                  <div className="font-heading text-[14.5px] font-bold text-ink">
                    Tu campo, en marcha
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {hechos} de {items.length} — te llevo paso a paso
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setColapso(true)}
                  title="Achicar"
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                >
                  <ChevronUp className="size-4" />
                </button>
              </div>

              <div className="max-h-[52vh] overflow-y-auto px-4 pb-4 pt-2">
                {items.map((item, i) => {
                  const activo = !item.hecho && item.id === siguiente?.id
                  const abiertoPaso = activo || expandido === item.id
                  const ultimo = i === items.length - 1
                  const Icono = ICONO_PASO[item.id]
                  return (
                    <div key={item.id} className="relative flex gap-2.5">
                      <div className="flex w-[30px] shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            'z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
                            item.hecho
                              ? 'border-field bg-field text-white'
                              : activo
                                ? 'border-field bg-field-soft text-field-deep shadow-[0_0_0_4px_rgba(23,138,85,0.13)]'
                                : 'border-border bg-card text-faint',
                          )}
                        >
                          {item.hecho ? (
                            <Check className="size-3.5" strokeWidth={3} />
                          ) : (
                            <Icono className="size-[15px]" />
                          )}
                        </span>
                        {!ultimo && (
                          <span
                            className={cn(
                              'w-[2px] flex-1',
                              item.hecho ? 'bg-field/50' : 'bg-border',
                            )}
                          />
                        )}
                      </div>

                      <div className={cn('min-w-0 flex-1', ultimo ? 'pb-0' : 'pb-2.5')}>
                        <button
                          type="button"
                          onClick={() =>
                            !item.hecho &&
                            !activo &&
                            setExpandido((e) => (e === item.id ? null : item.id))
                          }
                          className={cn(
                            'flex w-full items-center gap-2 pt-[5px] text-left text-[13px] leading-snug',
                            item.hecho
                              ? 'cursor-default text-faint line-through'
                              : activo
                                ? 'cursor-default font-heading font-bold text-ink'
                                : 'font-semibold text-ink/75',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{item.titulo}</span>
                          {activo && (
                            <motion.span
                              animate={{ opacity: [1, 0.5, 1] }}
                              transition={{ duration: 2.2, repeat: Infinity }}
                              className="shrink-0 rounded-full bg-field-soft px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.08em] text-field-deep"
                            >
                              ahora
                            </motion.span>
                          )}
                        </button>

                        <AnimatePresence initial={false}>
                          {abiertoPaso && !item.hecho && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22 }}
                              className="overflow-hidden"
                            >
                              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                                {item.detalle}
                              </p>
                              {item.movil ? (
                                <div className="mt-1.5 flex w-fit items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                                  <Smartphone className="size-3" />
                                  desde tu celular
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => irA(item)}
                                  className={cn(
                                    'mt-1.5 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-opacity hover:opacity-90',
                                    activo
                                      ? 'bg-field-deep text-white shadow-[0_2px_10px_rgba(11,88,55,0.35)]'
                                      : 'border border-field bg-card text-field-deep',
                                  )}
                                >
                                  {item.cta} →
                                </button>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>,
    document.body,
  )
}

