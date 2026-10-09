import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ponerSatelite } from '@/features/mapa/satelite'
import type { CampoMapa } from '@/features/mapa/reglas'
import type { Nivel, PotreroAtencion } from '../para-atender-api'

const COLOR: Record<Nivel, string> = { atender: '#b3372a', prevenir: '#d38f1d', nota: '#7c8b69' }

/**
 * «Lo que dejó la recorrida» (página 35): el campo en el satélite con cada
 * potrero; los que piden atención, llenos en su color y con lo que pasa
 * arriba. Quieto: es para ver, no para mover.
 */
export function CroquisRecorrida({ campo, atencion }: { campo: CampoMapa; atencion: PotreroAtencion[] }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current || !campo.contorno) return
    const map = L.map(host.current, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      zoomSnap: 0.25,
    })
    const quitar = ponerSatelite(map)
    map.fitBounds(L.latLngBounds(campo.contorno), { padding: [24, 24] })
    L.polygon(campo.contorno, { color: '#fbfaf6', weight: 2, fill: false, interactive: false }).addTo(map)
    for (const p of campo.potreros) {
      if (!p.poligono) continue
      const a = atencion.find((x) => x.potrero === p.nombre && x.campo === campo.nombre)
      const l = L.polygon(p.poligono, {
        color: '#fbfaf6',
        weight: 1.5,
        fillColor: a ? COLOR[a.nivel] : '#000',
        fillOpacity: a ? 0.85 : 0,
        interactive: false,
      }).addTo(map)
      const que = a ? `<span class="inicio-croquis-chip" style="background:${COLOR[a.nivel]}">${a.avisos[0]!.titulo}${a.hace > 0 ? ` · hace ${a.hace} ${a.hace === 1 ? 'día' : 'días'}` : ''}</span>` : ''
      l.bindTooltip(`${que}<b>${p.nombre}</b>`, { permanent: true, direction: 'center', className: 'inicio-croquis-etiqueta' })
    }
    const ro = new ResizeObserver(() => {
      map.invalidateSize()
      map.fitBounds(L.latLngBounds(campo.contorno!), { padding: [24, 24] })
    })
    ro.observe(host.current)
    return () => {
      ro.disconnect()
      quitar()
      map.remove()
    }
  }, [campo, atencion])

  return <div ref={host} className="h-[430px] w-full overflow-hidden rounded-[12px] bg-[#2b3526]" aria-label={`Croquis de ${campo.nombre}`} />
}
