import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']
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
