import { AnimatePresence, motion } from 'framer-motion'
import type { ActividadCampo } from '@/features/campos/api'
import { categoriasPorEspecie, especiePorCategoria, type Especie } from '@/features/hacienda/labels'
import {
  ESTILO_ESPECIE,
  estiloDeCategoria,
  totalCabezas,
  type CabezasPorCategoria,
  type PotreroCroquis,
} from '@/features/onboarding/especies-croquis'
import {
  acomodarHacienda,
  acomodarSiembra,
  decidirMarcas,
  repartir,
  type Marcas,
  type ModoMarcas,
  type Rect,
} from '@/features/onboarding/croquis-layout'
import { estiloDeCultivo } from '@/features/onboarding/cultivos-croquis'
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
  // Caballo. Cuello y cabeza son UNA curva continua desde la cruz hasta el
  // hocico —antes eran dos polígonos pegados y la costura se veía como un
  // quiebre—, con la oreja saliendo de la nuca. Lo que hace reconocible a un
  // caballo a 14 px no es el cuerpo: es el cuello arqueado, la cabeza chica
  // en punta mirando abajo, y las patas largas.
  equino:
    'M-7.4 -2.8 h8.6 a2.7 2.7 0 0 1 2.7 2.7 v1.2 a2.7 2.7 0 0 1 -2.7 2.7 h-8.6 a2.7 2.7 0 0 1 -2.7 -2.7 v-1.2 a2.7 2.7 0 0 1 2.7 -2.7 z M1 -2.2 C2.2 -5.8 3.9 -8.1 6.1 -9.4 L6.5 -11.3 L7.9 -9.6 C9.2 -9.2 10.3 -8 10.5 -6.6 L9.4 -5.5 C8.3 -6 7.1 -6.4 6.2 -6.6 C5.6 -5 5.2 -3.5 5 -1.8 z M-7.8 3.2 h1.5 v4.8 h-1.5 z M-4.8 3.2 h1.5 v4.8 h-1.5 z M0.6 3.2 h1.5 v4.8 h-1.5 z M3.2 3.2 h1.5 v4.8 h-1.5 z M-9.7 -2.4 c-2 2.2 -2.4 5 -1.3 7.2 l1.4 -0.5 c-0.8 -1.9 -0.5 -3.9 1 -5.6 z',
}

/**
 * La marca de una categoría, centrada en (0,0): la silueta de su especie en
 * el color de la especie, siempre del mismo tamaño — una vaca es una vaca,
 * sea vaca, ternero o toro. Se usa en el croquis y en la leyenda.
 */
export function MarcaCategoria({ categoria }: { categoria: Categoria }) {
  const { color } = estiloDeCategoria(categoria)
  // Contorno oscuro detrás del relleno (`paintOrder: stroke`): separa la
  // silueta del fondo sin comerle forma. Sobre el verde del potrero y sobre
  // la textura rayada del agrícola, sin contorno las patas se perdían.
  return (
    <path
      d={SILUETA[especiePorCategoria[categoria]]}
      fill={color}
      stroke="#0a140d"
      strokeWidth={1.1}
      strokeLinejoin="round"
      style={{ paintOrder: 'stroke' }}
    />
  )
}

/** La marca de un cultivo, centrada en (0,0). Mismo contorno que la hacienda. */
export function MarcaCultivo({ cultivo }: { cultivo: string | null | undefined }) {
  const e = estiloDeCultivo(cultivo)
  const trazo = { stroke: '#0a140d', strokeWidth: 1.1, strokeLinejoin: 'round' as const, style: { paintOrder: 'stroke' } }
  return (
    <g>
      <path d={e.d} fill={e.color} {...trazo} />
      {e.centro && <path d={e.centro.d} fill={e.centro.color} {...trazo} />}
    </g>
  )
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
  /** El potrero que se está cargando: se resalta para ubicarse de un vistazo. */
  activo?: string | null
}


const ANCHO = 420
const ALTO = 200
const MARGEN = 14


/**
 * La hacienda de un potrero, resumida: UNA marca por especie, nunca una
 * multiplicación de vaquitas. Qué marca y dónde lo decide `croquis-layout`,
 * que tiene la tabla de casos y sus tests; acá sólo se pone la especie a
 * cada posición. El número de cabezas NO va en ningún modo: compite con la
 * etiqueta y en un potrero chico no se lee. Vive en el hover.
 */
type MarcaResumen = { cx: number; cy: number; categoria: Categoria; color: string }
/** Las especies presentes, cada una con su categoría principal. */
function especiesDe(cabezas: CabezasPorCategoria) {
  return (['bovino', 'ovino', 'equino'] as const)
    .map((e) => {
      const cats = categoriasPorEspecie[e].filter((c) => (cabezas[c] ?? 0) > 0)
      const total = cats.reduce((s, c) => s + (cabezas[c] ?? 0), 0)
      const principal = cats.sort((a, b) => (cabezas[b] ?? 0) - (cabezas[a] ?? 0))[0]
      return { e, total, principal }
    })
    .filter((x) => x.total > 0 && x.principal)
}

