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

export type FondoSatelital = { dataUri: string; atribucion: string; extent?: [number,number,number,number] }
const radio = 6378137
/** La misma proyección que el raster de Esri, para alinear foto y límites. */
export function proyectarMapa([lat, lng]: Pt): Pt {
  return [radio * lng * Math.PI / 180, radio * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))]
}
export function geometriaMapa(datos: MapaCampo, focoId?: string) {
  if (datos.potreros.length > 100) throw new Error('El mapa admite hasta 100 potreros por imagen')
  const valid = datos.potreros.map(p => ({ ...p, points: poligonoMapa(p.poligono) })).filter((p): p is typeof p & { points: Pt[] } => p.points !== null)
  const faltantes = datos.potreros.filter(p => !valid.some(v => v.id === p.id)).map(p => p.nombre)
  if (!valid.length) return null
  valid.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
  const foco = focoId ? valid.find(p => p.id === focoId) : null
  if (focoId && !foco) throw new Error('El potrero solicitado no tiene un dibujo disponible')
  const projected = (foco ? [foco] : valid).flatMap(p => p.points).map(proyectarMapa)
  const bounds = projected.reduce((b, p) => [Math.min(b[0], p[0]), Math.max(b[1], p[0]), Math.min(b[2], p[1]), Math.max(b[3], p[1])], [Infinity, -Infinity, Infinity, -Infinity])
  const [minX, maxX, minY, maxY] = bounds
  const width = 1400, mapW = 1400, mapH = 1100, mapX = 0, mapY = 82
  const height = 1220
  let scale = Math.min((mapW - (foco ? 350 : 90)) / Math.max(maxX - minX, 1e-8), (mapH - (foco ? 350 : 90)) / Math.max(maxY - minY, 1e-8))
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  if(foco){
    const general=geometriaMapa(datos)!
    scale=Math.max(scale,mapW/(general.extent[2]-general.extent[0]))
    const hw=mapW/scale/2,hh=mapH/scale/2
    cx=Math.max(general.extent[0]+hw,Math.min(general.extent[2]-hw,cx))
    cy=Math.max(general.extent[1]+hh,Math.min(general.extent[3]-hh,cy))
  }
  const extent = [cx - mapW / scale / 2, cy - mapH / scale / 2, cx + mapW / scale / 2, cy + mapH / scale / 2] as [number, number, number, number]
  const point = (p: Pt): Pt => { const [x, y] = proyectarMapa(p); return [mapX + (x - extent[0]) * scale, mapY + (extent[3] - y) * scale] }
  return { valid, faltantes, width, height, mapW, mapH, mapX, mapY, extent, point, foco }
}

