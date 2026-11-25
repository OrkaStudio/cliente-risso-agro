// El número lo cambia el equipo, no la persona (Lau, 25/11): es quién sos en la app y
// en el bot, y cambiarlo solo dejaba el número viejo hablándole al bot. La persona nos
// escribe por WhatsApp desde el número nuevo, alguien confirma que es ella y lo cambia
// con interno.cambiar_numero (migración 20261125120000), en la cuenta y en el bot juntos.

/** El WhatsApp de una persona del equipo (E.164 sin «+»). Sin la variable, no se ofrece. */
const SOPORTE = (import.meta.env.VITE_WHATSAPP_SOPORTE as string | undefined)?.replace(/\D/g, '') || null

/** Link al WhatsApp del equipo con el pedido ya escrito: quién es y con qué número entraba. */
export function whatsappCambioDeNumero(datos: { nombre?: string | null; empresa?: string | null; actual?: string | null } = {}): string | null {
  if (!SOPORTE) return null
  const quien = [datos.nombre?.trim(), datos.empresa?.trim() ? `de ${datos.empresa.trim()}` : null].filter(Boolean).join(' ')
  const texto = [
    `Hola${quien ? `, soy ${quien}` : ''}. Cambié de número y quiero entrar a Troppero con este, desde el que te escribo.`,
    datos.actual ? `Hasta ahora entraba con el ${datos.actual}.` : 'Antes entraba con el: ',
  ].join(' ')
  return `https://wa.me/${SOPORTE}?text=${encodeURIComponent(texto)}`
}
