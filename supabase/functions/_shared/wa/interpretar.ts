// Cómo se le pide al modelo que lea un mensaje, y cómo se limpia lo que devuelve.
// El modelo sólo extrae; no resuelve nombres ni escribe nada.

import { esFecha, norm, plural, sumarDias } from './texto.ts'
import {
  AGUA, CATEGORIAS_MORTANDAD, ELECTRICO, INTENTS, PASTO,
  ASPECTOS_RECORRIDA, type Borrador, type Contexto, type GrupoMortandad, type Interpretacion, type ObsInterpretada, type PedidoInterpretado, type ReporteMortandad,
} from './tipos.ts'

export const MAX_TEXTO = 12000
export const MAX_OBSERVACIONES = 60
export const MAX_PEDIDOS = 8
export class EntradaIncompleta extends Error {}

export const HERRAMIENTA = {
  name: 'interpretar_mensaje',
  description: 'Devuelve lo que el productor quiso decir, sin inventar datos que no dijo.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: [...INTENTS] },
      otros_registros: { type: 'array', items: { type: 'string' }, description: 'Otros tipos de REGISTRO presentes además del intent elegido: lluvia, gasto, novedad, hacienda. Vacío si hay uno solo; no omitir operaciones mezcladas.' },
      mortandad: {
        type: ['object', 'null'],
        description: 'Animales muertos mencionados como hechos. Completar también si el intent principal es lluvia. Null si no los menciona.',
        properties: {
          campo: { type: ['string', 'null'], description: 'Campo que mencionó para este hecho.' },
          potrero: { type: ['string', 'null'], description: 'Potrero donde dice que murieron. Copiá el nombre textual, incluso si no figura. Null si no lo vinculó claramente con la muerte.' },
          detalle: { type: ['string', 'null'], description: 'Otra novedad vinculada, como una inundación, sin repetir el conteo ni atribuir una causa que no dijo.' },
          grupos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                categoria: { type: 'string', description: 'Nombre singular que dijo el productor, sea o no una categoría de Hacienda.' },
                cantidad: { type: 'integer', minimum: 1 },
              },
              required: ['categoria', 'cantidad'],
            },
          },
        },
        required: ['campo', 'potrero', 'detalle', 'grupos'],
      },
      campo: { type: ['string', 'null'], description: 'El campo tal como lo nombró, o null.' },
      potrero: { type: ['string', 'null'], description: 'El potrero tal como lo nombró ("5", "5B"), o null.' },
      aspecto_observacion: { type: ['string', 'null'], enum: [...ASPECTOS_RECORRIDA, null], description: 'Para reubicar_observacion, el dato que quiere mover. Agua incluye aguada, bebedero o tanque. Null si no identificó el dato.' },
      archivo: { type: ['integer', 'null'], description: 'Número del adjunto inequívoco, o null.' },
      vacuna: { type: ['string', 'null'], description: 'Nombre de la vacuna aplicada, sólo si es explícito.' },
      mm: { type: ['number', 'null'] },
      fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD, sólo si dijo cuándo.' },
      monto: { type: ['number', 'null'], description: 'En pesos. "80 mil" = 80000.' },
      categoria: { type: ['string', 'null'], description: 'Una de las categorías de gastos de la lista, o null.' },
      categoria_animal: { type: ['string', 'null'], enum: [...CATEGORIAS_MORTANDAD, null], description: 'Categoría animal que pregunta en consulta_hacienda. Ejemplo: oveja si pide cuántas ovejas. Null para todo el rodeo.' },
      contraparte: { type: ['string', 'null'], description: 'A quién le pagó, si lo dijo.' },
      descripcion: { type: ['string', 'null'], description: 'Qué fue. Para una nota, conservar el contenido completo que quiere guardar.' },
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

export const HERRAMIENTA_TURNO = {
  name: HERRAMIENTA.name,
  description: 'Identificá todos los pedidos del mensaje, aunque sean distintos o repitan un tipo.',
  input_schema: {
    type: 'object',
    properties: {
      pedidos: {
        type: 'array', minItems: 1, maxItems: MAX_PEDIDOS,
        items: {
          ...HERRAMIENTA.input_schema,
          properties: {
            ...HERRAMIENTA.input_schema.properties,
            fragmento: { type: 'string', description: 'Fragmento literal que describe sólo este pedido. Si otra parte cuenta otro hecho, extraé otro pedido.' },
          },
          required: ['intent', 'fragmento'],
        },
      },
    },
    required: ['pedidos'],
  },
}

