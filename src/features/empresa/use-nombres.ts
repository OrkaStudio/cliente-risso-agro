import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase/client'
import { nombreRol } from './secciones'

/**
 * Quién es quién en la empresa, para decir quién cargó cada cosa (permisos,
 * entrega 4): «Cargó Juan · por WhatsApp». Lo de uno mismo no se marca.
 */
export function useNombres() {
  const { user } = useAuth()
  const q = useQuery({
    queryKey: ['nombres-empresa'],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('nombres_de_empresa')
      if (error) throw error
      return new Map((data ?? []).map((p) => [p.user_id, { nombre: p.nombre, rol: p.rol }]))
    },
  })
  const nombres = q.data
  /** «Cargó Juan Pérez · por WhatsApp», o null si lo cargó uno mismo o no se sabe quién. */
  const quienCargo = (createdBy: string | null | undefined, canal?: string | null): string | null => {
    if (!createdBy || createdBy === user?.id) return canal === 'whatsapp' ? 'Por WhatsApp' : null
    const p = nombres?.get(createdBy)
    const quien = p ? `${p.nombre}${p.rol !== 'dueno' ? ` (${nombreRol(p.rol).toLowerCase()})` : ''}` : 'Alguien de tu equipo'
    return `Cargó ${quien}${canal === 'whatsapp' ? ' · por WhatsApp' : ''}`
  }
  /** Nombre corto de quien cargó (para filtrar). */
  const nombreDe = (createdBy: string): string => (createdBy === user?.id ? 'Vos' : (nombres?.get(createdBy)?.nombre ?? 'Alguien'))
  return { quienCargo, nombreDe, yo: user?.id ?? null }
}
