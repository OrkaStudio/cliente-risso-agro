import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { codigoLote, type Lote } from '@/features/lotes/store'
import {
  allGeo,
  deleteGeo,
  getCampoBoundary,
  setGeo,
  type LatLng,
} from '@/features/lotes/geo'
import type { Campo, Potrero } from '@/features/lotes/mock'

// Esri World Imagery — tiles satelitales gratuitos, sin token.
const ESRI =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
// Centro por defecto: zona de Las Flores (Buenos Aires). El usuario navega
// hasta su campo y traza; cuando hay geometría guardada, encuadra ahí.
const DEFAULT_CENTER: [number, number] = [-36.03, -59.1]

/**
 * Mapa satelital real de un campo. Se dibujan los POTREROS como polígonos
 * (Geoman) sobre la imagen satelital; cada uno se etiqueta con su número y, si
 * un LOTE lo ocupa, con su código. La geometría persiste en localStorage.
 */
export function CampoMapaReal({
  campo,
  lotes,
}: {
  campo: Campo
  potreros: Potrero[]
  lotes: Lote[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const navigate = useNavigate()
  // refs frescas para los handlers de Leaflet (evitan stale closures)
  const lotesRef = useRef(lotes)
  lotesRef.current = lotes

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = L.map(ref.current, { center: DEFAULT_CENTER, zoom: 13 })
    mapRef.current = map
    L.tileLayer(ESRI, {
      maxZoom: 19,
      attribution: 'Imágenes © Esri World Imagery',
    }).addTo(map)

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

    // Recalcular el tamaño cuando el contenedor ya está pintado / cambia de
    // tamaño (evita tiles grises o cortados en el primer render).
    const fixSize = () => map.invalidateSize()
    const t = setTimeout(fixSize, 60)
    const ro = new ResizeObserver(fixSize)
    ro.observe(ref.current)

    function styleFor(numero: string) {
      const ocupan = lotesRef.current.filter((l) => l.potreros.includes(numero))
      const label = `Potrero ${numero}${
        ocupan.length ? ` · ${ocupan.map((l) => codigoLote(l)).join(', ')}` : ''
      }`
      return { ocupan, label }
    }

    function bind(layer: L.Polygon, numero: string) {
      ;(layer as L.Polygon & { _numero?: string })._numero = numero
      const { ocupan, label } = styleFor(numero)
      layer.setStyle({
        color: campo.color.hex,
        weight: 2,
        fillColor: campo.color.hex,
        fillOpacity: ocupan.length ? 0.35 : 0.12,
      })
      layer.bindTooltip(label, {
        permanent: true,
        direction: 'center',
        className: 'potrero-label',
      })
      layer.on('click', () => {
        const cur = styleFor(numero)
        if (cur.ocupan[0]) navigate(`/lotes/${cur.ocupan[0].id}`)
      })
      layer.on('pm:edit', () => {
        const pts = (layer.getLatLngs()[0] as L.LatLng[]).map(
          (p) => [p.lat, p.lng] as LatLng,
        )
        setGeo(campo.id, numero, pts)
      })
      layer.on('pm:remove', () => deleteGeo(campo.id, numero))
      return layer
    }

    // contorno del campo (parcela del catastro), si está
    const grupo: L.Layer[] = []
    const boundary = getCampoBoundary(campo.id)
    if (boundary) {
      const b = L.polygon(boundary, {
        color: campo.color.hex,
        weight: 3,
        dashArray: '6 5',
        fill: false,
        interactive: false,
      })
      b.addTo(map)
      grupo.push(b)
    }

    // cargar geometría de potreros guardada
    const saved = allGeo(campo.id)
    for (const [numero, pts] of Object.entries(saved)) {
      const layer = bind(L.polygon(pts as LatLng[]), numero)
      layer.addTo(map)
      grupo.push(layer)
    }

    if (grupo.length) {
      map.fitBounds(L.featureGroup(grupo).getBounds(), { padding: [24, 24] })
    }

    // al dibujar un potrero nuevo
    map.on('pm:create', (e: { layer: L.Layer }) => {
      const layer = e.layer as L.Polygon
      const numero = window.prompt('Número de potrero (ej. 9, 1A):')?.trim()
      if (!numero) {
        map.removeLayer(layer)
        return
      }
      const pts = (layer.getLatLngs()[0] as L.LatLng[]).map(
        (p) => [p.lat, p.lng] as LatLng,
      )
      setGeo(campo.id, numero, pts)
      map.removeLayer(layer)
      bind(L.polygon(pts), numero).addTo(map)
    })

    return () => {
      clearTimeout(t)
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [campo.id, campo.color.hex, navigate])

  return (
    <div
      ref={ref}
      className="relative isolate h-[520px] w-full overflow-hidden rounded-xl border border-border"
    />
  )
}
