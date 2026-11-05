import type { Vencimiento } from '@/features/agenda/api'

// Agenda (rediseño, Figma página 35 «Agenda»): las cuentas de cada pestaña.
// Sin React ni red.

const MS_DIA = 86_400_000
const dia = (ymd: string) => Date.parse(`${ymd}T12:00:00`)
export const diasEntre = (desde: string, hasta: string) => Math.round((dia(hasta) - dia(desde)) / MS_DIA)
const sumarDias = (ymd: string, n: number) => new Date(dia(ymd) + n * MS_DIA).toISOString().slice(0, 10)

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] ?? ''
export const mesCorto = (ymd: string) => nombreMes(ymd.slice(0, 7)).slice(0, 3)

export const pendiente = (v: Vencimiento) => v.estado === 'pendiente' && !!v.fechaVencimiento
export const pagado = (v: Vencimiento) => v.estado === 'liquidado' && !!v.fechaCobroPago
/** La fecha en que cae en la Agenda: el vencimiento si falta, el día que se pagó si ya está. */
export const fechaDe = (v: Vencimiento) => (pendiente(v) ? v.fechaVencimiento! : (v.fechaCobroPago ?? v.fechaVencimiento ?? ''))

/** El nombre de una fila: lo que se anotó, sin el «(cuota 2/6)» ni la estimación del alquiler. */
export function tituloDe(v: Vencimiento): string {
  const t = (v.descripcion || v.categoria || (v.tipo === 'ingreso' ? 'Cobro' : 'Pago')).replace(/\s*\(cuota \d+\/\d+\)$/i, '').split(' · ')[0]!
  // «eCheq» se escribe así: no se le pone mayúscula.
  return /^eCheq/i.test(t) ? `eCheq${t.slice(5)}` : t.charAt(0).toUpperCase() + t.slice(1)
}

/** Lo pactado del alquiler («1.552 kg de novillo/mes»), si la descripción lo trae. */
export const pactadoDe = (v: Vencimiento): string | null => (v.descripcion ?? '').split(' · ')[1] ?? null

/** Los próximos 30 días: lo que se cobra, lo que se paga y lo vencido (también cuenta: hay que pagarlo). */
export function proximos30(items: Vencimiento[], hoy: string) {
  const hasta = sumarDias(hoy, 30)
  let cobra = 0
  let paga = 0
  let vencidas = 0
  for (const v of items) {
    if (!pendiente(v) || v.fechaVencimiento! > hasta) continue
    if (v.fechaVencimiento! < hoy) vencidas++
    if (v.tipo === 'ingreso') cobra += v.monto
    else paga += v.monto
  }
  return { cobra, paga, queda: cobra - paga, vencidas }
}

export type Grupo = { clave: string; titulo: string; items: Vencimiento[] }

/**
 * «Lo que viene» en grupos como se dice: lo vencido, esta semana (de lunes a
 * domingo), la que viene, y después por mes.
 */
export function gruposLoQueViene(items: Vencimiento[], hoy: string): Grupo[] {
  const dow = (new Date(dia(hoy)).getUTCDay() + 6) % 7
  const finSemana = sumarDias(hoy, 6 - dow)
  const finProxima = sumarDias(finSemana, 7)
  const grupos = new Map<string, Grupo>()
  const meter = (clave: string, titulo: string, v: Vencimiento) => {
    const g = grupos.get(clave) ?? { clave, titulo, items: [] }
    g.items.push(v)
    grupos.set(clave, g)
  }
  for (const v of items.filter(pendiente).sort((a, b) => a.fechaVencimiento!.localeCompare(b.fechaVencimiento!))) {
    const f = v.fechaVencimiento!
    if (f < hoy) meter('0', 'Vencido', v)
    else if (f <= finSemana) meter('1', 'Esta semana', v)
    else if (f <= finProxima) meter('2', 'La que viene', v)
    else {
      const ym = f.slice(0, 7)
      meter(`3${ym}`, `${nombreMes(ym).replace(/^\w/, (c) => c.toUpperCase())}${ym.slice(0, 4) !== hoy.slice(0, 4) ? ` ${ym.slice(0, 4)}` : ''}`, v)
    }
  }
  return [...grupos.values()].sort((a, b) => a.clave.localeCompare(b.clave))
}

