import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']
type Sexo = Database['public']['Enums']['sexo_animal']
type Estado = Database['public']['Enums']['estado_animal']
type TipoEvento = Database['public']['Enums']['tipo_evento']

export const categoriaLabel: Record<Categoria, string> = {
  vaca: 'Vaca',
  vaquillona: 'Vaquillona',
  novillo: 'Novillo',
  ternero: 'Ternero',
  ternera: 'Ternera',
  toro: 'Toro',
  capon: 'Capón',
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
  baja: 'Baja',
  nota: 'Nota',
}
