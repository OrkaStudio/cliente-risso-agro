/** Orden natural de potreros por nombre: 1A, 2A … 10A (no 1A, 10A, 2A). */
export function ordenNaturalPotreros(
  a: { nombre: string },
  b: { nombre: string },
): number {
  return a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' })
}
