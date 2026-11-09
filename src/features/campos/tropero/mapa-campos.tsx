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
    // Los bordes van en su propia capa: durante el viaje de la cámara se desvanecen (estirados se
    // veían como una mancha borrosa, Lau 09/11) y vuelven al llegar.
    const capaFormas = map.createPane('formas')
    capaFormas.style.transition = 'opacity 260ms ease'
    const verFormas = (si: boolean) => (capaFormas.style.opacity = si ? '1' : '0')
    const formas = L.layerGroup().addTo(map)
    const etiquetas = L.layerGroup().addTo(map)
    // La tarjeta flota sobre el mapa desde el ancho «lg» (1024 px): ahí los campos se encuadran a su izquierda.
    const margen = () => (window.innerWidth >= 1024 ? margenDerecho : 0)
    const opciones = (): L.FitBoundsOptions => ({ paddingTopLeft: [70, 70], paddingBottomRight: [margen() + 70, 70], maxZoom: 15 })
    let viajando = false
    const timers: ReturnType<typeof setTimeout>[] = []

    // Entrar a un campo: la cámara viaja hasta él y, al llegar, se abre.
    const entrar = (c: CampoMapa) => {
      const b = limites(c)
      if (!b || viajando) return
      viajando = true
      etiquetas.clearLayers()
      verFormas(false)
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
      for (const p of campo.potreros) if (p.poligono) L.polygon(p.poligono, { pane: 'formas', color: '#fbfaf6', weight: 1, opacity: 0.7, fill: false, interactive: false }).addTo(formas)
      if (campo.contorno?.length) {
        const borde = L.polygon(campo.contorno, { pane: 'formas', color, weight: 3, opacity: 1, fillColor: color, fillOpacity: 0.18 }).addTo(formas)
        borde.on('click', () => entrar(campo))
      } else {
        L.circleMarker(b.getCenter(), { pane: 'formas', radius: 7, color: '#fbfaf6', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(formas).on('click', () => entrar(campo))
      }
    }

    // Las etiquetas, cada campo con la suya y sin pisarse (Lau, 09/11): si su lugar está ocupado,
    // se corre al primer lugar libre alrededor y una línea fina la une a su campo.
    const ponerEtiquetas = () => {
      if (viajando || !host.current) return
      etiquetas.clearLayers()
      const W = host.current.clientWidth
      const H = host.current.clientHeight
      const limiteDerecho = W - margen() - 12
      const ocupado: { x0: number; x1: number; y0: number; y1: number }[] = []
      const choca = (r: { x0: number; x1: number; y0: number; y1: number }) => ocupado.some((o) => r.x0 < o.x1 + 8 && o.x0 < r.x1 + 8 && r.y0 < o.y1 + 6 && o.y0 < r.y1 + 6)
      const orden = [...todos].sort((a, b) => map.latLngToContainerPoint(a.b.getCenter()).y - map.latLngToContainerPoint(b.b.getCenter()).y)
      for (const t of orden) {
        const p = map.latLngToContainerPoint(t.b.getCenter())
        const w = Math.round(48 + t.campo.nombre.length * 8.8)
        const h = 36
        // Lugares a probar: el propio, y después alrededor, cada vez más lejos.
        const lugares: [number, number][] = [[0, 0]]
        for (const r of [46, 84, 124, 170, 220])
          for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]] as const) lugares.push([dx * (r + w / 2 - 20), dy * r])
        let elegido: { cx: number; cy: number } | null = null
        for (const [dx, dy] of lugares) {
          const cx = p.x + dx
          const cy = p.y + dy
          const r = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 }
          if (r.x0 < 8 || r.y0 < 8 || r.x1 > limiteDerecho || r.y1 > H - 8 || choca(r)) continue
          elegido = { cx, cy }
          ocupado.push(r)
          break
        }
        elegido ??= { cx: p.x, cy: p.y }
        const centro = map.containerPointToLatLng([elegido.cx, elegido.cy])
        if (Math.hypot(elegido.cx - p.x, elegido.cy - p.y) > 4) {
          L.polyline([t.b.getCenter(), centro], { color: '#fbfaf6', weight: 2, opacity: 0.9, interactive: false }).addTo(etiquetas)
          L.circleMarker(t.b.getCenter(), { radius: 4, color: '#fbfaf6', weight: 2, fillColor: t.color, fillOpacity: 1, interactive: false }).addTo(etiquetas)
        }
        const html = `<b><i style="background:${t.color}">${esc(t.letra)}</i>${esc(t.campo.nombre)}</b>`
        L.marker(centro, { icon: L.divIcon({ className: 'tropero-campo tropero-campo--pin', html, iconSize: [w, h], iconAnchor: [w / 2, h / 2] }), keyboard: false, riseOnHover: true })
          .addTo(etiquetas)
          .on('click', () => entrar(t.campo))
      }
    }
    map.on('zoomend moveend', ponerEtiquetas)

    const todo = todos.length ? todos.reduce((acc, t) => acc.extend(t.b), L.latLngBounds(todos[0]!.b.getSouthWest(), todos[0]!.b.getNorthEast())) : null
    const encuadrar = () => todo && map.fitBounds(todo, opciones())
    // Volviendo de un campo: arranca en él y se aleja hasta ver todos (el zoom al revés).
    const de = desde ? todos.find((t) => t.campo.id === desde) : null
    if (de && todo) {
      // Arranca cerca del campo, pero no tan cerca: con un salto más corto el satélite llega a cargar
      // mientras se aleja (de muy cerca quedaban cuadros grises).
      // En viaje desde antes de mover la cámara: las etiquetas recién aparecen al llegar.
      viajando = true
      verFormas(false)
      const lejos = map.getBoundsZoom(todo, false, L.point(140 + margen(), 140))
      map.setView(de.b.getCenter(), Math.min(map.getBoundsZoom(de.b), lejos + 2), { animate: false })
      map.once('moveend', () => {
        viajando = false
        verFormas(true)
        ponerEtiquetas()
      })
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
