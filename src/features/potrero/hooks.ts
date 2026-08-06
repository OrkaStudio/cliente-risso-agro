import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPotreroDetalle, listarLabores, registrarLabor } from '@/features/potrero/api'

export const usePotreroDetalle = (id: string) =>
  useQuery({
    queryKey: ['potrero-detalle', id],
    queryFn: () => getPotreroDetalle(id),
    enabled: Boolean(id),
  })


export const useLabores = (potreroId: string) =>
  useQuery({
    queryKey: ['labores', potreroId],
    queryFn: () => listarLabores(potreroId),
    enabled: Boolean(potreroId),
  })

export function useRegistrarLabor(potreroId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: registrarLabor,
    onSuccess: () => {
      // Una labor puede mover el ciclo y crear un gasto: se invalida todo lo que
      // muestra alguna de esas dos cosas.
      qc.invalidateQueries({ queryKey: ['labores', potreroId] })
      qc.invalidateQueries({ queryKey: ['potrero-detalle', potreroId] })
      // El mapa de Campos lee de `campos-con-potreros` y `potreros-campo`: sin
      // invalidarlas, la siembra guardaba bien pero el potrero seguía sin
      // mostrar el cultivo hasta recargar la página.
      qc.invalidateQueries({ queryKey: ['campos'] })
      qc.invalidateQueries({ queryKey: ['campos-con-potreros'] })
      qc.invalidateQueries({ queryKey: ['potreros-campo'] })
      qc.invalidateQueries({ queryKey: ['panorama-inicio'] })
      qc.invalidateQueries({ queryKey: ['movimientos'] })
    },
  })
}
