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
