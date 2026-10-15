// Cliente mínimo de la API de WhatsApp (Cloud API de Meta).
// Único lugar que habla con Meta. El token es del usuario del sistema
// (no vence); vive como secret WA_TOKEN, nunca en el repo.

import type { Mensaje } from '../_shared/wa/tipos.ts'

const GRAPH = 'https://graph.facebook.com/v23.0'

const token = () => Deno.env.get('WA_TOKEN') ?? ''
const phoneId = () => Deno.env.get('WA_PHONE_NUMBER_ID') ?? ''

/** Preserva el texto completo; la confirmación siempre llega después del detalle. */
export function prepararMensajes(m: Mensaje): Mensaje[] {
  const interactivo = Boolean(m.botones?.length || m.lista?.filas.length || m.pedirUbicacion)
  if (m.texto.length <= (interactivo ? 1024 : 4096)) return [m]
  const partes: Mensaje[] = []
  let resto = m.texto
  while (resto.length) {
    let corte = Math.min(4096, resto.length)
    if (corte < resto.length && /[\uD800-\uDBFF]/.test(resto[corte - 1])) corte--
    partes.push({ texto: resto.slice(0, corte) })
    resto = resto.slice(corte)
  }
  if (interactivo) partes.push({ ...m, texto: m.pedirUbicacion ? 'Revisá el detalle anterior y enviá la ubicación.' : m.lista ? 'Revisá el detalle anterior y elegí una opción.' : 'Revisá el detalle completo en los mensajes anteriores. ¿Lo guardo?' })
  return partes
}

async function graph(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(`Meta ${res.status}: ${JSON.stringify(json.error ?? json)}`)
  return json
}

/** Arma el payload de Meta: pedido de ubicación, texto, botones de respuesta (≤3) o lista (≤10). */
export function payload(to: string, m: Mensaje): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to }
  if (m.pedirUbicacion) {
    return {
      ...base,
      type: 'interactive',
      interactive: { type: 'location_request_message', body: { text: m.texto.slice(0, 1024) }, action: { name: 'send_location' } },
    }
  }
  if (m.botones?.length) {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: m.texto.slice(0, 1024) },
        action: {
          buttons: m.botones.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titulo.slice(0, 20) } })),
        },
      },
    }
  }
  if (m.lista?.filas.length) {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: m.texto.slice(0, 1024) },
        action: {
          button: m.lista.boton.slice(0, 20),
          sections: [
            {
              title: m.lista.boton.slice(0, 24),
              rows: m.lista.filas.slice(0, 10).map((f) => ({
                id: f.id,
                title: f.titulo.slice(0, 24),
                ...(f.detalle ? { description: f.detalle.slice(0, 72) } : {}),
              })),
            },
          ],
        },
      },
    }
  }
  return { ...base, type: 'text', text: { body: m.texto.slice(0, 4096), preview_url: false } }
}

/** Manda un mensaje y devuelve el wamid y lo enviado (para guardarlo). */
export async function enviar(to: string, m: Mensaje): Promise<{ wamid: string; cuerpo: Record<string, unknown> }> {
  const cuerpo = payload(to, m)
  const r = await graph(`${phoneId()}/messages`, cuerpo)
  const wamid = (r.messages as { id: string }[] | undefined)?.[0]?.id
  if (!wamid) throw new Error(`Meta no devolvió id: ${JSON.stringify(r)}`)
  return { wamid, cuerpo }
}

export function payloadImagen(to: string, mediaId: string, caption: string): Record<string, unknown> {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'image', image: { id: mediaId, caption: [...caption].slice(0, 1024).join('') } }
}

export async function subirImagen(bytes: Uint8Array, filename: string): Promise<string> {
  const esJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217
  const esPng = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
  if (bytes.length > 5 * 1024 * 1024 || bytes.length < 8 || (!esJpeg && !esPng)) throw new Error('Imagen inválida o demasiado grande')
  const mime = esJpeg ? 'image/jpeg' : 'image/png'
  const form = new FormData()
  form.set('messaging_product', 'whatsapp'); form.set('type', mime)
  form.set('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }), filename)
  const res = await fetch(`${GRAPH}/${phoneId()}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: form, signal: AbortSignal.timeout(30_000) })
  const json = await res.json() as { id?: string; error?: { code?: number } }
  if (!res.ok || !json.id) throw new Error(`Meta imagen ${res.status} / ${json.error?.code ?? 'sin id'}`)
  return json.id
}

export async function enviarImagen(to: string, mediaId: string, caption: string) {
  const cuerpo = payloadImagen(to, mediaId, caption), result = await graph(`${phoneId()}/messages`, cuerpo)
  const wamid = (result.messages as { id: string }[] | undefined)?.[0]?.id
  if (!wamid) throw new Error('Meta no devolvió ID de la imagen')
  return { wamid, cuerpo }
}

/** PDF privado: se sube a Meta por bytes; no publica un link de los datos del campo. */
export async function subirDocumento(bytes: Uint8Array, filename: string): Promise<string> {
  const form = new FormData()
  form.set('messaging_product', 'whatsapp')
  form.set('type', 'application/pdf')
  form.set('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), filename)
  const res = await fetch(`${GRAPH}/${phoneId()}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: form, signal: AbortSignal.timeout(30_000) })
  const json = await res.json() as { id?: string; error?: { code?: number } }
  if (!res.ok || !json.id) throw new Error(`Meta documento ${res.status} / ${json.error?.code ?? 'sin id'}`)
  return json.id
}

