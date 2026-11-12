import { supabase } from '@/lib/supabase/client'
import { VERSION_LEGALES } from './textos'

export type Via = 'registro' | 'invitacion' | 'actualizacion'
const CLAVE = 'troppero-acepto-legales'

/** Al tocar «Mandame el código» con «Al seguir aceptás…» abajo: se anota para registrarlo al entrar. */
export function recordarQueAcepto(via: 'registro' | 'invitacion') {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ via, version: VERSION_LEGALES }))
  } catch {
    // Sin almacenamiento: queda la versión en los datos de la cuenta nueva.
  }
}

export function leerRecordado(): { via: Via; version: string } | null {
  try {
    const v = sessionStorage.getItem(CLAVE)
    return v ? JSON.parse(v) : null
  } catch {
    return null
  }
}

export async function aceptar(via: Via) {
  const { error } = await supabase.rpc('aceptar_legales', { p_version: VERSION_LEGALES, p_via: via })
  if (error) throw error
  try {
    sessionStorage.removeItem(CLAVE)
  } catch {
    // nada
  }
}
