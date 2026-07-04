import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw, RotateCw, Satellite, Trash2 } from 'lucide-react'
import {
  FEATURE_MAP,
  FEATURES,
  type FeatureId,
} from '@/features/lotes/potrero-features'
import { usoDeEstado, type CampoVM } from '@/features/campos/use-campo-mapa'
import type { Infraestructura, LatLng, PotreroMapa } from '@/features/campos/api'
import { cargarSat, satCacheado } from '@/features/lotes/satelite-cache'
import {
  PotreroSidePanel,
  ReferenciasPotrero,
  USO,
  type EditarPotrero,
  type PotreroInfo,
} from '@/features/lotes/potrero-side-panel'
import { cn } from '@/lib/utils'

const W = 1000
const H = 560
const PAD = 26
const M_PER_DEG = 111320

type XY = [number, number]
type Edge = [XY, XY]
type Shape = { id: string; numero: string; points: string; cx: number; cy: number; small: boolean }
type SatLayer = { href: string; matrix: string; w: number; h: number }
// Carga progresiva: `base` (chica, ~2s) aparece ya; `hi` (nítida, ~3s) entra
// encima. El `/export` de Esri renderiza on-demand y 2048px tarda ~13s → se
// veía el fondo verde todo ese rato. 1536 da buena definición en ~3s.
type Sat = { base: SatLayer; hi: SatLayer }

/** Marcador de infraestructura en estado de trabajo (mapeado de la fila real). */
type Mk = {
  id: string
  type: FeatureId
  lat: number
  lng: number
  radiusM?: number | null
  angleDeg?: number | null
  scale?: number | null
}

function infraToMk(i: Infraestructura): Mk {
  return {
    id: i.id,
    type: i.tipo as FeatureId,
    lat: i.lat,
    lng: i.lng,
    radiusM: i.radio_m,
    angleDeg: i.angulo_deg,
    scale: i.escala,
  }
}

