import L from 'leaflet'
import { atribucionGoogle, googleTilesDisponible, sesionGoogle, urlTilesGoogle } from '@/lib/google-tiles'

const ESRI =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_CAMINOS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'

/**
 * La imagen satelital del mapa (la misma que Campos): Esri siempre, y Google
 * encima si hay clave (mejor imagen en la pampa). La atribución es condición de
 * la licencia: se achica, no se quita. Devuelve con qué limpiar al desmontar.
 */
export function ponerSatelite(map: L.Map): () => void {
  map.attributionControl.setPrefix(false)
  // Debajo de todo, el mismo satélite en baja resolución: pocos cuadros grandes que cargan al
  // toque. Mientras la cámara viaja, donde la imagen nítida no llegó se ve el campo borroso, no
  // negro (Lau, 09/11: «los bordes parpadean en negro»).
  L.tileLayer(ESRI, { maxZoom: 21, maxNativeZoom: 9, minZoom: 0, keepBuffer: 4, zIndex: 0, updateWhenZooming: false }).addTo(map)
  // Conserva más cuadros alrededor de la vista: al moverse, los bordes ya están.
  const esri = L.tileLayer(ESRI, { maxZoom: 19, maxNativeZoom: 17, attribution: '© Esri', keepBuffer: 6, zIndex: 1 }).addTo(map)
  const caminos = L.tileLayer(ESRI_CAMINOS, { maxZoom: 19, maxNativeZoom: 17, opacity: 0.9, keepBuffer: 6, zIndex: 3 }).addTo(map)
  let vivo = true
  void (async () => {
    if (!googleTilesDisponible()) return
    const [sat, ov] = await Promise.all([sesionGoogle('satellite'), sesionGoogle('overlay')])
    if (!vivo || !sat) return
    const g = L.tileLayer(urlTilesGoogle(sat), { maxZoom: 21, maxNativeZoom: 20, attribution: 'Google', keepBuffer: 6, zIndex: 2 })
    g.on('load', () => map.hasLayer(esri) && map.removeLayer(esri))
    g.addTo(map)
    if (ov) {
      L.tileLayer(urlTilesGoogle(ov), { maxZoom: 21, maxNativeZoom: 20, opacity: 0.95, keepBuffer: 6, zIndex: 3 }).addTo(map)
      map.removeLayer(caminos)
    }
    const refrescar = async () => {
      const b = map.getBounds()
      const txt = await atribucionGoogle(sat, {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
        zoom: map.getZoom(),
      })
      if (vivo && txt) {
        map.attributionControl.removeAttribution('Google')
        map.attributionControl.addAttribution(txt)
      }
    }
    void refrescar()
    map.on('moveend', () => void refrescar())
  })()
  return () => {
    vivo = false
  }
}

/**
 * Pide de antemano las imágenes de una vista (la nítida y la de fondo), para que el viaje de la
 * cámara llegue con todo cargado. Termina cuando cargaron o a los `espera` ms, lo que pase antes.
 */
export function precargarVista(map: L.Map, limites: L.LatLngBounds, zoom: number, espera = 450): Promise<void> {
  const urls: string[] = []
  const cuadros = (z: number) => {
    const a = map.project(limites.getNorthWest(), z).divideBy(256).floor()
    const b = map.project(limites.getSouthEast(), z).divideBy(256).floor()
    for (let x = a.x - 1; x <= b.x + 1; x++) for (let y = a.y - 1; y <= b.y + 1; y++) urls.push(ESRI.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x)))
  }
  cuadros(Math.min(17, Math.round(zoom)))
  // A mitad del viaje la cámara se aleja un poco más que el destino: también ese nivel.
  cuadros(Math.max(3, Math.min(17, Math.round(zoom) - 1)))
  cuadros(Math.min(9, Math.round(zoom)))
  const cargas = urls.slice(0, 140).map(
    (u) =>
      new Promise<void>((ok) => {
        const i = new Image()
        i.onload = i.onerror = () => ok()
        i.src = u
      }),
  )
  return Promise.race([Promise.all(cargas).then(() => undefined), new Promise<void>((ok) => setTimeout(ok, espera))])
}
