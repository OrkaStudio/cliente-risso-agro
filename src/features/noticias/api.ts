import { supabase } from '@/lib/supabase/client'

export type Noticia = {
  titulo: string
  link: string
  fecha: string
  fuente: string
}

/**
 * Titulares del agro, agregados por la edge function `noticias-agro` (lee
 * los RSS server-side y los devuelve como JSON, sin el problema de CORS).
 */
export async function getNoticias(): Promise<Noticia[]> {
  const { data, error } = await supabase.functions.invoke<{
    noticias: Noticia[]
  }>('noticias-agro')
  if (error) throw new Error(error.message)
  return data?.noticias ?? []
}
