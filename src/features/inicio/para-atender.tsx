import * as React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarClock, Check, CheckCircle2, ChevronDown, Footprints, RotateCw } from 'lucide-react'

type Estado = 'resuelto' | 'sigue'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'
import { nivelUI } from '@/features/inicio/para-atender-ui'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useQueryClient } from '@tanstack/react-query'
import {
  invalidarAvisos,
  useDeshacerMarca,
  useMarcarSenal,
} from '@/features/inicio/marcar-senal'
import {
  type Aviso,
  type Nivel,
  type PotreroAtencion,
  haceLabel,
  useParaAtender,
} from '@/features/inicio/para-atender-api'


const fmtNum = new Intl.NumberFormat('es-AR')

/**
 * Una fila = un potrero, con sus señales adentro. El ícono, el color y la
 * posición los pone la señal más grave; las demás se listan al lado para que
 * se vea de un saque todo lo que hay que hacer en ese viaje.
 */
/**
 * Botón de decisión, con el lenguaje del Modo Campo (`CSegBtn` de la manga):
 * dos opciones parejas con borde marcado, que se RELLENAN con su tono cuando se
 * eligen. No es "acción principal + escape": son dos declaraciones con el mismo
 * rango, y el productor tiene que ver cuál eligió.
 */
function DecisionBtn({
  tono,
  icon: Icon,
  label,
  elegido,
  apagado,
  disabled,
  onClick,
}: {
  tono: 'ok' | 'warn'
  icon: typeof Check
  label: string
  elegido: boolean
  apagado: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={elegido}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-[11.5px] font-bold transition-all active:scale-[0.97] disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-soft',
        elegido
          ? tono === 'ok'
            ? 'border-field bg-field text-white shadow-[0_1px_3px_rgba(16,30,20,0.12)]'
            : 'border-sol-deep bg-sol-deep text-white shadow-[0_1px_3px_rgba(16,30,20,0.12)]'
          : apagado
            ? 'border-border/60 bg-card text-faint opacity-50'
            : tono === 'ok'
              ? 'border-border bg-card text-ink hover:border-field/60 hover:bg-field/[0.06]'
              : 'border-border bg-card text-ink hover:border-sol-deep/50 hover:bg-sol-soft',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

/**
 * Las señales de un potrero, cada una con su declaración.
 *
 * Va POR SEÑAL y no por fila: un potrero con aguada seca, eléctrico cortado y
 * pasto pelado no puede apagarse entero porque arreglaste la bomba.
 *
 * Marcar NO recarga la lista al instante: si el aviso desapareciera en el
 * momento, el productor no vería confirmación de nada — la fila se esfuma y
 * queda la duda de si se guardó. En vez de eso el botón elegido queda relleno,
 * con un "Deshacer" al lado, y la lista se actualiza cuando cierra el potrero.
 */
function SenalesDelPotrero({ p, empresaId }: { p: PotreroAtencion; empresaId: string }) {
  const qc = useQueryClient()
  const marcar = useMarcarSenal()
  const deshacer = useDeshacerMarca()
  const [hechas, setHechas] = React.useState<Record<string, { id: string; estado: Estado }>>({})
  const [enCurso, setEnCurso] = React.useState<string | null>(null)

  /* Al cerrar el potrero (o irse del Inicio) recién ahí se refresca: lo marcado
   * ya se vio confirmado y se pudo deshacer. */
  React.useEffect(() => () => invalidarAvisos(qc, p.key), [qc, p.key])

  const declarar = (a: Aviso, estado: Estado) => {
    if (hechas[a.key]) return
    setEnCurso(a.key)
    marcar.mutate(
      { empresaId, potreroId: p.key, observacionId: p.observacionId, tipo: a.tipo, estado },
      {
        onSuccess: (id) => setHechas((h) => ({ ...h, [a.key]: { id, estado } })),
        onSettled: () => setEnCurso(null),
      },
    )
  }

  const anular = (avisoKey: string, id: string) =>
    deshacer.mutate(id, {
      onSuccess: () =>
        setHechas((h) => {
          const resto = { ...h }
          delete resto[avisoKey]
          return resto
        }),
    })

  return (
    <div className="mt-2.5 flex flex-col gap-1 border-t border-border/60 pt-2.5">
      {p.avisos.map((a) => {
        const hecha = hechas[a.key]
        const ocupado = enCurso === a.key
        return (
          <motion.div
            key={a.key}
            animate={hecha ? { scale: [0.985, 1] } : {}}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-2 transition-colors',
              hecha
                ? hecha.estado === 'resuelto'
                  ? 'bg-field/[0.06]'
                  : 'bg-sol-soft/60'
                : 'hover:bg-secondary/50',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                hecha?.estado === 'resuelto' ? 'bg-field' : nivelUI[a.nivel].punto,
              )}
            />
            <span className="min-w-0 flex-1 text-[12.5px] text-ink">
              {a.titulo}
              {/* La novedad SIN su texto no dice nada: "Novedad" no es un aviso,
                  "Vaca caída" sí. */}
              {a.detalle && (
                <span className="text-muted-foreground">
                  {a.nivel === 'nota' ? ` — “${a.detalle}”` : ` (${a.detalle})`}
                </span>
              )}
              {a.revisadoHace != null && !hecha && (
                <span className="text-faint"> · revisado {haceLabel(a.revisadoHace)}</span>
              )}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <DecisionBtn
                tono="ok"
                icon={Check}
                label="Se solucionó"
                elegido={hecha?.estado === 'resuelto'}
                apagado={hecha?.estado === 'sigue'}
                disabled={ocupado || !!hecha}
                onClick={() => declarar(a, 'resuelto')}
              />
              <DecisionBtn
                tono="warn"
                icon={RotateCw}
                label="Sigue igual"
                elegido={hecha?.estado === 'sigue'}
                apagado={hecha?.estado === 'resuelto'}
                disabled={ocupado || !!hecha}
                onClick={() => declarar(a, 'sigue')}
              />
              {hecha && (
                <button
                  type="button"
                  onClick={() => anular(a.key, hecha.id)}
                  className="rounded px-1.5 py-0.5 text-[11.5px] font-semibold text-muted-foreground underline underline-offset-2 transition-colors hover:text-ink"
                >
                  Deshacer
                </button>
              )}
            </div>
          </motion.div>
        )
      })}
      {(marcar.isError || deshacer.isError) && (
        <p className="px-2 pt-1 text-[11.5px] text-destructive">
          No se pudo guardar: {((marcar.error ?? deshacer.error) as Error).message}
        </p>
      )}
    </div>
  )
}

