// Evalúa el intérprete real con datos ficticios y una herramienta sin escrituras.
import { interpretar, MODELO } from '../../functions/wa-webhook/llm.ts'
import type { Contexto } from '../../functions/_shared/wa/tipos.ts'

const ctx: Contexto = {
  hoy: '2026-11-14', nombre: null, categoriasGasto: [],
  campos: [{ id: 'qa', nombre: 'La Porteña', potreros: [{ id: 'qa-12b', nombre: '12B' }, { id: 'qa-1b', nombre: '1B' }] }],
}
const casos = [
  { id: 'vacunacion_y_lluvia', texto: 'Ahí van las terneras que pinchamos ayer en La Porteña con la clostridial. De paso, ¿cuánto llovió ayer ahí?',
    adjunto: 'planilla', esperados: [{ intent: 'vacunacion_planilla', campo: 'La Porteña', vacuna: 'clostridial', fecha: '2026-11-13' },
      { intent: 'consulta_lluvia', campo: 'La Porteña', fecha: '2026-11-13' }] },
  { id: 'lluvia_y_mortandad', texto: '¿Cuánto llovió en el 12B la semana pasada y antes de ayer? En el 1B encontré dos novillos muertos.',
    esperados: [{ intent: 'consulta_lluvia', potrero: '12B' }, { intent: 'consulta_lluvia', potrero: '12B', fecha: '2026-11-12' },
      { intent: 'novedad', mortandad: { potrero: '1B', grupos: [{ categoria: 'novillo', cantidad: 2 }] } }] },
  { id: 'referencia_pdf', texto: 'Esa es la buena, fijate cuánto da y de quién es.', adjunto: 'pdf',
    esperados: [{ intent: 'revisar_pdf' }] },
  { id: 'guardar_ultimo_pdf', texto: 'Bien, guardemos eso', adjunto: 'pdf', origen: 'inmediatamente anterior',
    esperados: [{ intent: 'guardar_pdf' }] },
  { id: 'pedido_de_gasto_con_pdf_reciente', texto: 'Anotá que hoy gasté 12.000 pesos en gasoil.', adjunto: 'pdf', origen: 'reciente',
    esperados: [{ intent: 'gasto', monto: 12000 }] },
  { id: 'saludo_con_consulta_de_pdf', texto: 'Buenas, ¿cuánto da esta factura?', adjunto: 'pdf', origen: 'este mensaje',
    esperados: [{ intent: 'revisar_pdf' }] },
  { id: 'campos_de_mi_cuenta', texto: 'Qué campos tenemos ?', esperados: [{ intent: 'consulta_campos' }] },
  { id: 'mapa_y_animales', texto: 'Quiero ver el potrero 12b con el satélite y saber que tengo ahí adentro',
    esperados: [{ intent: 'consulta_mapa', potrero: '12B' }, { intent: 'consulta_hacienda', potrero: '12B' }] },
  { id: 'saludo_despues_de_mapa', texto: 'Hola', historial: [
    { autor: 'productor', texto: 'Mostrame el 12B' },
    { autor: 'tropero', texto: 'Detalle de 12B.' },
  ], esperados: [{ intent: 'saludo' }] },
  { id: 'pregunta_de_ayuda', texto: '¿Qué podés hacer?', esperados: [{ intent: 'ayuda_general' }] },
  { id: 'vacuna_incompleta', texto: 'Las del archivo son las que vacunamos. Anotalo, por favor.', adjunto: 'planilla',
    esperados: [{ intent: 'vacunacion_planilla', fecha: null, vacuna: null }] },
  { id: 'lectura_no_es_aplicacion', texto: 'Te dejo la lectura que bajé del bastón, después te cuento qué hicimos.', adjunto: 'planilla',
    esperados: [{ intent: 'otro' }] },
  { id: 'dos_consultas', texto: 'Decime cuántas ovejas tengo en el 12B y cuánto llevo gastado este mes.',
    esperados: [{ intent: 'consulta_hacienda', potrero: '12B', categoriaAnimal: 'oveja' }, { intent: 'consulta_gastos' }] },
] as const

function coincide(actual: unknown, esperado: unknown): boolean {
  if (Array.isArray(esperado)) return Array.isArray(actual) && actual.length === esperado.length
    && esperado.every((e, i) => coincide(actual[i], e))
  if (esperado && typeof esperado === 'object') {
    return !!actual && typeof actual === 'object' && Object.entries(esperado)
      .every(([k, v]) => coincide((actual as Record<string, unknown>)[k], v))
  }
  return typeof actual === 'string' && typeof esperado === 'string'
    ? actual.toLocaleLowerCase('es-AR') === esperado.toLocaleLowerCase('es-AR') : actual === esperado
}

const modelos = Deno.args.length ? Deno.args : [MODELO]
if (!Deno.env.get('ANTHROPIC_API_KEY')) {
  console.error('Configurá ANTHROPIC_API_KEY para ejecutar la comparación real.')
  Deno.exit(2)
}
let errores = 0
for (const modelo of modelos) {
  for (const c of casos) {
    const inicio = performance.now()
    let lecturas = 0
    const adjunto = 'adjunto' in c ? c.adjunto : undefined
    try {
      const r = await interpretar(c.texto, ctx, undefined, true, { modelo, historial: 'historial' in c ? [...c.historial] : undefined, adjuntos: adjunto ? {
        adjuntos: [{ numero: 1, tipo: adjunto, nombre: 'muestra.' + (adjunto === 'pdf' ? 'pdf' : 'csv'), origen: 'origen' in c ? c.origen : 'mensaje al que respondió' }],
        leer: () => {
          lecturas++
          return Promise.resolve(adjunto === 'planilla' ? { caravanasDistintas: 30 } : { tipo: 'factura', total: 1210000 })
        },
      } : undefined })
      const obtenidos = r.pedidos.map(p => p.interpretacion)
      const quedan = obtenidos.slice()
      const aciertos = c.esperados.map(esperado => {
        const i = quedan.findIndex(x => coincide(x, esperado))
        if (i < 0) return false
        quedan.splice(i, 1)
        return true
      })
      const correcto = aciertos.every(Boolean) && !quedan.length
      if (!correcto) errores++
      console.log(JSON.stringify({
        caso: c.id, modelo, correcto, aciertos, pedidosExtra: quedan.length,
        lecturas, ms: Math.round(performance.now() - inicio), tokens: r.uso,
        intenciones: obtenidos.map(x => x.intent),
      }))
    } catch (error) {
      errores++
      console.log(JSON.stringify({ caso: c.id, modelo, error: error instanceof Error ? error.message : 'falló', ms: Math.round(performance.now() - inicio) }))
    }
  }
}
if (errores) Deno.exitCode = 1
