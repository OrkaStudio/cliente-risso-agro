import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CampoMapa } from '@/features/mapa/reglas'
import { ponerSatelite } from '@/features/mapa/satelite'
import { ICONOS_SVG } from '@/components/tropero/iconos-svg'

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

type Potrero = CampoMapa['potreros'][number]
export type Marca = { id: string; tipo: 'molino' | 'laguna' | 'tranquera' | 'manga'; lat: number; lng: number }

const ICONO: Record<Marca['tipo'], string> = { molino: 'Molino', laguna: 'Agua', tranquera: 'Alambrado', manga: 'Manga' }
const svg = (n: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none">${(ICONOS_SVG as Record<string, string>)[n]!.replaceAll('§', ' stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"').replaceAll('¤', ' fill="currentColor"')}</svg>`

/**
 * El campo sobre el satélite, como en el Figma (1050:2, «satélite y nombres
 * legibles»): los potreros con borde blanco y el nombre grande adentro; cada
 * capa los pinta según lo que cuenta. Sólo mirar y tocar: se dibuja aparte.
 * `margenDerecho` deja lugar a la tarjeta que flota a la derecha.
 */
export function MapaCampo({
  campo,
  elegido,
  onElegir,
  onFondo,
  color,
  dato,
  marcas = [],
  margenDerecho = 0,
}: {
  campo: CampoMapa
  elegido: string | null
  onElegir: (id: string) => void
  /** Tocar afuera de los potreros. */
  onFondo?: () => void
  /** Relleno del potrero (null = sin pintar, se ve el satélite). */
  color: (p: Potrero) => string | null
  /** Lo que se lee debajo del nombre. */
  dato: (p: Potrero) => string | null
  /** Molinos, lagunas, tranqueras y mangas del campo. */
  marcas?: Marca[]
  margenDerecho?: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capa = useRef<L.LayerGroup | null>(null)
  const elegir = useRef(onElegir)
  const fondo = useRef(onFondo)
  useEffect(() => {
    elegir.current = onElegir
    fondo.current = onFondo
  }, [onElegir, onFondo])

  // Montar una vez por campo, encuadrado en el campo y dejando lugar a la tarjeta.
  useEffect(() => {
    if (!host.current) return
    const map = L.map(host.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true, zoomSnap: 0.25 })
    mapa.current = map
    const quitar = ponerSatelite(map)
    capa.current = L.layerGroup().addTo(map)
    map.on('click', () => fondo.current?.())
    const puntos = [...(campo.contorno ?? []), ...campo.potreros.flatMap((p) => p.poligono ?? [])]
    const encuadrar = () => {
      if (!puntos.length) return
      const ancho = host.current?.clientWidth ?? 0
      const derecha = ancho > 900 ? margenDerecho : 0
      map.fitBounds(L.latLngBounds(puntos), { paddingTopLeft: [40, 120], paddingBottomRight: [derecha + 40, 70] })
    }
    encuadrar()
    const ro = new ResizeObserver(() => {
      map.invalidateSize()
      encuadrar()
    })
    ro.observe(host.current)
    return () => {
      ro.disconnect()
      quitar()
      map.remove()
      mapa.current = null
    }
  }, [campo.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Los potreros (cambian con la capa y la elección).
  useEffect(() => {
    const g = capa.current
    if (!g) return
    g.clearLayers()
    if (campo.contorno) {
      // Afuera del campo, apagado: lo que importa es lo de adentro.
      const mundo: L.LatLngExpression[] = [
        [-89, -179],
        [-89, 179],
        [89, 179],
        [89, -179],
      ]
      L.polygon([mundo, campo.contorno], { stroke: false, fillColor: '#131b16', fillOpacity: 0.5, interactive: false }).addTo(g)
      L.polygon(campo.contorno, { color: '#fbfaf6', weight: 2.5, opacity: 0.9, fill: false, interactive: false }).addTo(g)
    }
    for (const p of campo.potreros) {
      if (!p.poligono) continue
      const si = p.id === elegido
      // Con uno elegido, los demás se apagan: el elegido se lee solo.
      const otro = !!elegido && !si
      const c = color(p)
      if (si) L.polygon(p.poligono, { color: '#131b16', weight: 12, opacity: 0.45, fill: false, interactive: false }).addTo(g)
      const pol = L.polygon(p.poligono, {
        color: '#fbfaf6',
        weight: si ? 5 : 1.75,
        opacity: otro ? 0.55 : 1,
        fillColor: otro ? '#131b16' : (c ?? '#131b16'),
        fillOpacity: otro ? 0.45 : c ? (si ? 0.85 : 0.5) : si ? 0.18 : 0,
      }).addTo(g)
      pol.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        elegir.current(p.id)
      })
      const d = dato(p)
      pol
        .bindTooltip(`<b>${esc(p.nombre)}</b>${d ? `<span>${esc(d)}</span>` : ''}`, { permanent: true, direction: 'center', className: si ? 'tropero-nombre tropero-nombre--si' : otro ? 'tropero-nombre tropero-nombre--otro' : 'tropero-nombre' })
        .openTooltip()
      if (si) pol.bringToFront()
    }
    for (const m of marcas)
      L.marker([m.lat, m.lng], {
        interactive: false,
        icon: L.divIcon({ className: 'tropero-marca', html: `<span title="${m.tipo}">${svg(ICONO[m.tipo])}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
      }).addTo(g)
  }, [campo, elegido, color, dato, marcas])

  return <div ref={host} className="size-full bg-tinta" role="group" aria-label={`Mapa de ${campo.nombre}`} />
}