function PotreroRow({
  p,
  i,
  abierta,
  onToggle,
  empresaId,
}: {
  p: PotreroAtencion
  i: number
  abierta: boolean
  onToggle: () => void
  empresaId: string
}) {
  const ui = nivelUI[p.nivel]
  const Icon = p.avisos[0].icon
  const nota = p.avisos.find((a) => a.nivel === 'nota' && a.detalle)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border bg-card px-3.5 py-3 transition-all',
        abierta ? 'border-faint shadow-[0_6px_18px_rgba(16,24,19,0.08)]' : 'border-border/70',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-soft"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13.5px] font-semibold text-ink">{p.potrero}</span>
            <span className="truncate text-[12px] font-medium text-faint">{p.campo}</span>
            {p.cabezas > 0 && (
              <span className="tnum shrink-0 text-[12px] font-semibold text-muted-foreground">
                {fmtNum.format(p.cabezas)} {p.cabezas === 1 ? 'animal' : 'animales'}
              </span>
            )}
          </div>
          <div className="mt-1 text-[12px] text-ink">
            {p.avisos.map((a, n) => (
              <React.Fragment key={a.key}>
                {n > 0 && <span aria-hidden className="px-1.5 text-faint">·</span>}
                {a.titulo}
                {a.detalle && a.nivel !== 'nota' && (
                  <span className="text-faint"> ({a.detalle})</span>
                )}
              </React.Fragment>
            ))}
          </div>
          {/* Abierta, la novedad ya se lee completa en su propia fila con sus
              botones: repetirla acá era decir dos veces lo mismo. */}
          {nota?.detalle && !abierta && (
            <div className="mt-1 truncate text-[12px] text-muted-foreground">
              “{nota.detalle}”
            </div>
          )}
        </div>
        <span className={cn('tnum shrink-0 rounded-md px-2 py-1 text-[11px] font-bold', ui.chip)}>
          {ui.label} · {haceLabel(p.hace)}
        </span>
        {/* Única pista permanente de que la fila hace algo. */}
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 text-faint transition-transform', abierta && 'rotate-180')}
        />
      </button>
      {abierta && <SenalesDelPotrero p={p} empresaId={empresaId} />}
    </motion.div>
  )
}

