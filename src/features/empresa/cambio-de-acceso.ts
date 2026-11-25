// Cuando el dueño le cambia el acceso a alguien que tiene la app abierta (Lau, 19/11:
// «no le habilita la Agenda al veterinario y después quiere habilitarla, ¿qué pasa?»).
// La base aplica el cambio al instante, pero la app tenía guardado lo de antes: la
// barra no mostraba la sección nueva hasta que pasaran 30 s y se navegara, y al
// sacarle una sección seguía viendo los montos en pantalla hasta recargar.
// Acá, apenas llega la membresía nueva con otros niveles: se vuelve a pedir todo lo
// demás (lo que ya no ve vuelve vacío y la pantalla lo saca, ver SeccionPermitida),
// se borra del teléfono la plata guardada si dejó de verla, y se le dice qué cambió.
import { useEffect } from 'react'

import { queryClient } from '@/lib/query-client'
import { supabase } from '@/lib/supabase/client'
import { SECCIONES_CON_PERMISO, nivelDe, type Nivel, type SeccionConPermiso } from './secciones'
import type { Membresia } from './use-empresa'

const ARTICULO: Record<SeccionConPermiso, string> = { hacienda: 'la Hacienda', campos: 'los Campos', plata: 'la Plata y la Agenda' }
const ve = (n: Nivel) => n === 've' || n === 'carga'

export type Cambio = { seccion: SeccionConPermiso; nivel: Nivel; texto: string }

/** Qué cambió en cada sección, dicho para quien lo recibe. Vacío si no cambió nada que se note. */
export function cambiosDe(antes: Membresia, ahora: Membresia): Cambio[] {
  const cambios: Cambio[] = []
  for (const { id } of SECCIONES_CON_PERMISO) {
    const a = nivelDe(antes, id)
    const b = nivelDe(ahora, id)
    if (a === b) continue
    const texto =
      !ve(a) && ve(b) ? `Ahora ves ${ARTICULO[id]}${b === 'carga' ? ' y podés cargar' : ''}.`
      : ve(a) && !ve(b) ? `Ya no ves ${ARTICULO[id]}.`
      : a === 've' && b === 'carga' ? `Ahora podés cargar en ${ARTICULO[id]}.`
      : a === 'carga' && b === 've' ? `En ${ARTICULO[id]} ahora sólo mirás.`
      : b === 'solo_manda' ? `Lo de ${ARTICULO[id]} ahora lo mandás por WhatsApp.`
      : null
    if (texto) cambios.push({ seccion: id, nivel: b, texto })
  }
  return cambios
}

/** Lo mismo, en frases. */
export function queCambio(antes: Membresia, ahora: Membresia): string[] {
  return cambiosDe(antes, ahora).map((c) => c.texto)
}

/** ¿La misma cuenta con otros niveles? (Una cuenta distinta es otro camino: cambiar de cuenta.) */
export function cambioElAcceso(antes: Membresia | null | undefined, ahora: Membresia | null | undefined): boolean {
  if (!antes || !ahora || antes.empresa_id !== ahora.empresa_id) return false
  return JSON.stringify(antes.niveles ?? null) !== JSON.stringify(ahora.niveles ?? null) || antes.rol !== ahora.rol
}

export function aplicarCambioDeAcceso(antes: Membresia, ahora: Membresia) {
  // Todo lo demás se vuelve a pedir con el acceso nuevo.
  void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'empresa' })
  // La plata guardada en el teléfono para usar sin señal no queda si ya no la ve.
  if (ve(nivelDe(antes, 'plata')) && !ve(nivelDe(ahora, 'plata'))) {
    void import('@/features/campo/plata/db').then(({ platadb }) => platadb.refs.clear()).catch(() => {})
  }
  // Si con esto pasa a ir sólo por WhatsApp, lo dice su pantalla: no se repite en un aviso (Lau, 25/11).
  if (ahora.acceso === 'whatsapp' && antes.acceso !== 'whatsapp') {
    void import('./aviso-de-acceso').then(({ cerrarAvisoDeAcceso }) => cerrarAvisoDeAcceso())
    return
  }
  const cambios = cambiosDe(antes, ahora)
  if (cambios.length) void import('./aviso-de-acceso').then(({ avisarCambioDeAcceso }) => avisarCambioDeAcceso(cambios, antes.acceso === 'whatsapp' && ahora.acceso !== 'whatsapp'))
}

/**
 * El acceso en vivo (Lau, 20/11; migración 20261120120000): la app escucha su propia
 * fila de miembros y, apenas el dueño la cambia o la borra, vuelve a pedir la cuenta.
 * Sin esto, el cambio llegaba con el refresco de cada minuto (que sigue, por si el
 * tiempo real se corta). Al borrar, el aviso lleva sólo la clave: se pide igual.
 */
export function useAccesoEnVivo(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return
    const pedir = () => void queryClient.invalidateQueries({ queryKey: ['empresa'] })
    const canal = supabase
      .channel(`acceso-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'miembro_empresa', filter: `user_id=eq.${userId}` }, pedir)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'miembro_empresa' }, pedir)
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [userId])
}
