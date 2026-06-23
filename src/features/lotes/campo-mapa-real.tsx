import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { toast } from 'sonner'
import intersect from '@turf/intersect'
import area from '@turf/area'
import { featureCollection, polygon as turfPolygon } from '@turf/helpers'
import { codigoLote, totalLote, type Lote } from '@/features/lotes/store'
import { propositoLabel } from '@/features/lotes/domain'
import {
  allGeo,
  deleteGeo,
  getCampoBoundary,
  getCampoView,
  setCampoView,
  setGeo,
  type LatLng,
} from '@/features/lotes/geo'
import type { Campo, Potrero } from '@/features/lotes/mock'
import {
  PotreroSidePanel,
  USO,
  type PotreroInfo,
  type Uso,
} from '@/features/lotes/potrero-side-panel'

const IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const DEFAULT_CENTER: [number, number] = [-36.03, -59.1]
const HALO = '#08140f'
const LABEL_ZOOM = 15
const OVERLAP_MIN_M2 = 50

type Estado = 'normal' | 'hover' | 'selected'

const SVG_RECENTER =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
const SVG_FULL =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'

export function CampoMapaReal({
  campo,
  potreros,
  lotes,
}: {
  campo: Campo
  potreros: Potrero[]
  lotes: Lote[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const navigate = useNavigate()
  const lotesRef = useRef(lotes)
  lotesRef.current = lotes
  const potrerosRef = useRef(potreros)
  potrerosRef.current = potreros
  const [hover, setHover] = useState<PotreroInfo | null>(null)

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
    })
    mapRef.current = map

    L.tileLayer(IMAGERY, { maxZoom: 19, attribution: '© Esri' }).addTo(map)
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
      snapDistance: 20,
      allowSelfIntersection: false,
      pathOptions: { color: hex, weight: 2.5, fillColor: hex, fillOpacity: 0.15 },
    })

    const fixSize = () => map.invalidateSize()
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
      for (const [numero, entry] of layers) {
        if (numero === except) continue
        const b = toTurf(entry.pts)
        if (!b) continue
        try {
          const inter = intersect(featureCollection([a, b]))
          if (inter && area(inter) > OVERLAP_MIN_M2) return numero
        } catch {
          /* geometría inválida */
        }
      }
      return null
    }

    // ---------- uso + estilo ----------
    function ocupanDe(numero: string): Lote[] {
      return lotesRef.current.filter((lo) => lo.potreros.includes(numero))
    }
    function usoDe(numero: string): Uso {
      if (ocupanDe(numero).length) return 'ganadero'
      if (potrerosRef.current.find((p) => p.numero === numero)?.cultivo)
        return 'agricola'
      return 'vacio'
    }
    function styleMain(numero: string, estado: Estado): L.PathOptions {
      const uso = usoDe(numero)
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
    function labelHtml(numero: string, zoom: number): string {
      const lote = ocupanDe(numero)[0]
      if (zoom >= LABEL_ZOOM && lote) {
        return `<span class="pl-num">${numero}</span><span class="pl-sub">${codigoLote(
          lote,
        )} · ${totalLote(lote)}</span>`
      }
      return `<span class="pl-num">${numero}</span>`
    }

    // ---------- hover → panel lateral ----------
    function openHover(numero: string) {
      const lote = ocupanDe(numero)[0]
      const p = potrerosRef.current.find((pp) => pp.numero === numero)
      setHover({
        numero,
        uso: usoDe(numero),
        ha: p?.hectareas,
        especie: lote?.especie,
        proposito: lote ? propositoLabel[lote.proposito] : undefined,
        loteCodigo: lote ? codigoLote(lote) : undefined,
        cabezas: lote ? totalLote(lote) : undefined,
        loteId: lote?.id,
        cultivo: p?.cultivo,
      })
    }

    // ---------- potreros ----------
    const layers = new Map<
      string,
      { halo: L.Polygon; main: L.Polygon; pts: LatLng[] }
    >()
    let selected: string | null = null

    function selectPotrero(numero: string) {
      if (selected && layers.has(selected)) {
        layers.get(selected)!.main.setStyle(styleMain(selected, 'normal'))
      }
      selected = numero
      layers.get(numero)?.main.setStyle(styleMain(numero, 'selected'))
    }

    function addPotrero(numero: string, pts: LatLng[]) {
      const halo = L.polygon(pts, {
        color: HALO,
        weight: 5.5,
        opacity: 0.3,
        fill: false,
        interactive: false,
        lineJoin: 'round',
      }).addTo(map)
      const main = L.polygon(pts, styleMain(numero, 'normal')).addTo(map)
      main.bindTooltip(labelHtml(numero, map.getZoom()), {
        permanent: true,
        direction: 'center',
        className: 'potrero-label',
        interactive: false,
      })
      const entry = { halo, main, pts }
      main.on('mouseover', () => {
        if (selected !== numero) main.setStyle(styleMain(numero, 'hover'))
        openHover(numero)
      })
      main.on('mouseout', () => {
        if (selected !== numero) main.setStyle(styleMain(numero, 'normal'))
      })
      main.on('click', () => {
        selectPotrero(numero)
        openHover(numero)
        map.flyToBounds(main.getBounds(), {
          padding: [48, 48],
          maxZoom: 16,
          duration: 0.6,
        })
      })
      main.on('pm:edit', () => {
        const np = ringOf(main)
        const clash = overlapsExisting(np, numero)
        if (clash) {
          main.setLatLngs(entry.pts as L.LatLngExpression[])
          halo.setLatLngs(main.getLatLngs())
          toast.error(`No puede superponerse al potrero ${clash}`)
          return
        }
        entry.pts = np
        setGeo(campo.id, numero, np)
        halo.setLatLngs(main.getLatLngs())
      })
      main.on('pm:remove', () => {
        deleteGeo(campo.id, numero)
        map.removeLayer(halo)
        layers.delete(numero)
        if (selected === numero) selected = null
      })
      layers.set(numero, entry)
      return main
    }

    // ---------- contorno del campo ----------
    let boundaryLayer: L.Polygon | null = null
    const boundary = getCampoBoundary(campo.id)
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

    for (const [numero, pts] of Object.entries(allGeo(campo.id))) {
      addPotrero(numero, pts as LatLng[])
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

    // ---------- vista ----------
    const vista = getCampoView(campo.id)
    if (vista) map.setView(vista.center, vista.zoom)
    else {
      const b = allBounds()
      if (b && b.isValid()) map.fitBounds(b, { padding: [30, 30] })
    }
    map.on('moveend', () => {
      const c = map.getCenter()
      setCampoView(campo.id, { center: [c.lat, c.lng], zoom: map.getZoom() })
    })
    map.on('zoomend', () => {
      const z = map.getZoom()
      layers.forEach(({ main }, numero) =>
        main.setTooltipContent(labelHtml(numero, z)),
      )
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
      const popup = L.popup({ className: 'potrero-popup', closeButton: true })
        .setLatLng(raw.getBounds().getCenter())
        .setContent(box)
        .openOn(map)
      setTimeout(() => field.focus(), 60)
      let saved = false
      const commit = () => {
        const numero = field.value.trim()
        if (!numero) return
        saved = true
        setGeo(campo.id, numero, pts)
        map.removeLayer(raw)
        map.closePopup(popup)
        addPotrero(numero, pts)
        selectPotrero(numero)
        openHover(numero)
      }
      box.querySelector('.pi-ok')!.addEventListener('click', commit)
      field.addEventListener('keydown', (ev) => {
        if ((ev as KeyboardEvent).key === 'Enter') commit()
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

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div
        ref={ref}
        className="relative isolate h-[420px] w-full overflow-hidden rounded-2xl border border-border bg-secondary lg:h-[560px] lg:flex-1"
      />
      <PotreroSidePanel
        info={hover}
        campo={campo}
        onVerLote={(id) => navigate(`/potreros/${id}`)}
      />
    </div>
  )
}
