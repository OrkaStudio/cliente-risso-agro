import { esFecha, norm, numeroEn, sumarDias } from './texto.ts'
import type { Borrador } from './tipos.ts'

export type ComandoPiloto =
  | { k: 'ajustar'; valor?: number; anular: boolean }
  | { k: 'problemas' | 'tareas' | 'comparar'; pagina?: number }
  | { k: 'incidencia'; potrero: string; descripcion: string }
  | { k: 'resolver'; codigo: string }
  | { k: 'resolver_lugar'; potrero: string; equipo: string }
  | { k: 'tarea'; potrero: string; responsable: string; fecha: string; descripcion: string }
  | { k: 'tarea_estado'; codigo: string; estado: 'aceptada' | 'completa' }
  | { k: 'sesion'; accion: 'empezar' | 'retomar' | 'pausar' | 'cerrar'; campo?: string; fecha?: string }

export function comandoPiloto(texto: string, hoy: string): ComandoPiloto | null {
  const t = norm(texto).replace(/[.!?]+$/, '')
  if (/^(?:corregi|corregir|corregir la|corregi la) ultima carga(?: a .+)?$/.test(t)) {
    const valor = t.includes(' a ') ? numeroEn(t.split(' a ').slice(1).join(' a ')) : null
    return { k: 'ajustar', anular: false, ...(valor === null ? {} : { valor }) }
  }
  if (/^(?:deshace|deshacer|anula|anular)(?: la)? ultima carga$/.test(t)) return { k: 'ajustar', anular: true }
  const listado = t.match(/^(?:ver |mis |los |las )?(problemas|incidencias|tareas)(?: abiertos| pendientes)?(?: pagina (\d{1,4}))?$/)
  if (listado) return { k:listado[1]==='tareas'?'tareas':'problemas',pagina:Math.max(1,Number(listado[2] ?? 1)) }
  if (/^(?:comparar recorridas|que empeoro(?: desde la (?:recorrida )?anterior)?)$/.test(t)) return { k: 'comparar' }
  let m = t.match(/^(?:reportar|reporta|anotar|anota) problema (?:en )?(?:el )?(?:potrero )?(.+?)\s*:\s*(.+)$/)
  if (m) return { k: 'incidencia', potrero: m[1], descripcion: texto.slice(texto.indexOf(':') + 1).trim() }
  m=t.match(/^(?:se rompio|no anda|esta roto|esta rota|se corto) (?:el |la )?(molino|electrico|tranquera|boyero|bomba|bebedero) (?:del |de |en el |en )?(?:potrero )?(.+)$/)
  if(m)return {k:'incidencia',potrero:m[2],descripcion:texto.trim()}
  m=t.match(/^ya (?:arregle|repare) (?:el |la )?(molino|electrico|tranquera|boyero|bomba|bebedero) (?:del |de |en el |en )?(?:potrero )?(.+)$/)
  if(m)return {k:'resolver_lugar',potrero:m[2],equipo:m[1]}
  m = t.match(/^(?:resolver|resolve|cerra|cerrar|ya arregle)(?: el)? problema\s+(?:inc-)?([a-f0-9-]{8,36})$/)
  if (m) return { k: 'resolver', codigo: m[1] }
  m = t.match(/^(?:crear|crea|anotar|anota) tarea (?:en )?(?:el )?(?:potrero )?(.+?) para (.+?) (hoy|manana|\d{4}-\d{2}-\d{2})\s*:\s*(.+)$/)
  if (m) return { k: 'tarea', potrero: m[1], responsable: m[2], fecha: m[3] === 'hoy' ? hoy : m[3] === 'manana' ? sumarDias(hoy, 1) : m[3], descripcion: texto.slice(texto.indexOf(':') + 1).trim() }
  m=t.match(/^que (.+?) ((?:revise|arregle|repare|controle|mire|alimente|limpie|cambie) .+?) (hoy|manana|\d{4}-\d{2}-\d{2})(?: en (?:el )?(?:potrero )?(.+))?$/)
  if(m)return {k:'tarea',potrero:m[4] ?? '',responsable:m[1],fecha:m[3]==='hoy'?hoy:m[3]==='manana'?sumarDias(hoy,1):m[3],descripcion:m[2]}
  m = t.match(/^(aceptar|acepto|completar|complete|terminar|termine) tarea (?:tar-)?([a-f0-9-]{8,36})$/)
  if (m) return { k: 'tarea_estado', codigo: m[2], estado: m[1].startsWith('acept') ? 'aceptada' : 'completa' }
  m = t.match(/^(empezar|empeza|arrancar|arranca|retomar|retoma|pausar|pausa|cerrar|cerra|terminar) (?:la )?recorrida(?: (?:en |de )?(?:el campo )?(.+?))?(?: (hoy|ayer|\d{4}-\d{2}-\d{2}))?$/)
  if (m) {
    const accion = /^(empez|arranc)/.test(m[1]) ? 'empezar' : /^retom/.test(m[1]) ? 'retomar' : /^paus/.test(m[1]) ? 'pausar' : 'cerrar'
    const campo = m[2] && !['hoy', 'ayer'].includes(m[2]) && !esFecha(m[2]) ? m[2] : undefined
    const fecha = m[3] ?? (!campo ? m[2] : undefined)
    return { k: 'sesion', accion, campo, fecha: fecha === 'ayer' ? sumarDias(hoy, -1) : fecha === 'hoy' ? hoy : fecha }
  }
  return null
}

