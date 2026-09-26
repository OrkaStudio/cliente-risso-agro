// Los textos que devuelve el bot a partir de datos de la base. Puros: los
// números los trae la Edge Function; acá sólo se arma cómo se dicen.
// Cada carga confirmada vuelve con un dato, no con "ok".

import { cuandoTexto, ddmm, diasEntre, mmTexto, nombreMes, pesos, plural } from './texto.ts'

export function trasLluvia(d: { campo: string; hoy: string; mesMm: number; anteriorMm: number | null }): string {
  const base = `Listo. Van *${mmTexto(d.mesMm)} mm* en ${nombreMes(d.hoy)} en ${d.campo}`
  return d.anteriorMm === null ? `${base}.` : `${base}; el año pasado a esta altura iban ${mmTexto(d.anteriorMm)}.`
}

export function trasGasto(d: { hoy: string; categoria: string; total: number; cantidad: number }): string {
  return `Listo, quedó en Analítica. En ${nombreMes(d.hoy)} llevás *${pesos(d.total)}* en ${d.categoria} (${d.cantidad} ${d.cantidad === 1 ? 'carga' : 'cargas'}).`
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
