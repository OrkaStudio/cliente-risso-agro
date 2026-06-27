import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { toast } from 'sonner'
import intersect from '@turf/intersect'
import area from '@turf/area'
import { featureCollection, polygon as turfPolygon } from '@turf/helpers'
import { usoDeEstado, type CampoVM } from '@/features/campos/use-campo-mapa'
import type { LatLng, PotreroMapa } from '@/features/campos/api'
import { getCampoView, setCampoView } from '@/features/lotes/geo'
import {
  PotreroSidePanel,
  USO,
  type PotreroInfo,
} from '@/features/lotes/potrero-side-panel'

const IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const ROADS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'
const DEFAULT_CENTER: [number, number] = [-36.03, -59.1]
const HALO = '#08140f'
const LABEL_ZOOM = 15
const OVERLAP_MIN_M2 = 50

type Estado = 'normal' | 'hover' | 'selected'

// ----- Orientación: referencias prácticas por lado del campo -----
type Cardinal = 'N' | 'S' | 'E' | 'O'
const CARDINALES: { dir: Cardinal; pos: string; arrow: string }[] = [
  { dir: 'N', pos: 'left-1/2 top-2 -translate-x-1/2', arrow: '↑' },
  { dir: 'S', pos: 'bottom-2 left-1/2 -translate-x-1/2', arrow: '↓' },
  { dir: 'E', pos: 'right-2 top-1/2 -translate-y-1/2', arrow: '→' },
  { dir: 'O', pos: 'left-2 top-1/2 -translate-y-1/2', arrow: '←' },
]
// Referencias de ubicación por campo (ciudades, rutas). Lo que sabemos hoy;
// se completa con datos reales que dé el productor. Se busca por nombre.
const REFERENCIAS: Record<string, { dir: Cardinal; label: string }[]> = {
  'La Porteña': [{ dir: 'E', label: 'Las Flores' }],
}

const SVG_RECENTER =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
const SVG_FULL =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'

