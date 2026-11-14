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

/**
 * En desarrollo, el Supabase local corre en la misma compu que sirve la app.
 * Si el .env apunta a una IP de la red (para abrirla desde el celular), esa IP
 * cambia con cada wifi y la app deja de llegar a la base. Se usa entonces el
 * mismo host desde donde se abrió la app: localhost en la compu, la IP de la red
 * en el celular. Producción y los builds no cambian.
 */
function supabaseUrl(): string {
  const url = required('VITE_SUPABASE_URL')
  if (!import.meta.env.DEV || typeof window === 'undefined') return url
  const u = new URL(url)
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(u.hostname)
  if (!local) return url
  u.hostname = window.location.hostname
  return u.origin
}

/**
 * Dónde guarda supabase-js la sesión: el nombre por defecto sale del .env, no
 * del host que se usa de verdad. Así, al cambiar de wifi (o abrir por localhost)
 * se sigue encontrando la misma sesión. En producción es el nombre de siempre.
 */
function claveSesion(): string {
  return `sb-${new URL(required('VITE_SUPABASE_URL')).hostname.split('.')[0]}-auth-token`
}

export const env = {
  supabaseUrl: supabaseUrl(),
  supabaseStorageKey: claveSesion(),
  supabasePublishableKey: required('VITE_SUPABASE_PUBLISHABLE_KEY'),
} as const
