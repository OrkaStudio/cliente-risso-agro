import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CampoMapa } from '@/features/mapa/reglas'
import { ponerSatelite } from '@/features/mapa/satelite'

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export type CampoEnMapa = { campo: CampoMapa; letra: string; color: string }

/** Cuánto dura el viaje de la cámara al entrar a un campo y al volver (s). */
const VIAJE = 0.9

/** Los límites de un campo: su borde o, si todavía no lo tiene, un recuadro chico en su pueblo. */
function limites(c: CampoMapa): L.LatLngBounds | null {
  if (c.contorno?.length) return L.latLngBounds(c.contorno)
  if (c.lat != null && c.lon != null) return L.latLngBounds([c.lat - 0.012, c.lon - 0.018], [c.lat + 0.012, c.lon + 0.018])
  return null
}

/**
 * Todos los campos sobre el satélite, como vista central de Campos (Lau, 09/11):
 * - cada campo con su borde, su color y su etiqueta; si dos etiquetas se pisan,
 *   se juntan en una («2 campos: A C») que al tocarla acerca hasta separarlas;
 * - tocar un campo hace zoom hasta él y recién ahí se abre (`onElegir`);
 * - al volver de un campo (`desde`), arranca encuadrado en él y se aleja hasta
 *   ver todos: el mismo viaje, al revés.
 */
