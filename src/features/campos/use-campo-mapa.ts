import { useQuery } from '@tanstack/react-query'
import * as api from '@/features/campos/api'
import type { Database } from '@/lib/supabase/types'

type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']
type TipoCampo = Database['public']['Enums']['tipo_campo']

/** Uso visual del potrero (3 estados) derivado del ciclo real (7 estados). */
export type Uso = 'ganadero' | 'agricola' | 'vacio'
export function usoDeEstado(e: EstadoCiclo): Uso {
  if (e === 'ganadero') return 'ganadero'
  if (e === 'siembra' || e === 'cultivo' || e === 'cosecha') return 'agricola'
  return 'vacio' // descanso, preparacion, rastrojo
}

/**
 * Mapea el uso elegido en el editor (3 estados) a un estado_ciclo real. Si el
 * uso no cambió respecto del estado actual, se preserva el estado fino (no pisa
 * un "siembra"/"cosecha" por haber tocado "Agrícola"). Solo al cambiar de uso
 * se aterriza en el estado canónico de ese uso.
 */
export function usoToEstadoCiclo(uso: Uso, actual: EstadoCiclo): EstadoCiclo {
  if (usoDeEstado(actual) === uso) return actual
  if (uso === 'ganadero') return 'ganadero'
  if (uso === 'agricola') return 'cultivo'
  return 'descanso'
}

/** Color de identidad por campo (el modelo real no guarda color). */
export type CampoColor = { hex: string; nombre: string; letra: string }
const PALETA: { hex: string; nombre: string }[] = [
  { hex: '#e7b41f', nombre: 'Amarillo' },
  { hex: '#3b7dd8', nombre: 'Azul' },
  { hex: '#3f9d52', nombre: 'Verde' },
  { hex: '#8a5a33', nombre: 'Marrón' },
  { hex: '#7c5cc4', nombre: 'Violeta' },
  { hex: '#e07b39', nombre: 'Naranja' },
  { hex: '#2ba8a0', nombre: 'Turquesa' },
]
export function colorDeCampo(index: number, nombre: string): CampoColor {
  const c = PALETA[index % PALETA.length]
  return { hex: c.hex, nombre: c.nombre, letra: (nombre.trim()[0] ?? 'C').toUpperCase() }
}

/**
 * Vista de un campo para los componentes del mapa (lo que antes daba el mock):
 * identidad real (UUID) + color derivado. Reemplaza al tipo `Campo` del mock.
 */
export type CampoVM = {
  id: string
  nombre: string
  tipo: TipoCampo
  hectareas: number | null
  color: CampoColor
}

export const useCampoMapa = (campoId: string) =>
  useQuery({
    queryKey: ['campo-mapa', campoId],
    queryFn: () => api.getCampoMapa(campoId),
    enabled: !!campoId,
  })
