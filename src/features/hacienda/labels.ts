import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']
type Proposito = Database['public']['Enums']['proposito_lote']
type Sexo = Database['public']['Enums']['sexo_animal']
type Estado = Database['public']['Enums']['estado_animal']
type TipoEvento = Database['public']['Enums']['tipo_evento']

export type Especie = 'bovino' | 'ovino' | 'equino'

export const especieLabel: Record<Especie, string> = {
  bovino: 'Bovino',
  ovino: 'Ovino',
  equino: 'Equino',
}

/** Categorías ordenadas por especie (para selects agrupados). El orden acá es
 *  el orden con el que se muestran en el formulario. */
export const categoriasPorEspecie: Record<Especie, Categoria[]> = {
  bovino: ['vaca', 'vaquillona', 'novillo', 'ternero', 'ternera', 'toro', 'capon'],
  ovino: ['oveja', 'carnero', 'cordero', 'cordera'],
  equino: ['yegua', 'padrillo', 'potrillo', 'potranca'],
}

export const especiePorCategoria: Record<Categoria, Especie> = {
  vaca: 'bovino',
  vaquillona: 'bovino',
  novillo: 'bovino',
  ternero: 'bovino',
  ternera: 'bovino',
  toro: 'bovino',
  capon: 'bovino',
  oveja: 'ovino',
  carnero: 'ovino',
  cordero: 'ovino',
  cordera: 'ovino',
  yegua: 'equino',
  padrillo: 'equino',
  potrillo: 'equino',
  potranca: 'equino',
}

export const categoriaLabel: Record<Categoria, string> = {
  vaca: 'Vaca',
  vaquillona: 'Vaquillona',
  novillo: 'Novillo',
  ternero: 'Ternero',
  ternera: 'Ternera',
  toro: 'Toro',
  capon: 'Capón',
  oveja: 'Oveja',
  carnero: 'Carnero',
  cordero: 'Cordero',
  cordera: 'Cordera',
  yegua: 'Yegua',
  padrillo: 'Padrillo',
  potrillo: 'Potrillo',
  potranca: 'Potranca',
}

/** Plural de cada categoría — para etiquetas junto a un conteo ("14 vaquillonas"). */
export const categoriaPlural: Record<Categoria, string> = {
  vaca: 'Vacas',
  vaquillona: 'Vaquillonas',
  novillo: 'Novillos',
  ternero: 'Terneros',
  ternera: 'Terneras',
  toro: 'Toros',
  capon: 'Capones',
  oveja: 'Ovejas',
  carnero: 'Carneros',
  cordero: 'Corderos',
  cordera: 'Corderas',
  yegua: 'Yeguas',
  padrillo: 'Padrillos',
  potrillo: 'Potrillos',
  potranca: 'Potrancas',
}

/** Nombre de la categoría según la cantidad: 1 → singular, N → plural. */
export function categoriaNombre(c: Categoria, n: number): string {
  return n === 1 ? categoriaLabel[c] : categoriaPlural[c]
}

/** Color de la serie de datos por categoría (paleta de gráficos g1–g7).
 * Cada categoría con color propio DENTRO de su especie: en un potrero conviven
 * categorías de la misma especie y, si dos comparten color, la barra miente. */
export const categoriaColor: Record<Categoria, string> = {
  vaca: 'var(--g1)',
  ternero: 'var(--g2)',
  ternera: 'var(--g6)',
  vaquillona: 'var(--g3)',
  novillo: 'var(--g4)',
  toro: 'var(--g7)',
  capon: 'var(--g5)',
  oveja: 'var(--g1)',
  carnero: 'var(--g7)',
  cordero: 'var(--g2)',
  cordera: 'var(--g6)',
  yegua: 'var(--g1)',
  padrillo: 'var(--g7)',
  potrillo: 'var(--g2)',
  potranca: 'var(--g6)',
}

/**
 * Paleta categórica AGRO, anclada a los tokens de la marca (verde campo, sol,
 * cielo, tierra) + ciruela. Validada con la skill dataviz `--pairs all`:
 * normal-vision ΔE 15.2 (PASS) → todo lector full-color las distingue. El CVD
 * queda apoyado en la etiqueta (siempre visible) + gap de 2px. El color es canal
 * de APOYO: la identidad la lleva la etiqueta. 5 hues terrosos distintos; una 6ª
 * categoría recicla lejos y la etiqueta desambigua.
 */
export const SERIE_COLORS = [
  '#178a55', // verde campo
  '#dca01f', // sol (dorado)
  '#2779c4', // cielo
  '#b8442a', // tierra (terracota)
  '#7d4a9c', // ciruela
]

/** Orden canónico de TODAS las categorías (bovino → ovino → equino). */
const ORDEN_CATEGORIA: Categoria[] = [
  ...categoriasPorEspecie.bovino,
  ...categoriasPorEspecie.ovino,
  ...categoriasPorEspecie.equino,
]

/**
 * Asigna un color a cada categoría PRESENTE, en orden canónico. Dentro de un
 * mismo gráfico las presentes NUNCA comparten color (hasta 8); si hay más,
 * recicla lejos y la etiqueta desambigua. Estable dentro del gráfico; puede
 * variar entre gráficos con distinta composición (el color es apoyo, no ID).
 */
export function coloresPorCategoria(
  categorias: Iterable<Categoria>,
): Record<Categoria, string> {
  const presentes = [...new Set(categorias)].sort(
    (a, b) => ORDEN_CATEGORIA.indexOf(a) - ORDEN_CATEGORIA.indexOf(b),
  )
  const out = {} as Record<Categoria, string>
  presentes.forEach((c, i) => {
    out[c] = SERIE_COLORS[i % SERIE_COLORS.length]
  })
  return out
}

/** Propósito de una tropa = su rol en el ciclo productivo. Set estandarizado
 *  (antes era texto libre → inconsistente). "General" es el catch-all para lo
 *  no decidido todavía. El orden es el del desplegable en la carga. */
export const PROPOSITOS: Proposito[] = [
  'cria',
  'recria',
  'invernada',
  'reproductores',
  'consumo',
  'general',
]

export const propositoLabel: Record<Proposito, string> = {
  cria: 'Cría',
  recria: 'Recría',
  invernada: 'Invernada',
  reproductores: 'Reproductores',
  consumo: 'Consumo',
  general: 'General',
}

export const sexoLabel: Record<Sexo, string> = {
  macho: 'Macho',
  hembra: 'Hembra',
}

export const estadoLabel: Record<Estado, string> = {
  activo: 'Activo',
  vendido: 'Vendido',
  muerto: 'Muerto',
}

export const tipoEventoLabel: Record<TipoEvento, string> = {
  alta: 'Alta',
  parto: 'Parto',
  sanidad: 'Sanidad',
  pesaje: 'Pesaje',
  movimiento: 'Movimiento',
  servicio: 'Servicio',
  tacto: 'Tacto',
  destete: 'Destete',
  castracion: 'Castración',
  cambio_caravana: 'Cambio de caravana',
  caravana_asignada: 'Caravana asignada',
  baja: 'Baja',
  nota: 'Nota',
}
