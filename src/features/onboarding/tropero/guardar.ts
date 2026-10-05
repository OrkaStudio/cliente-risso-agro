// Onboarding de Tropero: lo que va a la base en cada paso. Cada paso guarda al
// tocar su botón principal (spec 2), y todo es idempotente: volver atrás y
// guardar de nuevo reescribe, no duplica.
import { supabase } from '@/lib/supabase/client'
import {
  actualizarActividadCampo,
  actualizarCampo,
  actualizarPotrero,
  actualizarPotreroMapa,
  crearCampo,
  crearPotrero,
  eliminarPotrero,
} from '@/features/campos/api'
import { actividadDeUsos } from '@/features/campos/labels'
import { borrarAltaOnboarding } from '@/features/hacienda/api'
import {
  descansoDeFecha,
  estadoDe,
  fechaDeDescanso,
  usoDe,
  type CampoOnb,
  type Categoria,
  type Contenido,
  type PotreroOnb,
  type TipoCampo,
} from './modelo'

/** B1: crea la empresa con el usuario como dueño. */
export async function crearEmpresa(nombre: string): Promise<string> {
  const { data, error } = await supabase.rpc('crear_empresa_con_dueno', { p_nombre: nombre.trim() })
  if (error) throw new Error(error.message)
  return data
}

export type DatosCampo = {
  nombre: string
  localidad: { nombre: string; provincia: string; lat: number; lon: number }
  tipo: TipoCampo
  hectareas: number
}

/** B2: crea el campo o, si ya existe (volvió a corregirlo), lo actualiza. */
export async function guardarCampo(empresaId: string, datos: DatosCampo, existente?: CampoOnb): Promise<CampoOnb> {
  const ubicacion = {
    localidad: datos.localidad.nombre,
    provincia: datos.localidad.provincia,
    lat: datos.localidad.lat,
    lon: datos.localidad.lon,
  }
  let id: string
  let colorIdx: number
  if (existente) {
    await actualizarCampo({
      id: existente.id,
      nombre: datos.nombre,
      tipo: datos.tipo,
      hectareas: datos.hectareas,
      actividad: null,
      ubicacion,
    })
    id = existente.id
    colorIdx = existente.colorIdx
  } else {
    ;({ id, colorIdx } = await crearCampo({
      empresaId,
      nombre: datos.nombre,
      tipo: datos.tipo,
      hectareas: datos.hectareas,
      ubicacion,
    }))
  }
  return {
    id,
    nombre: datos.nombre.trim(),
    localidad: datos.localidad.nombre,
    provincia: datos.localidad.provincia,
    lat: datos.localidad.lat,
    lon: datos.localidad.lon,
    tipo: datos.tipo,
    hectareas: datos.hectareas,
    colorIdx,
    potreros: existente?.potreros ?? [],
  }
}

export type FilaPotrero = { id?: string; numero: string; hectareas: number }

/**
 * B3: los potreros del campo. Los que se sacaron de la lista se borran (con su
 * hacienda del onboarding), los que siguen se actualizan y los nuevos se crean.
 * La letra la pone la base (la del campo); vacío = el número siguiente.
 */
export async function guardarPotreros(empresaId: string, campo: CampoOnb, filas: FilaPotrero[]): Promise<PotreroOnb[]> {
  const siguen = new Set(filas.map((f) => f.id).filter(Boolean))
  const sacados = campo.potreros.filter((p) => !siguen.has(p.id)).map((p) => p.id)
  if (sacados.length) {
    await borrarAltaOnboarding(sacados)
    for (const id of sacados) await eliminarPotrero(id)
  }
  const out: PotreroOnb[] = []
  for (const f of filas) {
    const previo = f.id ? campo.potreros.find((p) => p.id === f.id) : undefined
    if (previo) {
      const numero = f.numero.trim() || previo.nombre
      await actualizarPotrero({
        id: previo.id,
        nombre: numero,
        estadoCiclo: previo.contenido ? estadoDe(previo.contenido).estadoCiclo : 'ganadero',
        hectareas: f.hectareas,
      })
      const { data } = await supabase.from('potrero').select('nombre').eq('id', previo.id).single()
      out.push({ ...previo, nombre: data?.nombre ?? previo.nombre, hectareas: f.hectareas })
    } else {
      // Sin número, el trigger de la base pone el siguiente disponible.
      const { id, nombre } = await crearPotrero({
        empresaId,
        campoId: campo.id,
        nombre: f.numero.trim(),
        estadoCiclo: 'ganadero',
        hectareas: f.hectareas,
      })
      out.push({ id, nombre, hectareas: f.hectareas, contenido: null })
    }
  }
  return out
}

