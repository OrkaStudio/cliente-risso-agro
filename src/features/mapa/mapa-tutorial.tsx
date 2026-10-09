import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
// Geoman usa el global `L`: se expone y el plugin se carga después (ver
// campo-mapa-real.tsx, mismo motivo).
if (typeof window !== 'undefined') (window as unknown as { L: typeof L }).L = L
await import('@geoman-io/leaflet-geoman-free')
import { cn } from '@/lib/utils'
import type { LatLng, PotreroMapa } from './reglas'
import { ponerSatelite } from './satelite'

// Colores de Tropero (Leaflet dibuja en SVG: no lee las clases de Tailwind).
const TERRACOTA = '#b85c2e'
const TRIGO = '#ecc46a'
const HUESO = '#fbfaf6'
const SUAVE = '#f5e2d8'

export type ModoMapa = 'mirar' | 'tocar' | 'borde' | 'ajustar' | 'potrero'

/** La guía animada sobre el mapa: dónde y qué gesto hacer. Sin `en`, va al centro. */
export type Guia = { tipo: 'tocar' | 'arrastrar' | 'esquinas'; en?: LatLng; texto?: string }

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
    /** Modo «tocar»: el punto donde tocó (para buscar la parcela). */
    onToque?: (lat: number, lng: number) => void
    /** Una parcela propuesta (catastro), en trigo, esperando confirmación. */
    candidato?: LatLng[] | null
    guia?: Guia | null
    className?: string
  }
>(function MapaTutorial(
  { centro, contorno, potreros, borrador, borradorNombre, modo, onDibujo, onPuntos, onAjuste, onToque, candidato, guia, className },
  api,
) {
  const host = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capas = useRef<L.LayerGroup | null>(null)
  const cb = useRef({ onDibujo, onPuntos, onAjuste, onToque })
  cb.current = { onDibujo, onPuntos, onAjuste, onToque }
  const modoRef = useRef(modo)
  modoRef.current = modo

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
    // Algunos pasos montan el mapa de nuevo: si ya hay borde, arranca encuadrado en él.
    if (contorno) map.fitBounds(L.latLngBounds(contorno), { padding: [48, 48] })
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
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (modoRef.current === 'tocar') cb.current.onToque?.(e.latlng.lat, e.latlng.lng)
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
    if (candidato) {
      L.polygon(candidato, { color: TRIGO, weight: 4, dashArray: '10 8', fillColor: TRIGO, fillOpacity: 0.28, interactive: false }).addTo(g)
    }
    if (guia?.en) {
      L.marker(guia.en, { icon: L.divIcon({ className: 'tropero-guia-ancla', html: htmlGuia(guia), iconSize: [0, 0] }), interactive: false }).addTo(g)
    }
    if (borrador) {
      const l = L.polygon(borrador, { color: HUESO, weight: 2.5, fillColor: TERRACOTA, fillOpacity: 0.88, interactive: false }).addTo(g)
      if (borradorNombre)
        l.bindTooltip(`<b>${borradorNombre}</b>`, { permanent: true, direction: 'center', className: 'tropero-etiqueta tropero-etiqueta--activa' })
    }
  }, [contorno, potreros, borrador, borradorNombre, modo, candidato, guia])

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

  return (
    <div className={cn('relative', modo === 'tocar' && '[&_.leaflet-container]:cursor-pointer', className)}>
      {/* La clase del host no cambia nunca: Leaflet le agrega las suyas y un re-render las borraría. */}
      <div ref={host} className="size-full" />
      {guia && !guia.en && (
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 z-[450]"
          dangerouslySetInnerHTML={{ __html: htmlGuia(guia) }}
        />
      )}
    </div>
  )
})

/** El gesto animado (CSS en index.css, «Guía sobre el mapa»). */
function htmlGuia(g: Guia): string {
  const mano =
    '<svg class="guia-mano" viewBox="0 0 24 24" width="44" height="44"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.9-2.6L4.3 14a1.6 1.6 0 0 1 2.5-2l2.2 2.3" fill="#fbfaf6" stroke="#131b16" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  const texto = g.texto ? `<span class="guia-texto">${g.texto}</span>` : ''
  if (g.tipo === 'esquinas') {
    return `<div class="guia guia--esquinas"><svg class="guia-forma" viewBox="0 0 140 100" width="140" height="100"><path d="M10 10 L130 14 L126 90 L14 86 Z" /></svg>${mano}${texto}</div>`
  }
  return `<div class="guia guia--${g.tipo}"><span class="guia-onda"></span>${mano}${texto}</div>`
}
