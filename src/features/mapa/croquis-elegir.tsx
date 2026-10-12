import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import type { CampoMapa } from './reglas'
import { ponerSatelite } from './satelite'

const HUESO = '#fbfaf6'
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const TERRACOTA = '#b85c2e'

/**
 * El campo sobre el satélite para ELEGIR un potrero tocándolo (página 35:
 * «Los vendí · ¿De qué potrero y cuántos?»). Sólo mirar y tocar: no se dibuja
 * ni se edita. Cada potrero lleva su nombre y lo que cuenta `dato`; los
 * que no sirven para esta elección (`apagado`) se ven pero no se tocan.
 */
export function CroquisElegir({
  campo,
  elegido,
  onElegir,
  dato = (p) => (p.cabezas ? `${p.cabezas} cab` : null),
  apagado = () => false,
  className,
}: {
  campo: CampoMapa
  elegido: string | null
  onElegir: (potreroId: string) => void
  /** Lo que se lee debajo del nombre («60 cab», «18 terneros»); null = sólo el nombre. */
  dato?: (p: CampoMapa['potreros'][number]) => string | null
  apagado?: (p: CampoMapa['potreros'][number]) => boolean
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capa = useRef<L.LayerGroup | null>(null)
  const elegir = useRef(onElegir)
  useEffect(() => {
    elegir.current = onElegir
  }, [onElegir])

  // Montar una vez por campo.
  useEffect(() => {
    if (!host.current) return
    const map = L.map(host.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, zoomSnap: 0.25 })
    mapa.current = map
    const quitar = ponerSatelite(map)
    capa.current = L.layerGroup().addTo(map)
    const puntos = [...(campo.contorno ?? []), ...campo.potreros.flatMap((p) => p.poligono ?? [])]
    if (puntos.length) map.fitBounds(L.latLngBounds(puntos), { padding: [18, 18] })
    else if (campo.lat != null && campo.lon != null) map.setView([campo.lat, campo.lon], 14)
    // Si el contenedor cambia de tamaño (el panel se ensancha), reencuadrar.
    const ro = new ResizeObserver(() => {
      map.invalidateSize()
      if (puntos.length) map.fitBounds(L.latLngBounds(puntos), { padding: [18, 18] })
    })
    ro.observe(host.current)
    // El panel entra animado: recalcular el tamaño cuando termina.
    const t = window.setTimeout(() => {
      map.invalidateSize()
      if (puntos.length) map.fitBounds(L.latLngBounds(puntos), { padding: [18, 18] })
    }, 350)
    return () => {
      ro.disconnect()
      window.clearTimeout(t)
      quitar()
      map.remove()
      mapa.current = null
    }
  }, [campo.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dibujar los potreros (cambia con la elección).
  useEffect(() => {
    const g = capa.current
    if (!g) return
    g.clearLayers()
    if (campo.contorno) L.polygon(campo.contorno, { color: HUESO, weight: 2, fill: false, dashArray: '6 6', interactive: false }).addTo(g)
    for (const p of campo.potreros) {
      if (!p.poligono) continue
      const si = p.id === elegido
      const off = apagado(p)
      const pol = L.polygon(p.poligono, {
        color: si ? HUESO : 'rgba(251,250,246,0.85)',
        weight: si ? 3 : 1.5,
        fillColor: si ? TERRACOTA : off ? '#131b16' : HUESO,
        fillOpacity: si ? 0.85 : off ? 0.35 : 0.12,
        interactive: !off,
      }).addTo(g)
      if (!off) pol.on('click', () => elegir.current(p.id))
      pol
        .bindTooltip(`<b>${esc(p.nombre)}</b>${dato(p) ? `<span>${esc(dato(p)!)}</span>` : ''}`, {
          permanent: true,
          direction: 'center',
          className: cn('tropero-etiqueta', si && 'tropero-etiqueta--hacienda', off && 'opacity-60'),
        })
        .openTooltip()
    }
  }, [campo, elegido, dato, apagado])

  return <div ref={host} className={cn('h-[360px] overflow-hidden rounded-[20px] bg-tinta', className)} role="group" aria-label={`Croquis de ${campo.nombre}`} />
}
