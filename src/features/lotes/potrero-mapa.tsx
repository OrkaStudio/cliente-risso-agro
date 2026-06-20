import { Link } from 'react-router-dom'
import { squarify } from '@/features/campos/treemap'
import { especieColor } from '@/features/lotes/domain'
import { codigoLote, totalLote, type Lote } from '@/features/lotes/store'
import type { Campo, Potrero } from '@/features/lotes/mock'

/**
 * Mapa esquemático de un campo: cada POTRERO es un bloque (área ∝ hectáreas),
 * con el/los LOTE(s) que lo ocupan como chips adentro. Separa lo geográfico
 * (el potrero, la tierra) de la hacienda (el lote, la tropa). Potrero sin lote
 * = "libre". Tinte por color del campo.
 */
const EXP = 0.6

/** Chip de un lote dentro de un potrero. */
function LoteChip({ lote }: { lote: Lote }) {
  return (
    <Link
      to={`/lotes/${lote.id}`}
      className="flex items-center gap-1.5 rounded-md bg-white/75 px-2 py-1 text-[11px] shadow-[0_1px_2px_rgba(16,24,19,0.08)] transition-colors hover:bg-white"
      title={`Lote ${codigoLote(lote)} · ${totalLote(lote)} cab`}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: especieColor[lote.especie] }}
      />
      <b className="font-heading text-ink">{codigoLote(lote)}</b>
      <span className="tnum ml-auto font-bold text-ink">{totalLote(lote)}</span>
    </Link>
  )
}

export function PotreroMapa({
  campo,
  potreros,
  lotes,
  ratio = 2.6,
}: {
  campo: Campo
  potreros: Potrero[]
  lotes: Lote[]
  ratio?: number
}) {
  const REF_W = 1000
  const REF_H = REF_W / ratio
  const tiles = squarify(
    potreros.map((p) => ({
      datum: p,
      value: Math.pow(p.hectareas > 0 ? p.hectareas : 0.3, EXP),
    })),
    { x: 0, y: 0, w: REF_W, h: REF_H },
  )
  const hex = campo.color.hex

  if (tiles.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-faint">
        Este campo todavía no tiene potreros cargados.
      </p>
    )
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: String(ratio) }}>
      {tiles.map((t) => {
        const p = t.datum
        const wPct = (t.w / REF_W) * 100
        const hPct = (t.h / REF_H) * 100
        const grande = wPct > 16 && hPct > 30
        const ocupan = lotes.filter((l) => l.potreros.includes(p.numero))
        return (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: `${(t.x / REF_W) * 100}%`,
              top: `${(t.y / REF_H) * 100}%`,
              width: `${wPct}%`,
              height: `${hPct}%`,
            }}
          >
            <div
              className="absolute inset-[4px] flex flex-col gap-1.5 overflow-hidden rounded-xl p-2.5"
              style={{
                background: `color-mix(in srgb, ${hex} 12%, var(--card))`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hex} 36%, transparent)`,
              }}
            >
              {/* Cabecera: número de potrero (grande) + hectáreas */}
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 leading-none">
                  <div className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Potrero
                  </div>
                  <div
                    className="tnum mt-0.5 truncate font-heading font-bold text-ink"
                    style={{ fontSize: grande ? '24px' : '15px', lineHeight: 1 }}
                  >
                    {p.numero}
                  </div>
                </div>
                <span className="tnum shrink-0 whitespace-nowrap text-[11px] font-bold text-ink/70">
                  {p.hectareas}
                  <span className="ml-0.5 text-[9px] font-medium text-muted-foreground">
                    ha
                  </span>
                </span>
              </div>

              {/* Lotes que ocupan el potrero */}
              <div className="mt-auto flex flex-col gap-1">
                {ocupan.length === 0 ? (
                  <span className="text-[11px] font-medium text-faint">libre</span>
                ) : grande ? (
                  ocupan.map((l) => <LoteChip key={l.id} lote={l} />)
                ) : (
                  <Link
                    to={`/lotes/${ocupan[0].id}`}
                    className="truncate text-[11px] font-bold text-ink hover:underline"
                    title={ocupan.map((l) => codigoLote(l)).join(', ')}
                  >
                    {ocupan.length === 1
                      ? `Lote ${codigoLote(ocupan[0])}`
                      : `${ocupan.length} lotes`}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
