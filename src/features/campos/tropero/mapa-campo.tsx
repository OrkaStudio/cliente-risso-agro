import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CampoMapa } from '@/features/mapa/reglas'
import { ponerSatelite, precargarVista } from '@/features/mapa/satelite'
import { VIAJE, recordarCampo, vistaGeneral } from './vista-mapa'
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
  entrando = false,
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
  /** Viene de «Todos tus campos»: arranca en esa vista y viaja hasta el campo. */
  entrando?: boolean
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
    const map = L.map(host.current, { fadeAnimation: false, zoomControl: false, attributionControl: true, scrollWheelZoom: true, zoomSnap: 0.25 })
    let vivo = true
    mapa.current = map
    const quitar = ponerSatelite(map)
    // Los potreros en su capa: durante el viaje no se ven (estirados se ven borrosos) y al llegar aparecen.
    const capaPotreros = map.createPane('potreros')
    capaPotreros.style.transition = 'opacity 420ms cubic-bezier(0.22, 1, 0.36, 1)'
    capa.current = L.layerGroup().addTo(map)
    map.on('click', () => fondo.current?.())
    const puntos = [...(campo.contorno ?? []), ...campo.potreros.flatMap((p) => p.poligono ?? [])]
    // En la compu el mapa ocupa la pantalla y deja lugar arriba a la barra; en el celular es una
    // tarjeta chica: ahí el campo la llena, dejando arriba lugar al botón de volver a todos.
    const relleno = (): L.FitBoundsOptions => {
      const ancho = host.current?.clientWidth ?? 0
      if (ancho < 600) return { paddingTopLeft: [20, 54], paddingBottomRight: [20, 16] }
      const derecha = ancho > 900 ? margenDerecho : 0
      return { paddingTopLeft: [40, 120], paddingBottomRight: [derecha + 40, 70] }
    }
    const encuadrar = () => {
      // Sin nada dibujado todavía, el satélite de la zona del campo (su localidad) y no un fondo vacío (25/11).
      if (!puntos.length) {
        if (campo.lat != null && campo.lon != null) map.setView([campo.lat, campo.lon], 13, { animate: false })
        // Ni dibujo ni localidad: la provincia de Buenos Aires de lejos, nunca un recuadro vacío.
        else map.setView([-36.6, -60.2], 6, { animate: false })
        return
      }
      map.fitBounds(L.latLngBounds(puntos), relleno())
    }
    const desde = entrando ? vistaGeneral() : null
    if (desde && puntos.length) {
      // El viaje: desde donde estaba la vista general hasta el campo, en un solo movimiento.
      capaPotreros.style.opacity = '0'
      map.setView([desde.lat, desde.lng], desde.zoom, { animate: false })
      const destino = L.latLngBounds(puntos)
      const r = relleno()
      const [izq, arriba] = r.paddingTopLeft as [number, number]
      const [der, abajo] = r.paddingBottomRight as [number, number]
      const z = map.getBoundsZoom(destino, false, L.point(izq + der, arriba + abajo))
      // Antes de viajar, pide las imágenes de donde va a llegar (sin huecos oscuros en el camino).
      void precargarVista(map, destino.pad(0.6), z).then(() => {
        if (!vivo) return
        map.once('moveend', () => (capaPotreros.style.opacity = '1'))
        map.flyToBounds(destino, { ...r, duration: VIAJE, easeLinearity: 0.1 })
      })
    } else encuadrar()
    // Dónde quedó: la vuelta a «Todos tus campos» arranca acá.
    map.on('moveend', () => {
      const m = map.getCenter()
      recordarCampo(campo.id, { lat: m.lat, lng: m.lng, zoom: map.getZoom() })
    })
    let ancho = host.current.clientWidth
    const ro = new ResizeObserver(() => {
      map.invalidateSize()
      if (host.current && Math.abs(host.current.clientWidth - ancho) > 4) {
        ancho = host.current.clientWidth
        encuadrar()
      }
    })
    ro.observe(host.current)
    return () => {
      vivo = false
      ro.disconnect()
      map.off()
      map.stop()
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
      L.polygon([mundo, campo.contorno], { pane: 'potreros', stroke: false, fillColor: '#131b16', fillOpacity: 0.5, interactive: false }).addTo(g)
      L.polygon(campo.contorno, { pane: 'potreros', color: '#fbfaf6', weight: 2.5, opacity: 0.9, fill: false, interactive: false }).addTo(g)
    }
    // Los nombres de potreros chicos se pisan: el que no entra en su potrero o choca con
    // uno ya puesto (de mayor a menor) se esconde hasta acercarse. El potrero sigue
    // tocándose; el nombre del elegido se ve siempre.
    const nombres: { el: () => HTMLElement | undefined; area: number; si: boolean; poligono: L.LatLng[] }[] = []
    for (const p of campo.potreros) {
      if (!p.poligono) continue
      const si = p.id === elegido
      // Con uno elegido, los demás se apagan: el elegido se lee solo.
      const otro = !!elegido && !si
      const c = color(p)
      if (si) L.polygon(p.poligono, { pane: 'potreros', color: '#131b16', weight: 12, opacity: 0.45, fill: false, interactive: false }).addTo(g)
      const pol = L.polygon(p.poligono, {
        pane: 'potreros',
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
        .bindTooltip(`<b>${esc(p.nombre)}</b>${d ? `<span>${esc(d)}</span>` : ''}`, { pane: 'potreros', permanent: true, direction: 'center', className: si ? 'tropero-nombre tropero-nombre--si' : otro ? 'tropero-nombre tropero-nombre--otro' : 'tropero-nombre' })
        .openTooltip()
      const b = pol.getBounds()
      nombres.push({ el: () => pol.getTooltip()?.getElement(), area: (b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest()), si, poligono: (pol.getLatLngs() as L.LatLng[][])[0] ?? [] })
      if (si) pol.bringToFront()
    }
    const map = mapa.current
    const acomodar = () => {
      const puestos: DOMRect[] = []
      for (const n of [...nombres].sort((a, b) => Number(b.si) - Number(a.si) || b.area - a.area)) {
        const el = n.el()
        if (!el) continue
        el.classList.remove('tropero-nombre--oculto')
        const r = el.getBoundingClientRect()
        const choca = puestos.some((q) => r.left < q.right + 2 && r.right > q.left - 2 && r.top < q.bottom + 2 && r.bottom > q.top - 2)
        // Lo que ocupa el potrero en pantalla: si el nombre no entra holgado, se sale sobre los vecinos.
        const pts = map ? n.poligono.map((ll) => map.latLngToContainerPoint(ll)) : []
        const areaPx = Math.abs(pts.reduce((t, p, i) => t + p.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * p.y, 0)) / 2
        const noEntra = pts.length > 2 && areaPx < r.width * r.height * 2.5
        if ((choca || noEntra) && !n.si) el.classList.add('tropero-nombre--oculto')
        else puestos.push(r)
      }
    }
    // Después de que el mapa ubica los nombres (al terminar de moverse o de acercarse).
    let cuadro = 0
    const programar = () => {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(acomodar)
    }
    programar()
    map?.on('zoomend moveend', programar)
    for (const m of marcas)
      L.marker([m.lat, m.lng], {
        pane: 'potreros',
        interactive: false,
        icon: L.divIcon({ className: 'tropero-marca', html: `<span title="${m.tipo}">${svg(ICONO[m.tipo])}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
      }).addTo(g)
    return () => {
      cancelAnimationFrame(cuadro)
      map?.off('zoomend moveend', programar)
    }
  }, [campo, elegido, color, dato, marcas])

  return <div ref={host} className="size-full bg-tinta" role="group" aria-label={`Mapa de ${campo.nombre}`} />
}