export function limpiarPedidos(raw: unknown, textoOriginal: string, fuentes?: string[]): PedidoInterpretado[] {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  // Acepta el contrato anterior durante la transición y para respuestas simples.
  if (!('pedidos' in o)) {
    fuentes?.push(textoOriginal)
    return [{ fragmento: textoOriginal, interpretacion: limpiarInterpretacion(raw) }]
  }
  if (!Array.isArray(o.pedidos) || !o.pedidos.length || o.pedidos.length > MAX_PEDIDOS) {
    throw new EntradaIncompleta('No pude separar todos los pedidos. Mandame el mensaje en partes más cortas.')
  }
  const pedidos: PedidoInterpretado[] = []
  for (const pedido of o.pedidos) {
    const fragmento = typeof pedido?.fragmento === 'string' ? pedido.fragmento.trim() : ''
    if (!fragmento || !textoOriginal.includes(fragmento)) {
      throw new EntradaIncompleta('No pude relacionar todos los pedidos con tu mensaje. ¿Me lo repetís en partes más cortas?')
    }
    fuentes?.push(fragmento)
    const interpretacion = limpiarInterpretacion(pedido)
    const previo = pedidos.at(-1)
    const anterior = previo?.interpretacion
    if (interpretacion.intent === 'consulta_lluvia' && anterior?.intent === 'consulta_lluvia'
      && !interpretacion.campo && !interpretacion.potrero
      && /^(?:[¿¡]\s*)?y\s+(?:antes de ayer|anteayer|ayer|hoy|(?:la )?semana pasada|esta semana|este mes)\b/.test(norm(fragmento))) {
      interpretacion.campo = anterior.campo
      interpretacion.potrero = anterior.potrero
    }
    // «El 12B o todo el campo» ofrece dos formas de cumplir el mismo pedido.
    if (previo && anterior?.intent === 'consulta_mapa' && interpretacion.intent === 'consulta_mapa'
      && Boolean(anterior.potrero) !== Boolean(interpretacion.potrero)) {
      const hastaElFragmento = textoOriginal.slice(0, textoOriginal.indexOf(fragmento))
      const disyuncion = /^[¿¡,;\s]*o\b/.test(norm(fragmento)) || /(?:^|\s)o$/.test(norm(hastaElFragmento))
      const detalle = anterior.potrero ? anterior : interpretacion
      const general = anterior.potrero ? interpretacion : anterior
      if (disyuncion && general.campo && (!detalle.campo || norm(detalle.campo) === norm(general.campo))) {
        if (!anterior.potrero) previo.fragmento = fragmento
        previo.interpretacion = { ...detalle, campo: detalle.campo ?? general.campo }
        previo.campoComoAlternativa = true
        continue
      }
    }
    pedidos.push({ fragmento, interpretacion })
  }
  return pedidos
}

/** Conserva texto que el modelo dejó fuera de sus fragmentos. Jamás genera una carga a partir de ese texto. */
export function textoSinInterpretar(texto: string, fuentes: string[]): PedidoInterpretado[] {
  const ultimas = new Map<string, number>()
  const rangos = fuentes.map(fuente => {
    const desde = texto.indexOf(fuente, ultimas.get(fuente) ?? 0)
    const inicio = desde < 0 ? texto.indexOf(fuente) : desde
    const fin = inicio + fuente.length
    ultimas.set(fuente, fin)
    return { inicio, fin }
  }).filter(r => r.inicio >= 0).sort((a, b) => a.inicio - b.inicio)
  rangos.push({ inicio: texto.length, fin: texto.length })

  const huecos: PedidoInterpretado[] = []
  let cursor = 0
  for (const { inicio, fin } of rangos) {
    const fragmento = inicio > cursor ? texto.slice(cursor, inicio).replace(/^[\s,;:—.!?¿¡]+|[\s,;:—.!?¿¡]+$/g, '') : ''
    cursor = Math.max(cursor, fin)
    const frase = norm(fragmento).replace(/^(?:y |o |ademas |tambien |de paso )+/, '')
    if (/\p{L}|\d/u.test(frase)
      && !/^(?:y|o|de|del|ahí|ahi|en|pero|hola|che|buenas|buen dia|por favor|gracias|de paso|ademas|tambien|nada mas|despues|luego|entonces|bien|bueno|dale|ok|listo|perfecto)$/.test(frase)) {
      huecos.push({ fragmento, interpretacion: limpiarInterpretacion({ intent: 'otro' }), sinInterpretar: true })
    }
  }
  return huecos
}

