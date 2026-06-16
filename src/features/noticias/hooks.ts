import { useQuery } from '@tanstack/react-query'
import { getNoticias } from '@/features/noticias/api'

/** Titulares del agro. Cambian lento → cache 30 min. */
export const useNoticias = () =>
  useQuery({
    queryKey: ['noticias-agro'],
    queryFn: getNoticias,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })
