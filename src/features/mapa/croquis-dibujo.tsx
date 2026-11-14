import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { CampoMapa, LatLng } from './reglas'

// El croquis del campo dibujado, sin satélite: los potreros reales (sus
// polígonos) en verde pasto, con el nombre adentro y el elegido en terracota.
// Para reconocer de un vistazo dónde está cada cosa; el satélite queda para
// dibujar el campo.

const ANCHO = 600

type Potrero = CampoMapa['potreros'][number]

export function CroquisDibujo({
  campo,
  elegido,
  onElegir,
  dato,
  apagado,
  pintar,
  proporcion = 0.7,
  llenar = false,
  className,
}: {
  campo: CampoMapa
  elegido: string | null
  /** Sin onElegir es sólo para mirar. */
  onElegir?: (potreroId: string) => void
  /** Lo que se lee debajo del nombre («18 terneros»); null = sólo el nombre. */
  dato?: (p: Potrero) => string | null
  apagado?: (p: Potrero) => boolean
  /** El color de cada potrero (lo que tiene). Con color, el elegido se marca con un borde y no se pinta de terracota. */
  pintar?: (p: Potrero) => string
  /** El alto máximo, como proporción del ancho. */
  proporcion?: number
  /** Ocupa todo el lugar que le dan (alto incluido): el dibujo se acomoda a esa forma. */
  llenar?: boolean
  className?: string
}) {
  const caja = useRef<HTMLDivElement>(null)
  const [forma, setForma] = useState<number | null>(null)
  useEffect(() => {
    if (!llenar || !caja.current) return
    const el = caja.current
    const ro = new ResizeObserver(() => el.clientWidth > 0 && setForma(el.clientHeight / el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [llenar])
  if (llenar)
    return (
      <div ref={caja} className={cn('relative min-h-0 overflow-hidden rounded-[16px] bg-pasto-oscuro', className)}>
        {forma && <Dibujo {...{ campo, elegido, onElegir, dato, apagado, pintar }} proporcion={forma} exacto className="absolute inset-0 size-full rounded-none" />}
      </div>
    )
  return <Dibujo {...{ campo, elegido, onElegir, dato, apagado, pintar, proporcion, className }} />
}

function Dibujo({
  campo,
  elegido,
  onElegir,
  dato,
  apagado,
  pintar,
  proporcion,
  exacto = false,
  className,
}: {
  campo: CampoMapa
  elegido: string | null
  onElegir?: (potreroId: string) => void
  dato?: (p: Potrero) => string | null
  apagado?: (p: Potrero) => boolean
  /** El color de cada potrero (lo que tiene). Con color, el elegido se marca con un borde y no se pinta de terracota. */
  pintar?: (p: Potrero) => string
  proporcion: number
  /** El alto es exactamente ancho × proporción (para llenar una caja). */
  exacto?: boolean
  className?: string
}) {
  const dibujados = campo.potreros.filter((p): p is Potrero & { poligono: LatLng[] } => !!p.poligono && p.poligono.length >= 3)
  const puntos = [...dibujados.flatMap((p) => p.poligono), ...(campo.contorno ?? [])]
  if (!puntos.length) return null

  // Proyección plana: alcanza para un campo (unos km), corrigiendo la longitud por la latitud.
  const lats = puntos.map((p) => p[0])
  const lngs = puntos.map((p) => p[1])
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const anchoGeo = Math.max((maxLng - minLng) * k, 1e-9)
  const altoGeo = Math.max(maxLat - minLat, 1e-9)
  // Entra entero en un rectángulo apaisado: ni muy chato ni más alto que ancho.
  const margen = 14
  const altoMax = ANCHO * proporcion
  const escala = Math.min((ANCHO - 2 * margen) / anchoGeo, (altoMax - 2 * margen) / altoGeo)
  const alto = exacto ? ANCHO * proporcion : Math.max(altoGeo * escala + 2 * margen, ANCHO * Math.min(0.35, proporcion))
  const dx = (ANCHO - anchoGeo * escala) / 2
  const dy = (alto - altoGeo * escala) / 2
  const xy = ([lat, lng]: LatLng) => [dx + (lng - minLng) * k * escala, dy + (maxLat - lat) * escala] as const
  const camino = (p: LatLng[]) => p.map((q, i) => `${i ? 'L' : 'M'}${xy(q).map((n) => n.toFixed(1)).join(' ')}`).join(' ') + ' Z'
  const centro = (p: LatLng[]) => {
    const c = p.map(xy)
    return [c.reduce((t, q) => t + q[0], 0) / c.length, c.reduce((t, q) => t + q[1], 0) / c.length] as const
  }
  // El nombre, lo más grande que entre en el potrero. Con muchos potreros chicos se achica;
  // si ni así entra, no se escribe (el elegido siempre).
  const tamano = (p: LatLng[], nombre: string) => {
    const c = p.map(xy)
    const w = Math.max(...c.map((q) => q[0])) - Math.min(...c.map((q) => q[0]))
    const h = Math.max(...c.map((q) => q[1])) - Math.min(...c.map((q) => q[1]))
    const entra = Math.min((w * 0.8) / (0.55 * nombre.length + 0.2), h / 1.6)
    return { t: Math.max(12, Math.min(30, entra)), entra: entra >= 12 }
  }

  return (
    <svg viewBox={`0 0 ${ANCHO} ${alto.toFixed(0)}`} className={cn('block h-auto w-full rounded-[16px] bg-pasto-oscuro', className)} preserveAspectRatio="xMidYMid meet" role="group" aria-label={`Croquis de ${campo.nombre}`}>
      {campo.contorno && campo.contorno.length >= 3 && <path d={camino(campo.contorno)} fill="var(--color-pasto)" fillOpacity={0.45} stroke="var(--color-superficie)" strokeWidth={2} strokeDasharray="7 6" />}
      {/* El elegido al final: su borde no queda tapado por los vecinos. */}
      {[...dibujados].sort((x, y) => Number(x.id === elegido) - Number(y.id === elegido)).map((p) => {
        const si = p.id === elegido
        const off = apagado?.(p) ?? false
        const [cx, cy] = centro(p.poligono)
        const { t, entra } = tamano(p.poligono, p.nombre)
        const conNombre = entra || si
        const d = dato?.(p)
        const tocable = !!onElegir && !off
        return (
          <g
            key={p.id}
            role={onElegir ? 'button' : undefined}
            aria-label={onElegir ? `${p.nombre}${d ? `, ${d}` : ''}` : undefined}
            aria-pressed={onElegir ? si : undefined}
            aria-disabled={onElegir && off ? true : undefined}
            tabIndex={tocable ? 0 : undefined}
            onClick={tocable ? () => onElegir!(p.id) : undefined}
            onKeyDown={tocable ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onElegir!(p.id)) : undefined}
            className={cn('outline-none', tocable && 'cursor-pointer [&:focus-visible>path]:stroke-texto [&:hover>path]:brightness-95', off && 'opacity-45')}
          >
            <path
              d={camino(p.poligono)}
              fill={pintar ? pintar(p) : si ? 'var(--color-principal)' : 'var(--color-pasto)'}
              stroke={pintar && si ? 'var(--color-texto)' : 'var(--color-superficie)'}
              strokeWidth={pintar && si ? 6 : si ? 4 : 3}
              strokeLinejoin="round"
            />
            {conNombre && <text x={cx} y={d ? cy - t * 0.15 : cy} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-cifra)" fontWeight={800} fontSize={si ? t * 1.15 : t} fill={si && !pintar ? 'var(--color-superficie)' : 'var(--color-texto)'} className="pointer-events-none select-none">
              {p.nombre}
            </text>}
            {conNombre && d && (
              <text x={cx} y={cy + t * 0.85} textAnchor="middle" dominantBaseline="middle" fontSize={t * 0.55} fontWeight={600} fill={si && !pintar ? 'var(--color-superficie)' : 'var(--color-texto)'} className="pointer-events-none select-none">
                {d}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
