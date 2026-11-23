import type { NombreIcono } from '@/components/tropero/iconos-svg'

// Las pestañas de Configuración: las usan la compu y el celular (Lau, 19/11).
export type Pestana = 'personas' | 'cuenta' | 'plan'
export const PESTANAS: { id: Pestana; texto: string; icono: NombreIcono; para: string }[] = [
  { id: 'personas', texto: 'Personas', icono: 'Usuario', para: 'Quién entra y qué ve' },
  { id: 'cuenta', texto: 'Tu cuenta', icono: 'Celular', para: 'Tu nombre y tu número' },
  { id: 'plan', texto: 'Plan', icono: 'Comprobante', para: 'Lo que tenés y usás' },
]
