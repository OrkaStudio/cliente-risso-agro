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
const TINTA = '#131b16'
/** Cada potrero con el color de lo que tiene (el mismo lenguaje que el ejemplo). */
const COLOR: Record<NonNullable<PotreroMapa['tipo']>, { fill: string; op: number }> = {
  hacienda: { fill: TERRACOTA, op: 0.62 },
  sembrado: { fill: TRIGO, op: 0.66 },
  descanso: { fill: '#e3ecdf', op: 0.6 },
  vacio: { fill: HUESO, op: 0.45 },
}

export type ModoMapa = 'mirar' | 'tocar' | 'borde' | 'ajustar' | 'potrero'

/** La guía animada sobre el mapa: dónde y qué gesto hacer. Sin `en`, va al centro. */
export type Guia = { tipo: 'tocar' | 'arrastrar'; en?: LatLng; texto?: string }

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
    borradorQue?: string
    /** Lo de afuera del borde se apaga: la vista va al campo. */
    foco?: boolean
    /** Compu: lo que dice la pastilla que sigue al mouse mientras se dibuja. */
    pistaCursor?: string
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
  {
    centro,
    contorno,
    potreros,
    borrador,
    borradorNombre,
    borradorQue,
    foco,
    pistaCursor,
    modo,
    onDibujo,
    onPuntos,
    onAjuste,
    onToque,
    candidato,
    guia,
    className,
  },
  api,
) {
  const host = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capas = useRef<L.LayerGroup | null>(null)
  const cb = useRef({ onDibujo, onPuntos, onAjuste, onToque })
  cb.current = { onDibujo, onPuntos, onAjuste, onToque }
  const modoRef = useRef(modo)
  modoRef.current = modo
  const contar = useRef<(n: number, primero?: L.LatLng) => void>(() => {})
  const cursor = useRef<HTMLDivElement>(null)

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
    // «Cerrá acá»: con 3 esquinas o más, el primer punto late para cerrar el dibujo.
    const cierre = L.layerGroup().addTo(map)
    contar.current = (n, primero) => {
      cierre.clearLayers()
      if (n >= 3 && primero) {
        L.marker(primero, {
          icon: L.divIcon({ className: 'tropero-cerrar', html: '<span class="tropero-cerrar-onda"></span><span class="tropero-cerrar-texto">Cerrá acá</span>', iconSize: [0, 0] }),
          interactive: false,
          keyboard: false,
        }).addTo(cierre)
      }
      cb.current.onPuntos?.(n)
    }
    map.on('pm:drawstart', (e: { workingLayer: L.Layer }) => {
      contar.current(0)
      e.workingLayer.on('pm:vertexadded', () => {
        const ll = (e.workingLayer as L.Polyline).getLatLngs() as L.LatLng[]
        contar.current(ll.length, ll[0])
      })
    })
    map.on('pm:drawend', () => cierre.clearLayers())
    // La pastilla que acompaña al mouse (sólo con mouse: en el celular no hay cursor).
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const el = cursor.current
      if (el) el.style.transform = `translate(${e.containerPoint.x + 18}px, ${e.containerPoint.y + 20}px)`
    })
    map.on('mouseout', () => cursor.current?.style.setProperty('opacity', '0'))
    map.on('mouseover', () => cursor.current?.style.removeProperty('opacity'))
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
    if (contorno && foco) {
      // El mundo con un agujero del tamaño del campo.
      const mundo: LatLng[] = [
        [-89, -179],
        [-89, 179],
        [89, 179],
        [89, -179],
      ]
      L.polygon([mundo, contorno], { stroke: false, fillColor: TINTA, fillOpacity: 0.62, interactive: false }).addTo(g)
    }
    if (contorno && modo !== 'ajustar') {
      L.polygon(contorno, {
        color: TERRACOTA,
        weight: 3,
        fillColor: TERRACOTA,
        fillOpacity: potreros.some((p) => p.poligono) || foco ? 0 : 0.14,
        interactive: false,
      }).addTo(g)
    }
    for (const p of potreros) {
      // El que se está mostrando como borrador va una sola vez, con su etiqueta.
      if (!p.poligono || p.poligono === borrador) continue
      const c = COLOR[p.tipo ?? 'vacio']
      L.polygon(p.poligono, { color: HUESO, weight: 2, fillColor: c.fill, fillOpacity: c.op, interactive: false })
        .bindTooltip(`<b>${p.nombre}</b><span>${p.que}</span>`, {
          permanent: true,
          direction: 'center',
          className: `tropero-etiqueta tropero-etiqueta--${p.tipo ?? 'vacio'}`,
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
        l.bindTooltip(`<b>${borradorNombre}</b>${borradorQue ? `<span>${borradorQue}</span>` : ''}`, {
          permanent: true,
          direction: 'center',
          className: 'tropero-etiqueta tropero-etiqueta--activa',
        })
    }
  }, [contorno, potreros, borrador, borradorNombre, borradorQue, foco, modo, candidato, guia])

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
      const ll = (d?.Polygon?._layer?.getLatLngs() as L.LatLng[] | undefined) ?? []
      contar.current(ll.length, ll[0])
    },
    reiniciar() {
      const map = mapa.current
      if (!map) return
      map.pm.disableDraw()
      map.pm.enableDraw('Polygon', { finishOn: null, continueDrawing: false, tooltips: false })
      contar.current(0)
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
      {pistaCursor && (modo === 'borde' || modo === 'potrero') && (
        <div
          ref={cursor}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-[460] rounded-full bg-tinta/90 px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-superficie shadow-lg transition-opacity [@media(hover:none)]:hidden"
          style={{ transform: 'translate(-999px, -999px)' }}
        >
          {pistaCursor}
        </div>
      )}
    </div>
  )
})

/** El gesto animado (CSS en index.css, «Guía sobre el mapa»). */
function htmlGuia(g: Guia): string {
  const mano =
    '<svg class="guia-mano" viewBox="0 0 24 24" width="44" height="44"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.9-2.6L4.3 14a1.6 1.6 0 0 1 2.5-2l2.2 2.3" fill="#fbfaf6" stroke="#131b16" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  const texto = g.texto ? `<span class="guia-texto">${g.texto}</span>` : ''
  return `<div class="guia guia--${g.tipo}"><span class="guia-onda"></span>${mano}${texto}</div>`
}
