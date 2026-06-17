import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  Beef,
  LandPlot,
  Leaf,
  Sprout,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import type { CampoConPotreros } from '@/features/campos/api'
import type { LineaCampo, LineaPotrero } from '@/features/analitica/compute'
import { Panel } from '@/components/panel'

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000)
    return `${sign}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${abs}`
}

type Fin = { ingresos: number; gastos: number; resultado: number }
type Estado = 'sin' | 'curso' | 'gana' | 'pierde'

/** Ciclo largo: invertir y todavía no vender NO es pérdida, es inversión.
 *  Solo hay ganancia/pérdida cuando hubo ingresos. */
function estadoDe(f: Fin | undefined): Estado {
  if (!f || (f.ingresos === 0 && f.gastos === 0)) return 'sin'
  if (f.ingresos === 0 && f.gastos > 0) return 'curso'
  return f.resultado >= 0 ? 'gana' : 'pierde'
}

const COLOR: Record<Estado, string> = {
  sin: 'var(--faint)',
  curso: 'var(--sol-deep)',
  gana: 'var(--field-deep)',
  pierde: 'var(--destructive)',
}
const ETIQUETA: Record<Estado, string> = {
  sin: '',
  curso: 'Invertido',
  gana: 'Ganancia',
  pierde: 'Pérdida',
}

// Identidad visual por TIPO de potrero (lo que se ve a simple vista).
type Tipo = 'ganadero' | 'agricola' | 'forrajero' | 'vacio'
const AGRICOLA = ['preparacion', 'siembra', 'cultivo', 'cosecha', 'rastrojo']

function tipoDe(
  estadoCiclo: string,
  cabezas: number,
  cultivo: string | null,
  destino: string | null,
): Tipo {
  if (destino === 'consumo') return 'forrajero'
  if (estadoCiclo === 'ganadero' || cabezas > 0) return 'ganadero'
  if (AGRICOLA.includes(estadoCiclo) || cultivo) return 'agricola'
  return 'vacio'
}

const TIPO: Record<
  Tipo,
  { color: string; tint: string; Icon: LucideIcon; label: string }
> = {
  ganadero: {
    color: 'var(--field-deep)',
    tint: 'var(--field-soft)',
    Icon: Beef,
    label: 'Ganadero',
  },
  agricola: {
    color: 'var(--sol-deep)',
    tint: 'var(--sol-soft)',
    Icon: Wheat,
    label: 'Agrícola',
  },
  forrajero: {
    color: 'var(--tierra)',
    tint: 'var(--tierra-soft)',
    Icon: Leaf,
    label: 'Forrajero',
  },
  vacio: {
    color: 'var(--faint)',
    tint: 'var(--secondary)',
    Icon: LandPlot,
    label: 'En descanso',
  },
}

/** Card compacta: el número manda. Las sin datos quedan apagadas (mismo tamaño,
 *  segundo plano) — visibles pero sin robar la atención. */
