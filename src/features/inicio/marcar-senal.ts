import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import type { TipoSenal } from '@/features/inicio/para-atender-api'

type EstadoMarca = Database['public']['Enums']['estado_marca']

/**
 * Un cambio de dominio invalida TODAS las vistas de ese dominio, no las que uno
 * se acuerda en el momento. Ya nos pasó con el stock: tres mutaciones
 * invalidaban subconjuntos distintos y el satélite mostraba números viejos.
 * Ver lecciones/2026-07-03-risso-agro-invalidacion-stock-vistas.
 *
 * Al marcar una señal cambian: el panel del Inicio, la cabecera y el contador de
 * la nav (los tres leen `para-atender-campo`), y el historial del potrero.
 */
export function invalidarAvisos(qc: QueryClient, potreroId?: string) {
  for (const key of [
    ['para-atender-campo'],
    ['panorama-inicio'],
    ['potrero-detalle'],
    ['historial-potrero'],
  ]) {
    qc.invalidateQueries({ queryKey: key })
  }
  if (potreroId) {
    qc.invalidateQueries({ queryKey: ['potrero-detalle', potreroId] })
    qc.invalidateQueries({ queryKey: ['historial-potrero', potreroId] })
  }
}

export type MarcarSenalInput = {
  empresaId: string
  potreroId: string
  observacionId: string
  tipo: TipoSenal
  estado: EstadoMarca
  nota?: string
}

/**
 * Declara qué pasó con una señal que vio la recorrida.
 *
 * La marca se ata a la OBSERVACIÓN, no al potrero: si mañana una recorrida vuelve
 * a ver el mismo problema, esa observación es otra, no hay marca que la tape y el
 * aviso reaparece solo. Ver la migración `marca_de_senal_del_potrero`.
 */
export function useMarcarSenal() {
  return useMutation({
    mutationFn: async (input: MarcarSenalInput) => {
      const { data, error } = await supabase.rpc('marcar_senal', {
        p_empresa_id: input.empresaId,
        p_potrero_id: input.potreroId,
        p_observacion_id: input.observacionId,
        p_tipo: input.tipo,
        p_estado: input.estado,
        // El tipo generado espera `string | undefined`, no null: se omite si no hay nota.
        p_nota: input.nota,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    /* A propósito NO invalida acá. Si el aviso desaparece en el momento, el
     * productor marca y no ve confirmación de nada: la fila simplemente se
     * esfuma. La lista se actualiza cuando cierra el potrero (ver
     * SenalesDelPotrero), después de que vio el ✓ y pudo deshacer. */
  })
}

/** Deshacer lo que se acaba de marcar. Borra la marca propia; la RLS ya limita
 *  el alcance a la empresa del usuario. */
export function useDeshacerMarca() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marca_senal').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidarAvisos(qc),
  })
}
