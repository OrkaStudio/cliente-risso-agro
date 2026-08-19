import { useQuery } from '@tanstack/react-query'
import { Droplets, HeartPulse, ListChecks, Sprout, StickyNote, Wheat, Zap } from 'lucide-react'
import { categoriaNombre } from '@/features/hacienda/labels'
import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

/* Umbrales de la sección (ajustables): una observación más vieja que esto ya
 * no es "estado actual" (el aviso pasa a ser "hace N días sin recorrer");
 * las novedades son notas de diario y caducan antes. */
const OBS_VIGENTE_DIAS = 30
const NOVEDAD_VIGENTE_DIAS = 14
const RECORRER_CADA_DIAS = 7
/* El conteo se compara contra el stock de HOY: solo vale muy fresco (si pasaron
 * días pudo haber movimientos de hacienda y la comparación miente). */
const CONTEO_VIGENTE_DIAS = 3
/* Nacimientos anotados en la recorrida: el aviso vive hasta que se caravanean
 * en la manga, pero no para siempre. Dos semanas es lo que tarda una marcada. */
const NACIMIENTO_VIGENTE_DIAS = 14

/* Urgencia EXPLÍCITA por señal: el número ORDENA, el nivel PINTA. Más chico se
 * atiende antes. Es una tabla de criterios de campo —editable como los umbrales
 * de arriba—, no un puntaje calculado: el productor tiene que poder leer por qué
 * una fila está arriba de otra. La escala son horas → días → semanas.
 *
 * 1-2  se resuelve HOY (los animales están en riesgo ahora)
 * 3-5  esta semana
 * 6-9  seguimiento */
const URGENCIA = {
  sinAgua: 1, // animales sin agua: horas, no días
  electrico: 1, // se salen del potrero (ruta, campo del vecino)
  faltan: 2, // el conteo no cierra: pueden faltar animales
  sinPasto: 3, // sin comida: hay que mover o suplementar
  aguaBaja: 4,
  pastoJusto: 5,
  tratamiento: 5,
  cultivoMal: 6, // el cultivo se juega en semanas, no en horas
  cultivoRegular: 7,
  novedad: 9, // nota de diario, no pendiente
} as const

/* Un potrero sin animales no genera urgencias de hacienda: una aguada seca ahí
 * hay que arreglarla ANTES de mandar animales, pero no es "andá ahora". Las
 * señales que dependen del rodeo se corren detrás de todo lo que sí lo tiene. */
const PENALIDAD_SIN_ANIMALES = 10

/* El NIVEL (el color y la etiqueta del chip) se DERIVA de la urgencia, no se
 * asigna a mano: si se asignan por separado se contradicen —una fila "Atender"
 * termina debajo de una "Prevenir" y el panel deja de leerse. Una sola fuente
 * de verdad: la tabla de arriba. */
const HASTA_ATENDER = 3 // 1-3: hoy o mañana
const HASTA_PREVENIR = 7 // 4-7: esta semana
export const nivelDe = (u: number): Nivel =>
  u <= HASTA_ATENDER ? 'atender' : u <= HASTA_PREVENIR ? 'prevenir' : 'nota'

