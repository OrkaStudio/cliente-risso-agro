/** WhatsApp de soporte de Troppero (E.164 sin "+"). Sin la variable, no se ofrece. */
const WHATSAPP = (import.meta.env.VITE_WHATSAPP_SOPORTE as string | undefined)?.replace(
  /\D/g,
  '',
)

/** Link a WhatsApp con el mensaje ya escrito: quién es, de qué empresa y en
 *  qué pantalla estaba. El equipo responde sin preguntar lo obvio. */
export function linkWhatsapp(datos: {
  nombre: string | null
  empresa: string | null
  seccion: string | null
  /** Lo que escribió y el asistente no supo contestar: va ya escrito. */
  consulta?: string
}): string | null {
  if (!WHATSAPP) return null
  const quien = [datos.nombre, datos.empresa ? `de ${datos.empresa}` : null]
    .filter(Boolean)
    .join(' ')
  const donde = datos.seccion ? ` Estoy en ${datos.seccion}.` : ''
  const texto = `Hola, ${quien ? `soy ${quien}. ` : ''}Uso Troppero.${donde} Tengo una consulta: ${datos.consulta?.trim() ?? ''}`
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`
}
