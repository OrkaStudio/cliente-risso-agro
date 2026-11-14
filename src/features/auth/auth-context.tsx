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
import { registrarAppAbierta, registrarSesionIniciada } from '@/lib/telemetria'

type AuthState = {
  session: Session | null
  user: User | null
  /** true mientras se resuelve la sesión inicial (evita parpadeo del guard) */
  loading: boolean
  signOut: () => Promise<void>
}

// Se entra sólo con el celular y un código por WhatsApp: pedir y validar el
// código vive en features/acceso (envio.ts). Este contexto sólo sigue la sesión.

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
      // Sólo encola: el envío sale después. Llamar a supabase dentro de este
      // callback lo traba.
      if (event === 'SIGNED_IN' && next) registrarSesionIniciada(next.user.id)
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && next)
        registrarAppAbierta(next.user.id)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
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
