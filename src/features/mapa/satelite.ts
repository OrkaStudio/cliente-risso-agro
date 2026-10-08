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
  const esri = L.tileLayer(ESRI, { maxZoom: 19, maxNativeZoom: 17, attribution: '© Esri' }).addTo(map)
  const caminos = L.tileLayer(ESRI_CAMINOS, { maxZoom: 19, maxNativeZoom: 17, opacity: 0.9 }).addTo(map)
  let vivo = true
  void (async () => {
    if (!googleTilesDisponible()) return
    const [sat, ov] = await Promise.all([sesionGoogle('satellite'), sesionGoogle('overlay')])
    if (!vivo || !sat) return
    const g = L.tileLayer(urlTilesGoogle(sat), { maxZoom: 21, maxNativeZoom: 20, attribution: 'Google' })
    g.on('load', () => map.hasLayer(esri) && map.removeLayer(esri))
    g.addTo(map)
    if (ov) {
      L.tileLayer(urlTilesGoogle(ov), { maxZoom: 21, maxNativeZoom: 20, opacity: 0.95 }).addTo(map)
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
