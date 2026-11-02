import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CampoMapa } from '@/features/mapa/reglas'
import { ponerSatelite } from '@/features/mapa/satelite'

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export type CampoEnMapa = { campo: CampoMapa; letra: string; color: string }

/**
 * Todos los campos juntos sobre el satélite («Todos tus campos», Lau 29/10):
 * el borde de cada uno con su color y su letra, sus potreros en blanco fino, y
 * encuadrado para que entren todos. Tocar un campo lo elige (como en la barra).
 * Un campo sin borde todavía se marca en su pueblo, con su letra.
 */
export function MapaCampos({ campos, onElegir, margenDerecho = 0 }: { campos: CampoEnMapa[]; onElegir: (id: string) => void; margenDerecho?: number }) {
  const host = useRef<HTMLDivElement>(null)
  const capa = useRef<L.LayerGroup | null>(null)
  const elegir = useRef(onElegir)
  useEffect(() => {
    elegir.current = onElegir
  }, [onElegir])

  const clave = campos.map((c) => c.campo.id).join(',')
  useEffect(() => {
    if (!host.current) return
    const map = L.map(host.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true, zoomSnap: 0.25 })
    const quitar = ponerSatelite(map)
    const g = L.layerGroup().addTo(map)
    capa.current = g
    const puntos: L.LatLngExpression[] = []
    for (const { campo, letra, color } of campos) {
      const etiqueta = `<b><i style="background:${color}">${esc(letra)}</i>${esc(campo.nombre)}</b>`
      if (campo.contorno?.length) {
        puntos.push(...campo.contorno)
        for (const p of campo.potreros) if (p.poligono) L.polygon(p.poligono, { color: '#fbfaf6', weight: 1, opacity: 0.7, fill: false, interactive: false }).addTo(g)
        const borde = L.polygon(campo.contorno, { color, weight: 3, opacity: 1, fillColor: color, fillOpacity: 0.18 }).addTo(g)
        borde.on('click', () => elegir.current(campo.id))
        borde.bindTooltip(etiqueta, { permanent: true, direction: 'center', className: 'tropero-campo' }).openTooltip()
      } else if (campo.lat != null && campo.lon != null) {
        puntos.push([campo.lat, campo.lon])
        const m = L.marker([campo.lat, campo.lon], { icon: L.divIcon({ className: 'tropero-campo tropero-campo--pin', html: etiqueta, iconSize: undefined }) }).addTo(g)
        m.on('click', () => elegir.current(campo.id))
      }
    }
    const encuadrar = () => {
      if (!puntos.length) return
      const derecha = (host.current?.clientWidth ?? 0) > 900 ? margenDerecho : 0
      map.fitBounds(L.latLngBounds(puntos), { paddingTopLeft: [60, 60], paddingBottomRight: [derecha + 60, 60], maxZoom: 15 })
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
      capa.current = null
    }
  }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="size-full bg-tinta" role="group" aria-label="Mapa de todos tus campos" />
}
