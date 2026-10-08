import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
// Geoman usa el global `L`: se expone y el plugin se carga después (ver
// campo-mapa-real.tsx, mismo motivo).
if (typeof window !== 'undefined') (window as unknown as { L: typeof L }).L = L
await import('@geoman-io/leaflet-geoman-free')
import type { LatLng, PotreroMapa } from './reglas'
import { ponerSatelite } from './satelite'

// Colores de Tropero (Leaflet dibuja en SVG: no lee las clases de Tailwind).
const TERRACOTA = '#b85c2e'
const TRIGO = '#ecc46a'
const HUESO = '#fbfaf6'
const SUAVE = '#f5e2d8'

export type ModoMapa = 'mirar' | 'borde' | 'ajustar' | 'potrero'

export type MapaTutorialApi = {
  /** Saca el último punto del dibujo en curso. */
  deshacer: () => void
  /** Borra el dibujo en curso y arranca de nuevo. */
  reiniciar: () => void
  irA: (lat: number, lon: number, zoom?: number) => void
  encuadrar: (p: LatLng[]) => void
}

const ring = (l: L.Polygon): LatLng[] => (l.getLatLngs()[0] as L.LatLng[]).map((p) => [p.lat, p.lng] as LatLng)

/**
 * El mapa satelital del tutorial (página 35, «Tutorial · …»): el borde del
 * campo, los potreros ya ubicados con su nombre, y el dibujo en curso.
 * Se dibuja tocando cada esquina; para cerrar, se toca el primer punto.
 */
export const MapaTutorial = forwardRef<
  MapaTutorialApi,
  {
    centro: { lat: number; lon: number; zoom: number }
    contorno: LatLng[] | null
    potreros: PotreroMapa[]
    /** El que se está asignando: va lleno en terracota. */
    borrador?: LatLng[] | null
    borradorNombre?: string
    modo: ModoMapa
    onDibujo?: (p: LatLng[]) => void
    onPuntos?: (n: number) => void
    onAjuste?: (p: LatLng[]) => void
    className?: string
  }
>(function MapaTutorial(
  { centro, contorno, potreros, borrador, borradorNombre, modo, onDibujo, onPuntos, onAjuste, className },
  api,
) {
  const host = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capas = useRef<L.LayerGroup | null>(null)
  const cb = useRef({ onDibujo, onPuntos, onAjuste })
  cb.current = { onDibujo, onPuntos, onAjuste }

  // Montar una sola vez.
  useEffect(() => {
    if (!host.current || mapa.current) return
    const map = L.map(host.current, {
      center: [centro.lat, centro.lon],
      zoom: centro.zoom,
      zoomControl: false,
      zoomSnap: 0.5,
      wheelPxPerZoomLevel: 120,
    })
    mapa.current = map
    const quitarSatelite = ponerSatelite(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    capas.current = L.layerGroup().addTo(map)
    map.pm.setLang('es')
    map.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 24,
      allowSelfIntersection: false,
      templineStyle: { color: TRIGO, weight: 3, dashArray: '8 7' },
      hintlineStyle: { color: TRIGO, weight: 2, dashArray: '4 6' },
      pathOptions: { color: TERRACOTA, weight: 3, fillColor: TERRACOTA, fillOpacity: 0.12 },
    })
    map.on('pm:drawstart', (e: { workingLayer: L.Layer }) => {
      cb.current.onPuntos?.(0)
      e.workingLayer.on('pm:vertexadded', () => {
        const n = ((e.workingLayer as L.Polyline).getLatLngs() as L.LatLng[]).length
        cb.current.onPuntos?.(n)
      })
    })
    map.on('pm:create', (e: { layer: L.Layer }) => {
      const p = ring(e.layer as L.Polygon)
      map.removeLayer(e.layer)
      cb.current.onDibujo?.(p)
    })
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(host.current)
    return () => {
      ro.disconnect()
      quitarSatelite()
      map.remove()
      mapa.current = null
    }
    // El centro inicial se usa una vez; después se mueve con `irA`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lo dibujado: borde, potreros ubicados y el borrador.
  useEffect(() => {
    const g = capas.current
    if (!g) return
    g.clearLayers()
    if (contorno && modo !== 'ajustar') {
      L.polygon(contorno, {
        color: TERRACOTA,
        weight: 3,
        fillColor: TERRACOTA,
        fillOpacity: potreros.some((p) => p.poligono) ? 0 : 0.14,
        interactive: false,
      }).addTo(g)
    }
    for (const p of potreros) {
      if (!p.poligono) continue
      L.polygon(p.poligono, { color: HUESO, weight: 2, fillColor: SUAVE, fillOpacity: 0.72, interactive: false })
        .bindTooltip(`<b>${p.nombre}</b><span>${p.que}</span>`, {
          permanent: true,
          direction: 'center',
          className: 'tropero-etiqueta',
        })
        .addTo(g)
    }
    if (borrador) {
      const l = L.polygon(borrador, { color: HUESO, weight: 2.5, fillColor: TERRACOTA, fillOpacity: 0.88, interactive: false }).addTo(g)
      if (borradorNombre)
        l.bindTooltip(`<b>${borradorNombre}</b>`, { permanent: true, direction: 'center', className: 'tropero-etiqueta tropero-etiqueta--activa' })
    }
  }, [contorno, potreros, borrador, borradorNombre, modo])

  // El modo: dibujar el borde o un potrero, o ajustar el borde arrastrando puntos.
  useEffect(() => {
    const map = mapa.current
    if (!map) return
    map.pm.disableDraw()
    if (modo === 'borde' || modo === 'potrero') {
      map.pm.enableDraw('Polygon', { finishOn: null, continueDrawing: false, tooltips: false })
      return () => map.pm.disableDraw()
    }
    if (modo === 'ajustar' && contorno) {
      const l = L.polygon(contorno, { color: TERRACOTA, weight: 3, fillColor: TERRACOTA, fillOpacity: 0.12 }).addTo(map)
      l.pm.enable({ allowSelfIntersection: false, snappable: false })
      const avisar = () => cb.current.onAjuste?.(ring(l))
      l.on('pm:edit', avisar)
      l.on('pm:markerdragend', avisar)
      return () => {
        l.pm.disable()
        map.removeLayer(l)
      }
    }
  }, [modo, contorno])

  useImperativeHandle(api, () => ({
    deshacer() {
      const d = mapa.current?.pm.Draw as unknown as { Polygon?: { _removeLastVertex?: () => void; _layer?: L.Polyline } }
      d?.Polygon?._removeLastVertex?.()
      const n = (d?.Polygon?._layer?.getLatLngs() as L.LatLng[] | undefined)?.length ?? 0
      cb.current.onPuntos?.(n)
    },
    reiniciar() {
      const map = mapa.current
      if (!map) return
      map.pm.disableDraw()
      map.pm.enableDraw('Polygon', { finishOn: null, continueDrawing: false, tooltips: false })
      cb.current.onPuntos?.(0)
    },
    irA(lat, lon, zoom = 15) {
      mapa.current?.flyTo([lat, lon], zoom, { duration: 0.8 })
    },
    encuadrar(p) {
      mapa.current?.flyToBounds(L.latLngBounds(p), { padding: [48, 48], duration: 0.8 })
    },
  }))

  return <div ref={host} className={className} />
})
