import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/features/analitica/api'

export const useMovimientos = () =>
  useQuery({ queryKey: ['movimientos'], queryFn: api.listMovimientos })

export const useCategorias = () =>
  useQuery({ queryKey: ['categorias-mov'], queryFn: api.listCategorias })

export const usePendientes = () =>
  useQuery({ queryKey: ['pendientes'], queryFn: api.listPendientes })

function invalidarMovs(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['movimientos'] })
  qc.invalidateQueries({ queryKey: ['pendientes'] })
  qc.invalidateQueries({ queryKey: ['cheques'] })
  qc.invalidateQueries({ queryKey: ['panorama-inicio'] })
}

export function useCrearMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.crearMovimiento,
    onSuccess: () => invalidarMovs(qc),
  })
}

export function useCrearSerie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.crearSerie,
    onSuccess: () => invalidarMovs(qc),
  })
}

export function useCancelarSerie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.cancelarSerie,
    onSuccess: () => invalidarMovs(qc),
  })
}
