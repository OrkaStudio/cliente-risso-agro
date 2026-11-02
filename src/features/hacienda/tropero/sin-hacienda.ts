import type { ActividadCampo } from '@/features/campos/api'

// Hacienda sin animales (Lau, 29/10): un campo agrícola no tiene por qué tener
// hacienda, y a uno ganadero todavía le falta cargarla. Se distingue con lo que
// la app ya sabe: la actividad del campo o que todos sus potreros estén sembrados.

type PotreroDato = { estadoCiclo: string; cultivo: string | null; hectareas: number | null }
type CampoDato = { actividad: ActividadCampo | null; hectareas: number | null; potreros: PotreroDato[] }

export type CaraSinHacienda =
  | { tipo: 'agricola'; hectareas: number; sembrado: { cultivo: string; hectareas: number }[] }
  | { tipo: 'cargar' }

const sembrado = (p: PotreroDato) => !!p.cultivo || p.estadoCiclo === 'cultivo'
const nombre = (c: string) => c.charAt(0).toLocaleUpperCase('es-AR') + c.slice(1)

/** Con «Todos tus campos» (`campo` null) siempre es «cargar»: el negocio entero sin hacienda es que falta cargarla. */
export function caraSinHacienda(campo: CampoDato | null): CaraSinHacienda {
  if (!campo) return { tipo: 'cargar' }
  // Lo que el productor marcó manda; si no marcó nada, se deduce de los potreros.
  const agricola = campo.actividad === 'agricola' || (campo.actividad === null && campo.potreros.length > 0 && campo.potreros.every(sembrado))
  if (!agricola) return { tipo: 'cargar' }
  const porCultivo = new Map<string, number>()
  for (const p of campo.potreros) if (p.cultivo) porCultivo.set(nombre(p.cultivo), (porCultivo.get(nombre(p.cultivo)) ?? 0) + (p.hectareas ?? 0))
  return {
    tipo: 'agricola',
    hectareas: campo.hectareas ?? campo.potreros.reduce((n, p) => n + (p.hectareas ?? 0), 0),
    sembrado: [...porCultivo].map(([cultivo, hectareas]) => ({ cultivo, hectareas })).sort((a, b) => b.hectareas - a.hectareas),
  }
}
