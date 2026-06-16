import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { actualizarCultivo, getPotreroDetalle } from '@/features/potrero/api'

export const usePotreroDetalle = (id: string) =>
  useQuery({
    queryKey: ['potrero-detalle', id],
    queryFn: () => getPotreroDetalle(id),
    enabled: Boolean(id),
  })

export function useActualizarCultivo(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: actualizarCultivo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['potrero-detalle', id] })
      qc.invalidateQueries({ queryKey: ['panorama-inicio'] })
    },
  })
}
