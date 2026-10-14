// Los textos que devuelve el bot a partir de datos de la base. Puros: los
// números los trae la Edge Function; acá sólo se arma cómo se dicen.
// Cada carga confirmada vuelve con un dato, no con "ok".

import { cuandoTexto, ddmm, diasEntre, mmTexto, nombreMes, pesos, plural } from './texto.ts'

/** Lo que se anotó. Con la confirmación al elegir el campo es la única devolución de la carga. */
export function lluviaAnotada(d: { campo: string; mm: number; fecha: string; hoy: string }): string {
  return `Listo, anoté *${mmTexto(d.mm)} mm* ${cuandoTexto(d.fecha, d.hoy)} en ${d.campo}.`
}

/**
 * El total es del mes de la lluvia: la de ayer cargada el 1° no puede contestar
 * "en octubre van 0". Un mes ya terminado se cuenta entero ("fueron").
 */
export function trasLluvia(d: {
  campo: string
  mm: number
  fecha: string
  hoy: string
  mesMm: number
  anteriorMm: number | null
}): string {
  const cerrado = d.fecha.slice(0, 7) < d.hoy.slice(0, 7)
  const mes = nombreMes(d.fecha) + (d.fecha.slice(0, 4) === d.hoy.slice(0, 4) ? '' : ` de ${d.fecha.slice(0, 4)}`)
  const total = d.mm > 0 && d.mesMm === d.mm
    ? `Es la ${cerrado ? 'única' : 'primera'} de ${mes}`
    : `En ${mes} ${cerrado ? 'fueron' : 'van'} ${mmTexto(d.mesMm)}`
  const antes = d.anteriorMm === null
    ? ''
    : cerrado ? `; el año pasado, ${mmTexto(d.anteriorMm)}` : `; el año pasado a esta altura iban ${mmTexto(d.anteriorMm)}`
  return `${lluviaAnotada(d)} ${total}${antes}.`
}

/** Lo que se anotó, con las mismas palabras que la propuesta: monto, categoría, campo y cuándo se pagó. */
export function gastoAnotado(d: { monto: number; categoria: string; campo: string; fecha: string; hoy: string }): string {
  return `Listo, anoté *${pesos(d.monto)}* de ${d.categoria} en ${d.campo}, pagado ${cuandoTexto(d.fecha, d.hoy)}.`
}

/**
 * El total es del mes del gasto: un ticket del 29/09 cargado en octubre
 * no puede contestar "en octubre llevás $0".
 * fotoGuardada: null = no había foto; false = había y no se pudo guardar.
 */
export function trasGasto(d: {
  monto: number
  campo: string
  fecha: string
  hoy: string
  categoria: string
  total: number
  cantidad: number
  fotoGuardada: boolean | null
}): string {
  const mes = nombreMes(d.fecha) + (d.fecha.slice(0, 4) === d.hoy.slice(0, 4) ? '' : ` de ${d.fecha.slice(0, 4)}`)
  const total = d.cantidad === 1
    ? `Es el primer gasto de ${d.categoria} en ${mes}.`
    : `En ${mes} llevás ${pesos(d.total)} en ${d.categoria} (${d.cantidad} cargas).`
  const base = `${gastoAnotado(d)} ${total}`
  if (d.fotoGuardada === false) {
    return `${base}\n\nOjo: *no pude guardar la foto* del ticket. El gasto está anotado igual; guardá el papel por las dudas.`
  }
  return base
}

export type FilaHacienda = { campo: string; potrero: string; categoria: string; cabezas: number }

