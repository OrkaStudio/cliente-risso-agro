import type { Database } from '@/lib/supabase/types'

type TipoCampo = Database['public']['Enums']['tipo_campo']
type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']

export const tipoCampoLabel: Record<TipoCampo, string> = {
  propio: 'Propio',
  alquilado: 'Alquilado',
}

export const estadoCicloLabel: Record<EstadoCiclo, string> = {
  ganadero: 'Ganadero',
  descanso: 'Descanso',
  preparacion: 'Preparación',
  siembra: 'Siembra',
  cultivo: 'Cultivo',
  cosecha: 'Cosecha',
  rastrojo: 'Rastrojo',
}

/** Color del badge según el estado del ciclo (cartográfico apagado). */
export const estadoCicloColor: Record<EstadoCiclo, string> = {
  ganadero: 'var(--g1)',
  descanso: 'var(--g2)',
  preparacion: 'var(--tierra)',
  siembra: 'var(--lima)',
  cultivo: 'var(--g3)',
  cosecha: 'var(--sol)',
  rastrojo: 'var(--g5)',
}
