import { AnimatePresence, motion } from 'framer-motion'
import type { ActividadCampo } from '@/features/campos/api'
import { categoriasPorEspecie } from '@/features/hacienda/labels'
import {
  estiloDeCategoria,
  totalCabezas,
  type CabezasPorCategoria,
  type PotreroCroquis,
} from '@/features/onboarding/especies-croquis'
import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']
import { cn } from '@/lib/utils'

/**
 * El croquis del campo que se va dibujando SOLO mientras el productor
 * carga: aparece el contorno con el nombre, los potreros se reparten
 * proporcionales a sus hectáreas, y la hacienda cae como puntos adentro de
 * cada uno. Es el reconocimiento del onboarding, al lado del formulario y
 * no en una lista lejana.
 *
 * No es un mapa (todavía no hay contorno real): es un esquema de áreas.
 * Cada potrero ocupa una parte del rectángulo proporcional a sus hectáreas;
 * lo que falta asignar queda rayado.
 */

/** Orden canónico: vacunos, ovinos, equinos; adentro, el orden de la app. */
const ORDEN_CATEGORIAS: Categoria[] = [
  ...categoriasPorEspecie.bovino,
  ...categoriasPorEspecie.ovino,
  ...categoriasPorEspecie.equino,
]
const ACTIVIDAD_NOMBRE: Record<ActividadCampo, string> = { ganadera: 'Ganadera', agricola: 'Agrícola', mixta: 'Mixta' }

/** La marca de una categoría, centrada en (0,0). Se usa en el croquis y en la leyenda. */
export function MarcaCategoria({ categoria }: { categoria: Categoria }) {
  const { color, rol } = estiloDeCategoria(categoria)
  if (rol === 'macho') return <path d="M0 -3.6 L3.6 0 L0 3.6 L-3.6 0 Z" fill={color} />
  if (rol === 'cria') return <circle r={1.8} fill={color} />
  return <circle r={2.9} fill={color} />
}

export type CampoCroquis = {
  nombre: string
  hectareas: number | null
  /** Qué se hace en el campo: cambia la textura de los potreros. */
  actividad: ActividadCampo | null
  potreros: PotreroCroquis[]
  /** Hacienda sin potrero: se dibuja suelta dentro del contorno. */
  sueltas?: CabezasPorCategoria
  /** Qué se está dibujando ahora: cambia el acento del croquis. */
  estado: 'vacio' | 'campo' | 'potreros' | 'hacienda' | 'hecho'
}

type Rect = { x: number; y: number; w: number; h: number }

const ANCHO = 420
const ALTO = 200
const MARGEN = 14

/**
 * Reparto por bipartición: divide la lista en dos mitades de área parecida,
 * corta el rectángulo por el lado largo en esa proporción, y sigue. Da
 * rectángulos de proporción razonable sin importar el orden.
 */
function repartir(items: { clave: string; area: number }[], r: Rect): Record<string, Rect> {
  if (items.length === 0) return {}
  if (items.length === 1) return { [items[0]!.clave]: r }
  const total = items.reduce((s, i) => s + i.area, 0)
  let acumulado = 0
  let corte = 1
  for (let i = 0; i < items.length - 1; i++) {
    acumulado += items[i]!.area
    corte = i + 1
    if (acumulado >= total / 2) break
  }
  const a = items.slice(0, corte)
  const b = items.slice(corte)
  const fa = a.reduce((s, i) => s + i.area, 0) / total
  const horizontal = r.w >= r.h
  const ra: Rect = horizontal ? { ...r, w: r.w * fa } : { ...r, h: r.h * fa }
  const rb: Rect = horizontal
    ? { ...r, x: r.x + r.w * fa, w: r.w * (1 - fa) }
    : { ...r, y: r.y + r.h * fa, h: r.h * (1 - fa) }
  return { ...repartir(a, ra), ...repartir(b, rb) }
}

/**
 * Un punto cada 5 cabezas (mínimo 1 por categoría), en orden canónico,
 * hasta lo que entra en el potrero.
 */
function puntos(r: Rect, cabezas: CabezasPorCategoria): { cx: number; cy: number; categoria: Categoria }[] {
  const paso = 9
  const x0 = r.x + 8
  const y0 = r.y + 24 // debajo de la etiqueta
  const cols = Math.max(0, Math.floor((r.w - 16) / paso))
  const filas = Math.max(0, Math.floor((r.h - 30) / paso))
  const capacidad = cols * filas
  const out: { cx: number; cy: number; categoria: Categoria }[] = []
  for (const c of ORDEN_CATEGORIAS) {
    const n = cabezas[c] ?? 0
    if (n <= 0) continue
    for (let k = 0; k < Math.max(1, Math.ceil(n / 5)); k++) {
      const i = out.length
      if (i >= capacidad) return out
      out.push({ cx: x0 + (i % cols) * paso + 3, cy: y0 + Math.floor(i / cols) * paso + 3, categoria: c })
    }
  }
  return out
}

