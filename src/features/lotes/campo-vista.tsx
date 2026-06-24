import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
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
const INK = '#3a4a40'
const M_PER_DEG = 111320

type XY = [number, number]
type Edge = [XY, XY]
type Shape = { numero: string; points: string; cx: number; cy: number; small: boolean }

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
function fillOpFor(uso: Uso, sel: boolean, hov: boolean): number {
  if (uso === 'vacio') return sel ? 0.28 : hov ? 0.2 : 0.1
  if (uso === 'agricola') return sel ? 0.34 : hov ? 0.26 : 0.18
  return sel ? 0.5 : hov ? 0.4 : 0.3
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

  const { shapes, boundary, edges, placePoint, toLatLng, mToVB, vbToM } =
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
      const scale = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h)
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

      return {
        shapes,
        boundary: bnd ? ptsStr(place(bnd)) : null,
        edges,
        placePoint,
        toLatLng,
        mToVB,
        vbToM,
      }
    }, [campo.id])

  // ---------- marcadores ----------
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [markers, setMarkersState] = useState<Marker[]>(() => getMarkers(campo.id))
  const markersRef = useRef(markers)
  markersRef.current = markers
  const [placing, setPlacing] = useState<FeatureId | null>(null)
  const [hoverMk, setHoverMk] = useState<string | null>(null)
  const drag = useRef<{ id: string; mode: 'move' | 'resize' } | null>(null)

  const saveMarkers = (next: Marker[]) => {
    setMarkersState(next)
    setMarkers(campo.id, next)
  }
  const removeMarker = (id: string) =>
    saveMarkers(markersRef.current.filter((m) => m.id !== id))

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
  }
  function onPointerMove(e: React.PointerEvent) {
    const ds = drag.current
    if (!ds || !toLatLng) return
    const vb = clientToVB(e)
    if (!vb) return
    if (ds.mode === 'move') {
      const [lat, lng] = toLatLng(vb[0], vb[1])
      setMarkersState((prev) => prev.map((m) => (m.id === ds.id ? { ...m, lat, lng } : m)))
    } else if (placePoint && vbToM) {
      const m = markersRef.current.find((x) => x.id === ds.id)
      if (!m) return
      const [cx, cy] = placePoint(m.lat, m.lng)
      const radiusM = Math.max(25, Math.round(vbToM(Math.hypot(vb[0] - cx, vb[1] - cy))))
      setMarkersState((prev) => prev.map((x) => (x.id === ds.id ? { ...x, radiusM } : x)))
    }
  }
  function onPointerUp() {
    if (drag.current) {
      setMarkers(campo.id, markersRef.current)
      drag.current = null
    }
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
  const RemoveBtn = ({ id }: { id: string }) => (
    <button
      type="button"
      title="Quitar"
      onClick={(e) => {
        e.stopPropagation()
        removeMarker(id)
      }}
      style={{
        position: 'absolute',
        top: '-2px',
        right: '-2px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: INK,
        color: '#fff',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <X size={10} strokeWidth={3} />
    </button>
  )

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
              if (placing) placeAt(e)
              else setSelected(null)
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <defs>
              <pattern id="pat-agricola" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="9" stroke={campo.color.hex} strokeWidth="1" />
              </pattern>
              <radialGradient id="lg-water" cx="42%" cy="34%" r="72%">
                <stop offset="0%" stopColor="#c4e9f6" />
                <stop offset="55%" stopColor="#56a8cc" />
                <stop offset="100%" stopColor="#1f6386" />
              </radialGradient>
              <filter id="lg-sh" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0b1f17" floodOpacity="0.2" />
              </filter>
            </defs>

            {boundary && (
              <polygon points={boundary} fill="none" stroke={campo.color.hex} strokeWidth={2.5} strokeLinejoin="round" />
            )}

            {shapes.map((s) => {
              const info = infoDe(s.numero)
              const uso = info.uso
              const sel = selected === s.numero
              const hov = hoverNum === s.numero
              const sub =
                uso === 'ganadero'
                  ? `${info.cabezas} cab`
                  : uso === 'agricola'
                    ? (info.cultivo ?? null)
                    : null
              const conSub = !!sub && !s.small
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
                  {uso === 'agricola' && (
                    <polygon points={s.points} fill="url(#pat-agricola)" fillOpacity={0.5} style={{ pointerEvents: 'none' }} />
                  )}
                  <text x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-heading, sans-serif)" fill={INK} style={{ pointerEvents: 'none' }}>
                    <tspan x={s.cx} dy={conSub ? '-0.32em' : '0'} fontWeight={700} fontSize={s.small ? 15 : 22}>
                      {s.numero}
                    </tspan>
                    {conSub && (
                      <tspan x={s.cx} dy="1.35em" fontWeight={600} fontSize={12} fill="#6b776f">
                        {sub}
                      </tspan>
                    )}
                  </text>
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
                  const over = hoverMk === m.id
                  return (
                    <g
                      key={m.id}
                      onMouseEnter={() => setHoverMk(m.id)}
                      onMouseLeave={() => setHoverMk((h) => (h === m.id ? null : h))}
                    >
                      <ellipse
                        cx={vx}
                        cy={vy}
                        rx={r}
                        ry={ry}
                        fill="url(#lg-water)"
                        fillOpacity={0.82}
                        stroke="#1d5d7a"
                        strokeWidth={1}
                        filter="url(#lg-sh)"
                        style={{ cursor: 'move' }}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          drag.current = { id: m.id, mode: 'move' }
                          svgRef.current?.setPointerCapture(e.pointerId)
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <path
                        d={`M ${vx - r * 0.55} ${vy - ry * 0.35} q ${r * 0.55} ${-ry * 0.45} ${r * 1.1} 0`}
                        fill="none"
                        stroke="#e6f5fb"
                        strokeWidth={1.2}
                        strokeLinecap="round"
                        opacity={0.7}
                        style={{ pointerEvents: 'none' }}
                      />
                      <circle
                        cx={vx + r}
                        cy={vy}
                        r={6}
                        fill="#fff"
                        stroke="#1d5d7a"
                        strokeWidth={1.5}
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          drag.current = { id: m.id, mode: 'resize' }
                          svgRef.current?.setPointerCapture(e.pointerId)
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {over && (
                        <g
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            removeMarker(m.id)
                          }}
                        >
                          <circle cx={vx} cy={vy - ry - 11} r={8} fill={INK} />
                          <path
                            d={`M ${vx - 3} ${vy - ry - 14} l 6 6 M ${vx + 3} ${vy - ry - 14} l -6 6`}
                            stroke="#fff"
                            strokeWidth={1.6}
                            strokeLinecap="round"
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
                  const isTr = m.type === 'tranquera'
                  return (
                    <foreignObject
                      key={m.id}
                      x={vx - 24}
                      y={isTr ? vy - 24 : vy - 40}
                      width={48}
                      height={isTr ? 48 : 48}
                      style={{ overflow: 'visible' }}
                    >
                      <div
                        style={{ position: 'relative', width: '48px', height: '48px' }}
                        onMouseEnter={() => setHoverMk(m.id)}
                        onMouseLeave={() => setHoverMk((h) => (h === m.id ? null : h))}
                      >
                        <div
                          title={F.label}
                          onClick={(e) => e.stopPropagation()}
                          style={
                            isTr
                              ? {
                                  position: 'absolute',
                                  inset: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transform: `rotate(${m.angleDeg ?? 0}deg)`,
                                  filter: 'drop-shadow(0 2px 2px rgba(11,31,23,0.22))',
                                }
                              : {
                                  position: 'absolute',
                                  bottom: '0',
                                  left: '3px',
                                  width: '42px',
                                  height: '44px',
                                  filter: 'drop-shadow(0 2px 2px rgba(11,31,23,0.22))',
                                }
                          }
                        >
                          <Icon className={isTr ? 'size-[40px]' : 'size-[42px]'} />
                        </div>
                        {hoverMk === m.id && <RemoveBtn id={m.id} />}
                      </div>
                    </foreignObject>
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
