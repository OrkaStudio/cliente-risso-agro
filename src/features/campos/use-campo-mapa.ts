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

/**
 * Color de identidad por campo. El índice viene de `campo.color_idx` (guardado
 * en la DB por orden de creación, estable: agregar un campo no recorre los
 * demás). La LETRA también sale del índice (A, B, C…) — coincide con la letra
 * de sus potreros (campo A → potreros 1A, 2A). Todo el sistema queda coherente:
 * campo A = amarillo = potreros 1A/2A.
 */
export type CampoColor = { hex: string; nombre: string; letra: string }
const PALETA: { hex: string; nombre: string }[] = [
  { hex: '#e7b41f', nombre: 'Amarillo' },
  { hex: '#3b7dd8', nombre: 'Azul' },
  { hex: '#3f9d52', nombre: 'Verde' },
  { hex: '#8a5a33', nombre: 'Marrón' },
  { hex: '#7c5cc4', nombre: 'Violeta' },
  { hex: '#e07b39', nombre: 'Naranja' },
  { hex: '#2ba8a0', nombre: 'Turquesa' },
  { hex: '#d84f8c', nombre: 'Rosa' },
  { hex: '#4a8fb0', nombre: 'Celeste' },
  { hex: '#6f9a2e', nombre: 'Oliva' },
  { hex: '#b0532e', nombre: 'Teja' },
  { hex: '#5a5f9c', nombre: 'Índigo' },
]
/** Letra del campo por su índice: 0→A, 1→B, … Wrappea a AA, AB… por si acaso. */
function letraDeIndice(i: number): string {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}
export function colorDeCampo(colorIdx: number): CampoColor {
  const i = colorIdx < 0 ? 0 : colorIdx
  const c = PALETA[i % PALETA.length]
  return { hex: c.hex, nombre: c.nombre, letra: letraDeIndice(i) }
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