export function payloadDocumento(to: string, mediaId: string, filename: string, caption: string, template?: string): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to }
  if (template) return { ...base, type: 'template', template: { name: template, language: { code: 'es_AR' },
    components: [{ type: 'header', parameters: [{ type: 'document', document: { id: mediaId, filename } }] }] } }
  return { ...base, type: 'document', document: { id: mediaId, filename, caption } }
}

export async function enviarDocumento(to: string, mediaId: string, filename: string, caption: string, template?: string) {
  const cuerpo = payloadDocumento(to, mediaId, filename, caption, template)
  const json = await graph(`${phoneId()}/messages`, cuerpo)
  const wamid = (json.messages as { id: string }[] | undefined)?.[0]?.id
  if (!wamid) throw new Error('Meta no devolvió ID del documento')
  return { wamid, cuerpo }
}

export async function plantillaSemanalAprobada(name: string): Promise<boolean> {
  const waba = Deno.env.get('WA_BUSINESS_ACCOUNT_ID')
  if (!waba) return false
  const url = `${GRAPH}/${waba}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,language,components&limit=100`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Meta plantilla ${res.status}`)
  const result = await res.json() as { data?: { name: string; status: string; language: string; components?: { type: string; format?: string }[] }[] }
  return Boolean(result.data?.some(t => t.name === name && t.status === 'APPROVED' && t.language === 'es_AR' && t.components?.some(c => c.type === 'HEADER' && c.format === 'DOCUMENT')))
}

/** Tildes azules + "escribiendo…" mientras el bot piensa. No es crítico: si falla, sigue. */
export async function leidoYEscribiendo(wamid: string): Promise<void> {
  try {
    await graph(`${phoneId()}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: wamid,
      typing_indicator: { type: 'text' },
    })
  } catch (e) {
    console.warn('leidoYEscribiendo', e instanceof Error ? e.message : e)
  }
}

/** Error de Meta que vale la pena reintentar: 5xx, 429 o la red. */
class Pasajero extends Error {}

/**
 * Baja una foto o audio que mandó el productor. Meta a veces contesta 500 al
 * pedir el media (pasó el 02/10 con una foto que al reenviarla anduvo):
 * hasta 3 intentos antes de darlo por perdido.
 */
export async function descargarMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  for (let intento = 1; ; intento++) {
    try {
      return await descargarUnaVez(mediaId)
    } catch (e) {
      if (!(e instanceof Pasajero) || intento >= 3) throw e
      console.warn('descargarMedia reintento', intento, e.message)
      await new Promise((r) => setTimeout(r, 1000 * intento))
    }
  }
}

async function descargarUnaVez(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const pedir = async (url: string, ms: number) => {
    try {
      return await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(ms) })
    } catch (e) {
      throw new Pasajero(`red: ${e instanceof Error ? e.message : e}`)
    }
  }
  const fallo = (que: string, status: number) =>
    status >= 500 || status === 429 ? new Pasajero(`${que} ${status}`) : new Error(`${que} ${status}`)

  const meta = await pedir(`${GRAPH}/${mediaId}`, 15_000)
  const info = (await meta.json().catch(() => ({}))) as { url?: string; mime_type?: string }
  if (!meta.ok || !info.url) throw fallo('Meta media', meta.status)
  const res = await pedir(info.url, 30_000)
  if (!res.ok) throw fallo('Meta media descarga', res.status)
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: info.mime_type ?? 'image/jpeg' }
}

/** Firma X-Hub-Signature-256: HMAC-SHA256 del cuerpo crudo con el secreto de la app. */
export async function firmaValida(cuerpoCrudo: string, cabecera: string | null): Promise<boolean> {
  const secreto = Deno.env.get('WA_APP_SECRET')
  if (!secreto || !cabecera?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(cuerpoCrudo)))
  const esperado = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
  const recibido = cabecera.slice('sha256='.length)
  if (recibido.length !== esperado.length) return false
  let diff = 0
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i)
  return diff === 0
}
