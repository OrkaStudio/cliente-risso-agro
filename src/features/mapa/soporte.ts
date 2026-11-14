/** WhatsApp de una persona de Orka; sin la variable, «¿Dudas?» no aparece. */
const SOPORTE = (import.meta.env.VITE_WHATSAPP_SOPORTE as string | undefined)?.replace(/\D/g, '')

export const haySoporte = !!SOPORTE

export function abrirSoporte(texto: string) {
  if (!SOPORTE) return
  window.open(`https://wa.me/${SOPORTE}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
}
