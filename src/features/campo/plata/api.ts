import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import type { PlataItem, RefCampo, RefCategoria } from './db'

export type TipoMov = Database['public']['Enums']['tipo_movimiento']
export type MedioPago = Database['public']['Enums']['medio_pago']

/** Fila del historial de plata (para el Modo Campo). */
export type HistItem = {
  id: string
  tipo: TipoMov
  monto: number
  categoria: string | null
  campo: string | null
  fecha: string
  descripcion: string | null
  /** URL firmada del comprobante (bucket privado) o null. */
  comprobanteUrl: string | null
  ivaTotal: number | null
}

/**
 * Últimos movimientos de la empresa (bajo RLS), con nombre de categoría/campo
 * y una URL FIRMADA del comprobante (el bucket es privado). Para el historial
 * del Modo Campo: mirar/confirmar desde el teléfono lo cargado. Requiere señal.
 */
export async function fetchHistorial(limit = 50): Promise<HistItem[]> {
  const { data, error } = await supabase
    .from('movimiento_financiero')
    .select(
      'id, tipo, monto, fecha_devengo, descripcion, comprobante_url, iva_total, categoria:categoria_id(nombre), campo:campo_id(nombre)',
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)

  // Firmamos los comprobantes en lote (1 h de validez).
  const paths = (data ?? [])
    .map((m) => m.comprobante_url)
    .filter((p): p is string => !!p)
  const firmadas = new Map<string, string>()
  if (paths.length) {
    const { data: urls } = await supabase.storage
      .from('comprobantes')
      .createSignedUrls(paths, 3600)
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) firmadas.set(u.path, u.signedUrl)
    }
  }

  return (data ?? []).map((m) => ({
    id: m.id,
    tipo: m.tipo,
    monto: Number(m.monto),
    categoria: m.categoria?.nombre ?? null,
    campo: m.campo?.nombre ?? null,
    fecha: m.fecha_devengo,
    descripcion: m.descripcion,
    comprobanteUrl: m.comprobante_url
      ? (firmadas.get(m.comprobante_url) ?? null)
      : null,
    ivaTotal: m.iva_total,
  }))
}

/** Categorías y campos para el formulario (se cachean en Dexie). */
export async function fetchRefs(): Promise<{
  categorias: RefCategoria[]
  campos: RefCampo[]
}> {
  const [catsRes, camposRes] = await Promise.all([
    supabase
      .from('categoria_movimiento')
      .select('id, nombre, aplica_a')
      .order('nombre'),
    supabase.from('campo').select('id, nombre, empresa_id').order('nombre'),
  ])
  if (catsRes.error) throw catsRes.error
  if (camposRes.error) throw camposRes.error
  return {
    categorias: catsRes.data ?? [],
    campos: camposRes.data ?? [],
  }
}

/** Path del comprobante dentro del bucket (RLS por prefijo de empresa). */
export function pathComprobante(item: PlataItem): string {
  return `${item.empresa_id}/${item.id}.jpg`
}

const EXT_AUDIO: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
}

/** Path de la nota de voz del movimiento (determinístico por id → reintentar
 *  no duplica). */
export function pathAudioMovimiento(item: PlataItem): string {
  const ext = EXT_AUDIO[(item.audio?.type ?? '').split(';')[0]] ?? 'webm'
  return `${item.empresa_id}/mov-${item.id}.${ext}`
}

/** Sube la nota de voz (idempotente: objeto existente = subido). */
export async function subirAudioMovimiento(item: PlataItem): Promise<void> {
  if (!item.audio) return
  const { error } = await supabase.storage
    .from('comprobantes')
    .upload(pathAudioMovimiento(item), item.audio, {
      contentType: item.audio.type || 'audio/webm',
      upsert: false,
    })
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(error.message)
  }
}

/**
 * Sube la foto al bucket privado `comprobantes`. Idempotente: si el objeto ya
 * existe (reintento tras un insert fallido), lo trata como subido.
 */
export async function subirFoto(item: PlataItem): Promise<void> {
  if (!item.foto) return
  const { error } = await supabase.storage
    .from('comprobantes')
    .upload(pathComprobante(item), item.foto, {
      contentType: 'image/jpeg',
      upsert: false,
    })
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(error.message)
  }
}

/**
 * Inserta el movimiento con id generado en el cliente. Idempotente: un
 * conflicto de PK (23505) significa que un intento anterior ya lo subió.
 * Semántica igual a la carga de Oficina: liquidado hoy (lo que se carga en
 * el campo es plata que ya se movió; lo pendiente/cuotas vive en Oficina).
 */
export async function insertarMovimiento(item: PlataItem): Promise<void> {
  const { error } = await supabase.from('movimiento_financiero').insert({
    id: item.id,
    empresa_id: item.empresa_id,
    campo_id: item.campo_id,
    tipo: item.tipo,
    categoria_id: item.categoria_id,
    monto: item.monto,
    fecha_devengo: item.fecha,
    fecha_cobro_pago: item.fecha,
    estado: 'liquidado',
    medio_pago: item.medio_pago,
    descripcion: item.descripcion,
    comprobante_url: item.foto || item.foto_subida ? pathComprobante(item) : null,
    audio_url: item.audio_path,
  })
  if (error && error.code !== '23505') throw new Error(error.message)
}

/**
 * Achica la foto a JPEG (~1500px máx, calidad 0.85) antes de guardarla en el
 * outbox: entra liviana en IndexedDB y sube rápido con poca señal. Mismo
 * criterio que el escaneo de comprobantes de Oficina.
 */
export async function fotoAJpegBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const max = 1500
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))),
      'image/jpeg',
      0.85,
    )
  })
}
