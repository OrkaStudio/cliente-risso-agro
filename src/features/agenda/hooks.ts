import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listVencimientos,
  liquidarMovimiento,
  revertirLiquidacion,
  type Vencimiento,
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
    mutationFn: ({ id, fecha, monto }: { id: string; fecha: string; monto?: number }) =>
      liquidarMovimiento(id, fecha, monto),
    onSuccess: invalidar,
  })
}

export function useRevertirLiquidacion() {
  const invalidar = useInvalidarMovimientos()
  return useMutation({
    mutationFn: (v: Pick<Vencimiento, 'id' | 'fechaVencimiento' | 'fechaCobroPago'>) =>
      revertirLiquidacion(v.id, v),
    onSuccess: invalidar,
  })
}
