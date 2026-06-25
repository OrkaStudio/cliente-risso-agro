import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/features/campos/api'
import type { TablesUpdate } from '@/lib/supabase/types'

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

// ===== Geometría =====

export function useSetCampoContorno(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (contorno: api.LatLng[] | null) =>
      api.setCampoContorno(campoId, contorno),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
      qc.invalidateQueries({ queryKey: ['campo', campoId] })
    },
  })
}

export function useSetPotreroPoligono(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { potreroId: string; poligono: api.LatLng[] | null }) =>
      api.setPotreroPoligono(vars.potreroId, vars.poligono),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['potreros-campo', campoId] })
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
    },
  })
}

// ===== Infraestructura =====

export const useInfraestructura = (campoId: string) =>
  useQuery({
    queryKey: ['infraestructura', campoId],
    queryFn: () => api.listInfraestructura(campoId),
    enabled: !!campoId,
  })

export function useCrearInfraestructura(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.crearInfraestructura,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['infraestructura', campoId] }),
  })
}

export function useActualizarInfraestructura(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      id: string
      patch: TablesUpdate<'infraestructura'>
    }) => api.actualizarInfraestructura(vars.id, vars.patch),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['infraestructura', campoId] }),
  })
}

export function useBorrarInfraestructura(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.borrarInfraestructura,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['infraestructura', campoId] }),
  })
}

// ===== Lotes =====

export const useLotesDeCampo = (campoId: string) =>
  useQuery({
    queryKey: ['lotes-campo', campoId],
    queryFn: () => api.listLotes(campoId),
    enabled: !!campoId,
  })

export function useCrearLote(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.crearLote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lotes-campo', campoId] })
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
    },
  })
}

export function useActualizarLote(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; patch: TablesUpdate<'lote'> }) =>
      api.actualizarLote(vars.id, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lotes-campo', campoId] }),
  })
}

export function useBorrarLote(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.borrarLote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lotes-campo', campoId] })
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
    },
  })
}

export function useAsignarAnimalesALote(campoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { loteId: string | null; animalIds: string[] }) =>
      api.asignarAnimalesALote(vars.loteId, vars.animalIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lotes-campo', campoId] })
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
      qc.invalidateQueries({ queryKey: ['panorama-inicio'] })
    },
  })
}
