import { useQuery } from '@tanstack/react-query'
import { getPotreroDetalle } from '@/features/potrero/api'

export const usePotreroDetalle = (id: string) =>
  useQuery({
    queryKey: ['potrero-detalle', id],
    queryFn: () => getPotreroDetalle(id),
    enabled: Boolean(id),
  })
