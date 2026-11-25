/**
 * Las bases que el Modo Campo viejo guardaba en el teléfono para la recorrida, la manga y los
 * nacimientos/movimientos. Salieron de la app el 18/11 (se hacen por WhatsApp con el bot; el
 * código está en archivo/): se borran una vez para que no ocupen lugar ni se lean por error.
 * Lau confirmó que lo que pudiera quedar ahí no importa.
 */
const VIEJAS = ['risso-recorrida', 'risso-manga', 'risso-ops']
const HECHO = 'campo.bases-viejas-borradas.v1'

export function limpiarBasesViejas() {
  try {
    if (localStorage.getItem(HECHO) || typeof indexedDB === 'undefined') return
    for (const nombre of VIEJAS) indexedDB.deleteDatabase(nombre)
    localStorage.setItem(HECHO, '1')
  } catch {
    /* sin almacenamiento: se intenta la próxima vez */
  }
}