export function promptInterpretar(texto: string, ctx: Contexto, anterior?: Borrador, varios = false): string {
  if (texto.length > MAX_TEXTO) throw new EntradaIncompleta('El mensaje es demasiado largo para revisarlo completo. Mandalo en dos partes; no guardé una carga parcial. Tu pendiente anterior se conserva.')
  const campos = ctx.campos
    .map((c) => `- ${c.nombre}: potreros ${c.potreros.map((p) => p.nombre).join(', ') || '(sin potreros)'}`)
    .join('\n')
  const cats = ctx.categoriasGasto.map((c) => c.nombre).join(' · ')
  const correccion = anterior
    ? `\nEl bot le propuso esta carga: ${JSON.stringify(anterior)}\n` +
      'Si el productor la corrige, devolvé el mismo intent y sólo los datos que cambia; el resto en null. Si hace una consulta, devolvé el intent de la consulta y sus propios datos.\n'
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
- "reubicar_observacion": corrige el potrero de un dato de una recorrida pendiente. Ejemplo «Lo del bebedero era en el 9B»: aspecto_observacion agua, potrero 9B. No es una observación nueva. Si mencionó un campo de destino, pasalo en campo.
- "consulta_hacienda": pregunta cuántos animales hay o qué animales hay dentro de un potrero. Si pregunta «¿cuántos animales tengo ahí?» después de nombrarlo en otra parte del mismo mensaje, mantené ese referente. Si hay duda, dejá el potrero en null.
- "consulta_campos": pide la lista o los nombres de campos o establecimientos de su cuenta. Ejemplo «¿Qué campos tenemos?». No es ayuda ni un pedido de mapa.
- "consulta_mapa": quiere ver una imagen, la vista completa o el mapa de un campo o potrero. Incluye pedidos como "¿me mostrás el campo La Porteña?". Completá campo y potrero según lo que pide. Si pide todo el campo, potrero queda null. Si da opciones con «o» para ver un potrero o el campo entero, extraé las dos vistas en orden e incluí el «o» en el segundo fragmento literal. El servidor elige cuál mostrar. Si además pide qué tiene adentro del potrero, devolvé también consulta_hacienda con el mismo campo y potrero.
- "consulta_lluvia": pregunta cuánto llovió. Conservá el potrero si lo nombra. Para semana pasada o esta semana, poné periodo "semana" y fecha null. Si pide dos períodos, devolvé dos pedidos de lluvia con fragmentos distintos y conservá el alcance explícito que comparten.
- "consulta_vencimientos": pregunta qué vence o qué tiene que pagar o cobrar.
- "consulta_dias_potrero": pregunta hace cuánto o desde cuándo están los animales en un potrero.
- "consulta_recorrida": pide el resumen de la recorrida de hoy o qué potreros faltan recorrer.
- "consulta_observacion": pregunta qué se anotó por última vez en un potrero; no informa una novedad nueva.
- "consulta_novedades": pide las novedades registradas recientemente, de la última semana o de un campo.
- "consulta_gastos": pregunta cuánto se gastó o pide el resumen de gastos; campo/categoría sólo si los nombró. Por defecto este mes.
- "consulta_cargas": pregunta qué cargó él por WhatsApp últimamente, si quedó registrada una carga o pide sus notas guardadas.
- "no_soportado": quiere REGISTRAR una operación de hacienda: dar de baja o de alta animales, ventas o compras, movimientos entre potreros, caravanas, tacto, pesadas. Lo que VIO en un potrero (una vaca muerta, animales que faltan) es novedad. La solicitud de operación queda conservada como nota de Hacienda para revisar su ejecución.
- "ayuda_gasto": pregunta CÓMO se anota un gasto, un ticket o una factura ("¿cómo cargo un gasto?").
- "ayuda_lluvia": pregunta CÓMO se anota la lluvia.
- "saludo": saluda o pregunta cómo estás, sin un pedido de campo. Si el mensaje tiene otro pedido o un adjunto, no conviertas el saludo en un segundo pedido.
- "ayuda_general": pregunta explícitamente qué puede hacer el bot o cómo usarlo.
- "vacunacion_planilla": informa o quiere anotar lo que ya vacunó y se refiere a una planilla. Entendé giros como "las que pinchamos" según el contexto. Extraé fecha de aplicación, campo, vacuna y archivo si son claros.
- "revisar_pdf": pide leer, aclarar o revisar un PDF adjunto.
- "guardar_pdf": pide conservar un PDF adjunto, por ejemplo "bien, guardemos eso" justo después de un PDF. Si se refiere al último PDF de forma directa, usá el archivo marcado como inmediatamente anterior. Usa gasto si te pide anotar un gasto explícitamente.
- "nota": pide conservar un dato, trabajo o pedido que no tiene una carga específica. Conservá el texto completo en descripcion y su lugar si lo indicó. Una nota puede quedar sin potrero. "Recordá que el herrero trae el portón" es nota.
- "otro": agradecimientos, despedidas, charla informal, preguntas ambiguas sin tipo claro y pedidos fuera del catálogo. No conviertas una charla en una carga.

Reglas: null para todo lo que el mensaje no dice. Completá campo y potrero según el mensaje o un referente inequívoco de la conversación. Un campo completo también puede ser el referente de «ahí». Si pide todos los potreros de ese campo, mantené campo y dejá potrero en null. No conviertas un número de potrero en mm ni en monto.
${varios
    ? 'Separá cada consulta o registro, incluso si repite tipo. Dejá otros_registros vacío. Una mortandad es una novedad independiente y lleva detalle estructurado. Compartí el lugar entre pedidos sólo si el texto indica que es el mismo.'
    : 'Si combina tipos de registro, completá otros_registros. Si combina lluvia y animales muertos, elegí lluvia, incluí novedad y completá mortandad.'}
En mortandad extraé cada especie o categoría y cantidad explícita, incluso cuando no figure en Hacienda. Conservá como novedad las partes que no se puedan estructurar. No atribuyas una causa que el productor no dijo.
En cada mensaje incluí toda observación del productor, aunque sea sobre algo que no está en el catálogo. Para un hecho observado usá novedad y conservá lo que dijo. Para un pedido sin ruta clara, usá otro e incluí su fragmento literal.
Si nombra uno de los campos de la lista, va en campo aunque venga con "para", "de" o "del campo" ("gasoil para Don Gilberto", "para el campo Toimil"); no lo pongas como contraparte.
En novedad, una observación por potrero; si dice el campo una vez, ponelo en cada una.
Si describe el nivel de un bebedero, tanque o aguada, registralo en observaciones[].agua. Nivel bajo o casi vacío es "baja", sin agua es "seca", nivel normal es "normal" y lleno o rebalsado es "llena". Usá novedad para datos adicionales como una rotura. Esto permite después corregir el dato de agua por separado.
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
    ...(['vacunacion_planilla', 'revisar_pdf', 'guardar_pdf'].includes(intent) ? {
      archivo: Number.isSafeInteger(o.archivo) && Number(o.archivo) > 0 ? Number(o.archivo) : null,
      vacuna: texto(o.vacuna)?.slice(0, 120) ?? null,
    } : {}),
    ...(intent === 'reubicar_observacion' ? { aspectoObservacion: deLista(ASPECTOS_RECORRIDA, o.aspecto_observacion) } : {}),
    categoriaAnimal: deLista(CATEGORIAS_MORTANDAD, o.categoria_animal),
    contraparte: texto(o.contraparte),
    descripcion: texto(o.descripcion),
    periodo,
    observaciones: intent === 'novedad' ? limpiarObservaciones(o.observaciones) : [],
    mortandad: limpiarMortandad(o.mortandad),
    otrosRegistros: Array.isArray(o.otros_registros) ? [...new Set(o.otros_registros.filter((v): v is string => typeof v === 'string' && ['lluvia', 'gasto', 'novedad', 'hacienda'].includes(v) && v !== intent))] : [],
  }
}

