// Importación one-time: pasa los dibujos guardados en localStorage (Fase 0)
// a la base real. Crea/encuentra los campos y potreros por nombre y les copia
// la geometría + infraestructura. Idempotente: re-correrlo no duplica campos
// ni potreros (match por nombre) y reemplaza la infraestructura del campo.
import { supabase } from '@/lib/supabase/client'
import * as api from '@/features/campos/api'
import { campos as mockCampos, potreros as mockPotreros } from '@/features/lotes/mock'
import { allGeo, getCampoBoundary, getMarkers } from '@/features/lotes/geo'

export type ResultadoImport = {
  campos: number
  potreros: number
  infraestructura: number
}

async function findOrCreateCampo(
  empresaId: string,
  nombre: string,
  tenencia: 'propio' | 'arrendado',
  hectareas: number,
): Promise<string> {
  const { data, error } = await supabase
    .from('campo')
    .select('id')
    .eq('nombre', nombre)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return data.id
  return api.crearCampo({
    empresaId,
    nombre,
    tipo: tenencia === 'arrendado' ? 'alquilado' : 'propio',
    hectareas,
  })
}

async function findOrCreatePotrero(
  empresaId: string,
  campoId: string,
  nombre: string,
  hectareas: number | null,
): Promise<string> {
  const { data, error } = await supabase
    .from('potrero')
    .select('id')
    .eq('campo_id', campoId)
    .eq('nombre', nombre)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return data.id
  const { data: nuevo, error: e2 } = await supabase
    .from('potrero')
    .insert({ empresa_id: empresaId, campo_id: campoId, nombre, hectareas })
    .select('id')
    .single()
  if (e2) throw new Error(e2.message)
  return nuevo.id
}

export async function importarDibujosLocales(
  empresaId: string,
): Promise<ResultadoImport> {
  const res: ResultadoImport = { campos: 0, potreros: 0, infraestructura: 0 }

  for (const mc of mockCampos) {
    const boundary = getCampoBoundary(mc.id)
    const geos = allGeo(mc.id) // { numero: LatLng[] }
    const markers = getMarkers(mc.id)
    const tieneDibujo =
      !!boundary || Object.keys(geos).length > 0 || markers.length > 0
    if (!tieneDibujo) continue // campo sin nada dibujado → no lo importo

    const campoId = await findOrCreateCampo(
      empresaId,
      mc.nombre,
      mc.tenencia,
      mc.hectareas,
    )
    res.campos++

    if (boundary) await api.setCampoContorno(campoId, boundary as api.LatLng[])

    for (const [numero, poly] of Object.entries(geos)) {
      const seed = mockPotreros.find(
        (p) => p.campoId === mc.id && p.numero === numero,
      )
      const potreroId = await findOrCreatePotrero(
        empresaId,
        campoId,
        numero,
        seed?.hectareas ?? null,
      )
      await api.setPotreroPoligono(potreroId, poly as api.LatLng[])
      res.potreros++
    }

    // Infraestructura: reemplazo la del campo para que re-correr no duplique.
    const previa = await api.listInfraestructura(campoId)
    for (const inf of previa) await api.borrarInfraestructura(inf.id)
    for (const m of markers) {
      await api.crearInfraestructura({
        empresa_id: empresaId,
        campo_id: campoId,
        tipo: m.type as api.TipoInfraestructura,
        lat: m.lat,
        lng: m.lng,
        radio_m: m.radiusM ?? null,
        angulo_deg: m.angleDeg ?? null,
        escala: m.scale ?? null,
      })
      res.infraestructura++
    }
  }

  return res
}
