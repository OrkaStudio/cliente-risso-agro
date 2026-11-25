import { especiePorCategoria } from '@/features/hacienda/labels'
import type { CategoriaAnimal } from './api'

export type Compo = { categoria: CategoriaAnimal; cabezas: number }

/**
 * En la manga solo entran BOVINOS: son los únicos que llevan caravana, y sin
 * caravana el bastón no puede identificar a nadie. Mostrar ovejas o yeguas acá
 * sería ofrecer un trabajo que no se puede hacer.
 */
export function soloBovinos(items: Compo[]): Compo[] {
  return items.filter((i) => especiePorCategoria[i.categoria] === 'bovino')
}

export function cabezasBovinas(items: Compo[]): number {
  return soloBovinos(items).reduce((s, i) => s + i.cabezas, 0)
}
