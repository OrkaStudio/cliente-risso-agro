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
  qc.invalidateQueries({ queryKey: ['vencimientos'] })
  qc.invalidateQueries({ queryKey: ['panorama-inicio'] })
  qc.invalidateQueries({ queryKey: ['plata-nuevos'] })
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

/** Cuántos cargó otro y todavía no se miraron. Sólo para quien carga la plata. */
export const useNuevosPlata = (activo: boolean) =>
  useQuery({ queryKey: ['plata-nuevos'], queryFn: api.contarNuevos, enabled: activo, staleTime: 60_000 })

export function useMarcarRevisados() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: api.marcarRevisados, onSuccess: () => invalidarMovs(qc) })
}

export function useCorregirMovimiento() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: api.corregirMovimiento, onSuccess: () => invalidarMovs(qc) })
}

export function useAnularMovimiento() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: api.anularMovimiento, onSuccess: () => invalidarMovs(qc) })
}
