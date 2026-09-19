import { AnimatePresence, motion } from 'framer-motion'
import type { ActividadCampo } from '@/features/campos/api'
import { categoriasPorEspecie, especiePorCategoria, type Especie } from '@/features/hacienda/labels'
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

const ACTIVIDAD_NOMBRE: Record<ActividadCampo, string> = { ganadera: 'Ganadera', agricola: 'Agrícola', mixta: 'Mixta' }

/**
 * Siluetas de perfil, mirando a la derecha, en una caja de 20×14 centrada en
 * (0,0). Dibujadas a mano porque lucide no tiene animales de campo. Tienen
 * que leerse a 14 px: cuerpo, cabeza y patas, nada más.
 */
const SILUETA: Record<Especie, string> = {
  // Vaca: cuerpo rectangular, cabeza baja con cuernos, cuatro patas, cola.
  bovino:
    'M-6.8 -3.5 h10.6 a2.2 2.2 0 0 1 2.2 2.2 v2.5999999999999996 a2.2 2.2 0 0 1 -2.2 2.2 h-10.6 a2.2 2.2 0 0 1 -2.2 -2.2 v-2.5999999999999996 a2.2 2.2 0 0 1 2.2 -2.2 z M5.8 -6 h3.4 a1.3 1.3 0 0 1 1.3 1.3 v2.6 a1.3 1.3 0 0 1 -1.3 1.3 h-3.4 a1.3 1.3 0 0 1 -1.3 -1.3 v-2.6 a1.3 1.3 0 0 1 1.3 -1.3 z M5.2 -6 l-0.8 -2 l1.8 0.6 z M9.6 -6 l0.9 -2 l-1.8 0.6 z M-7.6 3.3 h1.5 v3.7 h-1.5 z M-4.6 3.3 h1.5 v3.7 h-1.5 z M1.2 3.3 h1.5 v3.7 h-1.5 z M4 3.3 h1.5 v3.7 h-1.5 z M-2.8 3.6 a1.3 1.3 0 1 1 2.6 0 a1.3 1.3 0 1 1 -2.6 0 z M-9 -2.6 l-1.7 4.8 l1 0.35 l1.6 -4.5 z',
  // Oveja: cuerpo redondo de lana, cabeza chica y oscura, patas finas.
  ovino:
    'M-5.1 -4 h7.7 a3.4 3.4 0 0 1 3.4 3.4 v0.7000000000000002 a3.4 3.4 0 0 1 -3.4 3.4 h-7.7 a3.4 3.4 0 0 1 -3.4 -3.4 v-0.7000000000000002 a3.4 3.4 0 0 1 3.4 -3.4 z M-6.9 -4.2 a2.7 2.7 0 1 1 5.4 0 a2.7 2.7 0 1 1 -5.4 0 z M-1.9000000000000001 -4.6 a3.1 3.1 0 1 1 6.2 0 a3.1 3.1 0 1 1 -6.2 0 z M-3.2 -3.6 a2.4 2.4 0 1 1 4.8 0 a2.4 2.4 0 1 1 -4.8 0 z M6.199999999999999 -2.4 h2.3999999999999995 a1.6 1.6 0 0 1 1.6 1.6 v1.3999999999999995 a1.6 1.6 0 0 1 -1.6 1.6 h-2.3999999999999995 a1.6 1.6 0 0 1 -1.6 -1.6 v-1.3999999999999995 a1.6 1.6 0 0 1 1.6 -1.6 z M-6.4 3.2 h1.3 v3.8 h-1.3 z M-3.4 3.2 h1.3 v3.8 h-1.3 z M0.6 3.2 h1.3 v3.8 h-1.3 z M3.6 3.2 h1.3 v3.8 h-1.3 z',
  // Caballo: cuerpo alargado, cuello alto, cabeza, patas largas, cola.
  equino:
    'M-7.0 -3 h9.0 a2.5 2.5 0 0 1 2.5 2.5 v1.4000000000000004 a2.5 2.5 0 0 1 -2.5 2.5 h-9.0 a2.5 2.5 0 0 1 -2.5 -2.5 v-1.4000000000000004 a2.5 2.5 0 0 1 2.5 -2.5 z M1.2 -2.6 L4.6 -9.2 L7.6 -9.8 L11.2 -8.2 L10.6 -6.6 L8.2 -6.9 L7 -2.6 z M5.6 -9.4 l0.5 -1.8 l1.3 1.3 z M4.6 -9.2 L3 -9.6 L0.2 -3.6 L1.6 -3 z M-8 3 h1.4 v4.6 h-1.4 z M-5 3 h1.4 v4.6 h-1.4 z M0 3 h1.4 v4.6 h-1.4 z M2.8 3 h1.4 v4.6 h-1.4 z M-9.4 -2 l-2.2 5.4 l1.1 0.4 l2 -5 z',
}

