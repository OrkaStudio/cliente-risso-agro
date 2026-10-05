// Edge function: enviar-codigo
//
// Hook «Send SMS» de Supabase Auth: cuando alguien pide entrar con su celular,
// Supabase genera el código de 6 números y, en vez de mandar un SMS, llama a
// esta función. Acá se manda por WhatsApp con la plantilla de autenticación de
// Meta (la que trae el botón «Copiar código»), desde el número de Tropero.
//
// La llamada viene firmada por Supabase (Standard Webhooks). Sin firma válida
// no se manda nada: nadie más puede usar esta función para mandar mensajes.
//
// Secrets:
//   SEND_SMS_HOOK_SECRETS   v1,whsec_…  (el mismo que se carga en el hook)
//   WA_TOKEN                token permanente de tropero-bot (el del bot)
//   WA_PHONE_NUMBER_ID      1415816181604916
//   WA_PLANTILLA_CODIGO     nombre de la plantilla aprobada (p. ej. codigo_tropero)
//   WA_PLANTILLA_IDIOMA     es_AR (por defecto)
// Sin WA_* (desarrollo local) el código se escribe en el log y no sale nada.

import { Webhook } from 'npm:standardwebhooks@1.0.0'

type Payload = {
  user: { id: string; phone: string }
  sms: { otp: string }
}

const GRAPH = 'https://graph.facebook.com/v21.0'

const respuesta = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// El error que ve el usuario sale de acá: Supabase lo devuelve tal cual.
const fallo = (http_code: number, message: string) =>
  respuesta(http_code, { error: { http_code, message } })

async function mandarPorWhatsApp(telefono: string, codigo: string) {
  const token = Deno.env.get('WA_TOKEN')
  const numeroId = Deno.env.get('WA_PHONE_NUMBER_ID')
  const plantilla = Deno.env.get('WA_PLANTILLA_CODIGO')
  if (!token || !numeroId || !plantilla) {
    console.log(`[enviar-codigo] sin WhatsApp configurado · ${telefono} → ${codigo}`)
    return { ok: true as const }
  }
  const r = await fetch(`${GRAPH}/${numeroId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefono.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: plantilla,
        language: { code: Deno.env.get('WA_PLANTILLA_IDIOMA') ?? 'es_AR' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: codigo }] },
          // Botón «Copiar código» de las plantillas de autenticación.
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
        ],
      },
    }),
  })
  if (r.ok) return { ok: true as const }
  const detalle = await r.text()
  console.error(`[enviar-codigo] Meta respondió ${r.status}: ${detalle}`)
  return { ok: false as const }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fallo(405, 'Método no permitido.')

  const secreto = Deno.env.get('SEND_SMS_HOOK_SECRETS')
  if (!secreto) return fallo(500, 'Falta configurar el envío de códigos.')

  const cuerpo = await req.text()
  let datos: Payload
  try {
    const wh = new Webhook(secreto.replace('v1,whsec_', ''))
    datos = wh.verify(cuerpo, Object.fromEntries(req.headers)) as Payload
  } catch {
    return fallo(401, 'Firma inválida.')
  }

  const telefono = datos.user?.phone
  const codigo = datos.sms?.otp
  if (!telefono || !codigo) return fallo(400, 'Faltan el teléfono o el código.')

  const envio = await mandarPorWhatsApp(telefono, codigo)
  if (!envio.ok) return fallo(502, 'No pudimos mandar el código por WhatsApp. Probá de nuevo en un rato.')
  return respuesta(200)
})
