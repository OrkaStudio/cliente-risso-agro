/**
 * El onboarding en curso, guardado en el navegador para que recargar la
 * página deje al productor en el MISMO paso, con lo que ya cargó — y no lo
 * mande a la app a medio armar (la empresa ya existe desde el primer paso,
 * así que sin esto el guard lo sacaba del onboarding).
 *
 * Sólo lo que ya está guardado en la base (empresa, campos, potreros, lo que
 * hay en cada uno): lo tipeado y sin guardar de un paso se pierde, como en
 * cualquier formulario. Se borra al salir del onboarding por el final.
 */
const clave = (userId: string) => `orka:onboarding:${userId}`

export function leerProgreso<T>(userId: string | undefined): T | null {
  if (!userId) return null
  try {
    const crudo = localStorage.getItem(clave(userId))
    return crudo ? (JSON.parse(crudo) as T) : null
  } catch {
    return null
  }
}

export function guardarProgreso(userId: string | undefined, progreso: unknown): void {
  if (!userId) return
  try {
    localStorage.setItem(clave(userId), JSON.stringify(progreso))
  } catch {
    // Sin almacenamiento (modo privado, cuota): se sigue sin poder retomar.
  }
}

export function borrarProgreso(userId: string | undefined): void {
  if (!userId) return
  try {
    localStorage.removeItem(clave(userId))
  } catch {
    // nada
  }
}