export function MapaCampos({ campos, onElegir, margenDerecho = 0, desde = null, pedido = null }: { campos: CampoEnMapa[]; onElegir: (id: string) => void; margenDerecho?: number; desde?: string | null; /** Un campo tocado afuera del mapa (la lista): viaja hasta él igual. */ pedido?: string | null }) {
  const host = useRef<HTMLDivElement>(null)
  const elegir = useRef(onElegir)
  const irA = useRef<(id: string) => void>(() => {})
  useEffect(() => {
    elegir.current = onElegir
  }, [onElegir])

  const clave = campos.map((c) => c.campo.id).join(',')
  useEffect(() => {
    if (!host.current) return
    const map = L.map(host.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true, zoomSnap: 0.25 })
    const quitar = ponerSatelite(map)
    const formas = L.layerGroup().addTo(map)
    const etiquetas = L.layerGroup().addTo(map)
    const margen = () => ((host.current?.clientWidth ?? 0) > 900 ? margenDerecho : 0)
    const opciones = (): L.FitBoundsOptions => ({ paddingTopLeft: [70, 70], paddingBottomRight: [margen() + 70, 70], maxZoom: 15 })
    let viajando = false
    const timers: ReturnType<typeof setTimeout>[] = []

    // Entrar a un campo: la cámara viaja hasta él y, al llegar, se abre.
    const entrar = (c: CampoMapa) => {
      const b = limites(c)
      if (!b || viajando) return
      viajando = true
      etiquetas.clearLayers()
      // Se abre un instante después de llegar: el mapa termina su animación antes de desarmarse.
      map.once('moveend', () => (timers.push(setTimeout(() => elegir.current(c.id), 60))))
      map.flyToBounds(b, { ...opciones(), maxZoom: 16, duration: VIAJE, easeLinearity: 0.2 })
    }

    irA.current = (id: string) => {
      const c = campos.find((x) => x.campo.id === id)
      if (c) entrar(c.campo)
    }
    const todos = campos.map((x) => ({ ...x, b: limites(x.campo) })).filter((x): x is CampoEnMapa & { b: L.LatLngBounds } => !!x.b)
    for (const { campo, color, b } of todos) {
      for (const p of campo.potreros) if (p.poligono) L.polygon(p.poligono, { color: '#fbfaf6', weight: 1, opacity: 0.7, fill: false, interactive: false }).addTo(formas)
      if (campo.contorno?.length) {
        const borde = L.polygon(campo.contorno, { color, weight: 3, opacity: 1, fillColor: color, fillOpacity: 0.18 }).addTo(formas)
        borde.on('click', () => entrar(campo))
      } else {
        L.circleMarker(b.getCenter(), { radius: 7, color: '#fbfaf6', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(formas).on('click', () => entrar(campo))
      }
    }

    // Las etiquetas, sin pisarse: se miden en pantalla y las que se tocan se juntan en una.
    const ponerEtiquetas = () => {
      if (viajando) return
      etiquetas.clearLayers()
      const cajas = todos.map((t) => {
        const p = map.latLngToContainerPoint(t.b.getCenter())
        const w = 52 + t.campo.nombre.length * 8.6
        return { t, p, x0: p.x - w / 2 - 6, x1: p.x + w / 2 + 6, y0: p.y - 22, y1: p.y + 22 }
      })
      const grupo = cajas.map((_, i) => i)
      const raiz = (i: number): number => (grupo[i] === i ? i : (grupo[i] = raiz(grupo[i]!)))
      for (let i = 0; i < cajas.length; i++)
        for (let j = i + 1; j < cajas.length; j++) {
          const a = cajas[i]!
          const c = cajas[j]!
          if (a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1) grupo[raiz(i)] = raiz(j)
        }
      const grupos = new Map<number, typeof cajas>()
      cajas.forEach((c, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), c]))
      for (const g of grupos.values()) {
        if (g.length === 1) {
          const { t } = g[0]!
          const html = `<b><i style="background:${t.color}">${esc(t.letra)}</i>${esc(t.campo.nombre)}</b>`
          L.marker(t.b.getCenter(), { icon: L.divIcon({ className: 'tropero-campo tropero-campo--pin', html, iconSize: undefined }), keyboard: false })
            .addTo(etiquetas)
            .on('click', () => entrar(t.campo))
          continue
        }
        // Varios juntos: una etiqueta con sus letras; tocarla acerca hasta que se separan.
        const centro = L.latLngBounds(g.map((c) => c.t.b.getCenter())).getCenter()
        const letras = g.map((c) => `<i style="background:${c.t.color}">${esc(c.t.letra)}</i>`).join('')
        const html = `<b class="tropero-campo-grupo">${letras}<span>${g.length} campos</span></b>`
        const caja = g.reduce((acc, c) => acc.extend(c.t.b), L.latLngBounds(g[0]!.t.b.getSouthWest(), g[0]!.t.b.getNorthEast()))
        L.marker(centro, { icon: L.divIcon({ className: 'tropero-campo tropero-campo--pin', html, iconSize: undefined }), keyboard: false })
          .addTo(etiquetas)
          .on('click', () => map.flyToBounds(caja, { ...opciones(), maxZoom: 16, duration: 0.7 }))
      }
    }
    map.on('zoomend moveend', ponerEtiquetas)

    const todo = todos.length ? todos.reduce((acc, t) => acc.extend(t.b), L.latLngBounds(todos[0]!.b.getSouthWest(), todos[0]!.b.getNorthEast())) : null
    const encuadrar = () => todo && map.fitBounds(todo, opciones())
    // Volviendo de un campo: arranca en él y se aleja hasta ver todos (el zoom al revés).
    const de = desde ? todos.find((t) => t.campo.id === desde) : null
    if (de && todo) {
      map.fitBounds(de.b, { ...opciones(), maxZoom: 16 })
      timers.push(setTimeout(() => map.flyToBounds(todo, { ...opciones(), duration: VIAJE, easeLinearity: 0.2 }), 120))
    } else encuadrar()
    ponerEtiquetas()

    let ancho = host.current.clientWidth
    const ro = new ResizeObserver(() => {
      map.invalidateSize()
      // Sólo si cambió el ancho de verdad (no en medio del viaje).
      if (!viajando && host.current && Math.abs(host.current.clientWidth - ancho) > 4) {
        ancho = host.current.clientWidth
        encuadrar()
      }
    })
    ro.observe(host.current)
    return () => {
      timers.forEach(clearTimeout)
      ro.disconnect()
      map.off()
      map.stop()
      quitar()
      map.remove()
    }
  }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pedido) irA.current(pedido)
  }, [pedido])

  return <div ref={host} className="size-full bg-tinta" role="group" aria-label="Mapa de todos tus campos" />
}
