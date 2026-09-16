import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { leerSesionPersistida } from '@/lib/supabase/persisted-session'

type AuthState = {
  session: Session | null
  user: User | null
  /** true mientras se resuelve la sesión inicial (evita parpadeo del guard) */
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  /**
   * Registro con email+contraseña. Nombre y apellido van a user_metadata
   * (el onboarding sugiere "<Apellido> Agro" como nombre de empresa).
   * `needsConfirmation` = true cuando Supabase exige confirmar el email
   * antes de dar sesión (el flujo normal en prod).
   */
  signUp: (datos: {
    email: string
    password: string
    nombre: string
    apellido: string
    /**
     * E.164 (`+549…`), ya normalizado por `normalizarCelularAR`. Va a
     * user_metadata; cuando haya proveedor de WhatsApp/SMS se promueve a
     * teléfono de la cuenta (auth.users.phone) para el ingreso por código.
     */
    celular: string
  }) => Promise<{ error: string | null; needsConfirmation: boolean }>
  /** Manda el mail con link a `/restablecer`. Siempre "ok" (no revela si existe). */
  resetPassword: (email: string) => Promise<{ error: string | null }>
  /** Cambia la contraseña del usuario logueado (tras el link de recuperación). */
  updatePassword: (password: string) => Promise<{ error: string | null }>
  /** Reenvía el mail de confirmación (sólo si Supabase la exige). */
  resendConfirmation: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

/** Mismo texto venga de donde venga; el registro lo reconoce para ofrecer salida. */
export const YA_REGISTRADO = 'Ya hay una cuenta con este email.'

/** Los mensajes de GoTrue vienen en inglés; traducimos los que el usuario ve seguido. */
function traducirErrorAuth(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials'))
    return 'Email o contraseña incorrectos.'
  if (m.includes('email not confirmed'))
    return 'Tu email todavía no está confirmado. Revisá tu casilla.'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return YA_REGISTRADO
  if (m.includes('password should be at least'))
    return 'La contraseña es demasiado corta.'
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Demasiados intentos. Esperá un momento y volvé a probar.'
  if (m.includes('same password') || m.includes('different from the old'))
    return 'La contraseña nueva tiene que ser distinta a la anterior.'
  if (m.includes('auth session missing'))
    return 'El link venció o ya se usó. Pedí uno nuevo.'
  return message
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  // Arranque instantáneo desde storage, SIN esperar la red: si el token está
  // vencido y no hay señal, `getSession()` se colgaría intentando refrescar y
  // trabaría la app en "Cargando…" (el caso del campo). Leyendo la sesión del
  // storage en el init del estado ya podemos decidir la ruta en el primer
  // render. Ver [[clientes/risso-agro/tareas/TASK-042-2026-07-15]].
  const [session, setSession] = useState<Session | null>(leerSesionPersistida)
  // Si ya hay sesión en storage, no esperamos nada. Si no, puede que venga en
  // la URL (confirmación de email vía detectSessionInUrl) → mostramos "Cargando…"
  // hasta que getSession la procese, para no redirigir a /login antes de tiempo.
  const [loading, setLoading] = useState(() => leerSesionPersistida() === null)

  useEffect(() => {
    // Reconciliar con supabase (renueva el token si hay red, o levanta la sesión
    // que venía en la URL). Si se cuelga o falla offline no importa: la sesión de
    // storage ya se aplicó en el init del estado.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) setSession(data.session)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Cambios posteriores (login, logout, refresh de token, confirmación por URL).
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Sólo un cierre de sesión explícito nos saca. Un `null` de INITIAL_SESSION
      // offline (el refresh del token vencido falló por falta de red) NO debe
      // pisar la sesión que levantamos de storage y echar al usuario a /login.
      if (event === 'SIGNED_OUT') {
        setSession(null)
        return
      }
      if (next) setSession(next)
      // Link de "olvidé mi contraseña" abierto en cualquier ruta (p. ej. si la
      // URL de redirect no está en la lista blanca de Supabase y cayó en la
      // raíz): llevamos al formulario de contraseña nueva igual. Recarga
      // completa a propósito — la sesión ya quedó en storage y este provider
      // no ve el router.
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/restablecer') {
        window.location.replace('/restablecer')
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        return { error: error ? traducirErrorAuth(error.message) : null }
      },
      async signUp({ email, password, nombre, apellido, celular }) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Si Supabase exige confirmar el email, el link vuelve a la app;
            // detectSessionInUrl levanta la sesión y el guard manda al onboarding.
            emailRedirectTo: window.location.origin,
            data: { nombre: nombre.trim(), apellido: apellido.trim(), celular },
          },
        })
        if (error)
          return {
            error: traducirErrorAuth(error.message),
            needsConfirmation: false,
          }
        // Con "Confirm email" prendido, Supabase responde OK aunque el email
        // ya tenga cuenta (para no revelar quién está registrado) y deja la
        // pista en `identities: []`. Para nosotros un email = una cuenta, y
        // el productor tiene que enterarse acá, no en "revisá tu correo".
        if (data.user && data.user.identities?.length === 0)
          return { error: YA_REGISTRADO, needsConfirmation: false }
        return { error: null, needsConfirmation: data.session === null }
      },
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/restablecer`,
        })
        return { error: error ? traducirErrorAuth(error.message) : null }
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password })
        return { error: error ? traducirErrorAuth(error.message) : null }
      },
      async resendConfirmation(email) {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: window.location.origin },
        })
        return { error: error ? traducirErrorAuth(error.message) : null }
      },
      async signOut() {
        await supabase.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Co-locamos el provider y el hook (idioma estándar de React Context). El hook
// no es un componente → Fast Refresh hace full-reload al editar este archivo,
// aceptable para un provider de auth que casi no se toca.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