export type CrearInfraInput = {
  tipo: FeatureId
  lat: number
  lng: number
  radio_m?: number | null
  angulo_deg?: number | null
}
export type PatchInfraInput = {
  lat?: number
  lng?: number
  radio_m?: number | null
  angulo_deg?: number | null
  escala?: number | null
}

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
  contorno,
  potreros,
  infra,
  onGuardarPotrero,
  onCrearInfra,
  onActualizarInfra,
  onBorrarInfra,
  onVerPotrero,
}: {
  campo: CampoVM
  contorno: LatLng[] | null
  potreros: PotreroMapa[]
  infra: Infraestructura[]
  onGuardarPotrero: EditarPotrero['onGuardar']
  onCrearInfra: (input: CrearInfraInput) => Promise<{ id: string }>
  onActualizarInfra: (id: string, patch: PatchInfraInput) => void
  onBorrarInfra: (id: string) => void
  onVerPotrero: (potreroId: string) => void
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  // Mapa potreroId → datos del potrero (uso, ha, cabezas, cultivo, estado).
  const byId = useMemo(
    () => new Map(potreros.map((p) => [p.id, p])),
    [potreros],
  )

  const { shapes, boundary, edges, placePoint, toLatLng, mToVB, vbToM, sat } =
    useMemo(() => {
      // Solo potreros con polígono dibujado entran al render.
      const entries = potreros
        .filter((p) => p.poligono && p.poligono.length > 0)
        .map((p) => ({ id: p.id, numero: p.nombre, pts: p.poligono as LatLng[] }))
      const bnd = contorno
      const all: LatLng[] = [...(bnd ?? []), ...entries.flatMap((e) => e.pts)]
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
      const shapes: Shape[] = entries.map(({ id, numero, pts }) => {
        const xy = place(pts)
        for (let i = 0; i < xy.length; i++) edges.push([xy[i], xy[(i + 1) % xy.length]])
        const { cx, cy, w: pw, h: ph } = centroide(xy)
        return { id, numero, points: ptsStr(xy), cx, cy, small: Math.min(pw, ph) < 92 }
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
      // Coloco la imagen mapeando sus esquinas a las 3 esquinas geográficas en
      // coordenadas SVG normales (robusto, sin números diminutos).
      const [p0x, p0y] = placePoint(maxLat, minLng) // NO (arriba-izq)
      const [p1x, p1y] = placePoint(maxLat, maxLng) // NE (arriba-der)
      const [p3x, p3y] = placePoint(minLat, minLng) // SO (abajo-izq)
      // El size DEBE tener el aspecto del bbox en GRADOS; si no, Esri ensancha
      // el bbox para igualarlo y la foto queda corrida/a otra escala.
      const ar = (maxLng - minLng) / (maxLat - minLat)
      const satLayer = (LONG: number): SatLayer => {
        const pxW = ar >= 1 ? LONG : Math.round(LONG * ar)
        const pxH = ar >= 1 ? Math.round(LONG / ar) : LONG
        const href =
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export' +
          `?bbox=${minLng},${minLat},${maxLng},${maxLat}&bboxSR=4326&imageSR=4326` +
          `&size=${pxW},${pxH}&format=jpg&f=image`
        const matrix = `matrix(${(p1x - p0x) / pxW} ${(p1y - p0y) / pxW} ${(p3x - p0x) / pxH} ${(p3y - p0y) / pxH} ${p0x} ${p0y})`
        return { href, matrix, w: pxW, h: pxH }
      }
      const sat: Sat = { base: satLayer(768), hi: satLayer(1536) }
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
    }, [potreros, contorno])

  // ---------- marcadores (infraestructura real) ----------
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [markers, setMarkersState] = useState<Mk[]>(() => infra.map(infraToMk))
  const markersRef = useRef(markers)
  useEffect(() => {
    markersRef.current = markers
  }, [markers])
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

  // Resincroniza desde la base cuando cambia la infraestructura y no se está
  // arrastrando (evita que un refetch pise un drag en curso).
  useEffect(() => {
    if (drag.current) return
    setMarkersState(infra.map(infraToMk))
  }, [infra])

  const removeMarker = (id: string) => {
    setSelMk((s) => (s === id ? null : s))
    setMarkersState((prev) => prev.filter((m) => m.id !== id))
    onBorrarInfra(id)
  }
  // Agranda/achica el marcador seleccionado: laguna por área (m), resto por escala.
  const bumpSize = (id: string, dir: 1 | -1) => {
    const m = markersRef.current.find((x) => x.id === id)
    if (!m) return
    if (m.type === 'laguna') {
      const r = Math.min(600, Math.max(25, Math.round((m.radiusM ?? 160) + dir * 25)))
      setMarkersState((prev) =>
        prev.map((x) => (x.id === id ? { ...x, radiusM: r } : x)),
      )
      onActualizarInfra(id, { radio_m: r })
    } else {
      const s = Math.min(2.2, Math.max(0.5, +((m.scale ?? 1) + dir * 0.15).toFixed(2)))
      setMarkersState((prev) =>
        prev.map((x) => (x.id === id ? { ...x, scale: s } : x)),
      )
      onActualizarInfra(id, { escala: s })
    }
  }
  // Rota el marcador (manga/tranquera) en pasos de 15°.
  const rotateMarker = (id: string, deltaDeg: number) => {
    const m = markersRef.current.find((x) => x.id === id)
    if (!m) return
    const ang = ((m.angleDeg ?? 0) + deltaDeg + 360) % 360
    setMarkersState((prev) =>
      prev.map((x) => (x.id === id ? { ...x, angleDeg: ang } : x)),
    )
    onActualizarInfra(id, { angulo_deg: ang })
  }

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
  async function placeAt(e: { clientX: number; clientY: number }) {
    if (!placing || !toLatLng) return
    const vb = clientToVB(e)
    if (!vb) return
    let input: CrearInfraInput
    if (placing === 'tranquera') {
      const snap = snapToEdge(vb[0], vb[1])
      const [lat, lng] = toLatLng(snap ? snap.x : vb[0], snap ? snap.y : vb[1])
      input = { tipo: 'tranquera', lat, lng, angulo_deg: snap ? snap.angle : 0 }
    } else if (placing === 'laguna') {
      const [lat, lng] = toLatLng(vb[0], vb[1])
      input = { tipo: 'laguna', lat, lng, radio_m: 160 }
    } else {
      const [lat, lng] = toLatLng(vb[0], vb[1])
      input = { tipo: placing, lat, lng }
    }
    // Coloca uno y sale del modo "Marcar" (evita seguir agregando con cada click).
    setPlacing(null)
    setSelected(null)
    try {
      const created = await onCrearInfra(input)
      setSelMk(created.id)
    } catch {
      /* el toast de error lo dispara la mutación del padre */
    }
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
    if (ds.moved) {
      const m = markersRef.current.find((x) => x.id === ds.id)
      if (m) {
        if (ds.mode === 'move') {
          onActualizarInfra(m.id, {
            lat: m.lat,
            lng: m.lng,
            ...(m.type === 'tranquera' ? { angulo_deg: m.angleDeg } : {}),
          })
        } else {
          onActualizarInfra(m.id, { radio_m: m.radiusM })
        }
      }
    }
    drag.current = null
  }

  const featsByPot = useMemo(() => {
    const map: Record<string, FeatureId[]> = {}
    for (const m of markers) {
      for (const p of potreros) {
        if (p.poligono && pointInRing(m.lat, m.lng, p.poligono)) {
          ;(map[p.id] ??= []).push(m.type)
          break
        }
      }
    }
    for (const k of Object.keys(map)) map[k] = [...new Set(map[k])]
    return map
  }, [potreros, markers])

  function infoDe(id: string): PotreroInfo {
    const p = byId.get(id)
    return {
      potreroId: id,
      numero: p?.nombre ?? '—',
      uso: p ? usoDeEstado(p.estadoCiclo) : 'vacio',
      estadoCiclo: p?.estadoCiclo ?? 'descanso',
      ha: p?.hectareas ?? null,
      cabezas: p?.cabezas ?? 0,
      cultivo: p?.cultivo ?? null,
      features: featsByPot[id],
    }
  }

  const editProp: EditarPotrero = { onGuardar: onGuardarPotrero }

  // Resolución del satélite a blob cacheado (Esri manda `max-age=0` → no cachea;
  // lo hacemos nosotros para que revisitas/toggles sean instantáneos). El cache
  // hit se lee en render (lookup puro) → sin spinner al volver a un campo. El
  // miss se baja en un efecto. El `href` viaja con el blob para no mostrar la
  // foto de otro campo mientras se resuelve.
  const baseHref = sat?.base.href
  const hiHref = sat?.hi.href
  const baseHit = baseHref ? satCacheado(baseHref) ?? null : null
  const hiHit = hiHref ? satCacheado(hiHref) ?? null : null
  const [baseFetched, setBaseFetched] = useState<{ href: string; blob: string } | null>(null)
  const [hiFetched, setHiFetched] = useState<{ href: string; blob: string } | null>(null)
  const baseSrc =
    baseHit ?? (baseFetched?.href === baseHref ? baseFetched?.blob : null)
  const hiSrc = hiHit ?? (hiFetched?.href === hiHref ? hiFetched?.blob : null)
  const [paintedHref, setPaintedHref] = useState<string | null>(null)
  const satLoaded = !!baseSrc
  const hiLoaded = !!hiSrc && paintedHref === hiHref

  useEffect(() => {
    if (!baseHref || baseHit) return
    let alive = true
    cargarSat(baseHref)
      .then((blob) => alive && setBaseFetched({ href: baseHref, blob }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [baseHref, baseHit])

  useEffect(() => {
    if (!hiHref || hiHit) return
    let alive = true
    cargarSat(hiHref)
      .then((blob) => alive && setHiFetched({ href: hiHref, blob }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [hiHref, hiHit])

  const activeId = selected ?? hoverId
  const panelInfo = activeId ? infoDe(activeId) : null
  const vacio = shapes.length === 0 && !boundary
  // Patrón de surcos (líneas diagonales) para los potreros agrícolas.
  const surcosId = `surcos-${campo.id}`
  const selMarker = markers.find((m) => m.id === selMk) ?? null
  const selFeat = selMarker ? FEATURE_MAP[selMarker.type] : null

  return (
    <div className="flex flex-col gap-3">
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
              if (placing) void placeAt(e)
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

            {/* Surcos: relleno ámbar con líneas diagonales (rows de cultivo)
                para los potreros agrícolas. El color diferencia la actividad. */}
            <defs>
              <pattern
                id={surcosId}
                width={9}
                height={9}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width={9} height={9} fill={USO.agricola.color} fillOpacity={0.85} />
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={9}
                  stroke="#5f3d06"
                  strokeWidth={3.5}
                  strokeOpacity={0.9}
                />
              </pattern>
            </defs>

            {/* Foto satelital: capa base (carga rápida) + nítida encima que
                entra con un fundido cuando termina de renderizar Esri. Ambas
                desde blob cacheado (instantáneo al revisitar el campo). */}
            {sat && baseSrc && (
              <image
                href={baseSrc}
                x={0}
                y={0}
                width={sat.base.w}
                height={sat.base.h}
                transform={sat.base.matrix}
                preserveAspectRatio="none"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {sat && hiSrc && (
              <image
                href={hiSrc}
                x={0}
                y={0}
                width={sat.hi.w}
                height={sat.hi.h}
                transform={sat.hi.matrix}
                preserveAspectRatio="none"
                onLoad={() => setPaintedHref(hiHref ?? null)}
                style={{
                  pointerEvents: 'none',
                  opacity: hiLoaded ? 1 : 0,
                  transition: 'opacity 0.4s ease',
                }}
              />
            )}

            {boundary && (
              <>
                <polygon points={boundary} fill="none" stroke="#0c1c14" strokeOpacity={0.55} strokeWidth={5} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                <polygon points={boundary} fill="none" stroke={campo.color.hex} strokeWidth={2.5} strokeLinejoin="round" />
              </>
            )}

            {shapes.map((s) => {
              const info = infoDe(s.id)
              const uso = info.uso
              const esAgricola = uso === 'agricola'
              const esVacio = uso === 'vacio'
              const sel = selected === s.id
              const hov = hoverId === s.id
              const cab = info.cabezas ?? 0
              const usoText =
                uso === 'ganadero'
                  ? `Ganadero · ${cab}`
                  : uso === 'agricola'
                    ? `Agrícola${info.cultivo ? ` · ${info.cultivo}` : ''}`
                    : 'Vacío'
              // Los potreros chicos no muestran el pill por espacio, PERO si
              // tienen hacienda cargada (o están seleccionados/hover) sí, para
              // que el conteo siempre se vea sobre el mapa (aunque desborde un
              // poco el polígono chico).
              const showPill = !s.small || (uso === 'ganadero' && cab > 0) || sel || hov
              return (
                <g
                  key={s.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverId(s.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (placing) {
                      void placeAt(e)
                      return
                    }
                    setSelected(s.id)
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
                    fill={esAgricola ? `url(#${surcosId})` : USO[uso].color}
                    fillOpacity={
                      esAgricola
                        ? sel || hov
                          ? 1
                          : 0.9
                        : esVacio
                          ? sel || hov
                            ? 0.42
                            : 0.24
                          : sel || hov
                            ? 0.74
                            : 0.56
                    }
                    stroke={campo.color.hex}
                    strokeWidth={sel || hov ? 3 : 2}
                    strokeLinejoin="round"
                    strokeDasharray={esVacio ? '4 5' : undefined}
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
                            background: USO[uso].color,
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
                  const F = FEATURE_MAP[m.type]
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

        {/* Placeholder gris uniforme mientras Esri renderiza la foto. Tapa todo
            (potreros, toolbar) → carga limpia, sin el fondo verde a medias. */}
        {!vacio && sat && !satLoaded && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-secondary">
            <div className="flex flex-col items-center gap-2.5">
              <Satellite
                className="size-10 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span className="text-[13.5px] font-semibold text-muted-foreground">
                Cargando satélite…
              </span>
            </div>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-black/[0.06]">
              <div className="animate-loadbar h-full w-1/3 rounded-full bg-field" />
            </div>
          </div>
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
        onVerPotrero={onVerPotrero}
        edit={editProp}
      />
     </div>
      <ReferenciasPotrero campo={campo} />
    </div>
  )
}
