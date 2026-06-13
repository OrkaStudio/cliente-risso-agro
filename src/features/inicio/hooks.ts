import { useQuery } from '@tanstack/react-query'
import { getPanoramaInicio } from '@/features/inicio/api'

export const usePanoramaInicio = () =>
  useQuery({ queryKey: ['panorama-inicio'], queryFn: getPanoramaInicio })
