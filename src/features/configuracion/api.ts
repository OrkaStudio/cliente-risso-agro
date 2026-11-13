import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Rol, Seccion } from '@/features/empresa/secciones'
import { supabase } from '@/lib/supabase/client'
import { formatearCelularAR } from '@/lib/telefono'

/** Alguien de la empresa: ya entra (userId) o está invitado y no aceptó (invitacionId). */
export type Persona = {
  userId: string | null
  invitacionId: string | null
  nombre: string
  /** E.164 sin «+» (549…). */
  celular: string
  rol: string
  secciones: Seccion[] | null
  desde: string
  venceAt: string | null
  token: string | null
  soyYo: boolean
}

export function usePersonas(activo: boolean) {
  return useQuery({
    queryKey: ['personas'],
    enabled: activo,
    queryFn: async (): Promise<Persona[]> => {
      const { data, error } = await supabase.rpc('personas_de_empresa')
      if (error) throw error
      return (data ?? []).map((p) => ({
        userId: p.user_id,
        invitacionId: p.invitacion_id,
        nombre: p.nombre ?? 'Sin nombre',
        celular: p.celular.replace(/\D/g, ''),
        rol: p.rol,
        secciones: (p.secciones as Seccion[] | null) ?? null,
        desde: p.desde,
        venceAt: p.vence_at,
        token: p.token,
        soyYo: p.soy_yo,
      }))
    },
  })
}

export function useInvitar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (x: { nombre: string; celular: string; rol: Rol; secciones: Seccion[] }) => {
      const { data, error } = await supabase.rpc('crear_invitacion', { p_celular: x.celular, p_nombre: x.nombre, p_rol: x.rol, p_secciones: x.secciones })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['personas'] }),
  })
}

export function useCambiarSecciones() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (x: { userId: string; secciones: Seccion[] }) => {
      const { error } = await supabase.rpc('cambiar_secciones', { p_user: x.userId, p_secciones: x.secciones })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['personas'] }),
  })
}

export function useQuitarPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: Pick<Persona, 'userId' | 'invitacionId'>) => {
      const { error } = await supabase.rpc('quitar_persona', { p_user: p.userId, p_invitacion: p.invitacionId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['personas'] }),
  })
}

/** El nombre de quien usa la cuenta (lo usa el asistente para saludar). */
export function useCambiarNombre() {
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.auth.updateUser({ data: { nombre: nombre.trim() } })
      if (error) throw error
    },
  })
}

/** El link de la invitación y el WhatsApp ya escrito para mandarlo. */
export function linkInvitacion(token: string) {
  return `${window.location.origin}/invitacion/${token}`
}
export function whatsappInvitacion(p: { celular: string; nombre: string; empresa: string; token: string }) {
  const texto = `Hola ${p.nombre.split(' ')[0]}, te sumé a ${p.empresa} en Troppero. Entrá desde acá con tu celular: ${linkInvitacion(p.token)}`
  return `https://wa.me/${p.celular}?text=${encodeURIComponent(texto)}`
}

/** «+54 9 2244 42-9015» para mostrar un número guardado como 549…, con la característica bien cortada. */
export function celularLindo(c: string) {
  return formatearCelularAR(`+${c.replace(/\D/g, '')}`)
}

// ---------------------------------------------------------------- Baja (Lau, 13/11)

export type Baja = { id: number; pedidaAt: string; borrarDesde: string }

/** La baja en curso de la empresa, si hay (la ve sólo el dueño). */
export function useBaja(empresaId: string | undefined) {
  return useQuery({
    queryKey: ['baja', empresaId],
    enabled: !!empresaId,
    queryFn: async (): Promise<Baja | null> => {
      const { data, error } = await supabase.from('baja').select('id, pedida_at, borrar_desde').eq('empresa_id', empresaId!).is('deshecha_at', null).maybeSingle()
      if (error) throw error
      return data ? { id: data.id, pedidaAt: data.pedida_at, borrarDesde: data.borrar_desde } : null
    },
  })
}

export function usePedirBaja(empresaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('pedir_baja')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baja', empresaId] }),
  })
}

export function useDeshacerBaja(empresaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('deshacer_baja')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baja', empresaId] }),
  })
}