const MS_DIA = 86400000
const diasDesde = (fecha: string): number => {
  const [y, m, d] = fecha.split('-').map(Number)
  return Math.max(0, Math.round((Date.now() - new Date(y, m - 1, d).getTime()) / MS_DIA))
}
export const haceLabel = (d: number): string =>
  d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`

export type Nivel = 'atender' | 'prevenir' | 'nota'

/** Una señal suelta de la última recorrida de un potrero. */
export type TipoSenal = Database['public']['Enums']['tipo_senal']

export type Aviso = {
  key: string
  /** Cuál de las siete señales es. Es lo que se marca como resuelta. */
  tipo: TipoSenal
  nivel: Nivel
  urgencia: number
  icon: typeof Droplets
  /** Qué pasa, en consecuencia y no en etiqueta: "Sin agua", no "Aguada: seca". */
  titulo: string
  /** Texto de apoyo (la novedad anotada, el detalle del conteo). */
  detalle?: string
  /** Depende de que haya animales en el potrero. */
  deRodeo?: boolean
  /** Días desde que el productor la marcó "sigue igual" (fue, miró, continúa). */
  revisadoHace?: number
}

/**
 * Un POTRERO que pide atención, con todas sus señales adentro.
 * La fila es el lugar al que hay que ir, no cada cosa que pasa ahí: un potrero
 * con aguada seca + pelado + eléctrico cortado es UN viaje, no tres avisos.
 */
export type PotreroAtencion = {
  key: string
  /** La observación vigente. Es contra ella que se marca resuelto. */
  observacionId: string
  /** "3B" */
  potrero: string
  campo: string
  /** Cabezas en el potrero (0 = vacío, no se muestra). */
  cabezas: number
  /** Ordenados por urgencia: el primero manda ícono, color y posición. */
  avisos: Aviso[]
  nivel: Nivel
  urgencia: number
  hace: number
  to: string
}

/** Un campo que hace rato no se recorre. No es un problema del potrero. */
export type CampoSinRecorrer = {
  key: string
  campo: string
  cabezas: number
  /** null = nunca se recorrió. */
  hace: number | null
  to: string
}

/** Un día de nacimientos en un potrero. NO es un aviso: es una novedad. */
export type Nacimientos = {
  key: string
  potrero: string
  campo: string
  total: number
  /** "2 terneros y 1 ternera" */
  detalle: string
  /** Fecha EXACTA del hecho, dd/mm. Un "hace N días" acá era engañoso: la
   *  fecha viene del campo y envejece sola en pantalla. */
  fecha: string
  /** Para ordenar por recencia. */
  orden: string
}

export type ParaAtenderData = {
  potreros: PotreroAtencion[]
  /** Aparte: "hace 12 días sin recorrer" no se arregla yendo a un potrero. */
  sinRecorrer: CampoSinRecorrer[]
  /** Aparte de los avisos: en la lista ordenada por urgencia quedaban últimos
   *  y cortados, o sea invisibles. Un nacimiento no compite con "aguada seca". */
  nacimientos: Nacimientos[]
  /** Días desde la última recorrida de la empresa (null = nunca hubo). */
  ultimaRecorridaHace: number | null
}

export const peso: Record<Nivel, number> = { atender: 0, prevenir: 1, nota: 2 }

/**
 * Junta la última observación de cada potrero (recorridas del Modo Campo) y
 * la traduce a avisos accionables, AGRUPADOS POR POTRERO: qué falta, qué
 * prevenir, qué atender.
 */
async function getParaAtender(): Promise<ParaAtenderData> {
  const [obsRes, recRes, potRes, stockRes, nacRes, marcaRes] = await Promise.all([
    supabase
      .from('observacion_potrero')
      .select(
        'id, potrero_id, pasto, agua, electrico, conteo, en_tratamiento, novedad, cultivo, created_at, recorrida:recorrida_id(fecha)',
      )
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('recorrida').select('campo_id, fecha').order('fecha', { ascending: false }),
    supabase.from('potrero').select('id, nombre, campo:campo(id, nombre)'),
    supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
    // Nacimientos declarados en el campo: el evento 'alta' que dejó la
    // recorrida (`origen_ui`), con la categoría real del animal creado.
    supabase
      .from('evento')
      .select('fecha, datos, animal:animal_id(categoria, potrero_id)')
      .eq('tipo', 'alta')
      .contains('datos', { origen_ui: 'recorrida' })
      .order('fecha', { ascending: false })
      .limit(500),
    // Lo que el productor declaró sobre esas señales. Append-only: puede haber
    // varias por señal (la revisó el martes y el jueves) → vale la última.
    supabase
      .from('marca_senal')
      .select('observacion_id, tipo_senal, estado, created_at')
      .order('created_at', { ascending: false })
      .limit(2000),
  ])
  if (obsRes.error) throw new Error(obsRes.error.message)
  if (recRes.error) throw new Error(recRes.error.message)
  if (potRes.error) throw new Error(potRes.error.message)
  if (stockRes.error) throw new Error(stockRes.error.message)
  if (nacRes.error) throw new Error(nacRes.error.message)
  if (marcaRes.error) throw new Error(marcaRes.error.message)

  /* La marca vale SÓLO para la observación contra la que se hizo. Una recorrida
   * posterior genera otra observación, no encuentra marca, y el aviso reaparece
   * solo. Ese es todo el mecanismo. */
  const marcas = new Map<string, { estado: string; hace: number }>()
  for (const m of marcaRes.data ?? []) {
    const k = `${m.observacion_id}-${m.tipo_senal}`
    if (marcas.has(k)) continue // ya vino la más nueva (orden desc)
    marcas.set(k, { estado: m.estado, hace: diasDesde(m.created_at.slice(0, 10)) })
  }

  const potreros = new Map(
    (potRes.data ?? []).map((p) => {
      const campo = p.campo as { id: string; nombre: string } | null
      return [
        p.id,
        { nombre: p.nombre, campoId: campo?.id ?? '', campoNombre: campo?.nombre ?? '' },
      ]
    }),
  )
  const stock = new Map(
    (stockRes.data ?? []).map((s) => [s.potrero_id, s.cabezas ?? 0]),
  )

  // ── Avisos por potrero: la última observación conocida de cada uno ──
  const enAtencion: PotreroAtencion[] = []
  const vistos = new Set<string>()
  for (const o of obsRes.data ?? []) {
    if (vistos.has(o.potrero_id)) continue
    vistos.add(o.potrero_id)

    const p = potreros.get(o.potrero_id)
    if (!p) continue
    const fecha = o.recorrida?.fecha ?? o.created_at.slice(0, 10)
    const hace = diasDesde(fecha)
    if (hace > OBS_VIGENTE_DIAS) continue // ya no es estado actual

    const cabezas = stock.get(o.potrero_id) ?? 0
    const avisos: Aviso[] = []
    const add = (a: Omit<Aviso, 'key' | 'nivel' | 'revisadoHace'> & { k: string }) => {
      const marca = marcas.get(`${o.id}-${a.tipo}`)
      // Resuelta contra ESTA observación: el aviso no existe más (hasta que una
      // recorrida nueva lo vuelva a ver).
      if (marca?.estado === 'resuelto') return
      avisos.push({
        ...a,
        key: `${o.potrero_id}-${a.k}`,
        nivel: nivelDe(a.urgencia),
        revisadoHace: marca?.estado === 'sigue' ? marca.hace : undefined,
      })
    }

    if (o.agua === 'seca')
      add({ k: 'agua', tipo: 'agua', urgencia: URGENCIA.sinAgua, icon: Droplets, titulo: 'Sin agua', deRodeo: true })
    else if (o.agua === 'baja')
      add({ k: 'agua', tipo: 'agua', urgencia: URGENCIA.aguaBaja, icon: Droplets, titulo: 'Aguada bajando', deRodeo: true })

    if (o.pasto === 'pelado')
      add({ k: 'pasto', tipo: 'pasto', urgencia: URGENCIA.sinPasto, icon: Sprout, titulo: 'Sin pasto', deRodeo: true })
    else if (o.pasto === 'escaso')
      add({ k: 'pasto', tipo: 'pasto', urgencia: URGENCIA.pastoJusto, icon: Sprout, titulo: 'Pasto justo', deRodeo: true })

    if (o.electrico === 'cortado')
      add({ k: 'elec', tipo: 'electrico', urgencia: URGENCIA.electrico, icon: Zap, titulo: 'Eléctrico cortado' })

    if (o.cultivo === 'mal')
      add({ k: 'cult', tipo: 'cultivo', urgencia: URGENCIA.cultivoMal, icon: Wheat, titulo: 'Cultivo en problemas' })
    else if (o.cultivo === 'regular')
      add({ k: 'cult', tipo: 'cultivo', urgencia: URGENCIA.cultivoRegular, icon: Wheat, titulo: 'Cultivo regular' })

    if (o.en_tratamiento)
      add({ k: 'trat', tipo: 'tratamiento', urgencia: URGENCIA.tratamiento, icon: HeartPulse, titulo: 'Animales en tratamiento', deRodeo: true })

    if (
      o.conteo != null &&
      o.conteo > 0 &&
      cabezas > 0 &&
      o.conteo < cabezas &&
      hace <= CONTEO_VIGENTE_DIAS
    )
      add({
        k: 'conteo',
        tipo: 'conteo',
        urgencia: URGENCIA.faltan,
        icon: ListChecks,
        // El productor no necesita hacer la resta: le importa cuántos no aparecieron.
        titulo: `Faltan ${cabezas - o.conteo}`,
        detalle: `contó ${o.conteo} de ${cabezas}`,
        deRodeo: true,
      })

    if (o.novedad?.trim() && hace <= NOVEDAD_VIGENTE_DIAS)
      add({
        k: 'nov',
        tipo: 'novedad',
        urgencia: URGENCIA.novedad,
        icon: StickyNote,
        titulo: 'Novedad',
        detalle: o.novedad.trim(),
      })

    if (avisos.length === 0) continue

    // Sin animales, lo que depende del rodeo deja de ser "andá ahora".
    if (cabezas === 0)
      for (const a of avisos)
        if (a.deRodeo) {
          a.urgencia += PENALIDAD_SIN_ANIMALES
          if (a.nivel === 'atender') a.nivel = 'prevenir'
        }

    avisos.sort((a, b) => a.urgencia - b.urgencia)
    enAtencion.push({
      key: o.potrero_id,
      observacionId: o.id,
      potrero: p.nombre,
      campo: p.campoNombre,
      cabezas,
      avisos,
      nivel: avisos.reduce<Nivel>((peor, a) => (peso[a.nivel] < peso[peor] ? a.nivel : peor), 'nota'),
      urgencia: avisos[0].urgencia,
      hace,
      to: `/potrero/${o.potrero_id}`,
    })
  }

  /* Orden: primero la señal más grave; a igual gravedad, donde hay más animales
   * en juego; y a igual todo, lo que lleva MÁS tiempo sin resolverse (antes se
   * ordenaba al revés y lo viejo —justo lo que se está ignorando— se hundía). */
  enAtencion.sort(
    (a, b) => a.urgencia - b.urgencia || b.cabezas - a.cabezas || b.hace - a.hace,
  )

  // ── Nacimientos anotados en el campo ──
  // Agrupados por potrero y día: al productor le importa "el lunes nacieron 3
  // en el 11B", no tres filas sueltas. Van APARTE de los avisos.
  const porPotreroDia = new Map<
    string,
    { potreroId: string; fecha: string; cats: Map<string, number> }
  >()
  for (const ev of nacRes.data ?? []) {
    const animal = ev.animal as { categoria: string; potrero_id: string | null } | null
    if (!animal?.potrero_id) continue
    if (diasDesde(ev.fecha) > NACIMIENTO_VIGENTE_DIAS) continue
    const k = `${animal.potrero_id}-${ev.fecha}`
    const g =
      porPotreroDia.get(k) ??
      { potreroId: animal.potrero_id, fecha: ev.fecha, cats: new Map<string, number>() }
    g.cats.set(animal.categoria, (g.cats.get(animal.categoria) ?? 0) + 1)
    porPotreroDia.set(k, g)
  }
  const nacimientos: Nacimientos[] = []
  for (const g of porPotreroDia.values()) {
    const p = potreros.get(g.potreroId)
    if (!p) continue
    const [yy, mm, dd] = g.fecha.split('-')
    nacimientos.push({
      key: `${g.potreroId}-nac-${g.fecha}`,
      potrero: p.nombre,
      campo: p.campoNombre,
      total: [...g.cats.values()].reduce((a, b) => a + b, 0),
      detalle: [...g.cats.entries()]
        .map(([cat, n]) => `${n} ${categoriaNombre(cat as never, n).toLocaleLowerCase('es')}`)
        .join(' y '),
      fecha: `${dd}/${mm}/${yy.slice(2)}`,
      orden: g.fecha,
    })
  }
  nacimientos.sort((a, b) => b.orden.localeCompare(a.orden))

  // ── Avisos por campo: hace cuánto no se recorre ──
  const ultimaPorCampo = new Map<string, string>()
  for (const r of recRes.data ?? []) {
    if (r.campo_id && !ultimaPorCampo.has(r.campo_id)) ultimaPorCampo.set(r.campo_id, r.fecha)
  }
  // Campos con hacienda (los vacíos no piden recorrida) + cuánta tienen.
  const camposConHacienda = new Map<string, { nombre: string; cabezas: number }>()
  for (const [id, p] of potreros) {
    const c = stock.get(id) ?? 0
    if (c > 0 && p.campoId) {
      const acc = camposConHacienda.get(p.campoId) ?? { nombre: p.campoNombre, cabezas: 0 }
      acc.cabezas += c
      camposConHacienda.set(p.campoId, acc)
    }
  }
  const sinRecorrer: CampoSinRecorrer[] = []
  for (const [campoId, c] of camposConHacienda) {
    const ultima = ultimaPorCampo.get(campoId)
    const hace = ultima ? diasDesde(ultima) : null
    if (hace != null && hace <= RECORRER_CADA_DIAS) continue
    sinRecorrer.push({
      key: `${campoId}-rec`,
      campo: c.nombre,
      cabezas: c.cabezas,
      hace,
      to: '/campos',
    })
  }
  // Lo que hace más que no se recorre, primero (nunca recorrido va al tope).
  sinRecorrer.sort((a, b) => (b.hace ?? Infinity) - (a.hace ?? Infinity))

  const fechas = (recRes.data ?? []).map((r) => r.fecha)
  return {
    potreros: enAtencion,
    sinRecorrer,
    nacimientos,
    ultimaRecorridaHace: fechas.length ? diasDesde(fechas[0]) : null,
  }
}


/**
 * Una sola consulta compartida por los tres consumidores: la cabecera "Hoy" del
 * Inicio, el panel completo y el contador de la nav. Misma queryKey ⇒ mismo
 * cache, no se pide tres veces.
 */
export const useParaAtender = () =>
  useQuery({ queryKey: ['para-atender-campo'], queryFn: getParaAtender })

/* Qué entra en "Hoy": lo que no puede esperar. Es el mismo corte que usa el
 * contador de la nav, para que nunca digan números distintos. */
export const URGENTE_HASTA = HASTA_ATENDER

export function loUrgente(d: ParaAtenderData | undefined): PotreroAtencion[] {
  return (d?.potreros ?? []).filter((p) => p.urgencia <= URGENTE_HASTA)
}

/** Lo que cuenta la nav y la cabecera: potreros urgentes + campos sin recorrer. */
export function contarHoy(d: ParaAtenderData | undefined): number {
  return loUrgente(d).length + (d?.sinRecorrer.length ?? 0)
}

