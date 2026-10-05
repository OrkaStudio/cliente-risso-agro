import { supabase } from '@/lib/supabase/client'
import { errorAlPedir, REENVIO_MS, type ErrorAlPedir } from './reglas'

// El recorrido A1 → A2 (o A3 → A2) en curso: a qué número se mandó el código,
// cuándo y cuántas veces se erró. Vive en sessionStorage para que recargar la
// pantalla del código no lo pierda; se borra al entrar.

const CLAVE = 'tropero:acceso'

export type Envio = {
  /** E.164: +5492241558820 */
  celular: string
  enviadoMs: number
  fallidos: number
  /** Viene de «Crear cuenta»: al entrar va al onboarding. */
  alta: boolean
}

export function leerEnvio(): Envio | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE)
    return crudo ? (JSON.parse(crudo) as Envio) : null
  } catch {
    return null
  }
}

export function guardarEnvio(envio: Envio) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(envio))
  } catch {
    // Sin storage (modo privado estricto): el recorrido sigue en memoria.
  }
}

export function borrarEnvio() {
  try {
    sessionStorage.removeItem(CLAVE)
  } catch {
    // nada
  }
}

/**
 * Anota que salió un código. Si Supabase dijo «esperá N segundos» es porque ya
 * se mandó uno hace menos de un minuto: el reloj arranca de ese envío. Si el
 * número es el mismo del recorrido en curso, se conservan sus intentos.
 */
export function marcarEnviado(
  celular: string,
  { alta, esperaSegundos }: { alta: boolean; esperaSegundos?: number },
): Envio {
  const ahora = Date.now()
  const previo = leerEnvio()
  const mismo = previo?.celular === celular
  const envio: Envio =
    esperaSegundos === undefined
      ? { celular, enviadoMs: ahora, fallidos: 0, alta }
      : {
          celular,
          enviadoMs: mismo ? previo.enviadoMs : ahora - (REENVIO_MS - esperaSegundos * 1000),
          fallidos: mismo ? previo.fallidos : 0,
          alta: mismo ? previo.alta || alta : alta,
        }
  guardarEnvio(envio)
  return envio
}

type DatosAlta = { nombre: string; apellido: string; mail: string }

/**
 * Pide el código. Supabase lo genera y lo manda por WhatsApp (hook
 * enviar-codigo). Sin `alta`, un número sin cuenta no recibe nada y vuelve
 * «sin-cuenta»; con `alta`, se crea el usuario con su nombre y mail.
 */
export async function pedirCodigo(
  celular: string,
  alta?: DatosAlta,
): Promise<{ ok: true } | { ok: false; error: ErrorAlPedir }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return { ok: false, error: { tipo: 'sin-senal' } }
  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: celular,
      options: alta
        ? {
            shouldCreateUser: true,
            // user_metadata: el onboarding sugiere «<Apellido> Agro» como empresa.
            data: {
              nombre: alta.nombre.trim(),
              apellido: alta.apellido.trim(),
              celular,
              ...(alta.mail.trim() ? { mail: alta.mail.trim() } : {}),
            },
          }
        : { shouldCreateUser: false },
    })
    if (error) return { ok: false, error: errorAlPedir(error) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errorAlPedir(e as Error) }
  }
}

/** Valida el código. Si es bueno, Supabase deja la sesión abierta. */
export async function verificarCodigo(
  celular: string,
  codigo: string,
): Promise<'ok' | 'incorrecto' | 'sin-senal'> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'sin-senal'
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: celular,
      token: codigo,
      type: 'sms',
    })
    if (error || !data.session) {
      return errorAlPedir(error ?? {}).tipo === 'sin-senal' ? 'sin-senal' : 'incorrecto'
    }
    return 'ok'
  } catch {
    return 'sin-senal'
  }
}

/** ¿Ese número ya tiene cuenta? (A3 avisa y ofrece entrar). */
export async function celularTieneCuenta(celular: string): Promise<boolean> {
  const { data } = await supabase.rpc('celular_tiene_cuenta', { p_celular: celular })
  return data === true
}