function porCategoria(filas: FilaHacienda[]): string {
  const t = new Map<string, number>()
  for (const f of filas) t.set(f.categoria, (t.get(f.categoria) ?? 0) + f.cabezas)
  return [...t.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${n} ${plural(c, n)}`)
    .join(', ')
}
const suma = (filas: { cabezas: number }[]) => filas.reduce((s, f) => s + f.cabezas, 0)

/** filas ya filtradas por la empresa (y por campo/potrero si se pidió). */
export function hacienda(filas: FilaHacienda[], filtro: { campo?: string; potrero?: string }): string {
  if (filtro.potrero) {
    if (!filas.length) return `El potrero ${filtro.potrero} de ${filtro.campo} está sin animales.`
    return `En el potrero ${filtro.potrero} de ${filtro.campo} hay *${suma(filas)} ${plural('cabeza', suma(filas))}*: ${porCategoria(filas)}.`
  }
  if (filtro.campo) {
    if (!filas.length) return `En ${filtro.campo} no tengo animales cargados.`
    const potreros = [...new Set(filas.map((f) => f.potrero))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    const lineas = potreros.map((p) => {
      const fp = filas.filter((f) => f.potrero === p)
      return `• ${p}: ${porCategoria(fp)}`
    })
    return `En ${filtro.campo} hay *${suma(filas)} ${plural('cabeza', suma(filas))}*: ${porCategoria(filas)}.\n${lineas.join('\n')}`
  }
  if (!filas.length) return 'Todavía no tengo animales cargados.'
  const campos = [...new Set(filas.map((f) => f.campo))]
  const lineas = campos.map((c) => {
    const fc = filas.filter((f) => f.campo === c)
    return `• *${c}*: ${suma(fc)} (${porCategoria(fc)})`
  })
  return `Hay *${suma(filas)} ${plural('cabeza', suma(filas))}* en total.\n${lineas.join('\n')}`
}

export function lluviaConsulta(hoy: string, filas: { campo: string; mesMm: number; anteriorMm: number | null }[]): string {
  if (!filas.length) return 'Todavía no tengo campos cargados.'
  const lineas = filas.map(
    (f) =>
      `• *${f.campo}*: ${mmTexto(f.mesMm)} mm${f.anteriorMm === null ? '' : ` (el año pasado a esta altura, ${mmTexto(f.anteriorMm)})`}`,
  )
  return `Lluvia medida en ${nombreMes(hoy)}, hasta hoy:\n${lineas.join('\n')}\n\nCuento sólo lo que marcó el pluviómetro.`
}

export type FilaVencimiento = {
  fecha: string
  tipo: 'gasto' | 'ingreso'
  monto: number
  descripcion: string | null
  contraparte: string | null
  categoria: string | null
}

export function vencimientos(hoy: string, hasta: string, filas: FilaVencimiento[]): string {
  if (!filas.length) return `No tenés nada pendiente hasta el ${ddmm(hasta)}.`
  const lineas = filas.map((f) => {
    const que = f.descripcion || f.contraparte || f.categoria || (f.tipo === 'gasto' ? 'Pago' : 'Cobro')
    const cuando = f.fecha < hoy ? `venció el ${ddmm(f.fecha)}` : cuandoTexto(f.fecha, hoy)
    return `• ${cuando}: ${que} · ${pesos(f.monto)}${f.tipo === 'ingreso' ? ' a cobrar' : ''}`
  })
  const pagar = filas.filter((f) => f.tipo === 'gasto').reduce((s, f) => s + f.monto, 0)
  const cobrar = filas.filter((f) => f.tipo === 'ingreso').reduce((s, f) => s + f.monto, 0)
  return `Hasta el ${ddmm(hasta)}:\n${lineas.join('\n')}\n\nA pagar: *${pesos(pagar)}* · A cobrar: *${pesos(cobrar)}*`
}

/** grupos: cuántos animales llegaron a ese potrero en cada fecha. */
export function diasEnPotrero(
  hoy: string,
  d: { campo: string; potrero: string; grupos: { desde: string; cabezas: number }[] },
): string {
  if (!d.grupos.length) return `El potrero ${d.potrero} de ${d.campo} está sin animales.`
  const g = [...d.grupos].sort((a, b) => b.cabezas - a.cabezas)
  if (g.length === 1) {
    const x = g[0]
    return `Los ${x.cabezas} animales del ${d.potrero} de ${d.campo} están desde el ${ddmm(x.desde)}: hace *${diasEntre(x.desde, hoy)} días*.`
  }
  const lineas = g.slice(0, 4).map((x) => `• ${x.cabezas} desde el ${ddmm(x.desde)} (hace ${diasEntre(x.desde, hoy)} días)`)
  return `En el ${d.potrero} de ${d.campo} hay animales que entraron en distintas fechas:\n${lineas.join('\n')}`
}

const potreros = (n: number) => `${n} ${n === 1 ? 'potrero' : 'potreros'}`

/** Lo que se anotó y cuánto lleva recorrido hoy: así se ve si le falta algún potrero. */
export function recorridaAnotada(anotados: number, fecha?: string, hoy?: string): string {
  return `Listo, anoté ${potreros(anotados)} en la recorrida de ${fecha && hoy ? cuandoTexto(fecha, hoy) : 'hoy'}.`
}

export function trasRecorrida(anotados: number, avance: { campo: string; recorridos: number; total: number }[], fecha?: string, hoy?: string): string {
  if (!avance.length) return recorridaAnotada(anotados, fecha, hoy)
  const van = avance.map((a) => `${a.recorridos} de ${a.total} en ${a.campo}`).join(', ')
  return `${recorridaAnotada(anotados, fecha, hoy)} ${fecha && hoy && fecha !== hoy ? 'Ese día quedaron' : 'Hoy van'} ${van}.`
}

export function resumenRecorrida(fecha: string, filas: { campo: string; recorridos: number; total: number; pendientes: string[] }[]): string {
  if (!filas.length) return 'Todavía no tengo campos cargados.'
  return `Recorrida del ${ddmm(fecha)}:\n` + filas.map((f) => {
    if (!f.total) return `• *${f.campo}*: sin potreros cargados.`
    const faltan = f.pendientes.length ? `Faltan: ${[...f.pendientes].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).join(', ')}.` : 'Todos tienen una observación registrada.'
    return `• *${f.campo}*: ${f.recorridos} de ${f.total} con observación. ${faltan}`
  }).join('\n') + '\nCuento las observaciones guardadas; no puedo saber qué recorriste sin anotarlo.'
}

export function ultimaObservacion(d: { fecha: string; campo: string; potrero: string; agua: string | null; pasto: string | null; electrico: string | null; conteo: number | null; novedad: string | null } | null, potrero: string, campo: string): string {
  if (!d) return `No tengo observaciones guardadas para el ${potrero} de ${campo}.`
  const detalles = [d.agua ? `aguada ${d.agua}` : '', d.pasto ? `pasto ${d.pasto}` : '', d.electrico ? `eléctrico ${d.electrico === 'ok' ? 'bien' : 'cortado'}` : '', d.conteo !== null ? `${d.conteo} cabezas contadas` : '', d.novedad ?? ''].filter(Boolean)
  return `Última observación del *${d.potrero} de ${d.campo}*, ${ddmm(d.fecha)}: ${detalles.join(', ') || 'sin estados ni novedades detallados'}.\nEs lo registrado ese día; puede haber cambiado.`
}

export function novedades(desde: string, hasta: string, filas: { fecha: string; campo: string; potrero: string; novedad: string }[]): string {
  if (!filas.length) return `No tengo novedades en texto registradas del ${ddmm(desde)} al ${ddmm(hasta)}.`
  return `Novedades registradas del ${ddmm(desde)} al ${ddmm(hasta)}:\n` + filas.slice(0, 10).map((f) => `• ${ddmm(f.fecha)} · ${f.potrero} de ${f.campo}: ${f.novedad}`).join('\n') + (filas.length > 10 ? '\nMuestro las 10 más recientes.' : '') + '\nEste historial no indica si ya se resolvieron.'
}

export function resumenGastos(desde: string, hasta: string, filas: { campo: string; categoria: string; cantidad: number; total: number }[]): string {
  if (!filas.length) return `No tengo gastos registrados del ${ddmm(desde)} al ${ddmm(hasta)} para esa consulta.`
  const total = filas.reduce((s, f) => s + Number(f.total), 0)
  return `Gastos registrados del ${ddmm(desde)} al ${ddmm(hasta)}:\n` + filas.map((f) => `• ${f.campo} · ${f.categoria}: *${pesos(Number(f.total))}* (${f.cantidad} ${f.cantidad === 1 ? 'gasto' : 'gastos'}).`).join('\n') + `\nTotal: *${pesos(total)}*. Según fecha de devengo; excluyo anulados.`
}

export function cargasRecientes(filas: { fecha: string; tipo: string; campo: string; cantidad: number | null }[]): string {
  if (!filas.length) return 'No encontré cargas tuyas de WhatsApp con un registro guardado para esa consulta.'
  return 'Tus últimas cargas guardadas por WhatsApp:\n' + filas.map((f) => {
    const valor = f.tipo === 'lluvia' ? `${mmTexto(Number(f.cantidad))} mm` : f.tipo === 'gasto' ? pesos(Number(f.cantidad)) : 'recorrida'
    return `• ${ddmm(f.fecha)} · ${f.campo}: ${valor}.`
  }).join('\n')
}
