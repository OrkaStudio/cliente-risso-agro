import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listVencimientos,
  liquidarMovimiento,
  revertirLiquidacion,
} from '@/features/agenda/api'

export const useVencimientos = () =>
  useQuery({ queryKey: ['vencimientos'], queryFn: listVencimientos })

/** Invalida todo lo que depende del estado de los movimientos. */
function useInvalidarMovimientos() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['vencimientos'] })
    qc.invalidateQueries({ queryKey: ['movimientos'] })
    qc.invalidateQueries({ queryKey: ['pendientes'] })
    qc.invalidateQueries({ queryKey: ['panorama-inicio'] })
  }
}

export function useLiquidar() {
  const invalidar = useInvalidarMovimientos()
  return useMutation({
    mutationFn: ({ id, fecha }: { id: string; fecha: string }) =>
      liquidarMovimiento(id, fecha),
    onSuccess: invalidar,
  })
}

export function useRevertirLiquidacion() {
  const invalidar = useInvalidarMovimientos()
  return useMutation({
    mutationFn: (id: string) => revertirLiquidacion(id),
    onSuccess: invalidar,
  })
}