const deLista = <T extends string>(lista: readonly T[], v: unknown): T | null =>
  lista.includes(v as T) ? (v as T) : null

function limpiarMortandad(raw: unknown): ReporteMortandad | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.grupos) || o.grupos.length > MAX_OBSERVACIONES) return null
  const grupos = new Map<GrupoMortandad['categoria'], number>()
  const otrosGrupos: NonNullable<ReporteMortandad['otrosGrupos']> = []
  for (const item of o.grupos) {
    if (!item || typeof item !== 'object') continue
    const nombre = texto(item.categoria)
    const cantidad = numero(item.cantidad)
    if (!nombre || cantidad === null || !Number.isSafeInteger(cantidad) || cantidad < 1) continue
    const categoria = CATEGORIAS_MORTANDAD.find(c => norm(nombre) === norm(c) || norm(nombre) === norm(plural(c, 2)))
    if (categoria && !grupos.has(categoria)) grupos.set(categoria, cantidad)
    else otrosGrupos.push({ nombre, cantidad })
  }
  if (!grupos.size && !otrosGrupos.length) return null
  return {
    campo: texto(o.campo), potrero: texto(o.potrero), detalle: texto(o.detalle),
    grupos: [...grupos].map(([categoria, cantidad]) => ({ categoria, cantidad })),
    ...(otrosGrupos.length ? { otrosGrupos } : {}),
  }
}

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
