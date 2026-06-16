import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/features/campos/api'

export const useCampos = () =>
  useQuery({ queryKey: ['campos'], queryFn: api.listCampos })

export const useCamposConPotreros = () =>
  useQuery({
    queryKey: ['campos-con-potreros'],
    queryFn: api.listCamposConPotreros,
  })

export const useCampo = (id: string) =>
  useQuery({ queryKey: ['campo', id], queryFn: () => api.getCampo(id) })

export const usePotreros = (campoId: string) =>
  useQuery({
    queryKey: ['potreros-campo', campoId],
    queryFn: () => api.listPotreros(campoId),
  })

export function useCrearCampo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.crearCampo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campos'] })
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
    },
  })
}

export function useActualizarCampo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.actualizarCampo,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['campos'] })
      qc.invalidateQueries({ queryKey: ['campo', vars.id] })
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
    },
  })
}

export function useCrearPotrero(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.crearPotrero,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['potreros-campo', campoId] })
      qc.invalidateQueries({ queryKey: ['campos'] })
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
      qc.invalidateQueries({ queryKey: ['potreros'] }) // dropdown del alta de animal
      qc.invalidateQueries({ queryKey: ['panorama-inicio'] })
    },
  })
}

export function useActualizarPotrero(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.actualizarPotrero,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['potreros-campo', campoId] })
      qc.invalidateQueries({ queryKey: ['potreros'] })
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
      qc.invalidateQueries({ queryKey: ['panorama-inicio'] })
      qc.invalidateQueries({ queryKey: ['potrero-detalle'] })
    },
  })
}
