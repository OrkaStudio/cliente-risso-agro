import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import * as api from '@/features/hacienda/api'

/**
 * Invalida TODO lo que depende del stock de hacienda. Cargar, dar de baja o
 * mover animales cambia el conteo/composición por potrero y por lote, así que
 * hay que refrescar todas las vistas que lo muestran (lista, mapa satelital,
 * treemap, resumen de campo, ficha de potrero, lotes, panorama de inicio) para
 * que ninguna quede con un número viejo. `campo-mapa` y `potrero-detalle` se
 * invalidan por prefijo (todos los campos/potreros abiertos).
 */
function invalidarStock(qc: QueryClient) {
  for (const key of [
    ['animales'],
    ['stock-potrero'],
    ['campos-con-potreros'],
    ['campo-mapa'],
    ['potrero-detalle'],
    ['lotes-campo'],
    ['lotes-reparto'],
    ['panorama-inicio'],
  ]) {
    qc.invalidateQueries({ queryKey: key })
  }
}

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
    onSuccess: () => invalidarStock(qc),
  })
}

export function useCrearAnimalesMasivo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.crearAnimalesMasivo,
    onSuccess: () => invalidarStock(qc),
  })
}

export function useRegistrarEvento(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.registrarEvento,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos', animalId] }),
  })
}

export function useCambiarCaravana(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.cambiarCaravana,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['animal', animalId] })
      qc.invalidateQueries({ queryKey: ['eventos', animalId] })
      qc.invalidateQueries({ queryKey: ['animales'] })
    },
  })
}

export function useDarBaja(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.darBaja,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['animal', animalId] })
      qc.invalidateQueries({ queryKey: ['eventos', animalId] })
      invalidarStock(qc)
    },
  })
}
