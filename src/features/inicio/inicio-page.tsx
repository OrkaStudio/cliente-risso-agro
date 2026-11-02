import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { AntesDelMapa } from './tropero/antes-del-mapa'
import { ElDia } from './tropero/el-dia'

/**
 * El Inicio de la Oficina (página 35): mientras falte el mapa, los pasos para
 * terminarlo con el Inicio de siempre como adelanto (antes-del-mapa); después,
 * «El día».
 */
export function InicioPage() {
  return useMapaPendiente() ? <AntesDelMapa /> : <ElDia />
}