function resumenHacienda(
  especies: ReturnType<typeof especiesDe>,
  { modo, posiciones, escala }: Marcas,
): { modo: ModoMarcas; escala: number; items: MarcaResumen[] } {
  return {
    modo,
    escala,
    items: posiciones.map((pos, i) => ({
      ...pos,
      categoria: especies[i]!.principal!,
      color: ESTILO_ESPECIE[especies[i]!.e].color,
    })),
  }
}


/** Un rectángulo con el patrón de la actividad, que sigue al potrero al moverse. */
function Textura({ r, patron }: { r: Rect; patron: string }) {
  return (
    <motion.rect
      rx={6}
      fill={`url(#${patron})`}
      // `width` y `height` van también en `initial`: si sólo están en
      // `animate`, el primer render sale sin el atributo y el navegador tira
      // «<rect> attribute width: Expected length, "undefined"». Se veía sólo
      // en campos agrícolas o mixtos, que son los únicos con textura.
      initial={{ opacity: 0, x: r.x + 2, y: r.y + 2, width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4) }}
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
            const t = totalCabezas(p.cabezas)
            // Qué hay en ESTE potrero. Si todavía no se dijo (paso de
            // potreros), manda la actividad del campo, como antes.
            // Sin elegir todavía (`null`) se ve como vacío: el verde de
            // ganadero sólo cuando de verdad hay hacienda.
            const uso =
              p.uso === null
                ? 'vacio'
                : (p.uso ??
                  (campo.actividad === 'agricola' ? 'agricola' : campo.actividad === 'mixta' ? 'mixta' : 'ganadero'))
            // Etiqueta, marcas y siembra: la regla y sus pruebas viven en
            // `croquis-layout` (probadas contra miles de potreros reales).
            const textoHa = p.hectareas ? `${p.hectareas.toLocaleString('es-AR')} ha` : ''
            // Etiqueta y contenido se deciden JUNTOS: si las hectáreas no
            // dejan ver lo que hay, se van de la etiqueta. Lo sembrado va como
            // la hacienda: su marca; si no entra, el nombre; y si tampoco, un punto.
            const especies = especiesDe(p.cabezas)
            const acomodo =
              uso === 'agricola' && p.cultivo
                ? { ...acomodarSiembra(r, p.nombre, textoHa, p.cultivo), marcas: null }
                : { ...acomodarHacienda(r, p.nombre, textoHa, especies.length), siembra: null }
            const { etiqueta, siembra } = acomodo
            const { modo, escala, items: resumen } = resumenHacienda(
              especies,
              acomodo.marcas ?? { modo: 'nada', posiciones: [], escala: 1 },
            )
            const enFoco = campo.activo === p.clave
            const apagado = !!campo.activo && !enFoco
            return (
              <motion.g
                key={p.clave}
                initial={{ opacity: 0 }}
                animate={{ opacity: apagado ? 0.55 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <motion.rect
                  rx={6}
                  // En foco, el borde toma el color del campo (A amarillo, B
                  // azul, C naranja…): el mismo que su contorno y su letra.
                  style={enFoco ? { stroke: campo.color ?? '#e9b45f' } : undefined}
                  className={cn(
                    !enFoco && 'stroke-sidebar-foreground/70',
                    uso === 'agricola'
                      ? 'fill-[#e9b45f]/10'
                      : uso === 'vacio'
                        ? 'fill-sidebar-foreground/[0.06]'
                        : t > 0
                          ? 'fill-primary/30'
                          : 'fill-primary/20',
                  )}
                  strokeWidth={enFoco ? 2.5 : 1.25}
                  initial={{ x: r.x + r.w / 2, y: r.y + r.h / 2, width: 0, height: 0 }}
                  animate={{ x: r.x + 2, y: r.y + 2, width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4) }}
                  transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                />
                {/* La textura de la actividad, encima del fondo y debajo de la hacienda. */}
                {/* Ganadera: el verde liso ES el pasto; la hacienda son los puntos. */}
                {uso === 'agricola' && <Textura r={r} patron="croquis-surcos" />}
                {uso === 'mixta' && (
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
                {etiqueta.modo === 'parada' ? (
                  // Astilla donde el nombre no entra acostado: parado, leído
                  // de abajo arriba, a lo largo del potrero.
                  <motion.g
                    initial={false}
                    animate={{ x: etiqueta.x, y: r.y + etiqueta.base }}
                    transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                  >
                    <text
                      transform="rotate(-90)"
                      className="fill-sidebar-foreground font-semibold"
                      fontSize={10}
                      style={{ paintOrder: 'stroke' }}
                      stroke="var(--sidebar)"
                      strokeWidth={3}
                      strokeLinejoin="round"
                    >
                      {p.nombre}
                      {etiqueta.conHa ? (
                        <tspan className="fill-sidebar-foreground/60 font-normal" fontSize={10}>
                          {' '}
                          {textoHa}
                        </tspan>
                      ) : null}
                    </text>
                  </motion.g>
                ) : (
                <motion.g
                  initial={false}
                  animate={{ x: etiqueta.x, y: r.y + etiqueta.base }}
                  transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                >
                  <text
                    className="fill-sidebar-foreground font-semibold"
                    fontSize={etiqueta.tamano}
                    textAnchor={etiqueta.centrada ? 'middle' : 'start'}
                    style={{ paintOrder: 'stroke' }}
                    stroke="var(--sidebar)"
                    strokeWidth={3}
                    strokeLinejoin="round"
                  >
                    {p.nombre}
                    {etiqueta.modo === 'lado' ? (
                      <tspan className="fill-sidebar-foreground/60 font-normal" fontSize={10}>
                        {' '}
                        {textoHa}
                      </tspan>
                    ) : null}
                  </text>
                  {etiqueta.modo === 'debajo' && (
                    <text
                      y={12}
                      className="fill-sidebar-foreground/60 font-normal"
                      fontSize={10}
                      textAnchor={etiqueta.centrada ? 'middle' : 'start'}
                      style={{ paintOrder: 'stroke' }}
                      stroke="var(--sidebar)"
                      strokeWidth={3}
                      strokeLinejoin="round"
                    >
                      {textoHa}
                    </text>
                  )}
                </motion.g>
                )}
                {siembra && (
                  <motion.g
                    key={`siembra-${p.cultivo}`}
                    initial={{ scale: 0, opacity: 0, x: siembra.cx, y: siembra.cy }}
                    animate={{ scale: 1, opacity: 1, x: siembra.cx, y: siembra.cy }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  >
                    {siembra.tipo === 'marca' ? (
                      <g transform={siembra.escala !== 1 ? `scale(${siembra.escala})` : undefined}>
                        <MarcaCultivo cultivo={p.cultivo} />
                      </g>
                    ) : siembra.tipo === 'texto' || siembra.tipo === 'textoParado' ? (
                      <text
                        transform={siembra.tipo === 'textoParado' ? 'rotate(-90)' : undefined}
                        textAnchor="middle"
                        className="font-semibold"
                        fill={estiloDeCultivo(p.cultivo).color}
                        fontSize={10}
                        style={{ paintOrder: 'stroke' }}
                        stroke="var(--sidebar)"
                        strokeWidth={3}
                        strokeLinejoin="round"
                      >
                        {p.cultivo}
                      </text>
                    ) : (
                      <circle r={3} fill={estiloDeCultivo(p.cultivo).color} stroke="var(--sidebar)" strokeWidth={1} />
                    )}
                    {siembra.baseNombre !== null && (
                      <text
                        y={siembra.baseNombre - siembra.cy}
                        textAnchor="middle"
                        className="fill-sidebar-foreground font-semibold"
                        fontSize={10}
                        style={{ paintOrder: 'stroke' }}
                        stroke="var(--sidebar)"
                        strokeWidth={3}
                        strokeLinejoin="round"
                      >
                        {p.cultivo}
                      </text>
                    )}
                  </motion.g>
                )}
                {resumen.map((it, i) => (
                  <motion.g
                    key={it.categoria}
                    initial={{ scale: 0, opacity: 0, x: it.cx, y: it.cy }}
                    animate={{ scale: 1, opacity: 1, x: it.cx, y: it.cy }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22, delay: i * 0.05 }}
                  >
                    {modo === 'siluetas' || modo === 'siluetasJunto' ? (
                      <g transform={escala !== 1 ? `scale(${escala})` : undefined}>
                        <MarcaCategoria categoria={it.categoria} />
                      </g>
                    ) : (
                      <circle r={3} fill={it.color} stroke="var(--sidebar)" strokeWidth={1} />
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

      {/* Hacienda sin potrero: el resumen por especie, bajo el nombre del campo.
          Misma regla que adentro de un potrero — la marca dice QUÉ hay, el
          hover dice CUÁNTO. */}
      {conHa.length === 0 && totalCabezas(campo.sueltas ?? {}) > 0 && (
        <g>
          {(() => {
            const zona = { x: interior.x, y: interior.y + ALTO / 2 + 6, w: interior.w, h: interior.h / 2 - 6 }
            // Sin etiqueta: el nombre del campo ya está arriba, fuera de esta zona.
            const especies = especiesDe(campo.sueltas ?? {})
            const { modo, items } = resumenHacienda(
              especies,
              decidirMarcas(zona, especies.length, {
                modo: 'nombre',
                centrada: true,
                x: zona.x + zona.w / 2,
                base: 0,
                tamano: 12,
                alto: 0,
                ancho: 0,
                conHa: false,
              }),
            )
            return items.map((it, i) => (
              <motion.g
                key={`suelta-${it.categoria}`}
                initial={{ scale: 0, opacity: 0, x: it.cx, y: it.cy }}
                animate={{ scale: 1, opacity: 1, x: it.cx, y: it.cy }}
                transition={{ type: 'spring', stiffness: 400, damping: 22, delay: i * 0.05 }}
              >
                {modo === 'siluetas' ? (
                  <MarcaCategoria categoria={it.categoria} />
                ) : (
                  <circle r={3} fill={it.color} stroke="var(--sidebar)" strokeWidth={1} />
                )}
              </motion.g>
            ))
          })()}
        </g>
      )}

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