/** «Venció hace 2 días», «Vence hoy», «En 9 días»: para el encabezado del panel. */
export function cuandoVence(f: string, hoy: string): { texto: string; tono: 'mal' | 'atencion' | 'bien' } {
  const d = diasEntre(hoy, f)
  if (d < 0) return { texto: d === -1 ? 'Venció ayer' : `Venció hace ${-d} días`, tono: 'mal' }
  if (d === 0) return { texto: 'Vence hoy', tono: 'atencion' }
  if (d === 1) return { texto: 'Vence mañana', tono: 'atencion' }
  return { texto: `En ${d} días`, tono: d <= 7 ? 'atencion' : 'bien' }
}

export type Serie = { serieId: string; nombre: string; detalle: string; total: number; pagadas: number; cuota: number; falta: number; proxima: string | null; tipo: Vencimiento['tipo'] }

/** Las compras en cuotas: cuántas se pagaron, cuánto falta y la próxima. Sólo las que tienen algo pendiente. */
export function series(items: Vencimiento[]): Serie[] {
  const porSerie = new Map<string, Vencimiento[]>()
  for (const v of items) if (v.serieId) porSerie.set(v.serieId, [...(porSerie.get(v.serieId) ?? []), v])
  const r: Serie[] = []
  for (const [serieId, vs] of porSerie) {
    const orden = [...vs].sort((a, b) => (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? ''))
    const pendientes = orden.filter((v) => v.estado === 'pendiente')
    if (!pendientes.length) continue
    const v0 = orden[0]!
    r.push({
      serieId,
      nombre: tituloDe(v0),
      detalle: [v0.campo, v0.categoria].filter(Boolean).join(', '),
      total: orden.length,
      pagadas: orden.filter((v) => v.estado === 'liquidado').length,
      cuota: v0.monto,
      falta: pendientes.reduce((s, v) => s + v.monto, 0),
      proxima: pendientes[0]!.fechaVencimiento,
      tipo: v0.tipo,
    })
  }
  return r.sort((a, b) => (a.proxima ?? '').localeCompare(b.proxima ?? ''))
}

export type EstadoCheque = 'En cartera' | 'Por debitar' | 'Cobrado' | 'Debitado'

/** Los cheques: los que tenés para cobrar (en cartera), los que diste (por debitar) y los ya cerrados, recientes. */
export function cheques(items: Vencimiento[], hoy: string) {
  const desde = sumarDias(hoy, -60)
  const lista = items
    .filter((v) => v.medio === 'cheque' && (pendiente(v) || (pagado(v) && v.fechaCobroPago! >= desde)))
    .map((v) => ({ v, estado: (pendiente(v) ? (v.tipo === 'ingreso' ? 'En cartera' : 'Por debitar') : v.tipo === 'ingreso' ? 'Cobrado' : 'Debitado') as EstadoCheque }))
    .sort((a, b) => Number(pagado(a.v)) - Number(pagado(b.v)) || fechaDe(a.v).localeCompare(fechaDe(b.v)))
  const enCartera = lista.filter((c) => c.estado === 'En cartera').reduce((s, c) => s + c.v.monto, 0)
  const emitidos = lista.filter((c) => c.estado === 'Por debitar').reduce((s, c) => s + c.v.monto, 0)
  return { lista, enCartera, emitidos }
}

export type Mes = { ym: string; entro: number; salio: number; items: Vencimiento[] }

/** «Ya pagado» por mes, del más nuevo al más viejo, con lo que entró y salió. */
export function pagadoPorMes(items: Vencimiento[]): Mes[] {
  const meses = new Map<string, Mes>()
  for (const v of items.filter(pagado)) {
    const ym = v.fechaCobroPago!.slice(0, 7)
    const m = meses.get(ym) ?? { ym, entro: 0, salio: 0, items: [] }
    if (v.tipo === 'ingreso') m.entro += v.monto
    else m.salio += v.monto
    m.items.push(v)
    meses.set(ym, m)
  }
  for (const m of meses.values()) m.items.sort((a, b) => b.fechaCobroPago!.localeCompare(a.fechaCobroPago!))
  return [...meses.values()].sort((a, b) => b.ym.localeCompare(a.ym))
}

/** Las semanas del mes para el calendario (de lunes a domingo), con los días de afuera para completar. */
export function semanasDelMes(ym: string): string[][] {
  const primero = `${ym}-01`
  const dow = (new Date(dia(primero)).getUTCDay() + 6) % 7
  let d = sumarDias(primero, -dow)
  const semanas: string[][] = []
  do {
    const s: string[] = []
    for (let i = 0; i < 7; i++) {
      s.push(d)
      d = sumarDias(d, 1)
    }
    semanas.push(s)
  } while (d.slice(0, 7) === ym)
  return semanas
}
export const mesVecino = (ym: string, n: number) => {
  const [a, m] = ym.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7)
}