/** Un rectángulo con el patrón de la actividad, que sigue al potrero al moverse. */
function Textura({ r, patron }: { r: Rect; patron: string }) {
  return (
    <motion.rect
      rx={6}
      fill={`url(#${patron})`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, x: r.x + 2, y: r.y + 2, width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4) }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
    />
  )
}

export function CroquisVivo({ campo, className }: { campo: CampoCroquis; className?: string }) {
  const { estado } = campo
  const interior: Rect = { x: MARGEN, y: MARGEN, w: ANCHO - MARGEN * 2, h: ALTO - MARGEN * 2 }
  const conHa = campo.potreros.filter((p) => p.hectareas !== null && p.hectareas > 0)
  const sumaHa = conHa.reduce((s, p) => s + (p.hectareas ?? 0), 0)
  const totalCampo = campo.hectareas ?? 0
  const faltan = Math.max(0, totalCampo - sumaHa)
  const excede = totalCampo > 0 && sumaHa > totalCampo + 0.05
  const items = conHa.map((p) => ({ clave: p.clave, area: p.hectareas ?? 0 }))
  if (faltan > 0.05 && conHa.length > 0) items.push({ clave: '__resto', area: faltan })
  const rects = repartir(items, interior)
  const cabezas = campo.potreros.reduce((s, p) => s + totalCabezas(p.cabezas), 0)

  const acento = excede
    ? 'stroke-destructive'
    : estado === 'hecho'
      ? 'stroke-primary'
      : 'stroke-[#e9b45f]'

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className={cn('block w-full', className)}
      role="img"
      aria-label={
        campo.nombre
          ? `Croquis de ${campo.nombre}: ${campo.potreros.length} potreros, ${cabezas} cabezas`
          : 'Croquis del campo'
      }
    >
      <defs>
        <pattern id="croquis-rayado" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" className="stroke-sidebar-foreground/25" strokeWidth="1.5" />
        </pattern>
        {/* Surcos: la textura del potrero agrícola. */}
        <pattern id="croquis-surcos" width="9" height="9" patternUnits="userSpaceOnUse">
          <line x1="0" y1="4.5" x2="9" y2="4.5" stroke="#e9b45f" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="5 2" />
        </pattern>
      </defs>

      {/* El contorno del campo. Punteado mientras se arma; firme cuando cierra. */}
      <motion.rect
        x={4}
        y={4}
        width={ANCHO - 8}
        height={ALTO - 8}
        rx={14}
        className={cn('fill-sidebar-foreground/[0.04]', acento)}
        strokeWidth={estado === 'vacio' ? 1.25 : 1.75}
        strokeDasharray={estado === 'hecho' ? undefined : '7 6'}
        initial={false}
        animate={{ opacity: estado === 'vacio' ? 0.45 : 1 }}
      />

      {/* Los potreros, proporcionales. */}
      <AnimatePresence>
        {campo.potreros
          .filter((p) => rects[p.clave])
          .map((p) => {
            const r = rects[p.clave]!
            const pts = puntos(r, p.cabezas)
            const t = totalCabezas(p.cabezas)
            const chico = r.w < 70 || r.h < 40
            // Con el conteo a la derecha, las hectáreas sólo entran en potreros anchos.
            const conHa = t > 0 ? r.w >= 120 : r.w >= 70
            return (
              <motion.g
                key={p.clave}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <motion.rect
                  rx={6}
                  className={cn(
                    'stroke-sidebar-foreground/70',
                    campo.actividad === 'agricola'
                      ? 'fill-[#e9b45f]/10'
                      : t > 0
                        ? 'fill-primary/30'
                        : 'fill-primary/20',
                  )}
                  strokeWidth={1.25}
                  initial={{ x: r.x + r.w / 2, y: r.y + r.h / 2, width: 0, height: 0 }}
                  animate={{ x: r.x + 2, y: r.y + 2, width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4) }}
                  transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                />
                {/* La textura de la actividad, encima del fondo y debajo de la hacienda. */}
                {/* Ganadera: el verde liso ES el pasto; la hacienda son los puntos. */}
                {campo.actividad === 'agricola' && <Textura r={r} patron="croquis-surcos" />}
                {campo.actividad === 'mixta' && (
                  <>
                    {/* Mixta: verde arriba de la diagonal, sembrado abajo. */}
                    <clipPath id={`mixta-${p.clave}`}>
                      <motion.path
                        initial={false}
                        animate={{
                          d: `M${r.x + 2} ${r.y + r.h - 2} L${r.x + r.w - 2} ${r.y + 2} L${r.x + r.w - 2} ${r.y + r.h - 2} Z`,
                        }}
                        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                      />
                    </clipPath>
                    <g clipPath={`url(#mixta-${p.clave})`}>
                      <motion.rect
                        rx={6}
                        className="fill-[#e9b45f]/20"
                        initial={false}
                        animate={{ x: r.x + 2, y: r.y + 2, width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4) }}
                        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                      />
                      <Textura r={r} patron="croquis-surcos" />
                    </g>
                    <motion.line
                      className="stroke-sidebar-foreground/45"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      initial={false}
                      animate={{ x1: r.x + 2, y1: r.y + r.h - 2, x2: r.x + r.w - 2, y2: r.y + 2 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                    />
                  </>
                )}
                <motion.g
                  initial={false}
                  animate={{ x: r.x + 8, y: r.y + 16 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                >
                  <text className="fill-sidebar-foreground font-semibold" fontSize={chico ? 10 : 12} style={{ paintOrder: 'stroke' }} stroke="var(--sidebar)" strokeWidth={3} strokeLinejoin="round">
                    {p.nombre}
                    {conHa && p.hectareas ? (
                      <tspan className="fill-sidebar-foreground/60 font-normal" fontSize={10}>
                        {' '}
                        {p.hectareas.toLocaleString('es-AR')} ha
                      </tspan>
                    ) : null}
                  </text>
                  {t > 0 && r.w >= 44 && (
                    <text
                      x={Math.max(0, r.w - 16)}
                      textAnchor="end"
                      className="fill-sidebar-foreground font-semibold tabular-nums"
                      fontSize={11}
                      style={{ paintOrder: 'stroke' }}
                      stroke="var(--sidebar)"
                      strokeWidth={3}
                      strokeLinejoin="round"
                    >
                      {t}
                    </text>
                  )}
                </motion.g>
                {pts.map((pt, i) => (
                  <motion.g
                    key={`${pt.categoria}-${i}`}
                    initial={{ scale: 0, opacity: 0, x: pt.cx, y: pt.cy }}
                    animate={{ scale: 1, opacity: 0.95, x: pt.cx, y: pt.cy }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22, delay: Math.min(i, 24) * 0.02 }}
                  >
                    <MarcaCategoria categoria={pt.categoria} />
                  </motion.g>
                ))}
              </motion.g>
            )
          })}

        {/* Lo que falta repartir. */}
        {rects.__resto && (
          <motion.g
            key="__resto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.rect
              rx={6}
              fill="url(#croquis-rayado)"
              className="stroke-sidebar-foreground/30"
              strokeWidth={1}
              strokeDasharray="4 4"
              initial={false}
              animate={{
                x: rects.__resto.x + 2,
                y: rects.__resto.y + 2,
                width: Math.max(0, rects.__resto.w - 4),
                height: Math.max(0, rects.__resto.h - 4),
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            />
            {rects.__resto.w > 80 && rects.__resto.h > 30 && (
              <motion.text
                className="fill-sidebar-foreground/55"
                fontSize={10}
                textAnchor="middle"
                initial={false}
                animate={{ x: rects.__resto.x + rects.__resto.w / 2, y: rects.__resto.y + rects.__resto.h / 2 + 4 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              >
                faltan {faltan.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ha
              </motion.text>
            )}
          </motion.g>
        )}
      </AnimatePresence>

      {/* Hacienda sin potrero: cae suelta dentro del contorno, bajo el nombre. */}
      {conHa.length === 0 &&
        puntos(
          {
            x: interior.x + 6,
            y: interior.y + ALTO / 2 + 2,
            w: interior.w - 12,
            h: interior.y + interior.h - (interior.y + ALTO / 2 + 2),
          }, campo.sueltas ?? {}).map(
          (pt, i) => (
            <motion.g
              key={`suelta-${pt.categoria}-${i}`}
              initial={{ scale: 0, opacity: 0, x: pt.cx, y: pt.cy }}
              animate={{ scale: 1, opacity: 0.95, x: pt.cx, y: pt.cy }}
              transition={{ type: 'spring', stiffness: 500, damping: 22, delay: Math.min(i, 24) * 0.02 }}
            >
              <MarcaCategoria categoria={pt.categoria} />
            </motion.g>
          ),
        )}

      {/* Sin potreros todavía: el nombre y las hectáreas, grandes, en el medio. */}
      {conHa.length === 0 && (
        <g>
          <text
            x={ANCHO / 2}
            y={ALTO / 2 - (campo.hectareas ? 4 : -5)}
            textAnchor="middle"
            className={cn(
              'font-heading font-semibold',
              campo.nombre ? 'fill-sidebar-foreground' : 'fill-sidebar-foreground/40',
            )}
            fontSize={campo.nombre.length > 18 ? 16 : 20}
          >
            {campo.nombre || 'Tu campo'}
          </text>
          {campo.hectareas || campo.actividad ? (
            <text
              x={ANCHO / 2}
              y={ALTO / 2 + 16}
              textAnchor="middle"
              className="fill-[#e9b45f] font-semibold tabular-nums"
              fontSize={13}
            >
              {[
                campo.actividad ? ACTIVIDAD_NOMBRE[campo.actividad] : null,
                campo.hectareas
                  ? `${campo.hectareas.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ha`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </text>
          ) : null}
        </g>
      )}
    </svg>
  )
}
