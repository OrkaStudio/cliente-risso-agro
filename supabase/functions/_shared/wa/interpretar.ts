// Cómo se le pide al modelo que lea un mensaje, y cómo se limpia lo que devuelve.
// El modelo sólo extrae; no resuelve nombres ni escribe nada.

import { esFecha, sumarDias } from './texto.ts'
import { INTENTS, type Borrador, type Contexto, type Interpretacion } from './tipos.ts'

export const HERRAMIENTA = {
  name: 'interpretar_mensaje',
  description: 'Devuelve lo que el productor quiso decir, sin inventar datos que no dijo.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: [...INTENTS] },
      campo: { type: ['string', 'null'], description: 'El campo tal como lo nombró, o null.' },
      potrero: { type: ['string', 'null'], description: 'El potrero tal como lo nombró ("5", "5B"), o null.' },
      mm: { type: ['number', 'null'] },
      fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD, sólo si dijo cuándo.' },
      monto: { type: ['number', 'null'], description: 'En pesos. "80 mil" = 80000.' },
      categoria: { type: ['string', 'null'], description: 'Una de las categorías de la lista, o null.' },
      contraparte: { type: ['string', 'null'], description: 'A quién le pagó, si lo dijo.' },
      descripcion: { type: ['string', 'null'], description: 'Qué fue, en pocas palabras.' },
      periodo: { type: ['string', 'null'], enum: ['semana', 'mes', 'anio', null] },
    },
    required: ['intent'],
  },
} as const

export function promptInterpretar(texto: string, ctx: Contexto, anterior?: Borrador): string {
  const campos = ctx.campos
    .map((c) => `- ${c.nombre}: potreros ${c.potreros.map((p) => p.nombre).join(', ') || '(sin potreros)'}`)
    .join('\n')
  const cats = ctx.categoriasGasto.map((c) => c.nombre).join(' · ')
  const correccion = anterior
    ? `\nEste mensaje CORRIGE una carga que el bot le propuso: ${JSON.stringify(anterior)}\n` +
      'Devolvé el mismo intent y sólo los datos que el productor cambia; el resto en null.\n'
    : ''
  return `Sos el intérprete de un bot de WhatsApp para productores ganaderos argentinos. Leés UN mensaje del productor y llamás a la herramienta con lo que quiso decir. No le respondés al productor.

Hoy es ${ctx.hoy} (hora de Argentina). "Anoche" o "ayer" es ${sumarDias(ctx.hoy, -1)}.

Campos de esta empresa:
${campos || '(ninguno)'}

Categorías de gasto: ${cats}

intent:
- "lluvia": informa lluvia medida (mm).
- "novedad": un problema u observación de un potrero (molino, aguada, bebedero, alambrado, tranquera, pasto, un animal enfermo).
- "gasto": informa un gasto con monto.
- "consulta_hacienda": pregunta cuántos animales hay.
- "consulta_lluvia": pregunta cuánto llovió.
- "consulta_vencimientos": pregunta qué vence o qué tiene que pagar o cobrar.
- "consulta_dias_potrero": pregunta hace cuánto o desde cuándo están los animales en un potrero.
- "no_soportado": quiere CARGAR algo que el bot todavía no carga: muertes, nacimientos, ventas o compras de hacienda, movimientos entre potreros, caravanas, tacto, pesadas.
- "saludo": saluda o pide ayuda.
- "otro": cualquier otra cosa.

Reglas: null para todo lo que el mensaje no dice. No completes el campo ni el potrero si no los nombró. No conviertas un número de potrero en mm ni en monto.
${correccion}
Mensaje del productor:
"""
${texto.slice(0, 1500)}
"""`
}

/**
 * Pista para la transcripción del audio: los nombres propios de la empresa
 * (campos, potreros) y la jerga del campo, para que "Toimil" o "5B" salgan
 * bien escritos.
 */
export function pistaTranscripcion(ctx: Contexto): string {
  const campos = ctx.campos
    .map((c) => `${c.nombre} (potreros ${c.potreros.map((p) => p.nombre).join(', ')})`)
    .join('; ')
  return (
    `Productor ganadero argentino hablando de su campo. Campos: ${campos}. ` +
    'Palabras frecuentes: milímetros, lluvia, pluviómetro, potrero, gasoil, vacas, terneros, novillos, vaquillonas, veterinario.'
  ).slice(0, 700)
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null)
const numero = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

/** Lo que vuelve del modelo no es de fiar: se valida campo por campo. */
export function limpiarInterpretacion(raw: unknown): Interpretacion {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const intent = INTENTS.includes(o.intent as never) ? (o.intent as Interpretacion['intent']) : 'otro'
  const periodo = ['semana', 'mes', 'anio'].includes(o.periodo as string) ? (o.periodo as Interpretacion['periodo']) : null
  const potrero = o.potrero === null || o.potrero === undefined ? null : texto(String(o.potrero))
  return {
    intent,
    campo: texto(o.campo),
    potrero,
    mm: numero(o.mm),
    fecha: esFecha(o.fecha) ? (o.fecha as string) : null,
    monto: numero(o.monto),
    categoria: texto(o.categoria),
    contraparte: texto(o.contraparte),
    descripcion: texto(o.descripcion),
    periodo,
  }
}
