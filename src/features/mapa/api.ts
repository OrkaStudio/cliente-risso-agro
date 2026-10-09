import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { crearPotrero, setCampoContorno, setPotreroPoligono } from '@/features/campos/api'
import type { CampoMapa, LatLng, PotreroMapa } from './reglas'

/** Lo que se ve de cada potrero para reconocerlo: «60 cabezas», «Trigo», «En descanso». */
function queTiene(estado: string, cultivo: string | null, cabezas: number): string {
  if (cabezas > 0) return `${cabezas} ${cabezas === 1 ? 'cabeza' : 'cabezas'}`
  if (cultivo) return cultivo.charAt(0).toLocaleUpperCase('es-AR') + cultivo.slice(1)
  if (estado === 'descanso') return 'En descanso'
  return 'Vacío'
}

function tipoDe(estado: string, cultivo: string | null, cabezas: number): PotreroMapa['tipo'] {
  if (cabezas > 0) return 'hacienda'
  if (cultivo || estado === 'cultivo') return 'sembrado'
  if (estado === 'descanso') return 'descanso'
  return 'vacio'
}

/** Los campos de la empresa con su borde y sus potreros, desde la base. */
export async function leerMapa(empresaId: string): Promise<CampoMapa[]> {
  const [{ data: campos, error }, { data: stock, error: e2 }] = await Promise.all([
    supabase
      .from('campo')
      .select('id, nombre, provincia, localidad, lat, lon, hectareas, contorno, color_idx, potrero(id, nombre, hectareas, poligono, estado_ciclo, cultivo, created_at)')
      .eq('empresa_id', empresaId)
      .order('color_idx'),
    supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
  ])
  if (error) throw new Error(error.message)
  if (e2) throw new Error(e2.message)
  const cab = new Map((stock ?? []).map((s) => [s.potrero_id, s.cabezas ?? 0]))
  return (campos ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    provincia: c.provincia ?? '',
    localidad: c.localidad,
    lat: c.lat,
    lon: c.lon,
    hectareas: c.hectareas === null ? null : Number(c.hectareas),
    contorno: (c.contorno as LatLng[] | null) ?? null,
    potreros: [...(c.potrero ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((p) => {
        const cabezas = cab.get(p.id) ?? 0
        return {
          id: p.id,
          nombre: p.nombre,
          hectareas: p.hectareas === null ? null : Number(p.hectareas),
          poligono: (p.poligono as LatLng[] | null) ?? null,
          cabezas,
          que: queTiene(p.estado_ciclo, p.cultivo, cabezas),
          tipo: tipoDe(p.estado_ciclo, p.cultivo, cabezas),
        }
      }),
  }))
}

export const useMapa = (empresaId: string | undefined) =>
  useQuery({
    queryKey: ['mapa', empresaId],
    queryFn: () => leerMapa(empresaId!),
    enabled: !!empresaId,
  })

export const guardarBorde = setCampoContorno

/** «Sí, mide 198 ha: lo corrijo»: el alta toma lo medido en el mapa. */
export async function corregirHectareasCampo(campoId: string, hectareas: number): Promise<void> {
  const { error } = await supabase.from('campo').update({ hectareas }).eq('id', campoId)
  if (error) throw new Error(error.message)
}
export const asignarDibujo = setPotreroPoligono

/** «Sí, el 1A mide 8,5 ha: lo corrijo»: el potrero toma lo medido en el mapa. */
export async function corregirHectareasPotrero(potreroId: string, hectareas: number): Promise<void> {
  const { error } = await supabase.from('potrero').update({ hectareas }).eq('id', potreroId)
  if (error) throw new Error(error.message)
}

/** Un potrero dibujado que no estaba en el alta («No está en la lista: es uno nuevo»). */
export async function crearPotreroDibujado(input: {
  empresaId: string
  campoId: string
  numero: string
  uso: 'hacienda' | 'sembrado' | 'vacio'
  poligono: LatLng[]
  hectareas: number
}): Promise<string> {
  const { id } = await crearPotrero({
    empresaId: input.empresaId,
    campoId: input.campoId,
    nombre: input.numero,
    estadoCiclo: input.uso === 'hacienda' ? 'ganadero' : input.uso === 'sembrado' ? 'cultivo' : 'descanso',
    hectareas: Math.round(input.hectareas * 10) / 10,
  })
  await setPotreroPoligono(id, input.poligono)
  return id
}

/** «No, es un solo potrero»: el borde del campo es su único potrero. */
export async function campoDeUnSoloPotrero(empresaId: string, campo: CampoMapa, hectareas: number): Promise<void> {
  await crearPotreroDibujado({
    empresaId,
    campoId: campo.id,
    numero: '1',
    uso: 'hacienda',
    poligono: campo.contorno!,
    hectareas,
  })
}

/** Todos los campos en el mapa: se abre la app. La base vuelve a verificarlo. */
export async function terminarMapa(): Promise<void> {
  const { error } = await supabase.rpc('terminar_mapa')
  if (error) throw new Error(error.message)
}

export type Lugar = { nombre: string; lat: number; lon: number }

/** «Buscá un camino, paraje o estancia» (OpenStreetMap, sólo Argentina). */
export async function buscarLugar(texto: string, cerca?: { lat: number; lon: number }): Promise<Lugar[]> {
  const q = texto.trim()
  if (q.length < 3) return []
  const params = new URLSearchParams({ format: 'jsonv2', countrycodes: 'ar', limit: '6', 'accept-language': 'es', q })
  if (cerca) {
    // Prioriza lo que está cerca del pueblo del campo (unos 60 km).
    params.set('viewbox', [cerca.lon - 0.6, cerca.lat + 0.6, cerca.lon + 0.6, cerca.lat - 0.6].join(','))
  }
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
  if (!r.ok) throw new Error('No pudimos buscar. Probá de nuevo.')
  const j = (await r.json()) as { display_name: string; lat: string; lon: string }[]
  return j.map((x) => ({
    nombre: x.display_name.split(', ').slice(0, 3).join(', '),
    lat: Number(x.lat),
    lon: Number(x.lon),
  }))
}
