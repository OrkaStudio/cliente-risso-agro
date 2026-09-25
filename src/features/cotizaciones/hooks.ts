import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cargarGordo,
  getClima,
  getDolarBlue,
  getGordoActual,
  getNovilloCanuelas,
  getPronostico,
  type UbicacionClima,
} from '@/features/cotizaciones/api'

/**
 * Dólar Blue. Cambia pocas veces al día → cacheo generoso y refetch
 * cada 30 min. Sin reintentos agresivos: si la fuente está caída, el
 * ticker simplemente no muestra el dato (nunca un valor inventado).
 */
export const useDolarBlue = () =>
  useQuery({
    queryKey: ['dolar-blue'],
    queryFn: getDolarBlue,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
  })

/**
 * Clima del campo elegido (Open-Meteo). Cambia lento → cache 15 min. Sin
 * ubicación (ningún campo con centro) no consulta: `data` queda undefined y
 * la UI pide cargar la ubicación en vez de mostrar un clima ajeno.
 */
export const useClima = (u: UbicacionClima | null) =>
  useQuery({
    queryKey: ['clima', u?.lat, u?.lon],
    queryFn: () => getClima(u!),
    enabled: u !== null,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    // Un corte de red de un segundo (cambio de wifi, el 4G en el campo) no
    // puede dejar la ficha sin clima para siempre: reintenta con espera.
    retry: 4,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
  })

/** Pronóstico 7 días del campo elegido (Open-Meteo). Cambia poco → cache 1 h. */
export const usePronostico = (u: UbicacionClima | null) =>
  useQuery({
    queryKey: ['pronostico', u?.lat, u?.lon],
    queryFn: () => getPronostico(u!),
    enabled: u !== null,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  })

/** Último precio del gordo (carga manual). enabled hasta tener empresa. */
/** Novillo de Cañuelas, automático. Se refresca cada 12 h; si falla, el ticker cae al manual. */
export const useNovilloCanuelas = () =>
  useQuery({
    queryKey: ['novillo-canuelas'],
    queryFn: getNovilloCanuelas,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })

export const useGordoActual = (empresaId: string) =>
  useQuery({
    queryKey: ['gordo-actual', empresaId],
    queryFn: getGordoActual,
    enabled: Boolean(empresaId),
    staleTime: 5 * 60 * 1000,
  })

export function useCargarGordo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: cargarGordo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gordo-actual'] }),
  })
}
