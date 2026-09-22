/** WhatsApp de soporte de Orka (E.164 sin "+"). Sin la variable, no se ofrece. */
const WHATSAPP = (import.meta.env.VITE_WHATSAPP_SOPORTE as string | undefined)?.replace(
  /\D/g,
  '',
)

/** Link a WhatsApp con el mensaje ya escrito: quién es, de qué empresa y en
 *  qué pantalla estaba. Orka responde sin preguntar lo obvio. */
export function linkWhatsapp(datos: {
  nombre: string | null
  empresa: string | null
  seccion: string | null
}): string | null {
  if (!WHATSAPP) return null
  const quien = [datos.nombre, datos.empresa ? `de ${datos.empresa}` : null]
    .filter(Boolean)
    .join(' ')
  const donde = datos.seccion ? ` Estoy en ${datos.seccion} de la aplicación.` : ''
  const texto = `Hola, ${quien ? `soy ${quien}. ` : ''}Uso la aplicación de Orka.${donde} Tengo una consulta: `
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`
}
