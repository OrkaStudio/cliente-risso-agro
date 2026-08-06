import type { Database } from '@/lib/supabase/types'
import type { Uso } from './use-campo-mapa'

type TipoCampo = Database['public']['Enums']['tipo_campo']

export const tipoCampoLabel: Record<TipoCampo, string> = {
  propio: 'Propio',
  alquilado: 'Alquilado',
}

/**
 * El vocabulario ÚNICO de qué se hace en un potrero: ganadero, agrícola o
 * vacío. Tres estados, en todos lados.
 *
 * La base guarda siete (`estado_ciclo_potrero`: ganadero, descanso,
 * preparacion, siembra, cultivo, cosecha, rastrojo) y durante un tiempo la app
 * mostró las dos escalas a la vez — el diálogo de Oficina ofrecía las siete y
 * el panel del mapa tres. Nadie puede sostener dos clasificaciones del mismo
 * hecho: el productor elige "Rastrojo" en una pantalla y en la otra el potrero
 * le aparece como "Vacío", sin explicación.
 *
 * Los siete estados quedan en la base (no se pierde nada de lo ya cargado y el
 * detalle de campaña puede volver el día que haga falta), pero la UI habla
 * SOLO de estos tres. La conversión vive en `usoDeEstado` / `usoToEstadoCiclo`.
 */
export const USO: Record<Uso, { label: string; color: string }> = {
  ganadero: { label: 'Ganadero', color: '#3f9d52' }, // verde
  agricola: { label: 'Agrícola', color: '#c6871a' }, // ámbar
  vacio: { label: 'Vacío', color: '#7d8a93' }, // gris
}