/**
 * La marca de una categoría, centrada en (0,0): la silueta de su especie en
 * el color de la especie, siempre del mismo tamaño — una vaca es una vaca,
 * sea vaca, ternero o toro. Se usa en el croquis y en la leyenda.
 */
export function MarcaCategoria({ categoria }: { categoria: Categoria }) {
  const { color } = estiloDeCategoria(categoria)
  return <path d={SILUETA[especiePorCategoria[categoria]]} fill={color} />
}

export type CampoCroquis = {
  nombre: string
  hectareas: number | null
  /** Qué se hace en el campo: cambia la textura de los potreros. */
  actividad: ActividadCampo | null
  /** Color del campo (el de la paleta de Campos): identidad del contorno. */
  color?: string | null
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
 * Reparto en tiras (squarified treemap simplificado): los potreros se
 * ordenan de mayor a menor y se van llenando tiras a lo largo del lado
 * corto; cada tira se cierra cuando agregar el siguiente empeoraría la
 * proporción de sus rectángulos. Da cuadrados razonables, sin astillas ni
 * solapamientos, con cualquier mezcla de tamaños.
 */
function repartir(items: { clave: string; area: number }[], r: Rect): Record<string, Rect> {
  const out: Record<string, Rect> = {}
  const validos = items.filter((i) => i.area > 0)
  if (validos.length === 0) return out
  const total = validos.reduce((s, i) => s + i.area, 0)
  // Piso visual: ningún potrero ocupa menos del 5 % del croquis. 2 ha en
  // 1.000 son reales, pero una astilla de 3 px no le dice nada a nadie; el
  // resto se reescala para que sigan sumando el campo.
  const piso = total * 0.05
  const ajustados = validos.map((i) => ({ clave: i.clave, area: Math.max(i.area, piso) }))
  const totalAjustado = ajustados.reduce((s, i) => s + i.area, 0)
  const escala = (r.w * r.h) / totalAjustado
  const restantes = [...ajustados].sort((x, y) => y.area - x.area).map((i) => ({ clave: i.clave, area: i.area * escala }))
  let libre: Rect = { ...r }

  const peor = (tira: { area: number }[], lado: number) => {
    const suma = tira.reduce((s, i) => s + i.area, 0)
    const grosor = suma / lado
    let w = 0
    for (const i of tira) {
      const largo = i.area / grosor
      w = Math.max(w, Math.max(largo / grosor, grosor / largo))
    }
    return w
  }

  while (restantes.length > 0) {
    const horizontal = libre.w >= libre.h
    const lado = horizontal ? libre.h : libre.w
    const tira: { clave: string; area: number }[] = [restantes.shift()!]
    while (restantes.length > 0 && peor([...tira, restantes[0]!], lado) <= peor(tira, lado)) {
      tira.push(restantes.shift()!)
    }
    const suma = tira.reduce((s, i) => s + i.area, 0)
    const grosor = suma / lado
    let avance = 0
    for (const i of tira) {
      const largo = i.area / grosor
      out[i.clave] = horizontal
        ? { x: libre.x, y: libre.y + avance, w: grosor, h: largo }
        : { x: libre.x + avance, y: libre.y, w: largo, h: grosor }
      avance += largo
    }
    libre = horizontal
      ? { x: libre.x + grosor, y: libre.y, w: libre.w - grosor, h: libre.h }
      : { x: libre.x, y: libre.y + grosor, w: libre.w, h: libre.h - grosor }
  }
  return out
}

/**
 * La hacienda de un potrero, resumida: UNA silueta por especie con su
 * número, en fila y centrada. Nada de multiplicar vaquitas — se lee de un
 * vistazo y no compite con la etiqueta. Si el potrero es muy chico, sólo
 * las siluetas (el número ya está arriba).
 */
type Resumen = { cx: number; cy: number; categoria: Categoria; n: number }
function resumenHacienda(r: Rect, cabezas: CabezasPorCategoria): { items: Resumen[]; conNumero: boolean } {
  const especies = (['bovino', 'ovino', 'equino'] as const)
    .map((e) => {
      const cats = categoriasPorEspecie[e].filter((c) => (cabezas[c] ?? 0) > 0)
      const total = cats.reduce((s, c) => s + (cabezas[c] ?? 0), 0)
      const principal = cats.sort((a, b) => (cabezas[b] ?? 0) - (cabezas[a] ?? 0))[0]
      return { e, total, principal }
    })
    .filter((x) => x.total > 0 && x.principal)
  if (especies.length === 0) return { items: [], conNumero: false }
  const arriba = 22
  const altoLibre = r.h - arriba - 6
  if (altoLibre < 14) return { items: [], conNumero: false }
  // Cada ítem: silueta (20) + número (~7 px por dígito) + aire.
  const conNumero = r.w >= 24 * especies.length + 14 * especies.length && altoLibre >= 16
  const anchos = especies.map((x) => 22 + (conNumero ? 6 + String(x.total).length * 7 : 0))
  const total = anchos.reduce((s, w) => s + w, 0) + (especies.length - 1) * 8
  let x = r.x + r.w / 2 - total / 2
  const cy = r.y + arriba + altoLibre / 2
  const items: Resumen[] = especies.map((e, i) => {
    const cx = x + 11
    x += anchos[i]! + 8
    return { cx, cy, categoria: e.principal!, n: e.total }
  })
  // Si ni las siluetas entran, mostrar sólo la primera.
  if (total > r.w - 8) return { items: items.slice(0, 1).map((it) => ({ ...it, cx: r.x + r.w / 2 })), conNumero: false }
  return { items, conNumero }
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

  // El contorno lleva el color del campo (el mismo que en Campos y en el
  // mapa) apenas existe; antes de eso, el ámbar de "en construcción".
  const colorContorno = excede ? undefined : (campo.color ?? undefined)
  const acento = excede ? 'stroke-destructive' : colorContorno ? '' : 'stroke-[#e9b45f]'

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
        stroke={colorContorno}
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
            const { items: resumen, conNumero } = resumenHacienda(r, p.cabezas)
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
                    <clipPath id={`borde-${p.clave}`}>
                      <motion.rect
                        rx={6}
                        initial={false}
                        animate={{ x: r.x + 2, y: r.y + 2, width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4) }}
                        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                      />
                    </clipPath>
                    <motion.line
                      clipPath={`url(#borde-${p.clave})`}
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
                  {t > 0 && !conNumero && r.w >= 64 && (
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
                {resumen.map((it, i) => (
                  <motion.g
                    key={it.categoria}
                    initial={{ scale: 0, opacity: 0, x: it.cx, y: it.cy }}
                    animate={{ scale: 1, opacity: 1, x: it.cx, y: it.cy }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22, delay: i * 0.05 }}
                  >
                    <MarcaCategoria categoria={it.categoria} />
                    {conNumero && (
                      <text
                        x={14}
                        y={4}
                        className="fill-sidebar-foreground font-semibold tabular-nums"
                        fontSize={11}
                        style={{ paintOrder: 'stroke' }}
                        stroke="var(--sidebar)"
                        strokeWidth={3}
                        strokeLinejoin="round"
                      >
                        {it.n}
                      </text>
                    )}
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

      {/* Hacienda sin potrero: el resumen por especie, bajo el nombre del campo. */}
      {conHa.length === 0 &&
        resumenHacienda(
          { x: interior.x, y: interior.y + ALTO / 2 + 6, w: interior.w, h: interior.h / 2 - 6 },
          campo.sueltas ?? {},
        ).items.map((it, i) => (
          <motion.g
            key={`suelta-${it.categoria}`}
            initial={{ scale: 0, opacity: 0, x: it.cx, y: it.cy }}
            animate={{ scale: 1, opacity: 1, x: it.cx, y: it.cy }}
            transition={{ type: 'spring', stiffness: 400, damping: 22, delay: i * 0.05 }}
          >
            <MarcaCategoria categoria={it.categoria} />
            <text x={14} y={4} className="fill-sidebar-foreground font-semibold tabular-nums" fontSize={11}>
              {it.n}
            </text>
          </motion.g>
        ))}

      {/* Sin potreros todavía: el nombre y las hectáreas, grandes, en el medio. */}
      {conHa.length === 0 && (
        <g>
          <text
            x={ANCHO / 2}
            y={ALTO / 2 - (campo.hectareas || campo.actividad ? 6 : -5)}
            textAnchor="middle"
            className={cn(
              'font-heading font-semibold',
              campo.nombre && estado !== 'vacio' ? 'fill-sidebar-foreground' : 'fill-sidebar-foreground/40',
            )}
            fontSize={campo.nombre.length > 18 ? 16 : 20}
          >
            {campo.nombre || 'Tu campo'}
          </text>
          {campo.hectareas || campo.actividad ? (
            <text
              x={ANCHO / 2}
              y={ALTO / 2 + 18}
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
