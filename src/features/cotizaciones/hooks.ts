import { useQuery } from '@tanstack/react-query'
import { getDolarBlue } from '@/features/cotizaciones/api'

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
