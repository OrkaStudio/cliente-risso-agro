/**
 * Acceso tipado y validado a las variables de entorno.
 * Falla rápido y con un mensaje claro si falta una var (mejor que un error
 * críptico de Supabase en runtime).
 */

function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. ` +
        `Copiá .env.example a .env.local y completá los valores. ` +
        `Ver README.`,
    )
  }
  return value
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL'),
  supabasePublishableKey: required('VITE_SUPABASE_PUBLISHABLE_KEY'),
} as const
