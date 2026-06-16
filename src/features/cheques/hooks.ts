import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listCheques,
  liquidarCheque,
  revertirCheque,
} from '@/features/cheques/api'

export const useCheques = () =>
  useQuery({ queryKey: ['cheques'], queryFn: listCheques })

/** Invalida todo lo que depende del estado de los movimientos. */
function useInvalidarMovimientos() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['cheques'] })
    qc.invalidateQueries({ queryKey: ['movimientos'] })
    qc.invalidateQueries({ queryKey: ['pendientes'] })
    qc.invalidateQueries({ queryKey: ['panorama-inicio'] })
  }
}

export function useLiquidarCheque() {
  const invalidar = useInvalidarMovimientos()
  return useMutation({
    mutationFn: ({ id, fecha }: { id: string; fecha: string }) =>
      liquidarCheque(id, fecha),
    onSuccess: invalidar,
  })
}

export function useRevertirCheque() {
  const invalidar = useInvalidarMovimientos()
  return useMutation({
    mutationFn: (id: string) => revertirCheque(id),
    onSuccess: invalidar,
  })
}
