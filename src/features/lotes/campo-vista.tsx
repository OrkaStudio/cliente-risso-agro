import { useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw, RotateCw, Trash2 } from 'lucide-react'
import {
  FEATURE_MAP,
  FEATURES,
  type FeatureId,
} from '@/features/lotes/potrero-features'
import {
  allGeo,
  getCampoBoundary,
  getMarkers,
  setMarkers,
  type LatLng,
  type Marker,
} from '@/features/lotes/geo'
import {
  codigoLote,
  setPotreroLote,
  totalLote,
  type Lote,
} from '@/features/lotes/store'
import {
  setPotreroAttrs,
  usePotrerosAttrs,
} from '@/features/lotes/potreros-store'
import { propositoLabel } from '@/features/lotes/domain'
import type { Campo } from '@/features/lotes/mock'
import {
  PotreroSidePanel,
  type PotreroInfo,
  type Uso,
} from '@/features/lotes/potrero-side-panel'
import { cn } from '@/lib/utils'

const W = 1000
const H = 560
const PAD = 26
const M_PER_DEG = 111320

type XY = [number, number]
type Edge = [XY, XY]
type Shape = { numero: string; points: string; cx: number; cy: number; small: boolean }
type Sat = { href: string; matrix: string; w: number; h: number }

function ptsStr(xy: XY[]) {
  return xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}
function centroide(xy: XY[]) {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < xy.length; i++) {
    const [x0, y0] = xy[i]
    const [x1, y1] = xy[(i + 1) % xy.length]
    const f = x0 * y1 - x1 * y0
    a += f
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
  }
  const xs = xy.map((p) => p[0])
  const ys = xy.map((p) => p[1])
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  a *= 0.5
  if (Math.abs(a) < 1e-6) {
    const sx = xs.reduce((s, v) => s + v, 0) / xy.length
    const sy = ys.reduce((s, v) => s + v, 0) / xy.length
    return { cx: sx, cy: sy, w, h }
  }
  return { cx: cx / (6 * a), cy: cy / (6 * a), w, h }
}
// Color semántico del uso (canal distinto a la identidad del campo).
const USO_COLOR: Record<Uso, string> = {
  ganadero: '#2f7d3a',
  agricola: '#bb7a12',
  vacio: '#5d6770',
}
function fillOpFor(uso: Uso, sel: boolean, hov: boolean): number {
  // Tintes livianos: dejan ver la foto satelital de fondo.
  if (uso === 'vacio') return sel ? 0.18 : hov ? 0.12 : 0.04
  if (uso === 'agricola') return sel ? 0.24 : hov ? 0.18 : 0.1
  return sel ? 0.32 : hov ? 0.24 : 0.15
}
function pointInRing(lat: number, lng: number, ring: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0]
    const xi = ring[i][1]
    const yj = ring[j][0]
    const xj = ring[j][1]
    const hit = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}
/** Punto más cercano del segmento a→b respecto de (px,py). */
function closestOnSeg(px: number, py: number, a: XY, b: XY) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy || 1e-9
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a[0] + t * dx
  const cy = a[1] + t * dy
  return { cx, cy, d: Math.hypot(px - cx, py - cy) }
}

