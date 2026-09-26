// Cliente mínimo de la API de WhatsApp (Cloud API de Meta).
// Único lugar que habla con Meta. El token es del usuario del sistema
// (no vence); vive como secret WA_TOKEN, nunca en el repo.

import type { Mensaje } from '../_shared/wa/tipos.ts'

const GRAPH = 'https://graph.facebook.com/v23.0'

const token = () => Deno.env.get('WA_TOKEN') ?? ''
const phoneId = () => Deno.env.get('WA_PHONE_NUMBER_ID') ?? ''

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

/** Arma el payload de Meta: texto, botones de respuesta (≤3) o lista (≤10). */
export function payload(to: string, m: Mensaje): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to }
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

/** Baja una foto o audio que mandó el productor. */
export async function descargarMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const meta = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(15_000),
  })
  const info = (await meta.json()) as { url?: string; mime_type?: string }
  if (!meta.ok || !info.url) throw new Error(`Meta media ${meta.status}`)
  const res = await fetch(info.url, {
    headers: { Authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Meta media descarga ${res.status}`)
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
