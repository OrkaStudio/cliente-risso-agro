import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Empresa del usuario actual (multi-tenant). Por ahora un usuario pertenece a
 * una sola empresa; tomamos la primera membresía. La RLS ya garantiza que sólo
 * ve la(s) suya(s).
 */
export function useEmpresa() {
  return useQuery({
    queryKey: ['empresa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('miembro_empresa')
        .select('empresa_id, rol, empresa:empresa(id, nombre)')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}