/** La primera visita abre la primera fila, para que los botones se vean una vez. */
const BOTONES_VISTOS = 'para-atender-botones-vistos'

/** Cuántas filas se muestran antes del "Mostrar los N restantes". */
const FILAS_VISIBLES = 6

/** Chip de filtro del panel (nivel o campo). */
function ChipFiltro({
  activo,
  onClick,
  clase,
  children,
}: {
  activo: boolean
  onClick: () => void
  /** Clases del estado ACTIVO (color según el nivel). */
  clase: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors',
        activo
          ? clase
          : 'border-border bg-card text-muted-foreground hover:border-faint hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/**
 * "Para atender en el campo": traduce las recorridas del Modo Campo a avisos
 * accionables en el Inicio, AGRUPADOS POR POTRERO — una fila es un lugar al que
 * ir, con todo lo que pasa ahí adentro. Ordenados por gravedad de la peor señal,
 * después por cuántos animales hay en juego, después por lo que lleva más tiempo
 * sin resolverse. Los campos sin recorrer y los nacimientos van aparte.
 */
export function ParaAtenderCampo() {
  const { data, isLoading, error } = useParaAtender()


  const empresaId = useEmpresa().data?.empresa_id ?? ''

  /* Educar sin explicar: la PRIMERA vez, la primera fila viene abierta y los
   * botones se muestran solos. Después el chevron alcanza. Un cartel de "tocá
   * para ver qué podés hacer" sería ruido permanente para algo que se aprende
   * una vez. Estado (no ref) porque se lee durante el render. */
  const [abierta, setAbierta] = React.useState<string | null | undefined>(undefined)
  const [primeraVez] = React.useState(() => {
    try {
      return localStorage.getItem(BOTONES_VISTOS) !== '1'
    } catch {
      return false
    }
  })
  const [nivel, setNivel] = React.useState<'todos' | Nivel>('todos')
  const [campo, setCampo] = React.useState<string>('todos')
  const [verTodo, setVerTodo] = React.useState(false)

  const potreros = React.useMemo(() => data?.potreros ?? [], [data])
  // El efecto sólo escribe storage: nada de setState acá.
  React.useEffect(() => {
    if (!primeraVez || potreros.length === 0) return
    try {
      localStorage.setItem(BOTONES_VISTOS, '1')
    } catch {
      /* sin storage: se vuelve a mostrar la próxima vez, no es grave */
    }
  }, [primeraVez, potreros.length])
  const abiertaKey =
    abierta !== undefined ? abierta : primeraVez ? (potreros[0]?.key ?? null) : null
  const sinRecorrer = React.useMemo(() => data?.sinRecorrer ?? [], [data])
  const campos = React.useMemo(
    () =>
      [...new Set([...potreros.map((p) => p.campo), ...sinRecorrer.map((c) => c.campo)])].sort(),
    [potreros, sinRecorrer],
  )
  const delCampo = React.useMemo(
    () => (campo === 'todos' ? potreros : potreros.filter((p) => p.campo === campo)),
    [potreros, campo],
  )
  // Los chips cuentan POTREROS que tienen al menos una señal de ese nivel:
  // "3 potreros para atender" es la unidad de trabajo, no "7 señales".
  const conteo = React.useMemo(() => {
    const c: Record<Nivel, number> = { atender: 0, prevenir: 0, nota: 0 }
    for (const p of delCampo)
      for (const n of new Set(p.avisos.map((a) => a.nivel))) c[n]++
    return c
  }, [delCampo])
  const filtrados =
    nivel === 'todos' ? delCampo : delCampo.filter((p) => p.avisos.some((a) => a.nivel === nivel))
  const visibles = verTodo ? filtrados : filtrados.slice(0, FILAS_VISIBLES)
  const restantes = filtrados.length - visibles.length
  const sinRecorrerDelCampo =
    campo === 'todos' ? sinRecorrer : sinRecorrer.filter((c) => c.campo === campo)
  const hayAlgo = potreros.length > 0 || sinRecorrer.length > 0

  return (
    <Panel
      title="Para atender en el campo"
      info="Lo que dejaron las últimas recorridas, agrupado por potrero: aguadas y pasto al límite, eléctrico cortado, animales en tratamiento y conteos que no cierran. Arriba, lo más grave y donde hay más animales en juego. Tocá una fila para ir al potrero."
    >
      {/* Novedades del campo. Fuera de la lista de avisos: ahí quedaban últimas
          (nivel `nota`) y cortadas por FILAS_VISIBLES, o sea invisibles.
          Sin link por fila: llevar al potrero no aportaba nada — el nacimiento
          ya está contado en su stock. La única acción real que deja una cría es
          CARAVANEARLA, así que ese es el único link. */}
      {!isLoading && !error && (data?.nacimientos.length ?? 0) > 0 && (
        <div className="mb-3 rounded-xl border border-field/25 bg-field/[0.04] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-field">
            Nacimientos anotados en el campo
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {data!.nacimientos.map((n) => (
              <li key={n.key} className="flex items-baseline gap-2.5 text-sm">
                <span className="tnum shrink-0 text-base font-bold text-ink">{n.total}</span>
                <span className="min-w-0 flex-1 text-ink">
                  {n.detalle}
                  <span className="text-faint"> · {n.potrero}</span>
                </span>
                <span className="tnum shrink-0 text-xs text-faint">{n.fecha}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/hacienda?sinCaravana=1"
            className="mt-2.5 inline-block text-xs font-semibold text-field hover:underline"
          >
            Están sin caravana — ver los que faltan caravanear →
          </Link>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-destructive">
          Error al cargar: {(error as Error).message}
        </p>
      ) : !data || data.ultimaRecorridaHace == null ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
          <Footprints className="size-6 shrink-0 text-field/70" />
          <div>
            <p className="text-sm font-medium text-ink">
              Todavía no hay recorridas cargadas.
            </p>
            <p className="text-xs text-faint">
              Recorré el campo desde el teléfono (Modo Campo) y acá vas a ver
              qué atender: aguadas, pasto, eléctrico, tratamientos y novedades.
            </p>
          </div>
        </div>
      ) : !hayAlgo ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
          <CheckCircle2 className="size-6 shrink-0 text-field/70" />
          <div>
            <p className="text-sm font-medium text-ink">
              Todo en orden según las últimas recorridas.
            </p>
            <p className="text-xs text-faint">
              Última recorrida {haceLabel(data.ultimaRecorridaHace)}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Filtros: nivel a la izquierda, campo a la derecha. Solo aparecen
              cuando la lista lo amerita (pocas filas no piden filtro). */}
          {potreros.length > FILAS_VISIBLES && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <ChipFiltro
                  activo={nivel === 'todos'}
                  onClick={() => setNivel('todos')}
                  clase="border-ink bg-ink text-white"
                >
                  Todos · {delCampo.length}
                </ChipFiltro>
                <ChipFiltro
                  activo={nivel === 'atender'}
                  onClick={() => setNivel(nivel === 'atender' ? 'todos' : 'atender')}
                  clase="border-destructive/30 bg-destructive/10 text-destructive"
                >
                  Atender · {conteo.atender}
                </ChipFiltro>
                <ChipFiltro
                  activo={nivel === 'prevenir'}
                  onClick={() => setNivel(nivel === 'prevenir' ? 'todos' : 'prevenir')}
                  clase="border-sol-deep/30 bg-sol-soft text-sol-deep"
                >
                  Prevenir · {conteo.prevenir}
                </ChipFiltro>
                {conteo.nota > 0 && (
                  <ChipFiltro
                    activo={nivel === 'nota'}
                    onClick={() => setNivel(nivel === 'nota' ? 'todos' : 'nota')}
                    clase="border-sky/30 bg-sky-soft text-sky"
                  >
                    Notas · {conteo.nota}
                  </ChipFiltro>
                )}
              </div>
              {campos.length > 1 && (
                <select
                  value={campo}
                  onChange={(e) => setCampo(e.target.value)}
                  aria-label="Filtrar por campo"
                  className="rounded-full border border-border bg-card px-3 py-1 text-[12px] font-semibold text-muted-foreground outline-none transition-colors hover:border-faint focus-visible:ring-2 focus-visible:ring-field-soft"
                >
                  <option value="todos">Todos los campos</option>
                  {campos.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {filtrados.length === 0 ? (
            /* Sólo es "no hay resultados" si hay algo que filtrar: sin potreros
             * con avisos (pero con campos sin recorrer) no hay filtro puesto. */
            potreros.length > 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">Nada con este filtro.</p>
            ) : null
          ) : (
            <div className="flex flex-col gap-2">
              {visibles.map((p, i) => (
                <PotreroRow
                  key={p.key}
                  p={p}
                  i={i}
                  empresaId={empresaId}
                  abierta={abiertaKey === p.key}
                  onToggle={() => setAbierta((k) => (k === p.key ? null : p.key))}
                />
              ))}
            </div>
          )}

          {restantes > 0 && (
            <button
              type="button"
              onClick={() => setVerTodo(true)}
              className="rounded-xl border border-dashed border-border py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:border-faint hover:text-ink"
            >
              Mostrar los {restantes} restantes
            </button>
          )}
          {verTodo && filtrados.length > FILAS_VISIBLES && (
            <button
              type="button"
              onClick={() => setVerTodo(false)}
              className="rounded-xl border border-dashed border-border py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:border-faint hover:text-ink"
            >
              Mostrar menos
            </button>
          )}

          {/* Campos sin recorrer: no se arreglan yendo a un potrero, así que no
              compiten con la lista de arriba. */}
          {sinRecorrerDelCampo.length > 0 && (
            <div
              className={cn(
                'flex flex-col gap-2',
                // El separador sólo tiene sentido si hay filas arriba de las
                // que separarse; solo, dejaba una línea suelta y aire muerto.
                filtrados.length > 0 && 'mt-1 border-t border-border/70 pt-3',
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                Sin recorrer
              </p>
              {sinRecorrerDelCampo.map((c) => (
                <Link
                  key={c.key}
                  to={c.to}
                  className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-2.5 transition-all hover:-translate-y-px hover:border-faint hover:shadow-[0_6px_18px_rgba(16,24,19,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-soft"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sol-soft text-sol-deep">
                    {c.hace == null ? (
                      <Footprints className="size-[18px]" />
                    ) : (
                      <CalendarClock className="size-[18px]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-ink">
                        {c.campo}
                      </span>
                      <span className="tnum shrink-0 text-[12px] font-semibold text-muted-foreground">
                        {fmtNum.format(c.cabezas)} {c.cabezas === 1 ? 'animal' : 'animales'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {c.hace == null
                        ? 'Todavía no se recorrió'
                        : `${haceLabel(c.hace).replace('hace', 'Hace')} sin recorrer`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
