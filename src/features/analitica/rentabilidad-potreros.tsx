import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import type { CampoConPotreros } from '@/features/campos/api'
import { estadoCicloColor, estadoCicloLabel } from '@/features/campos/labels'
import type { LineaCampo, LineaPotrero } from '@/features/analitica/compute'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

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

/** Una campaña/ciclo en el campo es largo: si se invirtió y todavía no se
 *  vendió, NO es pérdida — es inversión en curso. Solo hay ganancia/pérdida
 *  cuando hubo ingresos. */
function estadoDe(f: Fin | undefined): Estado {
  if (!f || (f.ingresos === 0 && f.gastos === 0)) return 'sin'
  if (f.ingresos === 0 && f.gastos > 0) return 'curso'
  return f.resultado >= 0 ? 'gana' : 'pierde'
}

const ACENTO: Record<Estado, string> = {
  sin: 'border-l-border',
  curso: 'border-l-sol-deep',
  gana: 'border-l-field-deep',
  pierde: 'border-l-destructive',
}
const COLOR: Record<Estado, string> = {
  sin: 'text-faint',
  curso: 'text-sol-deep',
  gana: 'text-field-deep',
  pierde: 'text-destructive',
}

function PotreroCard({
  potreroId,
  nombre,
  ha,
  cabezas,
  estadoCiclo,
  cultivo,
  fin,
}: {
  potreroId: string
  nombre: string
  ha: number | null
  cabezas: number
  estadoCiclo: CampoConPotreros['potreros'][number]['estadoCiclo']
  cultivo: string | null
  fin: Fin | undefined
}) {
  const estado = estadoDe(fin)
  const ingresos = fin?.ingresos ?? 0
  const gastos = fin?.gastos ?? 0
  const resultado = fin?.resultado ?? 0
  const maxBar = Math.max(ingresos, gastos, 1)

  // Número principal: invertido (en curso) o resultado (cerrado).
  const valor = estado === 'curso' ? gastos : resultado
  const valorHa = ha && ha > 0 ? Math.round(valor / ha) : null
  const etiqueta =
    estado === 'curso'
      ? 'Invertido'
      : estado === 'sin'
        ? ''
        : 'Resultado'

  return (
    <Link
      to={`/potrero/${potreroId}`}
      className={cn(
        'group flex flex-col rounded-xl border border-l-4 border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,19,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,30,20,0.1)]',
        ACENTO[estado],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-heading text-[15px] font-bold text-ink">
            {nombre}
          </div>
          <div className="tnum text-[11px] text-faint">
            {ha ? `${ha} ha` : 's/ ha'}
            {cabezas > 0 && ` · ${cabezas} cab`}
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{
            color: estadoCicloColor[estadoCiclo],
            background: `color-mix(in srgb, ${estadoCicloColor[estadoCiclo]} 13%, transparent)`,
          }}
        >
          {estadoCicloLabel[estadoCiclo]}
        </span>
      </div>

      {estado === 'sin' ? (
        <div className="mt-3 flex-1 py-2 text-[13px] text-faint">
          Sin movimientos cargados
        </div>
      ) : (
        <>
          <div className="mt-3">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">
              {etiqueta}
            </div>
            <div className={cn('tnum text-[22px] font-bold leading-none', COLOR[estado])}>
              {fmtCompact(valor)}
            </div>
            <div className="mt-1 text-[11px] font-medium text-faint">
              {valorHa != null && `${fmtCompact(valorHa)}/ha`}
              {estado === 'curso' && ' · campaña en curso, sin vender'}
            </div>
          </div>

          {/* Composición: entró vs gastó */}
          <div className="mt-3 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[10px] font-semibold text-field-deep">
                Entró
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-field-deep"
                  style={{ width: `${(ingresos / maxBar) * 100}%` }}
                />
              </div>
              <span className="tnum w-12 shrink-0 text-right text-[10.5px] font-bold text-ink">
                {fmtCompact(ingresos)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[10px] font-semibold text-tierra">
                Gastó
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-tierra"
                  style={{ width: `${(gastos / maxBar) * 100}%` }}
                />
              </div>
              <span className="tnum w-12 shrink-0 text-right text-[10.5px] font-bold text-ink">
                {fmtCompact(gastos)}
              </span>
            </div>
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
        <span className="truncate text-[11px] text-muted-foreground">
          {cultivo ?? ' '}
        </span>
        <span className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-field-deep">
          Ver
          <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
    </Link>
  )
}

/** Rentabilidad por potrero como cards limpias agrupadas por campo. Cada card
 *  lleva a la página del potrero (toda la info), sin saturar la grilla. */
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

  // Campos con movimientos o con potreros; ordenados por resultado.
  const lista = [...camposConPotreros].sort((a, b) => {
    const ra = finPorCampo.get(a.id)?.resultado ?? 0
    const rb = finPorCampo.get(b.id)?.resultado ?? 0
    return rb - ra
  })

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
            const cf = finPorCampo.get(campo.id)
            const estado = estadoDe(cf)
            const ha = campo.hectareas ?? campo.totalHa
            const valor = estado === 'curso' ? (cf?.gastos ?? 0) : (cf?.resultado ?? 0)
            const valorHa = ha > 0 && valor ? Math.round(valor / ha) : null
            return (
              <div key={campo.id}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
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
                      <span className="text-faint">
                        {estado === 'curso' ? 'invertido' : 'resultado'}
                      </span>
                      <span className={cn('tnum font-bold', COLOR[estado])}>
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
                    {campo.potreros.map((p) => (
                      <PotreroCard
                        key={p.id}
                        potreroId={p.id}
                        nombre={p.nombre}
                        ha={p.hectareas}
                        cabezas={p.cabezas}
                        estadoCiclo={p.estadoCiclo}
                        cultivo={p.cultivo}
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
