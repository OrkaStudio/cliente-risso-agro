import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/features/hacienda/api'

export const useAnimales = () =>
  useQuery({ queryKey: ['animales'], queryFn: api.listAnimales })

export const useAnimal = (id: string) =>
  useQuery({ queryKey: ['animal', id], queryFn: () => api.getAnimal(id) })

export const useEventos = (id: string) =>
  useQuery({ queryKey: ['eventos', id], queryFn: () => api.getEventos(id) })

export const usePotreros = () =>
  useQuery({ queryKey: ['potreros'], queryFn: api.listPotreros })

export const useStockPorPotrero = () =>
  useQuery({ queryKey: ['stock-potrero'], queryFn: api.getStockPorPotrero })

export function useCrearAnimal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.crearAnimal,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['animales'] })
      qc.invalidateQueries({ queryKey: ['stock-potrero'] })
    },
  })
}
