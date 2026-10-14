import { hoyAR, norm, sumarDias } from './texto.ts'

export type PeriodoSemana = { desde: string; hasta: string; corte: string; vencimientosHasta: string }
/** Siete días completos anteriores al día del envío. El sábado cubre sábado-viernes. */
export function periodoSemana(ahora = new Date()): PeriodoSemana {
  const corte = hoyAR(ahora)
  return { desde: sumarDias(corte, -7), hasta: sumarDias(corte, -1), corte, vencimientosHasta: sumarDias(corte, 6) }
}

/** Ventana de una hora: empieza a las 09:00 AR, permite reintentos seguros del cron. */
export function horarioSemanal(ahora = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(ahora)
  return parts.find(p => p.type === 'weekday')?.value === 'Sat' && parts.find(p => p.type === 'hour')?.value === '09'
}

export type ComandoSemanal = 'activar' | 'desactivar' | 'ver' | null
export function comandoSemanal(texto: string): ComandoSemanal {
  const t = norm(texto).replace(/[¿?¡!.,]/g, '').trim()
  if (/^(activar|activa|activame|quiero recibir|suscribirme al) (el )?resumen semanal$/.test(t)) return 'activar'
  if (/^(desactivar|desactiva|cancelar|dar de baja|no quiero recibir) (el )?resumen semanal$/.test(t)) return 'desactivar'
  if (/^((ver|mostrame|enviame|mandame|quiero ver|quiero) )?(el |mi )?resumen (semanal|de (la |esta )semana)( del campo)?$/.test(t)) return 'ver'
  return null
}

export type SemanaCampo = {
  empresa: string
  periodo: PeriodoSemana
  lluvia: { campo: string; mediciones: number; mm: number }[]
  recorridas: { campo: string; dias: number; observaciones: number; potreros: number }[]
  observaciones: { fecha: string; campo: string; potrero: string; agua: string | null; pasto: string | null; electrico: string | null; conteo: number | null; novedad: string | null }[]
  gastos: { campo: string; categoria: string; cantidad: number; total: number }[]
  hacienda: { campo: string; categoria: string; cabezas: number }[]
  vencimientos: { fecha: string; tipo: string; monto: number; descripcion: string | null; contraparte: string | null; categoria: string | null }[]
}

export type LineaInforme = { tipo: 'titulo' | 'texto'; texto: string }
const fecha = (f: string) => f.split('-').reverse().join('/')
const plata = (n: number) => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function lineasSemana(s: SemanaCampo): LineaInforme[] {
  const lines: LineaInforme[] = []
  const title = (texto: string) => lines.push({ tipo: 'titulo', texto })
  const text = (texto: string) => lines.push({ tipo: 'texto', texto })
  text(`${s.empresa} | ${fecha(s.periodo.desde)} al ${fecha(s.periodo.hasta)}`)
  text('Resumen de registros de Tropero, ingresados desde la app o WhatsApp. Los datos ausentes no significan que no haya ocurrido actividad.')
  title('Lluvia medida')
  if (!s.lluvia.length) text('Sin mediciones manuales registradas en el período.')
  for (const f of s.lluvia) text(`${f.campo}: ${f.mm.toLocaleString('es-AR')} mm en ${f.mediciones} mediciones. No incluye lluvia estimada.`)
  title('Recorridas registradas')
  if (!s.recorridas.length) text('Sin recorridas registradas en el período.')
  for (const f of s.recorridas) text(`${f.campo}: ${f.dias} días con recorrida, ${f.observaciones} observaciones y ${f.potreros} potreros con registro. No equivale a visitas verificadas físicamente.`)
  title('Observaciones y novedades')
  if (!s.observaciones.length) text('Sin observaciones registradas en el período.')
  for (const f of s.observaciones) {
    const states = [f.agua && `agua ${f.agua}`, f.pasto && `pasto ${f.pasto}`, f.electrico && `eléctrico ${f.electrico}`, f.conteo !== null && `conteo ${f.conteo}`].filter(Boolean)
    text(`${fecha(f.fecha)} | ${f.campo}, potrero ${f.potrero}: ${[...states, f.novedad].filter(Boolean).join('; ') || 'sin detalle adicional'}`)
  }
  text('Las novedades son históricas: el informe no supone que un incidente sigue abierto. Una muerte anotada no realiza la baja en Hacienda.')
  title('Gastos por devengo')
  if (!s.gastos.length) text('Sin gastos registrados en el período según fecha de devengo.')
  for (const f of s.gastos) text(`${f.campo} | ${f.categoria}: ${plata(f.total)} (${f.cantidad} movimiento${f.cantidad===1?'':'s'}).`)
  text(`Total: ${plata(s.gastos.reduce((t, f) => t + f.total, 0))}. Excluye ingresos y movimientos anulados; no equivale al flujo de caja pagado.`)
  title('Hacienda al corte')
  if (!s.hacienda.length) text('Sin animales activos visibles al generar el informe.')
  for (const f of s.hacienda) text(`${f.campo}: ${f.cabezas} ${f.categoria}.`)
  text('Estado actual al generar el informe. No representa altas, bajas ni movimientos netos de la semana.')
  title('Vencidos y próximos vencimientos')
  text(`Pendientes hasta ${fecha(s.periodo.vencimientosHasta)}, incluyendo vencidos anteriores.`)
  if (!s.vencimientos.length) text('Sin vencimientos pendientes registrados hasta esa fecha.')
  for (const f of s.vencimientos) text(`${fecha(f.fecha)}${f.fecha < s.periodo.corte ? ' (vencido)' : ''}: ${f.descripcion || f.contraparte || f.categoria || 'Movimiento'} | ${plata(f.monto)} ${f.tipo === 'ingreso' ? 'a cobrar' : 'a pagar'}.`)
  title('Tu resumen semanal')
  text('Envío los sábados a las 09:00, hora de Argentina, cuando está activado. Para dejar de recibirlo: desactivar resumen semanal. Para pedirlo: resumen semanal.')
  return lines
}

export type EnvioSemanaDeps = {
  reclamar: () => Promise<boolean>
  preparar: () => Promise<void>
  listoParaEnviar: () => Promise<boolean>
  marcarEnviando: () => Promise<boolean>
  enviar: () => Promise<string>
  guardarEnviado: (wamid: string) => Promise<void>
  fallo: (fase: 'preparacion' | 'envio', error: unknown) => Promise<void>
}
/** No se reintenta automáticamente un envío de resultado incierto. */
export async function ejecutarEnvioSemana(d: EnvioSemanaDeps): Promise<'ocupado' | 'enviado' | 'baja' | 'fallo'> {
  if (!(await d.reclamar())) return 'ocupado'
  let fase: 'preparacion' | 'envio' = 'preparacion'
  try {
    await d.preparar()
    if (!(await d.listoParaEnviar())) return 'baja'
    if (!(await d.marcarEnviando())) return 'baja'
    fase = 'envio'
    const wamid = await d.enviar()
    await d.guardarEnviado(wamid)
    return 'enviado'
  } catch (error) {
    await d.fallo(fase, error)
    return 'fallo'
  }
}
