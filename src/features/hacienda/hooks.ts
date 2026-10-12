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
    ['tropas-potrero'],
    ['tropas-campo'],
    ['panorama-inicio'],
    // Las cabezas de cada campo en la barra lateral y lo que hay para atender.
    ['mapa'],
    ['para-atender-campo'],
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

/** Eventos de toda la empresa que alimentan las señales del rodeo. */
export const useEventosSenales = () =>
  useQuery({ queryKey: ['eventos-senales'], queryFn: api.listEventosSenales })

export const usePotreros = () =>
  useQuery({ queryKey: ['potreros'], queryFn: api.listPotreros })

/** Tropa (lote) de un animal — para mostrarla en la ficha. */
export const useLote = (loteId: string | null | undefined) =>
  useQuery({
    queryKey: ['lote', loteId],
    queryFn: () => api.getLote(loteId!),
    enabled: !!loteId,
  })

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

/** Tropas (y sueltos) que ocupan un potrero — panel del mapa y diálogo de mover. */
export const useTropasDelPotrero = (potreroId: string | null) =>
  useQuery({
    queryKey: ['tropas-potrero', potreroId],
    queryFn: () => api.getTropasDelPotrero(potreroId!),
    enabled: !!potreroId,
  })

/** Tropas de un campo — selector de tropa destino al mover. */
export const useTropasCampo = (campoId: string | null) =>
  useQuery({
    queryKey: ['tropas-campo', campoId],
    queryFn: () => api.listTropasCampo(campoId!),
    enabled: !!campoId,
  })

export function useMoverAnimales() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.moverAnimales,
    onSuccess: () => {
      invalidarStock(qc)
      // El movimiento deja un evento en el historial de cada animal movido,
      // y cambia su potrero: la ficha abierta tiene que mostrar el nuevo.
      qc.invalidateQueries({ queryKey: ['eventos'] })
      qc.invalidateQueries({ queryKey: ['animal'] })
    },
  })
}

export function useUbicarAnimales() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.ubicarAnimales,
    onSuccess: () => {
      invalidarStock(qc)
      qc.invalidateQueries({ queryKey: ['eventos'] })
      qc.invalidateQueries({ queryKey: ['asistente-checklist'] })
    },
  })
}

export function useRegistrarEvento(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.registrarEvento,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventos', animalId] })
      // Un tacto/sanidad/pesaje nuevo puede prender o apagar señales.
      qc.invalidateQueries({ queryKey: ['eventos-senales'] })
    },
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

export function useSalidaPorCantidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.salidaPorCantidad,
    onSuccess: () => {
      invalidarStock(qc)
      qc.invalidateQueries({ queryKey: ['eventos'] })
      qc.invalidateQueries({ queryKey: ['eventos-senales'] })
      qc.invalidateQueries({ queryKey: ['animal'] })
      qc.invalidateQueries({ queryKey: ['bajas-pendientes'] })
    },
  })
}

export const useBajasPendientes = () => useQuery({ queryKey: ['bajas-pendientes'], queryFn: api.listBajasPendientes })

function invalidarCaravanas(qc: QueryClient) {
  invalidarStock(qc)
  for (const k of [['eventos'], ['eventos-senales'], ['animal'], ['bajas-pendientes']]) qc.invalidateQueries({ queryKey: k })
}

export function useIdentificarSalida() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: api.identificarSalida, onSuccess: () => invalidarCaravanas(qc) })
}

export function useAsignarCaravanasPlanilla() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: api.asignarCaravanasPlanilla, onSuccess: () => invalidarCaravanas(qc) })
}
