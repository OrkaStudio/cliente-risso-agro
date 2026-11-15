/**
 * La cuenta con la que se trabaja (Lau, 14/11; spec del cerebro
 * clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona,
 * «Una persona en varios campos»).
 *
 * Un veterinario o un ingeniero puede estar en varias cuentas. La elegida viaja
 * en cada pedido a Supabase (encabezado `x-troppero-cuenta`, ver `client.ts`) y
 * la base la hace cumplir: con ella, cada consulta ve y carga sólo en esa
 * cuenta, aunque no filtre por empresa. Nunca se elige sola: con varias cuentas
 * y ninguna elegida en este equipo, se pregunta.
 */

export const ENCABEZADO_CUENTA = 'x-troppero-cuenta'

// La elegida por cada usuario de este equipo (un celular puede compartirse).
const CLAVE = 'troppero.cuenta.v1'

let delPedido: string | null = null

/** La cuenta que se manda en cada pedido (null = ninguna todavía). */
export function cuentaDelPedido(): string | null {
  return delPedido
}

export function fijarCuentaDelPedido(empresaId: string | null) {
  delPedido = empresaId
}

function leerTodas(): Record<string, string> {
  try {
    const crudo = localStorage.getItem(CLAVE)
    const v: unknown = crudo ? JSON.parse(crudo) : {}
    return v && typeof v === 'object' ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** La cuenta que eligió este usuario en este equipo, si eligió alguna. */
export function leerCuentaElegida(userId: string): string | null {
  return leerTodas()[userId] ?? null
}

export function guardarCuentaElegida(userId: string, empresaId: string) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...leerTodas(), [userId]: empresaId }))
  } catch {
    /* sin almacenamiento: se vuelve a preguntar la próxima vez */
  }
}

/**
 * Una clave de este equipo que depende de la cuenta (el campo elegido, el campo
 * por defecto de Plata): cada cuenta recuerda lo suyo.
 */
export function claveDeCuenta(base: string): string {
  return delPedido ? `${base}:${delPedido}` : base
}

/** Volver a preguntar con qué cuenta entra (ninguna elegida en este equipo). */
export function olvidarCuentaElegida(userId: string) {
  try {
    const todas = leerTodas()
    delete todas[userId]
    localStorage.setItem(CLAVE, JSON.stringify(todas))
  } catch {
    /* sin almacenamiento: no había nada guardado */
  }
}