function PotreroCard({
  potreroId,
  nombre,
  ha,
  cabezas,
  estadoCiclo,
  cultivo,
  destino,
  fin,
}: {
  potreroId: string
  nombre: string
  ha: number | null
  cabezas: number
  estadoCiclo: CampoConPotreros['potreros'][number]['estadoCiclo']
  cultivo: string | null
  destino: CampoConPotreros['potreros'][number]['destino']
  fin: Fin | undefined
}) {
  // Identidad por tipo de potrero
  const tipo = tipoDe(estadoCiclo, cabezas, cultivo, destino)
  const t = TIPO[tipo]
  const Marca = t.Icon

  // Forraje (consumo) = centro de costo: se muestra el costo, no ganancia/pérdida.
  const esForraje = destino === 'consumo'
  const gastos = fin?.gastos ?? 0
  let etiqueta: string
  let valor: number
  let numColor: string
  let flecha: typeof ArrowUpRight | null
  let sin: boolean

  if (esForraje) {
    sin = gastos === 0
    etiqueta = sin ? 'Sin movimientos' : 'Costo de forraje'
    valor = gastos
    numColor = 'var(--tierra)'
    flecha = null
  } else {
    const estado = estadoDe(fin)
    sin = estado === 'sin'
    etiqueta = sin ? 'Sin movimientos' : ETIQUETA[estado]
    valor = estado === 'curso' ? gastos : (fin?.resultado ?? 0)
    numColor = COLOR[estado]
    flecha = estado === 'pierde' ? ArrowDownRight : ArrowUpRight
  }
  const valorHa = ha && ha > 0 && !sin ? Math.round(valor / ha) : null
  const Flecha = flecha

  return (
    <Link
      to={`/potrero/${potreroId}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,19,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(16,30,20,0.12)]"
    >
      {/* Tinte y marca de agua del TIPO de potrero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${t.tint} 55%, transparent), transparent 60%)`,
        }}
      />
      <Marca
        aria-hidden
        className="pointer-events-none absolute -bottom-4 -right-3 size-28 opacity-[0.07] transition-all group-hover:scale-110 group-hover:opacity-[0.12]"
        style={{ color: t.color }}
        strokeWidth={1.5}
      />
      <div
        aria-hidden
        className="absolute left-0 top-0 h-full w-1.5"
        style={{ background: t.color }}
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <h4 className="truncate font-heading text-[17px] font-bold text-ink">
            {nombre}
          </h4>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
            style={{
              color: t.color,
              background: `color-mix(in srgb, ${t.color} 12%, transparent)`,
            }}
          >
            <Marca className="size-3" />
            {t.label}
          </span>
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-faint">
              {etiqueta}
            </div>
            <div
              className="tnum flex items-center gap-1 text-[30px] font-bold leading-none"
              style={{ color: numColor }}
            >
              {!sin && Flecha && <Flecha className="size-5" strokeWidth={2.5} />}
              {sin ? '—' : fmtCompact(valor)}
            </div>
          </div>
          {valorHa != null && (
            <div className="tnum pb-0.5 text-right text-[15px] font-bold text-muted-foreground">
              {fmtCompact(valorHa)}
              <span className="text-[11px] font-semibold text-faint">/ha</span>
            </div>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <span className="tnum truncate text-[12px] text-faint">
            {ha ? `${ha} ha` : 's/ha'}
            {cabezas > 0 && ` · ${cabezas} cab`}
            {cultivo && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-field">
                <Sprout className="size-3" />
                {cultivo}
              </span>
            )}
          </span>
          <span
            className="inline-flex items-center gap-0.5 text-[12px] font-semibold"
            style={{ color: t.color }}
          >
            {sin ? 'Cargar' : 'Ver'}
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}

/** Rentabilidad por potrero: cards compactas para los que tienen datos, y un
 *  strip de chips para los que todavía no — foco en lo que importa. */
export function RentabilidadPotreros({
  campos,
  potreros,
  camposConPotreros,
}: {
  campos: LineaCampo[]
  potreros: LineaPotrero[]
  camposConPotreros: CampoConPotreros[]
}) {
  const finPorPotrero = new Map<string, Fin>(
    potreros.map((p) => [
      p.potreroId,
      { ingresos: p.ingresos, gastos: p.gastos, resultado: p.resultado },
    ]),
  )
  const finPorCampo = new Map<string, LineaCampo>(
    campos.map((c) => [c.campoId, c]),
  )

  const lista = [...camposConPotreros].sort(
    (a, b) =>
      (finPorCampo.get(b.id)?.resultado ?? 0) -
      (finPorCampo.get(a.id)?.resultado ?? 0),
  )

  return (
    <Panel
      title="Rentabilidad por potrero"
      sub="tocá un potrero para ver todo su detalle"
    >
      {lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sin campos cargados todavía.
        </p>
      ) : (
        <div className="flex flex-col gap-7">
          {lista.map((campo) => {
            // Con datos primero, vacíos después; dentro, por resultado.
            const orden = [...campo.potreros].sort((a, b) => {
              const fa = finPorPotrero.get(a.id)
              const fb = finPorPotrero.get(b.id)
              const sa = estadoDe(fa) === 'sin' ? 1 : 0
              const sb = estadoDe(fb) === 'sin' ? 1 : 0
              if (sa !== sb) return sa - sb
              return (fb?.resultado ?? 0) - (fa?.resultado ?? 0)
            })
            const cf = finPorCampo.get(campo.id)
            const estado = estadoDe(cf)
            const ha = campo.hectareas ?? campo.totalHa
            const valor = estado === 'curso' ? (cf?.gastos ?? 0) : (cf?.resultado ?? 0)
            const valorHa = ha > 0 && valor ? Math.round(valor / ha) : null

            return (
              <div key={campo.id}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="flex items-baseline gap-2">
                    <h4 className="font-heading text-[16px] font-bold text-ink">
                      {campo.nombre}
                    </h4>
                    <span className="text-[12px] text-faint">
                      {campo.potreros.length}{' '}
                      {campo.potreros.length === 1 ? 'potrero' : 'potreros'}
                      {ha > 0 && ` · ${ha} ha`}
                    </span>
                  </div>
                  {estado !== 'sin' && (
                    <span className="flex items-baseline gap-1.5 text-[13px]">
                      <span className="text-faint">{ETIQUETA[estado].toLowerCase()}</span>
                      <span
                        className="tnum font-bold"
                        style={{ color: COLOR[estado] }}
                      >
                        {fmtCompact(valor)}
                      </span>
                      {valorHa != null && (
                        <span className="tnum text-[11px] text-faint">
                          ({fmtCompact(valorHa)}/ha)
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {campo.potreros.length === 0 ? (
                  <p className="py-2 text-[13px] text-faint">
                    Este campo no tiene potreros cargados.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {orden.map((p) => (
                      <PotreroCard
                        key={p.id}
                        potreroId={p.id}
                        nombre={p.nombre}
                        ha={p.hectareas}
                        cabezas={p.cabezas}
                        estadoCiclo={p.estadoCiclo}
                        cultivo={p.cultivo}
                        destino={p.destino}
                        fin={finPorPotrero.get(p.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
