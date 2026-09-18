import { especiePorCategoria, type Especie } from '@/features/hacienda/labels'
import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']

/** Cabezas por categoría (lo que el productor carga: vaca, ternero, toro…). */
export type CabezasPorCategoria = Partial<Record<Categoria, number>>

export type PotreroCroquis = {
  clave: string
  nombre: string
  hectareas: number | null
  cabezas: CabezasPorCategoria
}

export function totalCabezas(c: CabezasPorCategoria): number {
  return Object.values(c).reduce((s, n) => s + (n ?? 0), 0)
}

/**
 * Cada especie con su color: vacunos ámbar, ovinos crema (la lana), equinos
 * castaño. La FORMA dice el rol dentro de la especie — la hembra adulta es
 * el círculo (la base del rodeo), el macho el rombo, la cría un punto chico.
 * Con color + forma se lee de un vistazo; la leyenda por categoría confirma.
 */
export const ESTILO_ESPECIE: Record<Especie, { color: string; nombre: string }> = {
  bovino: { color: '#e9b45f', nombre: 'vacunos' },
  ovino: { color: '#f1ebd9', nombre: 'ovinos' },
  equino: { color: '#d98a5a', nombre: 'equinos' },
}

export type RolAnimal = 'hembra' | 'macho' | 'cria'

export const ROL_POR_CATEGORIA: Record<Categoria, RolAnimal> = {
  vaca: 'hembra',
  vaquillona: 'hembra',
  novillo: 'macho',
  toro: 'macho',
  capon: 'macho',
  ternero: 'cria',
  ternera: 'cria',
  oveja: 'hembra',
  carnero: 'macho',
  cordero: 'cria',
  cordera: 'cria',
  yegua: 'hembra',
  padrillo: 'macho',
  potrillo: 'cria',
  potranca: 'cria',
}

export function estiloDeCategoria(c: Categoria): { color: string; rol: RolAnimal } {
  return { color: ESTILO_ESPECIE[especiePorCategoria[c]].color, rol: ROL_POR_CATEGORIA[c] }
}
