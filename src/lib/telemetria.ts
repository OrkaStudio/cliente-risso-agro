import { supabase } from '@/lib/supabase/client'
import { esViewportMovil } from '@/lib/use-is-mobile'

/**
 * Telemetría de producto: por ahora sólo el onboarding y el inicio de sesión.
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

/** Sólo para tests. */
export function _reiniciarTelemetria(): void {
  cola = []
  if (temporizador !== null) clearTimeout(temporizador)
  temporizador = null
  empresaId = null
  sesionEnMemoria = null
}