/**
 * B4: qué hay en UN potrero. Primero se deshace lo que el onboarding ya había
 * cargado en ese potrero (si volvió a corregirlo) y después se escribe de nuevo.
 */
export async function guardarContenido(
  empresaId: string,
  potrero: PotreroOnb,
  contenido: Contenido,
  hoy: Date,
): Promise<void> {
  await borrarAltaOnboarding([potrero.id])
  const { estadoCiclo, cultivo } = estadoDe(contenido)
  await actualizarPotreroMapa({ id: potrero.id, estadoCiclo, hectareas: potrero.hectareas, cultivo })
  const { error: e1 } = await supabase
    .from('potrero')
    .update({ descanso_desde: contenido.tipo === 'descanso' ? fechaDeDescanso(contenido.desde, hoy) : null })
    .eq('id', potrero.id)
  if (e1) throw new Error(e1.message)
  if (contenido.tipo !== 'hacienda') return
  const items = (Object.entries(contenido.cabezas) as [Categoria, number][])
    .filter(([, n]) => n > 0)
    .map(([categoria, cantidad]) => ({ categoria, cantidad }))
  if (items.length === 0) return
  const { error } = await supabase.rpc('crear_animales_masivo', {
    p_empresa_id: empresaId,
    p_potrero_id: potrero.id,
    p_items: items,
    p_origen: 'onboarding',
  })
  if (error) throw new Error(`Potrero ${potrero.nombre}: ${error.message}`)
}

/** Al terminar los potreros de un campo: su actividad sale de lo que hay. */
export async function cerrarCampo(campo: CampoOnb): Promise<void> {
  const usos = campo.potreros.flatMap((p) => (p.contenido ? [usoDe(p.contenido)] : []))
  await actualizarActividadCampo(campo.id, actividadDeUsos(usos))
}

/** B6: el onboarding queda hecho; entrar ya no vuelve acá. */
export async function terminarOnboarding(): Promise<void> {
  const { error } = await supabase.rpc('terminar_onboarding')
  if (error) throw new Error(error.message)
}

/**
 * Lo que ya está en la base, para retomar desde otro equipo (sin el progreso
 * guardado en este navegador). Un potrero «ganadero» sin hacienda cuenta como
 * sin responder: así nace todo potrero nuevo.
 */
export async function leerDeLaBase(empresaId: string, hoy: Date): Promise<CampoOnb[]> {
  const { data: campos, error } = await supabase
    .from('campo')
    .select('id, nombre, localidad, provincia, lat, lon, tipo, hectareas, color_idx, potrero(id, nombre, hectareas, estado_ciclo, cultivo, descanso_desde, created_at)')
    .eq('empresa_id', empresaId)
    .order('color_idx')
  if (error) throw new Error(error.message)
  const { data: animales, error: e2 } = await supabase
    .from('animal')
    .select('potrero_id, categoria')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
  if (e2) throw new Error(e2.message)
  const porPotrero = new Map<string, Partial<Record<Categoria, number>>>()
  for (const a of animales ?? []) {
    if (!a.potrero_id) continue
    const c = porPotrero.get(a.potrero_id) ?? {}
    c[a.categoria] = (c[a.categoria] ?? 0) + 1
    porPotrero.set(a.potrero_id, c)
  }
  return (campos ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    localidad: c.localidad ?? '',
    provincia: c.provincia ?? '',
    lat: c.lat ?? 0,
    lon: c.lon ?? 0,
    tipo: c.tipo,
    hectareas: Number(c.hectareas ?? 0),
    colorIdx: c.color_idx ?? 0,
    potreros: [...(c.potrero ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((p) => {
        const cabezas = porPotrero.get(p.id)
        const contenido: Contenido | null =
          p.estado_ciclo === 'descanso'
            ? { tipo: 'descanso', desde: descansoDeFecha(p.descanso_desde ?? hoy.toISOString().slice(0, 10), hoy) }
            : p.cultivo
              ? { tipo: 'sembrado', cultivo: p.cultivo }
              : cabezas
                ? { tipo: 'hacienda', cabezas }
                : null
        return { id: p.id, nombre: p.nombre, hectareas: Number(p.hectareas ?? 0), contenido }
      }),
  }))
}