export function CampoMapaReal({
  campo,
  contorno,
  potreros,
  onDibujarPotrero,
  onSetPoligono,
  onVerPotrero,
}: {
  campo: CampoVM
  contorno: LatLng[] | null
  potreros: PotreroMapa[]
  /** Crea (o reusa por nombre) el potrero y le guarda el polígono. Devuelve su id. */
  onDibujarPotrero: (nombre: string, poligono: LatLng[]) => Promise<string>
  /** Reemplaza/limpia el polígono de un potrero existente. */
  onSetPoligono: (potreroId: string, poligono: LatLng[] | null) => void
  onVerPotrero: (potreroId: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [hover, setHover] = useState<PotreroInfo | null>(null)

  // Refs a los datos/callbacks para que el efecto (que corre una vez por campo)
  // siempre lea lo último sin re-montar el mapa.
  const potrerosRef = useRef(potreros)
  potrerosRef.current = potreros
  const contornoRef = useRef(contorno)
  contornoRef.current = contorno
  const dibujarRef = useRef(onDibujarPotrero)
  dibujarRef.current = onDibujarPotrero
  const setPoligonoRef = useRef(onSetPoligono)
  setPoligonoRef.current = onSetPoligono
  const verRef = useRef(onVerPotrero)
  verRef.current = onVerPotrero

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const host = ref.current
    const hex = campo.color.hex
    const map = L.map(host, {
      center: DEFAULT_CENTER,
      zoom: 13,
      zoomControl: false,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
      maxBoundsViscosity: 0.9, // efecto imán: resiste y trae de vuelta al campo
    })
    mapRef.current = map

    L.tileLayer(IMAGERY, { maxZoom: 19, attribution: '© Esri' }).addTo(map)
    // Caminos/rutas (overlay transparente) → referencia y orientación.
    L.tileLayer(ROADS, { maxZoom: 19, opacity: 0.95 }).addTo(map)
    let labels: L.TileLayer | null = L.tileLayer(LABELS, {
      maxZoom: 19,
      opacity: 0.9,
    }).addTo(map)

    L.control.zoom({ position: 'topright' }).addTo(map)

    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    })
    map.pm.setLang('es')
    map.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 30, // más tolerancia: el vértice se pega al potrero vecino
      snapSegment: true, // engancha al borde, no solo a los vértices
      allowSelfIntersection: false,
      pathOptions: { color: hex, weight: 2.5, fillColor: hex, fillOpacity: 0.15 },
    })

    const fixSize = () => {
      map.invalidateSize()
      lockToField()
    }
    const t = setTimeout(fixSize, 60)
    const ro = new ResizeObserver(fixSize)
    ro.observe(host)
    const onFs = () => setTimeout(fixSize, 150)
    document.addEventListener('fullscreenchange', onFs)

    // ---------- geometría / turf ----------
    const ringOf = (layer: L.Polygon): LatLng[] =>
      (layer.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng] as LatLng)

    function toTurf(pts: LatLng[]) {
      const ring = pts.map(([lat, lng]) => [lng, lat])
      const f = ring[0]
      const l = ring[ring.length - 1]
      if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
      if (ring.length < 4) return null
      return turfPolygon([ring])
    }

    function overlapsExisting(pts: LatLng[], except?: string): string | null {
      const a = toTurf(pts)
      if (!a) return null
      for (const [id, entry] of layers) {
        if (id === except) continue
        const b = toTurf(entry.pts)
        if (!b) continue
        try {
          const inter = intersect(featureCollection([a, b]))
          if (inter && area(inter) > OVERLAP_MIN_M2) return entry.nombre
        } catch {
          /* geometría inválida */
        }
      }
      return null
    }

    // ---------- uso + estilo ----------
    const datoDe = (id: string) => potrerosRef.current.find((p) => p.id === id)
    function usoDe(id: string) {
      const p = datoDe(id)
      return p ? usoDeEstado(p.estadoCiclo) : 'vacio'
    }
    function styleMain(id: string, estado: Estado): L.PathOptions {
      const uso = usoDe(id)
      const base = uso === 'vacio' ? 0.05 : 0.2
      const fillOpacity =
        estado === 'selected'
          ? base + 0.3
          : estado === 'hover'
            ? base + 0.16
            : base
      return {
        color: hex,
        weight: estado === 'normal' ? 2.5 : 3.5,
        fillColor: USO[uso].color,
        fillOpacity,
        lineJoin: 'round',
        lineCap: 'round',
        dashArray: uso === 'vacio' ? '3 6' : undefined,
      }
    }
    function labelHtml(id: string, zoom: number): string {
      const p = datoDe(id)
      const nombre = p?.nombre ?? '—'
      if (zoom >= LABEL_ZOOM && p && p.cabezas > 0) {
        return `<span class="pl-num">${nombre}</span><span class="pl-sub">${p.cabezas} cab</span>`
      }
      return `<span class="pl-num">${nombre}</span>`
    }

    // ---------- hover → panel lateral ----------
    function openHover(id: string) {
      const p = datoDe(id)
      setHover({
        potreroId: id,
        numero: p?.nombre ?? '—',
        uso: p ? usoDeEstado(p.estadoCiclo) : 'vacio',
        estadoCiclo: p?.estadoCiclo ?? 'descanso',
        ha: p?.hectareas ?? null,
        cabezas: p?.cabezas ?? 0,
        cultivo: p?.cultivo ?? null,
      })
    }

    // ---------- potreros ----------
    const layers = new Map<
      string,
      { halo: L.Polygon; main: L.Polygon; pts: LatLng[]; nombre: string }
    >()
    let selected: string | null = null

    function selectPotrero(id: string) {
      if (selected && layers.has(selected)) {
        layers.get(selected)!.main.setStyle(styleMain(selected, 'normal'))
      }
      selected = id
      layers.get(id)?.main.setStyle(styleMain(id, 'selected'))
    }

    function addPotrero(id: string, nombre: string, pts: LatLng[]) {
      const halo = L.polygon(pts, {
        color: HALO,
        weight: 5.5,
        opacity: 0.3,
        fill: false,
        interactive: false,
        lineJoin: 'round',
      }).addTo(map)
      const main = L.polygon(pts, styleMain(id, 'normal')).addTo(map)
      main.bindTooltip(labelHtml(id, map.getZoom()), {
        permanent: true,
        direction: 'center',
        className: 'potrero-label',
        interactive: false,
      })
      const entry = { halo, main, pts, nombre }
      main.on('mouseover', () => {
        if (selected !== id) main.setStyle(styleMain(id, 'hover'))
        openHover(id)
      })
      main.on('mouseout', () => {
        if (selected !== id) main.setStyle(styleMain(id, 'normal'))
      })
      main.on('click', () => {
        selectPotrero(id)
        openHover(id)
        map.flyToBounds(main.getBounds(), {
          padding: [48, 48],
          maxZoom: 16,
          duration: 0.6,
        })
      })
      main.on('pm:edit', () => {
        const np = ringOf(main)
        const clash = overlapsExisting(np, id)
        if (clash) {
          main.setLatLngs(entry.pts as L.LatLngExpression[])
          halo.setLatLngs(main.getLatLngs())
          toast.error(`No puede superponerse al potrero ${clash}`)
          return
        }
        entry.pts = np
        setPoligonoRef.current(id, np)
        halo.setLatLngs(main.getLatLngs())
      })
      main.on('pm:remove', () => {
        // Borrar el dibujo NO borra el potrero (eso está diferido): solo limpia
        // su geometría para poder volver a trazarlo.
        setPoligonoRef.current(id, null)
        map.removeLayer(halo)
        layers.delete(id)
        if (selected === id) selected = null
        toast.info('Se quitó el dibujo del potrero (el potrero sigue existiendo)')
      })
      layers.set(id, entry)
      return main
    }

    // ---------- contorno del campo ----------
    let boundaryLayer: L.Polygon | null = null
    const boundary = contornoRef.current

    if (boundary) {
      L.polygon(boundary, {
        color: HALO,
        weight: 6,
        opacity: 0.3,
        fill: false,
        interactive: false,
      }).addTo(map)
      boundaryLayer = L.polygon(boundary, {
        color: hex,
        weight: 3,
        fill: false,
        interactive: false,
        lineJoin: 'round',
      }).addTo(map)
    }

    for (const p of potrerosRef.current) {
      if (p.poligono && p.poligono.length > 0)
        addPotrero(p.id, p.nombre, p.poligono)
    }

    function allBounds(): L.LatLngBounds | null {
      let b: L.LatLngBounds | null = boundaryLayer
        ? boundaryLayer.getBounds()
        : null
      layers.forEach(({ main }) => {
        b = b ? b.extend(main.getBounds()) : main.getBounds()
      })
      return b
    }

    // Mantiene el campo como referencia: imán al centro al desplazarse y se
    // puede alejar el zoom para ver contexto (pero no irse a los vecinos).
    function lockToField() {
      const b = allBounds()
      if (!b || !b.isValid()) return
      map.setMaxBounds(b.pad(0.15))
      const fitZoom = map.getBoundsZoom(b.pad(0.15), false)
      // Permitir alejar unos niveles para contexto, sin caer a vista de país.
      if (Number.isFinite(fitZoom)) map.setMinZoom(Math.max(9, fitZoom - 4))
    }
    // Imán: tras arrastrar (o alejar el zoom) vuelve a centrar el campo.
    function magnetToCenter() {
      const b = allBounds()
      if (b && b.isValid()) map.panTo(b.getCenter(), { animate: true, duration: 0.4 })
    }

    // ---------- vista ----------
    const vista = getCampoView(campo.id)
    if (vista) map.setView(vista.center, vista.zoom)
    else {
      const b = allBounds()
      if (b && b.isValid()) map.fitBounds(b, { padding: [30, 30] })
    }
    lockToField()
    let prevZoom = map.getZoom()
    map.on('moveend', () => {
      const c = map.getCenter()
      setCampoView(campo.id, { center: [c.lat, c.lng], zoom: map.getZoom() })
    })
    // Imán al centro al soltar un arrastre.
    map.on('dragend', magnetToCenter)
    map.on('zoomend', () => {
      const z = map.getZoom()
      layers.forEach(({ main }, id) =>
        main.setTooltipContent(labelHtml(id, z)),
      )
      // Al alejar, recentrar el campo; al acercar, dejar inspeccionar libre.
      if (z < prevZoom) magnetToCenter()
      prevZoom = z
    })

    // ---------- controles ----------
    function recenter() {
      const b = allBounds()
      if (b && b.isValid())
        map.flyToBounds(b, { padding: [48, 48], duration: 0.6 })
    }
    function toggleLabels(btn: HTMLElement) {
      if (labels && map.hasLayer(labels)) {
        map.removeLayer(labels)
        btn.classList.remove('on')
      } else {
        if (!labels) labels = L.tileLayer(LABELS, { maxZoom: 19, opacity: 0.9 })
        labels.addTo(map)
        btn.classList.add('on')
      }
    }
    function toggleFull() {
      if (!document.fullscreenElement) void host.requestFullscreen?.()
      else void document.exitFullscreen?.()
    }
    const ToolsCtl = L.Control.extend({
      onAdd() {
        const el = L.DomUtil.create('div', 'map-tools')
        el.innerHTML =
          `<button class="mt-btn" data-act="recenter" title="Centrar en el campo">${SVG_RECENTER}</button>` +
          `<button class="mt-btn on" data-act="labels" title="Nombres del mapa">Aa</button>` +
          `<button class="mt-btn" data-act="full" title="Pantalla completa">${SVG_FULL}</button>`
        L.DomEvent.disableClickPropagation(el)
        el.querySelector('[data-act=recenter]')!.addEventListener('click', recenter)
        const lblBtn = el.querySelector('[data-act=labels]') as HTMLElement
        lblBtn.addEventListener('click', () => toggleLabels(lblBtn))
        el.querySelector('[data-act=full]')!.addEventListener('click', toggleFull)
        return el
      },
    })
    new ToolsCtl({ position: 'topright' }).addTo(map)

    // ---------- dibujar potrero ----------
    map.on('pm:create', (e: { layer: L.Layer }) => {
      const raw = e.layer as L.Polygon
      const pts = ringOf(raw)
      const clash = overlapsExisting(pts)
      if (clash) {
        map.removeLayer(raw)
        toast.error(`No puede superponerse al potrero ${clash}`)
        return
      }
      const box = L.DomUtil.create('div', 'potrero-input')
      box.innerHTML =
        `<label>Número de potrero</label>` +
        `<div class="pi-row"><input class="pi-field" placeholder="9 · 1A" /><button class="pi-ok" type="button">Guardar</button></div>`
      L.DomEvent.disableClickPropagation(box)
      const field = box.querySelector('.pi-field') as HTMLInputElement
      const okBtn = box.querySelector('.pi-ok') as HTMLButtonElement
      const popup = L.popup({ className: 'potrero-popup', closeButton: true })
        .setLatLng(raw.getBounds().getCenter())
        .setContent(box)
        .openOn(map)
      setTimeout(() => field.focus(), 60)
      let saved = false
      const commit = async () => {
        const numero = field.value.trim()
        if (!numero || saved) return
        saved = true
        okBtn.disabled = true
        okBtn.textContent = 'Guardando…'
        try {
          const id = await dibujarRef.current(numero, pts)
          map.removeLayer(raw)
          map.closePopup(popup)
          addPotrero(id, numero, pts)
          selectPotrero(id)
          openHover(id)
        } catch (err) {
          saved = false
          okBtn.disabled = false
          okBtn.textContent = 'Guardar'
          toast.error(`No se pudo guardar: ${(err as Error).message}`)
        }
      }
      okBtn.addEventListener('click', () => void commit())
      field.addEventListener('keydown', (ev) => {
        if ((ev as KeyboardEvent).key === 'Enter') void commit()
      })
      map.on('popupclose', function onClose(ev: L.PopupEvent) {
        if (ev.popup !== popup) return
        map.off('popupclose', onClose)
        if (!saved && map.hasLayer(raw)) map.removeLayer(raw)
      })
    })

    map.on('click', () => {
      if (selected && layers.has(selected)) {
        layers.get(selected)!.main.setStyle(styleMain(selected, 'normal'))
      }
      selected = null
    })

    return () => {
      clearTimeout(t)
      ro.disconnect()
      document.removeEventListener('fullscreenchange', onFs)
      map.remove()
      mapRef.current = null
    }
  }, [campo.id, campo.color.hex])

  const refs = REFERENCIAS[campo.nombre] ?? []
  const refDe = (d: Cardinal) => refs.find((r) => r.dir === d)?.label

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="relative isolate h-[420px] w-full overflow-hidden rounded-2xl border border-border bg-secondary lg:h-[560px] lg:flex-1">
        <div ref={ref} className="absolute inset-0" />
        {/* Orientación: N/S/E/O (mapa norte-arriba) + referencia por lado */}
        <div className="pointer-events-none absolute inset-0 z-[450]">
          {CARDINALES.map(({ dir, pos, arrow }) => (
            <div
              key={dir}
              className={`absolute ${pos} flex items-center gap-1 rounded-full border border-border bg-white/85 px-2 py-0.5 text-[10.5px] shadow-sm backdrop-blur`}
            >
              <span className="font-bold text-field-deep">{dir}</span>
              {refDe(dir) && <span className="text-ink">{refDe(dir)}</span>}
              <span className="text-muted-foreground">{arrow}</span>
            </div>
          ))}
        </div>
      </div>
      <PotreroSidePanel
        info={hover}
        campo={campo}
        onVerPotrero={(id) => verRef.current(id)}
      />
    </div>
  )
}
