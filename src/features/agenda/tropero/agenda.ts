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

/** «Venció hace 2 días», «Vence hoy», «En 9 días»: para el encabezado del panel. */
export function cuandoVence(f: string, hoy: string): { texto: string; tono: 'mal' | 'atencion' | 'bien' } {
  const d = diasEntre(hoy, f)
  if (d < 0) return { texto: d === -1 ? 'Venció ayer' : `Venció hace ${-d} días`, tono: 'mal' }
  if (d === 0) return { texto: 'Vence hoy', tono: 'atencion' }
  if (d === 1) return { texto: 'Vence mañana', tono: 'atencion' }
  return { texto: `En ${d} días`, tono: d <= 7 ? 'atencion' : 'bien' }
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

export type Dia = { fecha: string; items: Vencimiento[]; entra: number; sale: number; vencido: boolean; todoPagado: boolean }

/**
 * Lo de cada día del calendario: qué entra y qué sale (lo pendiente y lo ya
 * pagado, por la fecha en que cae), si algo quedó atrasado y si ya está todo
 * resuelto. Ordenado: lo atrasado primero, después lo que falta, al final lo pagado.
 */
export function porDia(items: Vencimiento[], hoy: string): Map<string, Dia> {
  const dias = new Map<string, Dia>()
  for (const v of items) {
    const f = fechaDe(v)
    if (!f) continue
    const d = dias.get(f) ?? { fecha: f, items: [], entra: 0, sale: 0, vencido: false, todoPagado: true }
    d.items.push(v)
    if (v.tipo === 'ingreso') d.entra += v.monto
    else d.sale += v.monto
    if (pendiente(v)) {
      d.todoPagado = false
      if (f < hoy) d.vencido = true
    }
    dias.set(f, d)
  }
  const peso = (v: Vencimiento) => (pendiente(v) ? (fechaDe(v) < hoy ? 0 : 1) : 2)
  for (const d of dias.values()) d.items.sort((a, b) => peso(a) - peso(b) || b.monto - a.monto)
  return dias
}

export type Semana = { desde: string; hasta: string; titulo: string; items: Vencimiento[]; sale: number; entra: number }

/** «Cuota 2 de 6», si la descripción la trae. */
export const cuotaDe = (v: Vencimiento): string | null => {
  const m = /\(cuota (\d+)\/(\d+)\)/i.exec(v.descripcion ?? '')
  return m ? `Cuota ${m[1]} de ${m[2]}` : null
}

/**
 * Las semanas que vienen (de lunes a domingo), desde la de hoy, con lo que
 * vence en cada una (lo pendiente, más lo que ya se resolvió esta semana) y
 * cuánto sale y entra. Lo vencido de antes no va acá: se pregunta aparte.
 */
export function semanasQueVienen(items: Vencimiento[], hoy: string, n: number): Semana[] {
  const dow = (new Date(dia(hoy)).getUTCDay() + 6) % 7
  const lunes = sumarDias(hoy, -dow)
  const r: Semana[] = []
  for (let i = 0; i < n; i++) {
    const desde = sumarDias(lunes, i * 7)
    const hasta = sumarDias(desde, 6)
    const enSemana = items
      .filter((v) => {
        const f = fechaDe(v)
        if (f < desde || f > hasta) return false
        if (pendiente(v)) return f >= hoy
        return i === 0 && pagado(v)
      })
      .sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)) || Number(pagado(a)) - Number(pagado(b)))
    const pend = enSemana.filter(pendiente)
    const rango = desde.slice(5, 7) === hasta.slice(5, 7) ? `${Number(desde.slice(8))} al ${Number(hasta.slice(8))} de ${nombreMes(hasta.slice(0, 7))}` : `${Number(desde.slice(8))} de ${mesCorto(desde)} al ${Number(hasta.slice(8))} de ${mesCorto(hasta)}`
    r.push({
      desde,
      hasta,
      titulo: i === 0 ? 'Esta semana' : i === 1 ? 'La semana que viene' : `Del ${rango}`,
      items: enSemana,
      sale: pend.filter((v) => v.tipo === 'gasto').reduce((s, v) => s + v.monto, 0),
      entra: pend.filter((v) => v.tipo === 'ingreso').reduce((s, v) => s + v.monto, 0),
    })
  }
  return r
}

const mayusculaInicial = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const fechaCorta = (f: string) => `${Number(f.slice(8, 10))} de ${mesCorto(f)}`

/** Con qué se paga, en palabras («eCheq Galicia 123», «Mercado Pago»). */
export const medioDe = (v: Vencimiento): string | null =>
  v.medio === 'cheque' ? [v.esEcheq ? 'eCheq' : 'Cheque', v.chequeBanco, v.chequeNumero].filter(Boolean).join(' ') : v.medio === 'mercadopago' ? 'Mercado Pago' : v.medio && v.medio !== 'otro' ? mayusculaInicial(v.medio) : null

/**
 * Qué es cada cosa, para el color y la etiqueta. Lo pagado o cobrado va en
 * gris: el verde es sólo plata que entra (Lau, 05/11: «lo pagado no puede estar
 * en verde, se confunde con un ingreso»); lo que debés, en rojo.
 */
export type Clase = 'paga' | 'vencido' | 'cobra' | 'hecho'
export function claseDe(v: Vencimiento, hoy: string): Clase {
  if (!pendiente(v)) return 'hecho'
  if (fechaDe(v) < hoy) return 'vencido'
  return v.tipo === 'ingreso' ? 'cobra' : 'paga'
}

/** La etiqueta de estado: cuándo vence, hace cuánto venció o cuándo se pagó. */
export function estadoTexto(v: Vencimiento, hoy: string): { texto: string; clase: Clase } {
  const clase = claseDe(v, hoy)
  const cobro = v.tipo === 'ingreso'
  if (clase === 'hecho') return { texto: `${cobro ? 'Cobrado' : 'Pagado'}${v.fechaCobroPago ? ` el ${fechaCorta(v.fechaCobroPago)}` : ''}`, clase }
  const c = cuandoVence(fechaDe(v), hoy)
  return { texto: clase === 'vencido' ? `${c.texto}, sin ${cobro ? 'cobrar' : 'pagar'}` : c.texto, clase }
}

export const PILDORA: Record<Clase, string> = {
  paga: 'bg-estado-problema-suave text-estado-problema-texto',
  vencido: 'bg-estado-problema text-superficie',
  cobra: 'bg-estado-bien-suave text-estado-bien-texto',
  hecho: 'bg-superficie-hundida text-texto-suave',
}

/** Los datos de una cosa, en filas: en qué, de qué campo, a quién, cuota, cómo. */
export function datosDe(v: Vencimiento): [string, string][] {
  const cobro = v.tipo === 'ingreso'
  const filas: [string, string | null][] = [
    ['En qué', v.categoria],
    ['Campo', v.campo],
    [cobro ? 'Te paga' : 'A quién', v.contraparte],
    ['Cuota', cuotaDe(v)],
    ['Pactado', pactadoDe(v)],
    ['Cómo', medioDe(v)],
  ]
  return filas.filter((f): f is [string, string] => !!f[1])
}
