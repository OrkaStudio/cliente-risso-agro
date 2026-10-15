import type { ElementoMapa, MapaCampo } from './mapa.ts'
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
// Glifos en una caja de ±12, dibujados en el color del ícono.
const GLIFO: Record<ElementoMapa['tipo'], string> = {
  molino: '<path d="M0 0L-3.5-12h7ZM0 0L12-3.5v7ZM0 0L3.5 12h-7ZM0 0L-12 3.5v-7Z"/><circle r="2.5"/>',
  tanque: '<circle r="9.5" fill="none" stroke-width="3.2"/><circle r="3.6"/>',
  bebedero: '<rect x="-11.5" y="-5.5" width="23" height="11" rx="2.5" fill="none" stroke-width="3.2"/><path d="M-7 1h14" stroke-width="2.6"/>',
  energizador: '<rect x="-11.5" y="-11.5" width="23" height="23" rx="4" fill="none" stroke-width="2.8"/><path d="M1.8-8.5L-5.2 1.6h4.6l-2.1 7.4 7.3-10.4h-4.6z"/>',
  tranquera: '<path d="M-11-8v16M11-8v16M-11-5h22M-11 0h22M-11 5h22M-11 5L11-5" fill="none" stroke-width="2.4"/>',
  electrico: '<path d="M2.5-12.5L-7.5 2h6.5l-3 10.5 10.5-15h-6.5z"/>',
}
const TIPO: Record<ElementoMapa['tipo'], string> = { molino: 'Molino', tanque: 'Tanque', bebedero: 'Bebedero', energizador: 'Energizador', tranquera: 'Tranquera', electrico: 'Eléctrico' }
/** El potrero ya se lee en la imagen: el cartel lleva el tipo y, si hace falta, el apodo. */
const etiqueta = (e: ElementoMapa) => e.apodo ? `${TIPO[e.tipo]} ${e.apodo}` : TIPO[e.tipo]
type Caja = { x: number; y: number; w: number; h: number }
/** Puntos y líneas de infraestructura. Las fallas se marcan en rojo con su texto al lado: sin referencias numeradas. */
function capaInfraestructura(lista: ElementoMapa[], point: (p: Pt) => Pt, acercado: boolean, limites: Caja) {
  const lineas: string[] = [], sanos: string[] = [], destacados: string[] = [], cajas: Caja[] = []
  // Destacado: una falla (rojo) o lo que se está por cargar (terracota). Mismo tamaño, cartel y prioridad.
  const tono = (e: ElementoMapa) => e.falla ? DESTACADO.falla : e.nuevo ? DESTACADO.nuevo : null
  // En el teléfono el lienzo se ve a ~28%: el general prioriza lo destacado; los sanos van discretos.
  const radio = (e: ElementoMapa) => tono(e) ? (acercado ? 31 : 28) : (acercado ? 24 : 15)
  const visible = ([x, y]: Pt) => x >= limites.x && x <= limites.x + limites.w && y >= limites.y && y <= limites.y + limites.h
  const items = lista.slice(0, 150).map(e => {
    const linea = e.linea?.filter(p => Array.isArray(p) && p.every(Number.isFinite)).map(point)
    const at = linea && linea.length > 1 ? linea[Math.floor(linea.length / 2) - (linea.length % 2 ? 0 : 1)].map((v, i) => (v + linea[Math.floor(linea.length / 2)][i]) / 2) as Pt : e.punto ? point(e.punto) : null
    return { e, linea, at }
  }).filter((x): x is typeof x & { at: Pt } => x.at !== null && visible(x.at))
  // En el general, un eléctrico sano se reconoce por su línea: sin ícono que tape nombres.
  const conIcono = items.filter(({ e }) => acercado || tono(e) || e.tipo !== 'electrico')
  for (const { e, linea } of items) if (linea) {
    const pts = linea.map(p => p.map(n => n.toFixed(1)).join(',')).join(' '), t = tono(e)
    lineas.push(`<polyline points="${pts}" fill="none" stroke="#131b16" stroke-opacity=".8" stroke-width="${acercado ? 11 : 9}" stroke-linecap="round"/><polyline points="${pts}" fill="none" stroke="${t ? t.linea : '#2fd4ff'}" stroke-width="${acercado ? 6 : 5}" stroke-dasharray="${t ? '0' : '14 9'}" stroke-linecap="round"/>`)
  }
  for (const { e, at } of conIcono) { const r = radio(e); cajas.push({ x: at[0] - r - 4, y: at[1] - r - 4, w: 2 * r + 8, h: 2 * r + 8 }) }
  for (const { e, at } of conIcono) {
    const t = tono(e), r = radio(e), s = r / 19
    const capa = t ? destacados : sanos
    if (t) capa.push(`<circle cx="${at[0]}" cy="${at[1]}" r="${r + 10}" fill="${t.halo}" fill-opacity=".35"/>`)
    capa.push(`<circle cx="${at[0]}" cy="${at[1]}" r="${r}" fill="${t ? t.fondo : '#fbfaf6'}" stroke="${t ? '#fff' : '#131b16'}" stroke-width="${t ? 3 : 2}"/><g transform="translate(${at[0].toFixed(1)} ${at[1].toFixed(1)}) scale(${(s * .95).toFixed(3)})" fill="${t ? '#fff' : '#131b16'}" stroke="${t ? '#fff' : '#131b16'}" stroke-width="0">${GLIFO[e.tipo]}</g>`)
  }
  /** Los carteles van al final: esquivan nombres de potreros, íconos y otros carteles. */
  const textos = (ocupados: Caja[]) => conIcono.flatMap(({ e, at }) => {
    const t = tono(e), r = radio(e)
    if (!t && !acercado) return []
    const texto = e.falla ? `${etiqueta(e)}: ${e.falla}` : e.nuevo ? `Nuevo: ${etiqueta(e)}` : etiqueta(e)
    const size = t ? (acercado ? 30 : 28) : 22, filas = lines(texto, t ? 34 : 24)
    const w = Math.min(560, Math.max(...filas.map(f => f.length)) * size * .56 + 22), h = filas.length * (size + 4) + 12
    const cerca = [[r + 14, -h / 2], [-r - 14 - w, -h / 2], [-w / 2, r + 12], [-w / 2, -r - 12 - h], [r + 10, r + 6], [-r - 10 - w, -r - 6 - h], [r + 10, -r - 6 - h], [-r - 10 - w, r + 6]]
    // Si no hay lugar al lado, el cartel se aleja con una línea guía antes que tapar un nombre.
    const opciones = [...cerca, ...cerca.map(([dx, dy]) => [dx * 1.8 + (dx > 0 ? 30 : -30), dy * 1.8]), ...cerca.map(([dx, dy]) => [dx * 2.8 + (dx > 0 ? 60 : -60), dy * 2.8])]
      .map(([dx, dy]) => ({ x: Math.max(limites.x + 6, Math.min(limites.x + limites.w - w - 6, at[0] + dx)), y: Math.max(limites.y + 6, Math.min(limites.y + limites.h - h - 6, at[1] + dy)), w, h }))
    const libre = (a: Caja) => !ocupados.some(b => a.x < b.x + b.w + 6 && a.x + a.w + 6 > b.x && a.y < b.y + b.h + 6 && a.y + a.h + 6 > b.y)
    const caja = opciones.find(libre) ?? (t ? opciones[0] : null)
    if (!caja) return []
    ocupados.push(caja)
    const cx = Math.max(caja.x, Math.min(caja.x + w, at[0])), cy = Math.max(caja.y, Math.min(caja.y + h, at[1]))
    const guia = Math.hypot(cx - at[0], cy - at[1]) > r + 16 ? `<path d="M${at[0].toFixed(1)} ${at[1].toFixed(1)}L${cx.toFixed(1)} ${cy.toFixed(1)}" stroke="#131b16" stroke-width="6"/><path d="M${at[0].toFixed(1)} ${at[1].toFixed(1)}L${cx.toFixed(1)} ${cy.toFixed(1)}" stroke="${t ? t.linea : '#fff'}" stroke-width="3"/>` : ''
    return [`${guia}<rect x="${caja.x.toFixed(1)}" y="${caja.y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="7" fill="#fbfaf6" stroke="${t ? t.fondo : '#131b16'}" stroke-width="${t ? 3.5 : 1}"/><text text-anchor="middle" font-size="${size}" font-weight="${t ? 700 : 600}" fill="${t ? t.texto : '#131b16'}">${filas.map((f, j) => `<tspan x="${(caja.x + w / 2).toFixed(1)}" y="${(caja.y + size + 3 + j * (size + 4)).toFixed(1)}">${xml(f)}</tspan>`).join('')}</text>`]
  })
  return { lineas, sanos, destacados, cajas, textos }
}
const DESTACADO = {
  falla: { halo: '#ff4b3a', fondo: '#d93a2b', linea: '#ff4b3a', texto: '#9d2318' },
  nuevo: { halo: '#b85c2e', fondo: '#b85c2e', linea: '#e07a3f', texto: '#7d3a17' },
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
export function svgMapa(datos: MapaCampo, fecha: string, fondo?: FondoSatelital, focoId?: string): { svg: string; dibujados: number; faltantes: string[]; width: number; height: number } | null {
  const geo = geometriaMapa(datos, focoId)
  if (!geo) return null
  if (fondo && (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(fondo.dataUri) || fondo.dataUri.length > 6 * 1024 * 1024)) throw Error('Fondo satelital inválido')
  const { valid, faltantes, width, height, mapW, mapH, mapX, mapY, point, foco } = geo
  const elements: string[] = []
  const labels: string[] = []
  const ocupados: { x: number; y: number; w: number; h: number }[] = []
  const infra = capaInfraestructura(datos.infraestructura ?? [], point, Boolean(foco), { x: mapX, y: mapY, w: mapW, h: mapH })
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
    // Cabezas al lado del nombre; recorrida vieja como segunda línea (terracota: atención, no falla).
    const cab = p.cabezas && p.cabezas > 0 ? ` · ${p.cabezas}` : '', cabSize = Math.round(size * .7)
    const dias = p.ultimaRecorrida ? Math.round((Date.parse(fecha) - Date.parse(p.ultimaRecorrida)) / 86400000) : null
    // Una sola línea: en los potreros chicos dos renglones se pisan con los vecinos.
    // Los días van en un recuadro aparte: «30 64 d» se leía como un solo número.
    const viejo = p.ultimaRecorrida === null ? 'nunca' : dias !== null && dias > 14 ? `${dias} d` : ''
    const extra = cab.length * cabSize * .55
    const bw = Math.min(600, Math.max(82, Math.max(...rows.map((r, j) => r.length * size * .57 + (j === rows.length - 1 ? extra : 0))) + 22)), bh = rows.length * (size + 3) + 14
    const pw = viejo ? Math.round(viejo.length * cabSize * .6 + 18) : 0, tw = bw + (pw ? pw - 6 : 0)
    const candidates = [[0, 0], [0, -60], [0, 60], [-80, 0], [80, 0], [-70, -55], [70, 55], [70, -55], [-70, 55], [-140, 0], [140, 0], [0, -95], [0, 95], [-190, -90], [190, 90], [-270, 0], [270, 0], [0, -150], [0, 150], [-260, -150], [260, 150], [260, -150], [-260, 150], [-360, 0], [360, 0]]
      .map(([dx, dy]) => ({ x: Math.max(8, Math.min(width - tw - 8, at[0] + dx - tw / 2)), y: Math.max(mapY + 8, Math.min(mapY + mapH - bh - 8, at[1] + dy - bh / 2)), w: tw, h: bh }))
    const overlaps = (a: typeof candidates[number]) => ocupados.some(b => a.x < b.x + b.w + 8 && a.x + a.w + 8 > b.x && a.y < b.y + b.h + 8 && a.y + a.h + 8 > b.y)
    const fits = (a: typeof candidates[number]) => [[a.x, a.y], [a.x + a.w, a.y], [a.x, a.y + a.h], [a.x + a.w, a.y + a.h]].every(p => inside(p as Pt, points))
    // Un ícono corre el nombre sólo si el nombre sigue dentro de su potrero; si no, el ícono va encima.
    const pisa = (a: typeof candidates[number]) => infra.cajas.some(b => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)
    const centro = (a: typeof candidates[number]) => inside([a.x + a.w / 2, a.y + a.h / 2], points)
    const box = candidates.find(c => !overlaps(c) && !pisa(c) && fits(c)) ?? candidates.find(c => !overlaps(c) && !pisa(c) && centro(c))
      ?? candidates.find(c => !overlaps(c) && fits(c)) ?? candidates.slice(1).find(c => !overlaps(c)) ?? candidates[0]
    ocupados.push(box)
    const cx = box.x + bw / 2
    if (!fits(box) && !centro(box)) labels.push(`<path d="M${at[0].toFixed(2)} ${at[1].toFixed(2)} L${cx.toFixed(2)} ${(box.y + bh / 2).toFixed(2)}" stroke="#131b16" stroke-width="7"/><path d="M${at[0].toFixed(2)} ${at[1].toFixed(2)} L${cx.toFixed(2)} ${(box.y + bh / 2).toFixed(2)}" stroke="#fff" stroke-width="3"/>`)
    labels.push(`<rect x="${box.x}" y="${box.y}" width="${bw}" height="${bh}" rx="7" fill="#fbfaf6" stroke="${p.id === foco?.id || viejo ? '#b85c2e' : '#131b16'}" stroke-width="${p.id === foco?.id ? 3 : viejo ? 2 : 1}"/><text text-anchor="middle" font-size="${size}" font-weight="600">${rows.map((r, j) => `<tspan x="${cx}" y="${box.y + size + 4 + j * (size + 3)}">${xml(r)}</tspan>${j === rows.length - 1 && cab ? `<tspan font-size="${cabSize}" font-weight="500" fill="#536359">${cab}</tspan>` : ''}`).join('')}</text>${viejo ? `<rect x="${box.x + bw - 6}" y="${box.y + (bh - cabSize - 14) / 2}" width="${pw}" height="${cabSize + 14}" rx="${(cabSize + 14) / 2}" fill="#b85c2e" stroke="#fbfaf6" stroke-width="2"/><text x="${box.x + bw - 6 + pw / 2}" y="${box.y + bh / 2 + cabSize * .36}" text-anchor="middle" font-size="${cabSize}" font-weight="700" fill="#fff">${viejo}</text>` : ''}`)
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#131b16"/><g font-family="Inter" fill="#131b16">${background}${elements.join('')}${infra.lineas.join('')}${infra.sanos.join('')}${labels.join('')}${infra.destacados.join('')}${infra.textos([...ocupados, ...infra.cajas]).join('')}<rect width="${width}" height="${mapY}" fill="#131b16"/><rect y="${mapY + mapH}" width="${width}" height="${height - mapY - mapH}" fill="#131b16"/><text x="24" y="53" font-size="32" font-weight="600" fill="#fff">TROPPERO · ${xml(datos.nombre.slice(0, 48))}${foco ? ` · ${xml(foco.nombre)}` : ''}</text><rect x="16" y="94" width="44" height="72" rx="8" fill="#fbfaf6" fill-opacity=".9"/><path d="M38 152 L38 119 M29 133 L38 119 L47 133" fill="none" stroke="#131b16" stroke-width="3"/><text x="31" y="114" font-size="18">N</text><text x="16" y="${height - 14}" font-size="17" fill="#fff">${fondo ? 'Imagen de referencia' : 'Croquis de respaldo · satélite no disponible'} · ${fondo ? xml(fondo.atribucion.slice(0, 155)) : 'Contornos según la app.'}</text></g></svg>`
  return { svg, dibujados: valid.length, faltantes, width, height }
}
