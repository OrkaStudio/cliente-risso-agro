import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import type { PlataItem, RefCampo, RefCategoria } from './db'

export type TipoMov = Database['public']['Enums']['tipo_movimiento']

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
    descripcion: item.descripcion,
    comprobante_url: item.foto ? pathComprobante(item) : null,
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
