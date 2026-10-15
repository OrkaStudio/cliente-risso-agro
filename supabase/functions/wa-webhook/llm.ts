// Interpretar un mensaje con Haiku (tool use forzado) y leer comprobantes
// reusando la Edge Function extraer-comprobante.

import { EntradaIncompleta, HERRAMIENTA, limpiarInterpretacion, promptInterpretar } from '../_shared/wa/interpretar.ts'
import { leerServicio } from '../_shared/wa/servicios.ts'
import type { Borrador, Contexto, Interpretacion } from '../_shared/wa/tipos.ts'

const MODELO = 'claude-haiku-4-5'

export type Uso = { entrada: number; salida: number }

export async function interpretar(
  texto: string,
  ctx: Contexto,
  anterior?: Borrador,
): Promise<{ interpretacion: Interpretacion; uso: Uso }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY')
  const prompt = promptInterpretar(texto, ctx, anterior)
  const json = await leerServicio<{
    content?: { type: string; input?: unknown }[]
    usage?: { input_tokens: number; output_tokens: number }
    stop_reason?: string
  }>({ pedir: () => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 4096,
      temperature: 0,
      tools: [HERRAMIENTA],
      tool_choice: { type: 'tool', name: HERRAMIENTA.name },
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(25_000),
  }) })
  if (json.stop_reason === 'max_tokens') throw new EntradaIncompleta('No pude revisar el mensaje completo. Mandalo en partes más cortas; no guardé una parte sin avisarte. Tu pendiente se conserva.')
  const tool = json.content?.find((b) => b.type === 'tool_use')
  if (!tool?.input) throw new EntradaIncompleta('No pude interpretar el mensaje completo. Tu pendiente se conserva; probá con un audio más corto o escribime lo que falta.')
  return {
    interpretacion: limpiarInterpretacion(tool?.input),
    uso: { entrada: json.usage?.input_tokens ?? 0, salida: json.usage?.output_tokens ?? 0 },
  }
}

/**
 * Nota de voz → texto. Claude no recibe audio: la transcripción la hace
 * OpenAI (secret OPENAI_API_KEY). WhatsApp manda OGG/Opus, que acepta tal cual.
 */
export async function transcribir(bytes: Uint8Array, mime: string, pista: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY')
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') ? 'm4a' : 'ogg'
  const form = new FormData()
  form.append('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime.split(';')[0] }), `audio.${ext}`)
  form.append('model', 'gpt-4o-mini-transcribe')
  form.append('language', 'es')
  form.append('prompt', pista)
  const json = await leerServicio<{ text?: string }>({ pedir: () => fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  }) })
  return (json.text ?? '').trim()
}

export type Comprobante = {
  tipo: 'gasto' | 'ingreso' | null
  monto: number | null
  fecha: string | null
  descripcion: string | null
  contraparte: string | null
  cuit: string | null
  comprobante_tipo: 'a' | 'b' | 'c' | 'otro' | null
  categoria_id: string | null
  iva_lineas: { concepto: string | null; neto: number; alicuota: number; iva: number }[]
  confianza: 'alta' | 'media' | 'baja'
}

/** Misma lectura que usa la app al cargar un comprobante: no se duplica el prompt. */
export async function leerComprobante(
  bytes: Uint8Array,
  mediaType: string,
  categorias: { id: string; nombre: string; grupo: string | null; aplica_a: string | null }[],
): Promise<Comprobante> {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/extraer-comprobante`, {
    method: 'POST',
    headers: {
      // extraer-comprobante tiene verify_jwt: alcanza con la anon key (no da acceso a datos).
      Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64: btoa(bin), mediaType, categorias }),
    signal: AbortSignal.timeout(60_000),
  })
  const json = (await res.json().catch(() => ({}))) as Comprobante & { error?: string }
  if (!res.ok || json.error) throw new Error(`extraer-comprobante ${res.status}: ${json.error ?? ''}`)
  return json
}
