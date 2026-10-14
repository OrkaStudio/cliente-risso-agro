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

/** SVG local, sin URLs ni geometría inventada. Entrada almacenada [lat,lng]. */
export function svgMapa(datos: MapaCampo, fecha: string): { svg: string; dibujados: number; faltantes: string[]; width: number; height: number } | null {
  if (datos.potreros.length > 100) throw new Error('El mapa admite hasta 100 potreros por imagen')
  const valid = datos.potreros.map(p => ({ ...p, points: poligonoMapa(p.poligono) })).filter((p): p is typeof p & { points: Pt[] } => p.points !== null)
  const faltantes = datos.potreros.filter(p => !valid.some(v => v.id === p.id)).map(p => p.nombre)
  if (!valid.length) return null
  valid.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
  const all = valid.flatMap(p => p.points), lat = all.reduce((a, p) => a + p[0], 0) / all.length, cos = Math.cos(lat * Math.PI / 180)
  const projected = all.map(([la, lo]) => [lo * cos, -la] as Pt)
  const bounds = projected.reduce((b, p) => [Math.min(b[0], p[0]), Math.max(b[1], p[0]), Math.min(b[2], p[1]), Math.max(b[3], p[1])], [Infinity, -Infinity, Infinity, -Infinity])
  const [minX, maxX, minY, maxY] = bounds
  const width = 1400, height = Math.max(1160, 208 + valid.length * 32 + 120), mapW = 920, mapH = Math.min(height - 300, 1260)
  const scale = Math.min((mapW - 90) / Math.max(maxX - minX, 1e-8), (mapH - 90) / Math.max(maxY - minY, 1e-8))
  const ox = 36 + (mapW - (maxX - minX) * scale) / 2, oy = 178 + (mapH - (maxY - minY) * scale) / 2
  const point = ([la, lo]: Pt): Pt => [ox + (lo * cos - minX) * scale, oy + (-la - minY) * scale]
  const elements: string[] = []
  for (const [i, p] of valid.entries()) {
    const points = p.points.map(point), at = interior(points)
    elements.push(`<polygon points="${points.map(v => v.map(n => n.toFixed(2)).join(',')).join(' ')}" fill="${i % 2 ? '#e9e9d9' : '#e2e9dc'}" stroke="#4b574e" stroke-width="3"/>`)
    elements.push(`<circle cx="${at[0].toFixed(2)}" cy="${at[1].toFixed(2)}" r="18" fill="#fbfaf6" stroke="#b85c2e" stroke-width="2"/><text x="${at[0].toFixed(2)}" y="${(at[1] + 7).toFixed(2)}" text-anchor="middle" font-size="20" font-weight="600">${i + 1}</text>`)
    const label = p.nombre.replace(/\s+/g, ' ').trim()
    const bw = Math.min(label.length * 13 + 16, 240)
    if (label.length <= 16 && [[at[0] - bw / 2, at[1] + 24], [at[0] + bw / 2, at[1] + 52]].every(v => inside(v as Pt, points)))
      elements.push(`<rect x="${(at[0] - bw / 2).toFixed(2)}" y="${(at[1] + 23).toFixed(2)}" width="${bw}" height="30" rx="5" fill="#fbfaf6"/><text x="${at[0].toFixed(2)}" y="${(at[1] + 45).toFixed(2)}" text-anchor="middle" font-size="24" font-weight="600">${xml(label)}</text>`)
    const row = 213 + i * 32
    elements.push(`<text x="${mapW + 56}" y="${row}" font-size="22" fill="#b85c2e" font-weight="600">${i + 1}</text><text x="${mapW + 101}" y="${row}" font-size="22">${xml(label.slice(0, 25))}${label.length > 25 ? '…' : ''}</text>`)
  }
  const missing = faltantes.length ? `Sin dibujo: ${faltantes.join(', ')}` : 'Todos los potreros registrados tienen dibujo.'
  const footer = lines(missing, 90).slice(0, 3)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f4f1e9"/><g font-family="Inter" fill="#131b16"><text x="40" y="54" font-size="32" font-weight="700" fill="#b85c2e">TROPERO</text><text x="40" y="101" font-size="34" font-weight="600">${xml(datos.nombre.slice(0, 65))}</text><text x="40" y="138" font-size="21" fill="#6e675c">Potreros según el dibujo guardado · ${xml(fecha)} · ${valid.length} dibujados</text><rect x="36" y="178" width="${mapW}" height="${mapH}" rx="16" fill="#fbfaf6"/><text x="${mapW + 54}" y="175" font-size="23" font-weight="600">N° / Nombre del potrero</text>${elements.join('')}<path d="M70 244 L70 203 M60 219 L70 203 L80 219" fill="none" stroke="#131b16" stroke-width="3"/><text x="63" y="192" font-size="19">N</text>${footer.map((line, i) => `<text x="40" y="${height - 78 + i * 25}" font-size="19" fill="#6e675c">${xml(line)}</text>`).join('')}<text x="40" y="${height - 18}" font-size="17" fill="#6e675c">Escribí el nombre del potrero que reconocés. La posición de tu teléfono no determina esta ubicación.</text></g></svg>`
  return { svg, dibujados: valid.length, faltantes, width, height }
}
