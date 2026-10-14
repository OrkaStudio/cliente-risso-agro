import type { MapaCampo } from './mapa.ts'
type Pt = [number, number]
const xml = (s: string) => [...s].filter(c => { const n = c.codePointAt(0)!; return n >= 32 || n === 9 || n === 10 || n === 13 }).join('').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
export function poligonoMapa(value: unknown): Pt[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 2000) return null
  if (value.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 85 || Math.abs(p[1]) > 180)) return null
  const pts = value as Pt[]
  const base = pts[0]
  const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + (p[0] - base[0]) * (q[1] - base[1]) - (q[0] - base[0]) * (p[1] - base[1]) }, 0)
  return Math.abs(area) > 1e-12 ? pts : null
}
function inside(p: Pt, polygon: Pt[]): boolean {
  let yes = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes
  }
  return yes
}
function interior(poly: Pt[]): Pt {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1])
  const left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs) - left, height = Math.max(...ys) - top
  let best: Pt = poly[0], distance = -1
  for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) {
    const p: Pt = [left + width * (x + .5) / 12, top + height * (y + .5) / 12]
    if (!inside(p, poly)) continue
    let nearest = Infinity
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
      nearest = Math.min(nearest, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
    }
    if (nearest > distance) { distance = nearest; best = p }
  }
  return best
}
function lines(s: string, limit: number): string[] {
  const words = s.replace(/\s+/g, ' ').trim().match(new RegExp(`.{1,${limit}}(?:\\s|$)|.{1,${limit}}`, 'g')) ?? []
  return words.map(w => w.trim())
}

export type FondoSatelital = { dataUri: string; atribucion: string }
const radio = 6378137
/** La misma proyección que el raster de Esri, para alinear foto y límites. */
export function proyectarMapa([lat, lng]: Pt): Pt {
  return [radio * lng * Math.PI / 180, radio * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))]
}
export function geometriaMapa(datos: MapaCampo) {
  if (datos.potreros.length > 100) throw new Error('El mapa admite hasta 100 potreros por imagen')
  const valid = datos.potreros.map(p => ({ ...p, points: poligonoMapa(p.poligono) })).filter((p): p is typeof p & { points: Pt[] } => p.points !== null)
  const faltantes = datos.potreros.filter(p => !valid.some(v => v.id === p.id)).map(p => p.nombre)
  if (!valid.length) return null
  valid.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
  const projected = valid.flatMap(p => p.points).map(proyectarMapa)
  const bounds = projected.reduce((b, p) => [Math.min(b[0], p[0]), Math.max(b[1], p[0]), Math.min(b[2], p[1]), Math.max(b[3], p[1])], [Infinity, -Infinity, Infinity, -Infinity])
  const [minX, maxX, minY, maxY] = bounds
  const width = 1400, mapW = 1320, mapH = 1000, mapX = 40, mapY = 180
  const height = 1370 + Math.ceil(valid.length / 4) * 42
  const scale = Math.min((mapW - 90) / Math.max(maxX - minX, 1e-8), (mapH - 90) / Math.max(maxY - minY, 1e-8))
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const extent = [cx - mapW / scale / 2, cy - mapH / scale / 2, cx + mapW / scale / 2, cy + mapH / scale / 2] as [number, number, number, number]
  const point = (p: Pt): Pt => { const [x, y] = proyectarMapa(p); return [mapX + (x - extent[0]) * scale, mapY + (extent[3] - y) * scale] }
  return { valid, faltantes, width, height, mapW, mapH, mapX, mapY, extent, point }
}

