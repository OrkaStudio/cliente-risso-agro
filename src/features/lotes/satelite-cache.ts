// Cache de imágenes satelitales (Esri /export) en memoria del navegador.
//
// Esri responde con `Cache-Control: max-age=0, must-revalidate` → el navegador
// NO la cachea y la re-pide cada vez (cambiar de campo, togglear vista, volver),
// y como `/export` renderiza on-demand en el server cada pedido tarda ~2-3s. Lo
// resolvemos cacheando nosotros: bajamos el JPEG una vez y servimos un blob URL.
// Revisitas → instantáneo. Vive por sesión (un reload completo la vuelve a bajar).

const mem = new Map<string, string>() // exportURL -> blob URL
const enVuelo = new Map<string, Promise<string>>() // dedup de pedidos simultáneos

/** Blob URL ya cacheado para esa URL de Esri, o undefined si todavía no se bajó. */
export function satCacheado(url: string): string | undefined {
  return mem.get(url)
}

/** Baja la imagen (una sola vez por URL) y devuelve un blob URL cacheado. */
export function cargarSat(url: string): Promise<string> {
  const hit = mem.get(url)
  if (hit) return Promise.resolve(hit)
  const pendiente = enVuelo.get(url)
  if (pendiente) return pendiente

  const p = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Esri ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      mem.set(url, blobUrl)
      return blobUrl
    })
    .finally(() => enVuelo.delete(url))
  enVuelo.set(url, p)
  return p
}
