import { motion } from 'framer-motion'
import { Store, ArrowLeftRight, Undo2 } from 'lucide-react'
import type { RecPotrero } from '@/features/campo/recorrida/db'
import { CLabel } from '../ui'
import { IconoDestino } from './ui-manga'
import { colorLado, destinoLabel, ordenarPorLado, type Salida } from './salidas'

/**
 * El aparte entero en un dibujo: de qué potrero salen y a dónde va cada grupo.
 *
 * Existe porque el prearmado se arma de a un grupo por vez y nadie ve el
 * conjunto hasta que el rodeo ya está adentro del cepo. Acá el productor
 * confirma de un vistazo lo que acaba de decidir — "las preñadas al 6B, las
 * vacías se venden"— sobre la forma del campo que ya sabe leer.
 *
 * No es tocable a propósito: es un resumen, no un selector. El destino se elige
 * en el croquis grande, donde el potrero tiene tamaño para el dedo.
 *
 * NOTA: la proyección es la misma de `recorrida/croquis.tsx` pero reescrita
 * corta acá — este mapa no tiene pines, ni GPS, ni objetivos táctiles, y no
 * quería atarme a la firma del croquis grande mientras se lo está tocando.
 * Unificarlas en un helper compartido es una limpieza pendiente.
 */

type XY = [number, number]

/** Equirectangular con la PROPORCIÓN REAL del campo. Norte arriba, como en
 *  Oficina y en el croquis grande: el productor conoce esa orientación. */
function proyectar(potreros: RecPotrero[]) {
  const puntos = potreros.flatMap((p) => p.poligono ?? [])
  if (puntos.length === 0) return null
  const lats = puntos.map((p) => p[0])
  const lngs = puntos.map((p) => p[1])
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const w = (maxLng - minLng) * kx || 1e-9
  const h = maxLat - minLat || 1e-9
  const escala = 100 / Math.max(w, h)
  return {
    vw: w * escala,
    vh: h * escala,
    aXY: ([lat, lng]: [number, number]): XY => [
      (lng - minLng) * kx * escala,
      (maxLat - lat) * escala,
    ],
  }
}

/** Centro del bounding box del polígono: alcanza para colgarle una etiqueta a
 *  un dibujo de resumen (el croquis grande usa polo de inaccesibilidad porque
 *  ahí las etiquetas compiten entre sí y no pueden salirse del potrero). */
function centro(pts: XY[]): XY {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ]
}

const MARGEN = 4

export function MapaSalidas({
  potreros,
  origenId,
  salidas,
}: {
  potreros: RecPotrero[]
  origenId: string
  salidas: Salida[]
}) {
  const conPoligono = potreros.filter((p) => p.poligono && p.poligono.length >= 3)
  const proy = proyectar(conPoligono)

  const enOrden = ordenarPorLado(salidas)
  /** potrero destino → el grupo que va ahí. */
  const destinoDe = new Map<string, Salida>()
  for (const s of enOrden) {
    if (s.destino.k === 'potrero') destinoDe.set(s.destino.id, s)
  }
  // Los destinos que no son un potrero no se pueden dibujar en el mapa, pero
  // tienen que verse igual: si no, "las vacías se venden" desaparece del
  // resumen y el productor cree que no configuró nada.
  const fueraDelMapa = enOrden.filter((s) => s.destino.k !== 'potrero')

  if (!proy) {
    return fueraDelMapa.length > 0 ? (
      <ChipsFueraDelMapa salidas={fueraDelMapa} />
    ) : null
  }

  return (
    // `shrink-0`: es hijo de una columna flex scrolleable y sin esto flexbox
    // lo achica hasta comerse su propia leyenda (medido: 247px de contenido
    // dentro de una caja de 184 con `overflow-hidden`).
    <div className="shrink-0 overflow-hidden rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-sunk)]">
      <svg
        viewBox={`${-MARGEN} ${-MARGEN} ${proy.vw + MARGEN * 2} ${proy.vh + MARGEN * 2}`}
        className="block h-auto max-h-[168px] w-full"
        role="img"
        aria-label="Mapa del campo con el origen y los destinos del aparte"
      >
        {conPoligono.map((p) => {
          const pts = p.poligono!.map(proy.aXY)
          const d = pts.map(([x, y]) => `${x},${y}`).join(' ')
          const [cx, cy] = centro(pts)
          const esOrigen = p.id === origenId
          const salida = destinoDe.get(p.id)
          const c = salida ? colorLado[salida.lado] : null

          return (
            <g key={p.id}>
              <motion.polygon
                points={d}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                fill={
                  esOrigen
                    ? 'var(--c-ink)'
                    : (c?.borde ?? 'var(--c-panel)')
                }
                fillOpacity={esOrigen ? 0.9 : c ? 0.82 : 0.5}
                stroke={
                  esOrigen ? 'var(--c-ink)' : (c?.borde ?? 'var(--c-line-strong)')
                }
                strokeWidth={esOrigen || c ? 1.4 : 0.7}
                strokeLinejoin="round"
              />
              {/* Solo se rotula lo que participa del aparte. Rotular todo
                  convierte el resumen en el croquis grande y deja de resumir. */}
              {(esOrigen || salida) && (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#fff"
                  style={{ fontSize: 5.5, fontWeight: 800 }}
                >
                  {p.nombre}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="flex flex-col gap-1 border-t border-[var(--c-line)] bg-[var(--c-panel)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-sm bg-[var(--c-ink)]" />
          <span className="text-[12px] text-[var(--c-ink-soft)]">
            Salen del potrero{' '}
            <b className="text-[var(--c-ink)]">
              {potreros.find((p) => p.id === origenId)?.nombre ?? '—'}
            </b>
          </span>
        </div>
        {enOrden.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: colorLado[s.lado].borde }}
            />
            <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-[12px] text-[var(--c-ink-soft)]">
              <b style={{ color: colorLado[s.lado].tinta }}>{s.etiqueta}</b>
              <IconoDestino
                destino={s.destino}
                className="size-3.5"
                aria-hidden
              />
              <span className="truncate">{destinoLabel(s.destino)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Cuando el campo no tiene ningún polígono dibujado no hay mapa que mostrar,
 *  pero los destinos siguen existiendo y hay que poder revisarlos. */
function ChipsFueraDelMapa({ salidas }: { salidas: Salida[] }) {
  return (
    <div className="shrink-0 rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 py-2.5">
      <CLabel className="mb-1.5 block">Cómo queda</CLabel>
      <div className="flex flex-col gap-1.5">
        {salidas.map((s) => {
          const c = colorLado[s.lado]
          const Icono =
            s.destino.k === 'venta'
              ? Store
              : s.destino.k === 'manga'
                ? ArrowLeftRight
                : Undo2
          return (
            <div key={s.id} className="flex items-center gap-2">
              <Icono className="size-3.5 shrink-0" style={{ color: c.tinta }} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--c-ink-soft)]">
                <b style={{ color: c.tinta }}>{s.etiqueta}</b>
                {' → '}
                {destinoLabel(s.destino)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