export function CampoVista({
  campo,
  lotes,
  onVerLote,
}: {
  campo: Campo
  lotes: Lote[]
  onVerLote: (loteId: string) => void
}) {
  const [hoverNum, setHoverNum] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const attrs = usePotrerosAttrs()
  const attrOf = (numero: string) => attrs[`${campo.id}::${numero}`] ?? {}

  const { shapes, boundary, edges, placePoint, toLatLng, mToVB, vbToM, sat } =
    useMemo(() => {
      const geos = allGeo(campo.id)
      const bnd = getCampoBoundary(campo.id)
      const entries = Object.entries(geos)
      const all: LatLng[] = [...(bnd ?? []), ...entries.flatMap(([, p]) => p)]
      if (all.length === 0)
        return {
          shapes: [] as Shape[],
          boundary: null,
          edges: [] as Edge[],
          placePoint: undefined as ((lat: number, lng: number) => XY) | undefined,
          toLatLng: undefined as ((vx: number, vy: number) => LatLng) | undefined,
          mToVB: undefined as ((m: number) => number) | undefined,
          vbToM: undefined as ((d: number) => number) | undefined,
          sat: null as Sat | null,
        }

      const lats = all.map((p) => p[0])
      const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
      const k = Math.cos((midLat * Math.PI) / 180)
      const raw = ([la, lo]: LatLng): XY => [lo * k, -la]
      const allRaw = all.map(raw)
      const n = allRaw.length
      const mx = allRaw.reduce((s, p) => s + p[0], 0) / n
      const my = allRaw.reduce((s, p) => s + p[1], 0) / n
      let cxx = 0
      let cyy = 0
      let cxy = 0
      for (const [x, y] of allRaw) {
        const dx = x - mx
        const dy = y - my
        cxx += dx * dx
        cyy += dy * dy
        cxy += dx * dy
      }
      const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy)
      const ca = Math.cos(-angle)
      const sa = Math.sin(-angle)
      const rot = ([x, y]: XY): XY => {
        const dx = x - mx
        const dy = y - my
        return [dx * ca - dy * sa, dx * sa + dy * ca]
      }
      const project = (pts: LatLng[]): XY[] => pts.map((p) => rot(raw(p)))
      const allRot = project(all)
      const xs = allRot.map((p) => p[0])
      const ys = allRot.map((p) => p[1])
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const w = Math.max(maxX - minX, 1e-9)
      const h = Math.max(maxY - minY, 1e-9)
      // FILL < 1 deja margen alrededor para ver los campos vecinos.
      const FILL = 0.86
      const scale = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h) * FILL
      const offX = PAD + (W - 2 * PAD - w * scale) / 2
      const offY = PAD + (H - 2 * PAD - h * scale) / 2
      const fit = ([x, y]: XY): XY => [
        offX + (x - minX) * scale,
        offY + (y - minY) * scale,
      ]
      const place = (pts: LatLng[]): XY[] => project(pts).map(fit)

      const edges: Edge[] = []
      const shapes: Shape[] = entries.map(([numero, pts]) => {
        const xy = place(pts)
        for (let i = 0; i < xy.length; i++) edges.push([xy[i], xy[(i + 1) % xy.length]])
        const { cx, cy, w: pw, h: ph } = centroide(xy)
        return { numero, points: ptsStr(xy), cx, cy, small: Math.min(pw, ph) < 92 }
      })

      const placePoint = (lat: number, lng: number): XY => fit(rot(raw([lat, lng])))
      const cb = Math.cos(angle)
      const sb = Math.sin(angle)
      const toLatLng = (vx: number, vy: number): LatLng => {
        const rx = (vx - offX) / scale + minX
        const ry = (vy - offY) / scale + minY
        const dx = rx * cb - ry * sb
        const dy = rx * sb + ry * cb
        return [-(dy + my), (dx + mx) / k]
      }
      const mToVB = (m: number) => (m / M_PER_DEG) * scale
      const vbToM = (d: number) => (d / scale) * M_PER_DEG

      // ----- Imagen satelital encajada en la misma proyección (raw → SVG) -----
      // El bbox se calcula desde las 4 ESQUINAS del lienzo (no desde el campo):
      // así la foto cubre todo el cuadro aunque esté rotada → sin triángulos
      // blancos. Incluye el entorno (campos vecinos) alrededor del campo.
      const cornersLL = (
        [
          [0, 0],
          [W, 0],
          [W, H],
          [0, H],
        ] as XY[]
      ).map(([x, y]) => toLatLng(x, y))
      let minLat = Math.min(...cornersLL.map((p) => p[0]))
      let maxLat = Math.max(...cornersLL.map((p) => p[0]))
      let minLng = Math.min(...cornersLL.map((p) => p[1]))
      let maxLng = Math.max(...cornersLL.map((p) => p[1]))
      const mLat = (maxLat - minLat) * 0.14
      const mLng = (maxLng - minLng) * 0.14
      minLat -= mLat
      maxLat += mLat
      minLng -= mLng
      maxLng += mLng
      // El size DEBE tener el aspecto del bbox en GRADOS; si no, Esri ensancha
      // el bbox para igualarlo y la foto queda corrida/a otra escala.
      const LONG = 2048
      const ar = (maxLng - minLng) / (maxLat - minLat)
      const pxW = ar >= 1 ? LONG : Math.round(LONG * ar)
      const pxH = ar >= 1 ? Math.round(LONG / ar) : LONG
      const href =
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export' +
        `?bbox=${minLng},${minLat},${maxLng},${maxLat}&bboxSR=4326&imageSR=4326` +
        `&size=${pxW},${pxH}&format=jpg&f=image`
      // Coloco la imagen (de pxW×pxH) mapeando sus esquinas a las 3 esquinas
      // geográficas en coordenadas SVG normales (robusto, sin números diminutos).
      const [p0x, p0y] = placePoint(maxLat, minLng) // NO (arriba-izq)
      const [p1x, p1y] = placePoint(maxLat, maxLng) // NE (arriba-der)
      const [p3x, p3y] = placePoint(minLat, minLng) // SO (abajo-izq)
      const matrix = `matrix(${(p1x - p0x) / pxW} ${(p1y - p0y) / pxW} ${(p3x - p0x) / pxH} ${(p3y - p0y) / pxH} ${p0x} ${p0y})`
      const sat: Sat = { href, matrix, w: pxW, h: pxH }
      return {
        shapes,
        boundary: bnd ? ptsStr(place(bnd)) : null,
        edges,
        placePoint,
        toLatLng,
        mToVB,
        vbToM,
        sat,
      }
    }, [campo.id])

  // ---------- marcadores ----------
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [markers, setMarkersState] = useState<Marker[]>(() => getMarkers(campo.id))
  const markersRef = useRef(markers)
  markersRef.current = markers
  const [placing, setPlacing] = useState<FeatureId | null>(null)
  const [hoverMk, setHoverMk] = useState<string | null>(null)
  const [selMk, setSelMk] = useState<string | null>(null)
  const drag = useRef<{
    id: string
    mode: 'move' | 'resize'
    sx: number
    sy: number
    moved: boolean
  } | null>(null)
  // La captura de puntero hace que el "click" tras soltar caiga en el <svg>;
  // este flag evita que ese click deseleccione el marcador recién tocado.
  const suppressClick = useRef(false)

  const saveMarkers = (next: Marker[]) => {
    setMarkersState(next)
    setMarkers(campo.id, next)
  }
  const removeMarker = (id: string) => {
    setSelMk((s) => (s === id ? null : s))
    saveMarkers(markersRef.current.filter((m) => m.id !== id))
  }
  // Agranda/achica el marcador seleccionado: laguna por área (m), resto por escala.
  const bumpSize = (id: string, dir: 1 | -1) =>
    saveMarkers(
      markersRef.current.map((m) => {
        if (m.id !== id) return m
        if (m.type === 'laguna') {
          const r = Math.min(600, Math.max(25, Math.round((m.radiusM ?? 160) + dir * 25)))
          return { ...m, radiusM: r }
        }
        const s = Math.min(2.2, Math.max(0.5, +((m.scale ?? 1) + dir * 0.15).toFixed(2)))
        return { ...m, scale: s }
      }),
    )
  // Rota el marcador (manga/tranquera) en pasos de 15°.
  const rotateMarker = (id: string, deltaDeg: number) =>
    saveMarkers(
      markersRef.current.map((m) =>
        m.id === id ? { ...m, angleDeg: ((m.angleDeg ?? 0) + deltaDeg + 360) % 360 } : m,
      ),
    )

  function clientToVB(e: { clientX: number; clientY: number }): XY | null {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }
  function snapToEdge(vx: number, vy: number) {
    let best: { x: number; y: number; angle: number } | null = null
    let bestD = Infinity
    for (const [a, b] of edges) {
      const { cx, cy, d } = closestOnSeg(vx, vy, a, b)
      if (d < bestD) {
        bestD = d
        best = {
          x: cx,
          y: cy,
          angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
        }
      }
    }
    return best
  }
  function placeAt(e: { clientX: number; clientY: number }) {
    if (!placing || !toLatLng) return
    const vb = clientToVB(e)
    if (!vb) return
    const id = `m${Date.now()}`
    if (placing === 'tranquera') {
      const snap = snapToEdge(vb[0], vb[1])
      const [lat, lng] = toLatLng(snap ? snap.x : vb[0], snap ? snap.y : vb[1])
      saveMarkers([
        ...markersRef.current,
        { id, type: 'tranquera', lat, lng, angleDeg: snap ? snap.angle : 0 },
      ])
    } else if (placing === 'laguna') {
      const [lat, lng] = toLatLng(vb[0], vb[1])
      saveMarkers([...markersRef.current, { id, type: 'laguna', lat, lng, radiusM: 160 }])
    } else {
      const [lat, lng] = toLatLng(vb[0], vb[1])
      saveMarkers([...markersRef.current, { id, type: placing, lat, lng }])
    }
    // Coloca uno y sale del modo "Marcar" (evita seguir agregando con cada click).
    setPlacing(null)
    setSelMk(id)
    setSelected(null)
  }
  function startDrag(e: React.PointerEvent, id: string, mode: 'move' | 'resize') {
    e.stopPropagation()
    // Seleccionar al instante (la barra de acción aparece apenas tocás el ícono).
    setSelMk(id)
    setSelected(null)
    suppressClick.current = true
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, moved: false }
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    const ds = drag.current
    if (!ds || !toLatLng) return
    const vb = clientToVB(e)
    if (!vb) return
    // Umbral en píxeles de pantalla → distingue click de arrastre real.
    if (!ds.moved && Math.hypot(e.clientX - ds.sx, e.clientY - ds.sy) < 6) return
    ds.moved = true
    if (ds.mode === 'move') {
      const mk = markersRef.current.find((x) => x.id === ds.id)
      if (mk?.type === 'tranquera') {
        const snap = snapToEdge(vb[0], vb[1])
        const [lat, lng] = toLatLng(snap ? snap.x : vb[0], snap ? snap.y : vb[1])
        setMarkersState((prev) =>
          prev.map((m) =>
            m.id === ds.id ? { ...m, lat, lng, angleDeg: snap ? snap.angle : 0 } : m,
          ),
        )
      } else {
        const [lat, lng] = toLatLng(vb[0], vb[1])
        setMarkersState((prev) => prev.map((m) => (m.id === ds.id ? { ...m, lat, lng } : m)))
      }
    } else if (placePoint && vbToM) {
      const m = markersRef.current.find((x) => x.id === ds.id)
      if (!m) return
      const [cx, cy] = placePoint(m.lat, m.lng)
      const radiusM = Math.max(25, Math.round(vbToM(Math.hypot(vb[0] - cx, vb[1] - cy))))
      setMarkersState((prev) => prev.map((x) => (x.id === ds.id ? { ...x, radiusM } : x)))
    }
  }
  function onPointerUp() {
    const ds = drag.current
    if (!ds) return
    if (ds.moved) setMarkers(campo.id, markersRef.current)
    drag.current = null
  }

  const featsByPot = useMemo(() => {
    const geos = allGeo(campo.id)
    const map: Record<string, FeatureId[]> = {}
    for (const m of markers) {
      for (const [numero, ring] of Object.entries(geos)) {
        if (pointInRing(m.lat, m.lng, ring)) {
          ;(map[numero] ??= []).push(m.type as FeatureId)
          break
        }
      }
    }
    for (const k of Object.keys(map)) map[k] = [...new Set(map[k])]
    return map
  }, [campo.id, markers])

  function usoDe(numero: string): Uso {
    if (lotes.some((l) => l.potreros.includes(numero))) return 'ganadero'
    if (attrOf(numero).cultivo) return 'agricola'
    return 'vacio'
  }
  function infoDe(numero: string): PotreroInfo {
    const lote = lotes.find((l) => l.potreros.includes(numero))
    const a = attrOf(numero)
    return {
      numero,
      uso: usoDe(numero),
      ha: a.hectareas,
      especie: lote?.especie,
      proposito: lote ? propositoLabel[lote.proposito] : undefined,
      loteCodigo: lote ? codigoLote(lote) : undefined,
      cabezas: lote ? totalLote(lote) : undefined,
      loteId: lote?.id,
      cultivo: a.cultivo,
      features: featsByPot[numero],
    }
  }

  const editProp = {
    lotes: lotes.map((l) => ({ id: l.id, codigo: codigoLote(l) })),
    onGuardar: (
      numero: string,
      v: { hectareas?: number; cultivo?: string; loteId: string | null },
    ) => {
      setPotreroAttrs(campo.id, numero, { hectareas: v.hectareas, cultivo: v.cultivo })
      setPotreroLote(campo.id, numero, v.loteId)
    },
  }

  const activeNum = selected ?? hoverNum
  const panelInfo = activeNum ? infoDe(activeNum) : null
  const vacio = shapes.length === 0 && !boundary
  const selMarker = markers.find((m) => m.id === selMk) ?? null
  const selFeat = selMarker ? FEATURE_MAP[selMarker.type as FeatureId] : null

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="relative h-[360px] w-full overflow-hidden rounded-2xl border border-border bg-[#eef1ec] lg:h-[500px] lg:flex-1">
        {vacio ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Este campo todavía no tiene potreros dibujados. Tocá “Editar
            potreros” para delimitarlos sobre el satélite.
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
            style={{ cursor: placing ? 'crosshair' : undefined }}
            onClick={(e) => {
              if (suppressClick.current) {
                suppressClick.current = false
                return
              }
              if (placing) placeAt(e)
              else {
                setSelected(null)
                setSelMk(null)
              }
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* Fondo: si por algo la foto no llega a un borde, no se ve blanco */}
            <rect x="0" y="0" width={W} height={H} fill="#3a4a3f" />

            {/* Foto satelital plena: cubre todo el recuadro, sin atenuar */}
            {sat && (
              <image
                href={sat.href}
                x={0}
                y={0}
                width={sat.w}
                height={sat.h}
                transform={sat.matrix}
                preserveAspectRatio="none"
                style={{ pointerEvents: 'none' }}
              />
            )}

            {boundary && (
              <>
                <polygon points={boundary} fill="none" stroke="#0c1c14" strokeOpacity={0.55} strokeWidth={5} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                <polygon points={boundary} fill="none" stroke={campo.color.hex} strokeWidth={2.5} strokeLinejoin="round" />
              </>
            )}

            {shapes.map((s) => {
              const info = infoDe(s.numero)
              const uso = info.uso
              const sel = selected === s.numero
              const hov = hoverNum === s.numero
              const usoText =
                uso === 'ganadero'
                  ? `Ganadero · ${info.cabezas ?? 0}`
                  : uso === 'agricola'
                    ? `Agrícola${info.cultivo ? ` · ${info.cultivo}` : ''}`
                    : 'Vacío'
              const showPill = !s.small
              return (
                <g
                  key={s.numero}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverNum(s.numero)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (placing) {
                      placeAt(e)
                      return
                    }
                    setSelected(s.numero)
                  }}
                >
                  {/* casing oscuro: hace legible el contorno sobre la foto */}
                  <polygon
                    points={s.points}
                    fill="none"
                    stroke="#0c1c14"
                    strokeOpacity={0.55}
                    strokeWidth={(sel || hov ? 2.5 : 1.5) + 2.4}
                    strokeLinejoin="round"
                    strokeDasharray={uso === 'vacio' ? '4 5' : undefined}
                    style={{ pointerEvents: 'none' }}
                  />
                  <polygon
                    points={s.points}
                    fill={campo.color.hex}
                    fillOpacity={fillOpFor(uso, sel, hov)}
                    stroke={campo.color.hex}
                    strokeWidth={sel || hov ? 2.5 : 1.5}
                    strokeLinejoin="round"
                    strokeDasharray={uso === 'vacio' ? '4 5' : undefined}
                    style={{ transition: 'fill-opacity 0.12s' }}
                  />
                  <text
                    x={s.cx}
                    y={s.cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="var(--font-heading, sans-serif)"
                    fill="#fff"
                    stroke="#0c1c14"
                    strokeWidth={3.6}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    style={{ pointerEvents: 'none' }}
                  >
                    <tspan x={s.cx} dy={showPill ? '-0.6em' : '0'} fontWeight={700} fontSize={s.small ? 15 : 22}>
                      {s.numero}
                    </tspan>
                  </text>
                  {showPill && (
                    <foreignObject
                      x={s.cx - 70}
                      y={s.cy + 4}
                      width={140}
                      height={22}
                      style={{ overflow: 'visible', pointerEvents: 'none' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '1.5px 8px',
                            borderRadius: '999px',
                            background: USO_COLOR[uso],
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 600,
                            letterSpacing: '0.01em',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            fontFamily: 'var(--font-body, sans-serif)',
                          }}
                        >
                          {usoText}
                        </span>
                      </div>
                    </foreignObject>
                  )}
                </g>
              )
            })}

            {/* Lagunas (área expandible) */}
            {placePoint &&
              mToVB &&
              markers
                .filter((m) => m.type === 'laguna')
                .map((m) => {
                  const [vx, vy] = placePoint(m.lat, m.lng)
                  const r = Math.max(10, mToVB(m.radiusM ?? 120))
                  const ry = r * 0.62
                  const active = hoverMk === m.id || selMk === m.id
                  return (
                    <g
                      key={m.id}
                      onMouseEnter={() => setHoverMk(m.id)}
                      onMouseLeave={() => setHoverMk((h) => (h === m.id ? null : h))}
                    >
                      {/* casing oscuro para legibilidad sobre cualquier fondo */}
                      <ellipse
                        cx={vx}
                        cy={vy}
                        rx={r}
                        ry={ry}
                        fill="#bfe3f2"
                        fillOpacity={0.12}
                        stroke="#0c2630"
                        strokeOpacity={0.5}
                        strokeWidth={(active ? 2.4 : 1.8) + 2}
                        style={{ cursor: 'move' }}
                        onPointerDown={(e) => startDrag(e, m.id, 'move')}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {/* anillo que marca la laguna */}
                      <ellipse
                        cx={vx}
                        cy={vy}
                        rx={r}
                        ry={ry}
                        fill="none"
                        stroke="#e2f4fc"
                        strokeWidth={active ? 2.4 : 1.8}
                        strokeDasharray="6 4"
                        style={{ pointerEvents: 'none' }}
                      />
                      {active && (
                        <g
                          style={{ cursor: 'ew-resize' }}
                          onPointerDown={(e) => startDrag(e, m.id, 'resize')}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <circle cx={vx + r} cy={vy} r={8} fill="#fff" stroke="#0f4763" strokeWidth={1.8} />
                          <path
                            d={`M ${vx + r - 3.4} ${vy} l 2 -2 M ${vx + r - 3.4} ${vy} l 2 2 M ${vx + r + 3.4} ${vy} l -2 -2 M ${vx + r + 3.4} ${vy} l -2 2`}
                            stroke="#0f4763"
                            strokeWidth={1.4}
                            strokeLinecap="round"
                            fill="none"
                          />
                        </g>
                      )}
                    </g>
                  )
                })}

            {/* Molino (parado) y Tranquera (sobre el alambrado, orientada) */}
            {placePoint &&
              markers
                .filter((m) => m.type !== 'laguna')
                .map((m) => {
                  const F = FEATURE_MAP[m.type as FeatureId]
                  if (!F) return null
                  const [vx, vy] = placePoint(m.lat, m.lng)
                  const Icon = F.Icon
                  // Planos cenitales: centrados y rotables (tranquera, manga).
                  // Molino: ícono parado, anclado al piso.
                  const isFlat = m.type === 'tranquera' || m.type === 'manga'
                  const active = hoverMk === m.id || selMk === m.id
                  const scale = m.scale ?? 1
                  const FO = 110
                  return (
                    <g key={m.id}>
                      <foreignObject
                        x={vx - FO / 2}
                        y={isFlat ? vy - FO / 2 : vy - FO + 8}
                        width={FO}
                        height={FO}
                        style={{ overflow: 'visible' }}
                      >
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: isFlat ? 'center' : 'flex-end',
                            justifyContent: 'center',
                          }}
                          onMouseEnter={() => setHoverMk(m.id)}
                          onMouseLeave={() => setHoverMk((h) => (h === m.id ? null : h))}
                        >
                          {/* chip claro detrás del ícono plano → contraste */}
                          {isFlat && (
                            <span
                              style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                width: `${46 * scale}px`,
                                height: `${46 * scale}px`,
                                transform: 'translate(-50%,-50%)',
                                borderRadius: '50%',
                                background: 'rgba(248,250,246,0.9)',
                                border: active
                                  ? '1.5px solid #0f4763'
                                  : '1px solid rgba(20,40,30,0.22)',
                                boxShadow: '0 1px 3px rgba(11,31,23,0.4)',
                              }}
                            />
                          )}
                          <div
                            title={F.label}
                            onPointerDown={(e) => startDrag(e, m.id, 'move')}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: 'relative',
                              lineHeight: 0,
                              cursor: 'move',
                              transform: isFlat
                                ? `rotate(${m.angleDeg ?? 0}deg) scale(${scale})`
                                : `scale(${scale})`,
                              transformOrigin: isFlat ? 'center' : 'bottom center',
                              filter: isFlat
                                ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))'
                                : active
                                  ? 'drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 2px 2px rgba(0,0,0,0.5))'
                                  : 'drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 1px 2px rgba(0,0,0,0.42))',
                            }}
                          >
                            <Icon className={isFlat ? 'size-[40px]' : 'size-[42px]'} />
                          </div>
                        </div>
                      </foreignObject>
                    </g>
                  )
                })}
          </svg>
        )}

        {/* Toolbar */}
        {!vacio && (
          <div className="absolute left-3 top-3 flex items-center gap-1">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Marcar:
            </span>
            {FEATURES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                title={`Marcar ${label}`}
                onClick={() => setPlacing((p) => (p === id ? null : id))}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                  placing === id
                    ? 'border-field-deep bg-field-soft text-field-deep'
                    : 'border-border bg-white/80 text-muted-foreground hover:text-ink',
                )}
              >
                <Icon className="size-[15px]" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Barra de acción del marcador seleccionado (HTML → click 100% confiable) */}
        {selMarker && selFeat && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-white/95 py-1.5 pl-3 pr-1.5 shadow-md backdrop-blur">
            <selFeat.Icon className="size-4" />
            <span className="text-[12px] font-medium text-ink">{selFeat.label}</span>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <div className="flex items-center gap-1" title="Tamaño">
              <button
                type="button"
                aria-label="Achicar"
                onClick={() => bumpSize(selMarker.id, -1)}
                className="flex size-6 items-center justify-center rounded-full border border-border text-ink transition-colors hover:bg-muted"
              >
                <Minus className="size-[13px]" strokeWidth={2.4} />
              </button>
              <button
                type="button"
                aria-label="Agrandar"
                onClick={() => bumpSize(selMarker.id, 1)}
                className="flex size-6 items-center justify-center rounded-full border border-border text-ink transition-colors hover:bg-muted"
              >
                <Plus className="size-[13px]" strokeWidth={2.4} />
              </button>
            </div>
            {(selMarker.type === 'manga' || selMarker.type === 'tranquera') && (
              <>
                <span className="mx-0.5 h-4 w-px bg-border" />
                <div className="flex items-center gap-1" title="Rotar">
                  <button
                    type="button"
                    aria-label="Rotar a la izquierda"
                    onClick={() => rotateMarker(selMarker.id, -15)}
                    className="flex size-6 items-center justify-center rounded-full border border-border text-ink transition-colors hover:bg-muted"
                  >
                    <RotateCcw className="size-[13px]" strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    aria-label="Rotar a la derecha"
                    onClick={() => rotateMarker(selMarker.id, 15)}
                    className="flex size-6 items-center justify-center rounded-full border border-border text-ink transition-colors hover:bg-muted"
                  >
                    <RotateCw className="size-[13px]" strokeWidth={2.2} />
                  </button>
                </div>
              </>
            )}
            <span className="mx-0.5 h-4 w-px bg-border" />
            <button
              type="button"
              onClick={() => removeMarker(selMarker.id)}
              className="flex items-center gap-1 rounded-full bg-[#b4232a] px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-[#9a1d23]"
            >
              <Trash2 className="size-[13px]" strokeWidth={2.4} />
              Eliminar
            </button>
            <button
              type="button"
              title="Deseleccionar"
              onClick={() => setSelMk(null)}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-ink"
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <PotreroSidePanel
        info={panelInfo}
        campo={campo}
        onVerLote={onVerLote}
        edit={editProp}
      />
    </div>
  )
}
