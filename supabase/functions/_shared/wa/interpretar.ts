// Cómo se le pide al modelo que lea un mensaje, y cómo se limpia lo que devuelve.
// El modelo sólo extrae; no resuelve nombres ni escribe nada.

import { esFecha, sumarDias } from './texto.ts'
import {
  AGUA, ELECTRICO, INTENTS, PASTO,
  type Borrador, type Contexto, type Interpretacion, type ObsInterpretada,
} from './tipos.ts'

export const MAX_TEXTO = 12000
export const MAX_OBSERVACIONES = 60
export class EntradaIncompleta extends Error {}

export const HERRAMIENTA = {
  name: 'interpretar_mensaje',
  description: 'Devuelve lo que el productor quiso decir, sin inventar datos que no dijo.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: [...INTENTS] },
      otros_registros: { type: 'array', items: { type: 'string' }, description: 'Otros tipos de REGISTRO presentes además del intent elegido: lluvia, gasto, novedad, hacienda. Vacío si hay uno solo; no omitir operaciones mezcladas.' },
      campo: { type: ['string', 'null'], description: 'El campo tal como lo nombró, o null.' },
      potrero: { type: ['string', 'null'], description: 'El potrero tal como lo nombró ("5", "5B"), o null.' },
      mm: { type: ['number', 'null'] },
      fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD, sólo si dijo cuándo.' },
      monto: { type: ['number', 'null'], description: 'En pesos. "80 mil" = 80000.' },
      categoria: { type: ['string', 'null'], description: 'Una de las categorías de la lista, o null.' },
      contraparte: { type: ['string', 'null'], description: 'A quién le pagó, si lo dijo.' },
      descripcion: { type: ['string', 'null'], description: 'Qué fue, en pocas palabras.' },
      periodo: { type: ['string', 'null'], enum: ['semana', 'mes', 'anio', null] },
      observaciones: {
        type: 'array',
        description: 'Sólo para intent "novedad": una por potrero, en el orden en que los nombró.',
        items: {
          type: 'object',
          properties: {
            potrero: { type: ['string', 'null'], description: 'Como lo nombró ("2", "5B"). null si dijo "acá" o no lo dijo.' },
            campo: { type: ['string', 'null'], description: 'El campo si lo nombró en el mensaje, en cada observación.' },
            aca: { type: 'boolean', description: 'true si es el potrero donde está: "acá", "en este", "en el que estoy".' },
            agua: {
              type: ['string', 'null'], enum: [...AGUA, null],
              description: 'Sólo la aguada, bebedero o tanque: llena (también rebalsando), normal, baja, seca. "Mucha agua" sin decir que es la aguada: null y va en novedad.',
            },
            pasto: { type: ['string', 'null'], enum: [...PASTO, null] },
            electrico: { type: ['string', 'null'], enum: [...ELECTRICO, null], description: 'El eléctrico o boyero: cortado si no anda.' },
            conteo: {
              type: ['number', 'null'],
              description: 'Total de animales del potrero, sólo si contó todos ("hay 80 cabezas"). Si contó una categoría ("15 terneros") o faltan animales, va en novedad.',
            },
            novedad: {
              type: ['string', 'null'],
              description: 'Lo demás, corto y con sus palabras: "faltan 2 terneros", "vaca muerta, caravana 4521", "molino roto", "15 terneros", "mucha agua".',
            },
          },
          required: ['aca'],
        },
      },
    },
    required: ['intent'],
  },
} as const

