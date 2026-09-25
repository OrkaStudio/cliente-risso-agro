import type { Database } from '@/lib/supabase/types'
import type { Uso } from './use-campo-mapa'

type TipoCampo = Database['public']['Enums']['tipo_campo']

export const tipoCampoLabel: Record<TipoCampo, string> = {
  propio: 'Propio',
  alquilado: 'Alquilado',
}

type ActividadCampo = Database['public']['Enums']['actividad_campo']

/** Qué se hace en el campo. Es por campo: uno puede ser ganadero y otro agrícola. */
export const actividadLabel: Record<ActividadCampo, string> = {
  ganadera: 'Ganadera',
  agricola: 'Agrícola',
  mixta: 'Mixta',
}

/**
 * La actividad del campo SALE de sus potreros, no se pregunta: qué se hace
 * lo define cada potrero (un campo mixto no tiene potreros mixtos — cada uno,
 * en cada momento, tiene hacienda o está sembrado). Sin potreros con uno ni
 * otro, no se sabe todavía: null.
 */
export function actividadDeUsos(usos: Uso[]): ActividadCampo | null {
  const ganadero = usos.includes('ganadero')
  const agricola = usos.includes('agricola')
  if (ganadero && agricola) return 'mixta'
  if (agricola) return 'agricola'
  if (ganadero) return 'ganadera'
  return null
}

/**
 * Con qué estado nacen los potreros según la actividad del campo: en un
 * campo agrícola arrancan en descanso (el primer estado del ciclo agrícola);
 * ganadero o mixto, en ganadero. Se cambia después por potrero.
 */
export function estadoInicialPorActividad(
  a: ActividadCampo | null | undefined,
): Database['public']['Enums']['estado_ciclo_potrero'] {
  return a === 'agricola' ? 'descanso' : 'ganadero'
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