/** Repetir un audio del mismo mensaje no agrega datos; el store controla su ID. */
export function fusionarRecorrida(base: Borrador, nuevo: Borrador): Borrador {
  if (base.campoId && nuevo.campoId && base.campoId !== nuevo.campoId) throw new Error('La sesión es de otro campo. Cerrala o pausala antes de cambiar de campo.')
  const observaciones = structuredClone(base.observaciones ?? [])
  for (const item of nuevo.observaciones ?? []) {
    const i = item.potreroId ? observaciones.findIndex(o => o.potreroId === item.potreroId) : -1
    if (i < 0) { observaciones.push(item); continue }
    const anterior = observaciones[i]
    const novedad = [...new Set([anterior.novedad, item.novedad].filter(Boolean))].join('; ') || null
    observaciones[i] = { ...anterior, ...item, agua: item.agua ?? anterior.agua, pasto: item.pasto ?? anterior.pasto, electrico: item.electrico ?? anterior.electrico, conteo: item.conteo ?? anterior.conteo, novedad }
  }
  if (observaciones.length > 60) throw new Error('La sesión llegó a 60 observaciones. Cerrala antes de agregar más; este mensaje no se sumó.')
  return { ...base, observaciones }
}

export type Comparacion = { campo: string; potrero: string; fecha: string | null; anterior_fecha: string | null; agua: string | null; anterior_agua: string | null; pasto: string | null; anterior_pasto: string | null; electrico: string | null; anterior_electrico: string | null }
export function textoComparacion(filas: Comparacion[]): string {
  if (!filas.length) return 'No hay potreros disponibles para comparar.'
  const completas = filas.filter(f => f.fecha && f.anterior_fecha)
  const cambios = completas.flatMap(f => {
    const detalle = (['agua','pasto','electrico'] as const).filter(k => f[k] && f[`anterior_${k}`] && f[k] !== f[`anterior_${k}`]).map(k => `${k === 'electrico' ? 'eléctrico' : k}: ${f[`anterior_${k}`]} → ${f[k]}`)
    return detalle.length ? [`${f.campo} · ${f.potrero} (${f.anterior_fecha} → ${f.fecha}): ${detalle.join('; ')}`] : []
  })
  const sinDatos = filas.filter(f => !f.fecha || !f.anterior_fecha).length
  return `${cambios.length ? cambios.slice(0, 12).join('\n') : 'No hay cambios comparables registrados en agua, pasto o eléctrico.'}${cambios.length > 12 ? `\nHay ${cambios.length - 12} cambios más; consultá la app para el detalle.` : ''}\nComparé ${completas.length} de ${filas.length} potreros. ${sinDatos} no tienen dos fechas registradas. Sin datos no significa que estén bien; no evalué observaciones ausentes.`
}
