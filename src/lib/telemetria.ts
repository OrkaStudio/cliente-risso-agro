import { supabase } from '@/lib/supabase/client'
import { esViewportMovil } from '@/lib/use-is-mobile'

/**
 * Telemetría de producto: onboarding, uso (abrir la app, secciones) y los
 * tutoriales hasta que termina la puesta a punto (bienvenida, misiones,
 * puntitos, asistente).
 * Spec: [[clientes/risso-agro/especificaciones/2026-09-19-telemetria-onboarding-activacion]].
 *
 * Escribe en `evento_producto`, que es insert-only (la app no la puede leer).
 * La lectura es de Orka, por el schema `interno`.
 *
 * Regla dura: la telemetría NUNCA bloquea ni rompe nada. Los eventos se
 * juntan en memoria y se mandan en lote; si el envío falla, se descartan.
 */

export type NombreEvento =
  | 'registro_completado'
  | 'sesion_iniciada'
  | 'onboarding_iniciado'
  | 'paso_visto'
  | 'paso_completado'
  | 'paso_salteado'
  | 'paso_error'
  | 'onboarding_completado'
  // Uso: cada vez que abre la app (con o sin login) y por dónde anda.
  | 'app_abierta'
  | 'pantalla_vista'
  // Tutoriales, hasta que termina la puesta a punto.
  | 'bienvenida_vista'
  | 'bienvenida_respondida'
  | 'mision_iniciada'
  | 'mision_paso'
  | 'mision_completada'
  | 'mision_abandonada'
  | 'puesta_a_punto_item'
  | 'puesta_a_punto_completa'
  | 'spot_tocado'
  | 'asistente_abierto'
  | 'asistente_pregunta'
  | 'soporte_whatsapp'

type Props = Record<string, string | number | boolean | null | string[]>

type Fila = {
  sesion_id: string
  empresa_id: string | null
  nombre: NombreEvento
  props: Props
  dispositivo: 'movil' | 'escritorio'
  ts_cliente: string
}

const CLAVE_SESION = 'orka:telemetria:sesion'
/** La consola de soporte la prende al entrar a la cuenta de un productor. */
export const CLAVE_SOPORTE = 'orka:soporte'
const CADA_MS = 2000

let cola: Fila[] = []
let temporizador: ReturnType<typeof setTimeout> | null = null
let empresaId: string | null = null
let sesionEnMemoria: string | null = null

/**
 * Una por pestaña: sobrevive recargas (sessionStorage) y no cuenta doble.
 * Sin almacenamiento (modo privado), vive lo que vive la página.
 */
export function sesionId(): string {
  try {
    const guardada = sessionStorage.getItem(CLAVE_SESION)
    if (guardada) return guardada
    const nueva = crypto.randomUUID()
    sessionStorage.setItem(CLAVE_SESION, nueva)
    return nueva
  } catch {
    sesionEnMemoria ??= crypto.randomUUID()
    return sesionEnMemoria
  }
}

/** Orka adentro de la cuenta de un productor: eso no es uso del productor. */
function enSoporte(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_SOPORTE) !== null
  } catch {
    return false
  }
}

/** Desde que se conoce (el onboarding la crea en el primer paso). */
export function setEmpresaTelemetria(id: string | null): void {
  empresaId = id
}

export function registrar(nombre: NombreEvento, props: Props = {}): void {
  try {
    if (enSoporte()) return
    cola.push({
      sesion_id: sesionId(),
      empresa_id: empresaId,
      nombre,
      props,
      dispositivo: esViewportMovil() ? 'movil' : 'escritorio',
      ts_cliente: new Date().toISOString(),
    })
    temporizador ??= setTimeout(() => void enviar(), CADA_MS)
  } catch (err) {
    console.warn('[telemetria] no se registró', nombre, err)
  }
}

/** Manda lo encolado. Exportada para el cierre de pestaña y los tests. */
export async function enviar(): Promise<void> {
  if (temporizador !== null) {
    clearTimeout(temporizador)
    temporizador = null
  }
  if (cola.length === 0) return
  const lote = cola
  cola = []
  try {
    const { error } = await supabase.from('evento_producto').insert(lote)
    if (error) console.warn('[telemetria] lote descartado:', error.message)
  } catch (err) {
    console.warn('[telemetria] lote descartado:', err)
  }
}

// Al ocultar o cerrar la pestaña, lo que haya. Si no llega, se pierde: el
// abandono no se emite, se infiere del último paso visto.
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void enviar()
  })
  window.addEventListener('pagehide', () => void enviar())
}

/**
 * `sesion_iniciada` una vez por pestaña y usuario: supabase-js vuelve a
 * emitir SIGNED_IN al recuperar el foco, y eso no es un inicio de sesión.
 */
export function registrarSesionIniciada(userId: string): void {
  const clave = `orka:telemetria:sesion-iniciada:${userId}`
  try {
    if (sessionStorage.getItem(clave)) return
    sessionStorage.setItem(clave, '1')
  } catch {
    // Sin almacenamiento se registra igual: mejor de más que nunca.
  }
  registrar('sesion_iniciada')
}

/**
 * `app_abierta` una vez por pestaña y usuario, haya login o no: quien vuelve
 * con la sesión guardada no pasa por SIGNED_IN, y sin esto su uso no dejaba
 * rastro (el 26/09 un productor real usó la app y quedó en 0 eventos).
 */
export function registrarAppAbierta(userId: string): void {
  const clave = `orka:telemetria:app-abierta:${userId}`
  try {
    if (sessionStorage.getItem(clave)) return
    sessionStorage.setItem(clave, '1')
  } catch {
    // Sin almacenamiento se registra igual: mejor de más que nunca.
  }
  registrar('app_abierta')
}

/** Sólo para tests. */
export function _reiniciarTelemetria(): void {
  cola = []
  if (temporizador !== null) clearTimeout(temporizador)
  temporizador = null
  empresaId = null
  sesionEnMemoria = null
}
