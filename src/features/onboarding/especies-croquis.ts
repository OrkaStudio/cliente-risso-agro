import type { Especie } from '@/features/hacienda/labels'

export type CabezasPorEspecie = Partial<Record<Especie, number>>

export type PotreroCroquis = {
  clave: string
  nombre: string
  hectareas: number | null
  cabezas: CabezasPorEspecie
}

export function totalCabezas(c: CabezasPorEspecie): number {
  return (c.bovino ?? 0) + (c.ovino ?? 0) + (c.equino ?? 0)
}

/**
 * Cada especie con su marca: vacunos ámbar y redondos, ovinos claros y más
 * chicos (la lana), equinos en rombo castaño. Se lee sin leyenda; la leyenda
 * bajo el croquis confirma.
 */
export const ESTILO_ESPECIE: Record<Especie, { color: string; nombre: string }> = {
  bovino: { color: '#e9b45f', nombre: 'vacunos' },
  ovino: { color: '#f1ebd9', nombre: 'ovinos' },
  equino: { color: '#d98a5a', nombre: 'equinos' },
}
