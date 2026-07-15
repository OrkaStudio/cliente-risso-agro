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
  }) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signOut: () => Promise<void>
}

/** Los mensajes de GoTrue vienen en inglés; traducimos los que el usuario ve seguido. */
function traducirErrorAuth(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials'))
    return 'Email o contraseña incorrectos.'
  if (m.includes('email not confirmed'))
    return 'Tu email todavía no está confirmado. Revisá tu casilla.'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Ya existe una cuenta con ese email. Probá iniciar sesión.'
  if (m.includes('password should be at least'))
    return 'La contraseña es demasiado corta.'
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Demasiados intentos. Esperá un momento y volvé a probar.'
  return message
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Sesión inicial (puede venir de localStorage).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    // Cambios posteriores (login, logout, refresh de token).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
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
      async signUp({ email, password, nombre, apellido }) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // El link de confirmación vuelve a la app; detectSessionInUrl
            // levanta la sesión y el guard de empresa manda al onboarding.
            emailRedirectTo: window.location.origin,
            data: { nombre: nombre.trim(), apellido: apellido.trim() },
          },
        })
        if (error)
          return {
            error: traducirErrorAuth(error.message),
            needsConfirmation: false,
          }
        return { error: null, needsConfirmation: data.session === null }
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
