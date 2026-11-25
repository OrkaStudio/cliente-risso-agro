import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'

/** Ya se le dijo que lo sacaron de esa cuenta: no se repite. */
// El pedido de Supabase sale recién al esperarlo: por eso el `.then`.
export const visto = (empresa: string): PromiseLike<void> => supabase.rpc('acceso_quitado_visto' as never, { p_empresa: empresa } as never).then(() => undefined)

/** Lo sacaron de una cuenta pero tiene otras: un aviso, una sola vez por cuenta. */
export function useAvisarAccesoQuitado(quitadas: { empresa_id: string; nombre: string }[]) {
  const dichos = useRef(new Set<string>())
  const clave = quitadas.map((q) => q.empresa_id).join(',')
  useEffect(() => {
    for (const q of quitadas) {
      if (dichos.current.has(q.empresa_id)) continue
      dichos.current.add(q.empresa_id)
      toast.info(`Ya no tenés acceso a ${q.nombre}`, { description: 'El dueño te sacó el acceso. Lo que cargaste queda, con tu nombre.', duration: 10000 })
      void visto(q.empresa_id)
    }
  }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps
}