/** El raster se incrusta como bytes: el render nunca abre URLs externas. */
export function svgMapa(datos: MapaCampo, fecha: string, fondo?: FondoSatelital): { svg: string; dibujados: number; faltantes: string[]; width: number; height: number } | null {
  const geo = geometriaMapa(datos)
  if (!geo) return null
  if (fondo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(fondo.dataUri) || fondo.dataUri.length > 6 * 1024 * 1024)) throw Error('Fondo satelital inválido')
  const { valid, faltantes, width, height, mapW, mapH, mapX, mapY, point } = geo
  const elements: string[] = []
  for (const [i, p] of valid.entries()) {
    const points = p.points.map(point), at = interior(points)
    const coords = points.map(v => v.map(n => n.toFixed(2)).join(',')).join(' ')
    // El borde oscuro bajo el claro contrasta tanto en cultivos como en caminos.
    if (fondo) elements.push(`<polyline points="${coords} ${points[0].map(n => n.toFixed(2)).join(',')}" fill="none" stroke="#131b16" stroke-opacity=".75" stroke-width="7" stroke-linejoin="round"/>`)
    elements.push(`<polygon points="${coords}" fill="${fondo ? 'none' : i % 2 ? '#e9e9d9' : '#e2e9dc'}" stroke="${fondo ? '#fff3b3' : '#4b574e'}" stroke-width="3" stroke-linejoin="round"/>`)
    const label = p.nombre.replace(/\s+/g, ' ').trim()
    const bw = Math.min(label.length * 13 + 16, 240)
    const corners: Pt[] = [[at[0] - bw / 2, at[1] - 17], [at[0] + bw / 2, at[1] - 17], [at[0] - bw / 2, at[1] + 17], [at[0] + bw / 2, at[1] + 17]]
    if (label.length <= 16 && corners.every(v => inside(v, points)))
      elements.push(`<rect x="${(at[0] - bw / 2).toFixed(2)}" y="${(at[1] - 17).toFixed(2)}" width="${bw}" height="34" rx="6" fill="#fbfaf6" stroke="#131b16" stroke-opacity=".3"/><text x="${at[0].toFixed(2)}" y="${(at[1] + 8).toFixed(2)}" text-anchor="middle" font-size="24" font-weight="600">${xml(label)}</text>`)
    else elements.push(`<circle cx="${at[0].toFixed(2)}" cy="${at[1].toFixed(2)}" r="18" fill="#fbfaf6" stroke="#b85c2e" stroke-width="2"/><text x="${at[0].toFixed(2)}" y="${(at[1] + 7).toFixed(2)}" text-anchor="middle" font-size="20" font-weight="600">${i + 1}</text>`)
    const row = 1242 + Math.floor(i / 4) * 42, col = 42 + (i % 4) * 330
    elements.push(`<text x="${col}" y="${row}" font-size="24" fill="#b85c2e" font-weight="600">${i + 1}</text><text x="${col + 46}" y="${row}" font-size="24">${xml(label.slice(0, 19))}${label.length > 19 ? '…' : ''}</text>`)
  }
  const missing = faltantes.length ? `Sin dibujo: ${faltantes.join(', ')}` : 'Todos los potreros registrados tienen dibujo.'
  const footer = lines(missing, 100).slice(0, 2)
  const background = fondo ? `<image x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" preserveAspectRatio="none" href="${fondo.dataUri}"/>` : `<rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" fill="#fbfaf6"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f4f1e9"/><g font-family="Inter" fill="#131b16"><text x="40" y="54" font-size="32" font-weight="700" fill="#b85c2e">TROPPERO</text><text x="40" y="101" font-size="34" font-weight="600">${xml(datos.nombre.slice(0, 65))}</text><text x="40" y="138" font-size="21" fill="#6e675c">${fondo ? 'Vista satelital de referencia' : 'Croquis de respaldo · satélite no disponible'} · límites guardados · ${xml(fecha)}</text>${background}${elements.join('')}<rect x="55" y="192" width="46" height="75" rx="10" fill="#fbfaf6" fill-opacity=".9"/><path d="M78 252 L78 217 M68 233 L78 217 L88 233" fill="none" stroke="#131b16" stroke-width="3"/><text x="71" y="211" font-size="19">N</text>${footer.map((line, i) => `<text x="40" y="${height - 108 + i * 25}" font-size="19" fill="#6e675c">${xml(line)}</text>`).join('')}<text x="40" y="${height - 50}" font-size="17" fill="#6e675c">${fondo ? xml(fondo.atribucion.slice(0, 155)) : 'Contornos según la app.'}</text><text x="40" y="${height - 18}" font-size="19" fill="#6e675c">Escribí el nombre del potrero. No requiere ubicación en vivo. La imagen no muestra el estado actual del campo.</text></g></svg>`
  return { svg, dibujados: valid.length, faltantes, width, height }
}
