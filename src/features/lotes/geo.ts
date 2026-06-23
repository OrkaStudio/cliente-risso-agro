// Geometría de potreros trazada sobre satélite (Fase 0). Se guarda en
// localStorage para que el trazado no se pierda al refrescar. Más adelante va a
// una columna geográfica (geojson / PostGIS) en Supabase.
export type LatLng = [number, number] // [lat, lng]

const LS = 'risso-potrero-geo'
const keyOf = (campoId: string, numero: string) => `${campoId}::${numero}`

function load(): Record<string, LatLng[]> {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? '{}')
  } catch {
    return {}
  }
}

const geo: Record<string, LatLng[]> = load()

function persist() {
  try {
    localStorage.setItem(LS, JSON.stringify(geo))
  } catch {
    /* sin persistencia si no hay storage */
  }
}

export function setGeo(campoId: string, numero: string, coords: LatLng[]) {
  geo[keyOf(campoId, numero)] = coords
  persist()
}

export function deleteGeo(campoId: string, numero: string) {
  delete geo[keyOf(campoId, numero)]
  persist()
}

/** Geometrías trazadas de un campo: { numero: coords }. */
export function allGeo(campoId: string): Record<string, LatLng[]> {
  const out: Record<string, LatLng[]> = {}
  for (const k of Object.keys(geo)) {
    const [c, numero] = k.split('::')
    if (c === campoId) out[numero] = geo[k]
  }
  return out
}

// ===== Contorno del campo (parcela del catastro) =====
const LSB = 'risso-campo-boundary'

function loadB(): Record<string, LatLng[]> {
  try {
    return JSON.parse(localStorage.getItem(LSB) ?? '{}')
  } catch {
    return {}
  }
}

const boundaries: Record<string, LatLng[]> = loadB()

function persistB() {
  try {
    localStorage.setItem(LSB, JSON.stringify(boundaries))
  } catch {
    /* sin persistencia */
  }
}

export function setCampoBoundary(campoId: string, coords: LatLng[]) {
  boundaries[campoId] = coords
  persistB()
}

export function getCampoBoundary(campoId: string): LatLng[] | undefined {
  return boundaries[campoId]
}

export function deleteCampoBoundary(campoId: string) {
  delete boundaries[campoId]
  persistB()
}

// ===== Vista del mapa por campo (centro + zoom) =====
export type CampoView = { center: LatLng; zoom: number }

const LSV = 'risso-campo-view'

function loadV(): Record<string, CampoView> {
  try {
    return JSON.parse(localStorage.getItem(LSV) ?? '{}')
  } catch {
    return {}
  }
}

const views: Record<string, CampoView> = loadV()

function persistV() {
  try {
    localStorage.setItem(LSV, JSON.stringify(views))
  } catch {
    /* sin persistencia */
  }
}

export function setCampoView(campoId: string, v: CampoView) {
  views[campoId] = v
  persistV()
}

export function getCampoView(campoId: string): CampoView | undefined {
  return views[campoId]
}

export function deleteCampoView(campoId: string) {
  delete views[campoId]
  persistV()
}