/** El raster se incrusta como bytes: el render nunca abre URLs externas. */
export function svgMapa(datos: MapaCampo, _fecha: string, fondo?: FondoSatelital, focoId?: string): { svg: string; dibujados: number; faltantes: string[]; width: number; height: number } | null {
  const geo = geometriaMapa(datos, focoId)
  if (!geo) return null
  if (fondo && (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(fondo.dataUri) || fondo.dataUri.length > 6 * 1024 * 1024)) throw Error('Fondo satelital inválido')
  const { valid, faltantes, width, height, mapW, mapH, mapX, mapY, point, foco } = geo
  const elements: string[] = []
  const labels: string[] = []
  const ocupados: { x: number; y: number; w: number; h: number }[] = []
  for (const [i, p] of valid.entries()) {
    const points = p.points.map(point), at = interior(points)
    const coords = points.map(v => v.map(n => n.toFixed(2)).join(',')).join(' ')
    // El borde oscuro bajo el claro contrasta tanto en cultivos como en caminos.
    if (fondo) elements.push(`<polyline points="${coords} ${points[0].map(n => n.toFixed(2)).join(',')}" fill="none" stroke="#131b16" stroke-opacity=".75" stroke-width="7" stroke-linejoin="round"/>`)
    elements.push(`<polygon points="${coords}" fill="${fondo ? 'none' : i % 2 ? '#e9e9d9' : '#e2e9dc'}" stroke="${fondo ? '#fff3b3' : '#4b574e'}" stroke-width="3" stroke-linejoin="round"/>`)
    if (datos.alertas?.includes(p.id)) elements.push(`<polygon points="${coords}" fill="none" stroke="#ce4936" stroke-width="6" stroke-linejoin="round"/>`)
    const label = p.nombre.replace(/\s+/g, ' ').trim()
    if (at[0] < 0 || at[0] > width || at[1] < mapY || at[1] > mapY + mapH) continue
    const rows = lines(label, 20), size = label.length > 12 ? 28 : 38
    const bw = Math.min(600, Math.max(82, Math.max(...rows.map(r => r.length)) * size * .57 + 22)), bh = rows.length * (size + 3) + 14
    const candidates = [[0, 0], [-140, 0], [140, 0], [0, -95], [0, 95], [-190, -90], [190, 90], [-270, 0], [270, 0]]
      .map(([dx, dy]) => ({ x: Math.max(8, Math.min(width - bw - 8, at[0] + dx - bw / 2)), y: Math.max(mapY + 8, Math.min(mapY + mapH - bh - 8, at[1] + dy - bh / 2)), w: bw, h: bh }))
    const overlaps = (a: typeof candidates[number]) => ocupados.some(b => a.x < b.x + b.w + 8 && a.x + a.w + 8 > b.x && a.y < b.y + b.h + 8 && a.y + a.h + 8 > b.y)
    const fits = (a: typeof candidates[number]) => [[a.x, a.y], [a.x + a.w, a.y], [a.x, a.y + a.h], [a.x + a.w, a.y + a.h]].every(p => inside(p as Pt, points))
    const box = candidates.find(c => !overlaps(c) && fits(c)) ?? candidates.slice(1).find(c => !overlaps(c)) ?? candidates[0]
    ocupados.push(box)
    const cx = box.x + bw / 2
    if (!fits(box)) labels.push(`<path d="M${at[0].toFixed(2)} ${at[1].toFixed(2)} L${cx.toFixed(2)} ${(box.y + bh / 2).toFixed(2)}" stroke="#131b16" stroke-width="7"/><path d="M${at[0].toFixed(2)} ${at[1].toFixed(2)} L${cx.toFixed(2)} ${(box.y + bh / 2).toFixed(2)}" stroke="#fff" stroke-width="3"/>`)
    labels.push(`<rect x="${box.x}" y="${box.y}" width="${bw}" height="${bh}" rx="7" fill="#fbfaf6" stroke="${p.id === foco?.id ? '#b85c2e' : '#131b16'}" stroke-width="${p.id === foco?.id ? 3 : 1}"/><text text-anchor="middle" font-size="${size}" font-weight="600">${rows.map((r, j) => `<tspan x="${cx}" y="${box.y + size + 4 + j * (size + 3)}">${xml(r)}</tspan>`).join('')}</text>`)
  }
  const raster=fondo?.extent ?? geo.extent
  const rasterScale=mapW/(geo.extent[2]-geo.extent[0])
  const imageX=mapX+(raster[0]-geo.extent[0])*rasterScale,imageY=mapY+(geo.extent[3]-raster[3])*rasterScale
  const imageW=(raster[2]-raster[0])*rasterScale,imageH=(raster[3]-raster[1])*rasterScale
  const background = fondo ? `<image x="${imageX}" y="${imageY}" width="${imageW}" height="${imageH}" preserveAspectRatio="none" href="${fondo.dataUri}"/>` : `<rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" fill="#fbfaf6"/>`
  for(const equipo of (datos.equipos ?? []).slice(0,100)){
    if(!Number.isFinite(equipo.lat)||!Number.isFinite(equipo.lng)||Math.abs(equipo.lat)>85||Math.abs(equipo.lng)>180)continue
    const [x,y]=point([equipo.lat,equipo.lng])
    labels.push(`<circle cx="${x}" cy="${y}" r="21" fill="#ce4936" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y+11}" text-anchor="middle" font-size="32" font-weight="700" fill="#fff">!</text>`)
  }
  // Sin clip-path: resvg reserva una capa del tamaño de todo lo recortado y, al
  // acercar un potrero chico, el campo ampliado pedía ~300 MB (Edge corta sin
  // responder). Cabecera y pie se pintan encima y cubren lo que se sale.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#131b16"/><g font-family="Inter" fill="#131b16">${background}${elements.join('')}${labels.join('')}<rect width="${width}" height="${mapY}" fill="#131b16"/><rect y="${mapY + mapH}" width="${width}" height="${height - mapY - mapH}" fill="#131b16"/><text x="24" y="53" font-size="32" font-weight="600" fill="#fff">TROPPERO · ${xml(datos.nombre.slice(0, 48))}${foco ? ` · ${xml(foco.nombre)}` : ''}</text><rect x="16" y="94" width="44" height="72" rx="8" fill="#fbfaf6" fill-opacity=".9"/><path d="M38 152 L38 119 M29 133 L38 119 L47 133" fill="none" stroke="#131b16" stroke-width="3"/><text x="31" y="114" font-size="18">N</text><text x="16" y="${height - 14}" font-size="17" fill="#fff">${fondo ? 'Imagen de referencia' : 'Croquis de respaldo · satélite no disponible'} · ${fondo ? xml(fondo.atribucion.slice(0, 155)) : 'Contornos según la app.'}</text></g></svg>`
  return { svg, dibujados: valid.length, faltantes, width, height }
}
