import { useQuery } from '@tanstack/react-query'
import { listCheques } from '@/features/cheques/api'

export const useCheques = () =>
  useQuery({ queryKey: ['cheques'], queryFn: listCheques })