export function promptInterpretar(texto: string, ctx: Contexto, anterior?: Borrador): string {
  if (texto.length > MAX_TEXTO) throw new EntradaIncompleta('El mensaje es demasiado largo para revisarlo completo. Mandalo en dos partes; no guardé una carga parcial. Tu pendiente anterior se conserva.')
  const campos = ctx.campos
    .map((c) => `- ${c.nombre}: potreros ${c.potreros.map((p) => p.nombre).join(', ') || '(sin potreros)'}`)
    .join('\n')
  const cats = ctx.categoriasGasto.map((c) => c.nombre).join(' · ')
  const correccion = anterior
    ? `\nEste mensaje CORRIGE una carga que el bot le propuso: ${JSON.stringify(anterior)}\n` +
      'Devolvé el mismo intent y sólo los datos que el productor cambia; el resto en null.\n'
    : ''
  return `Sos el intérprete de un bot de WhatsApp para productores ganaderos argentinos. Leés UN mensaje del productor y llamás a la herramienta con lo que quiso decir. No le respondés al productor.

El mensaje fue recibido el ${ctx.fechaMensaje ?? ctx.hoy} (hora de Argentina). "Hoy" refiere a ese día; "anoche" o "ayer" es ${sumarDias(ctx.fechaMensaje ?? ctx.hoy, -1)}.

Campos de esta empresa:
${campos || '(ninguno)'}

Categorías de gasto: ${cats}

intent:
- "lluvia": informa lluvia medida (mm).
- "novedad": cuenta lo que vio recorriendo uno o más potreros: agua, pasto, eléctrico, animales contados, faltantes, muertos o enfermos, roturas (molino, aguada, bebedero, alambrado, tranquera). Una vaca muerta encontrada es novedad.
- "gasto": informa un gasto con monto.
- "consulta_hacienda": pregunta cuántos animales hay.
- "consulta_lluvia": pregunta cuánto llovió.
- "consulta_vencimientos": pregunta qué vence o qué tiene que pagar o cobrar.
- "consulta_dias_potrero": pregunta hace cuánto o desde cuándo están los animales en un potrero.
- "consulta_recorrida": pide el resumen de la recorrida de hoy o qué potreros faltan recorrer.
- "consulta_observacion": pregunta qué se anotó por última vez en un potrero; no informa una novedad nueva.
- "consulta_novedades": pide las novedades registradas recientemente, de la última semana o de un campo.
- "consulta_gastos": pregunta cuánto se gastó o pide el resumen de gastos; campo/categoría sólo si los nombró. Por defecto este mes.
- "consulta_cargas": pregunta qué cargó él por WhatsApp últimamente o si quedó registrada una carga.
- "no_soportado": quiere REGISTRAR una operación de hacienda: dar de baja o de alta animales, ventas o compras, movimientos entre potreros, caravanas, tacto, pesadas. Lo que VIO en un potrero (una vaca muerta, animales que faltan) es novedad.
- "ayuda_gasto": pregunta CÓMO se anota un gasto, un ticket o una factura ("¿cómo cargo un gasto?").
- "ayuda_lluvia": pregunta CÓMO se anota la lluvia.
- "saludo": saluda o pide ayuda en general ("¿qué podés hacer?").
- "otro": cualquier otra cosa.

Reglas: null para todo lo que el mensaje no dice. No completes el campo ni el potrero si no los nombró. No conviertas un número de potrero en mm ni en monto.
Si combina tipos de registro (por ejemplo lluvia y gasto), completá otros_registros con los tipos adicionales. No omitas la segunda operación ni confundas una pregunta con un registro.
Si nombra uno de los campos de la lista, va en campo aunque venga con "para", "de" o "del campo" ("gasoil para Don Gilberto", "para el campo Toimil"); no lo pongas como contraparte.
En novedad, una observación por potrero; si dice el campo una vez, ponelo en cada una.
Una observación con un potrero que no figura en la lista sigue siendo "novedad": devolvé el nombre que dijo. El código comprueba si existe; no la conviertas en "otro" por ese motivo.
${correccion}
Mensaje del productor:
"""
${texto}
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
  ).slice(0, 3500)
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
    ...(o.fecha != null && !esFecha(o.fecha) ? { fechaInvalida: true } : {}),
    monto: numero(o.monto),
    categoria: texto(o.categoria),
    contraparte: texto(o.contraparte),
    descripcion: texto(o.descripcion),
    periodo,
    observaciones: intent === 'novedad' ? limpiarObservaciones(o.observaciones) : [],
    otrosRegistros: Array.isArray(o.otros_registros) ? [...new Set(o.otros_registros.filter((v): v is string => typeof v === 'string' && ['lluvia', 'gasto', 'novedad', 'hacienda'].includes(v) && v !== intent))] : [],
  }
}

const deLista = <T extends string>(lista: readonly T[], v: unknown): T | null =>
  lista.includes(v as T) ? (v as T) : null

/** Un límite debe ser explícito: nunca devolver sólo un prefijo de la recorrida. */
function limpiarObservaciones(raw: unknown): ObsInterpretada[] {
  if (!Array.isArray(raw)) return []
  if (raw.length > MAX_OBSERVACIONES) throw new EntradaIncompleta('La recorrida tiene demasiadas observaciones para revisarlas juntas. Mandala en partes; no guardé una parte sin avisarte.')
  return raw.flatMap((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const conteo = numero(o.conteo)
    const obs: ObsInterpretada = {
      potrero: o.potrero === null || o.potrero === undefined ? null : texto(String(o.potrero)),
      campo: texto(o.campo),
      aca: o.aca === true,
      agua: deLista(AGUA, o.agua),
      pasto: deLista(PASTO, o.pasto),
      electrico: deLista(ELECTRICO, o.electrico),
      conteo: conteo === null ? null : Math.round(conteo),
      novedad: texto(o.novedad),
    }
    const algo = obs.agua || obs.pasto || obs.electrico || obs.conteo !== null || obs.novedad
    return algo ? [obs] : []
  })
}
