import type { NombreIcono } from '@/components/tropero/icono'
import { buscarFichas, normalizar } from '@/features/guia/buscar'
import type { CategoriaFicha, Ficha } from '@/features/guia/fichas'
import type { CampoMapa } from '@/features/mapa/reglas'

// La conversación con el asistente (Lau, 28/10: que se le pueda preguntar lo que
// sea, como al bot de WhatsApp). Hoy contesta las dudas de la app con las fichas;
// las preguntas sobre los datos del campo las va a contestar el mismo cerebro del
// bot (función `asistente`). Esta es la única pieza que cambia cuando se conecte.

export type Respuesta = {
  texto: string
  accion?: { texto: string; ruta: string; ancla: string | null }
  /** Ofrecer a una persona por WhatsApp, con la pregunta ya escrita. */
  persona?: boolean
}

export type Mensaje = { id: number; de: 'yo' | 'tropero'; texto: string; accion?: Respuesta['accion']; persona?: boolean }

/** Preguntas sobre los números del campo: las contesta el cerebro del bot, no las fichas. */
const DE_DATOS = /\b(cuant[oa]s?|cuanto|plata|gane|gano|ganancia|resultado|gaste|gasto|gastos|cobr|pague|llovio|lluvia|cabezas|tengo|vence|vencimiento)/
// De qué sección es una pregunta de números, para no contestar (ni derivar) lo que no está habilitado.
const DE_PLATA = /\b(plata|gane|gano|ganancia|resultado|gaste|gasto|gastos|cobr|pague|pagar|vence|vencimiento|rinde|rentab)/
const DE_HACIENDA = /\b(cabezas|animales|vacas|terneros|novillos|toros|hacienda|rodeo)/
const DE_CAMPOS = /\b(llovio|lluvia|potrero|potreros|recorrida|pasto)/

/** Qué secciones ve quien pregunta. Sin datos, todo (el dueño). */
export type PermisosAsistente = { plata: boolean; hacienda: boolean; campos: boolean }
const TODO: PermisosAsistente = { plata: true, hacienda: true, campos: true }

export function responderLocal(texto: string, fichas: Ficha[], ve: PermisosAsistente = TODO): Respuesta {
  const t = normalizar(texto)
  // Lo que no tiene habilitado se dice; no se manda a buscarlo por WhatsApp (permisos, 13/11).
  const noVe = DE_PLATA.test(t) && !ve.plata ? 'la plata la maneja' : DE_HACIENDA.test(t) && !ve.hacienda ? 'la hacienda la maneja' : DE_CAMPOS.test(t) && !ve.campos ? 'los campos los maneja' : null
  if (noVe) return { texto: `Eso no te lo puedo contestar: ${noVe} el dueño del campo. Si lo necesitás, pedile que te lo habilite.` }
  const ficha = buscarFichas(fichas, texto, 1)[0]
  // Una pregunta de números no se contesta con una ficha que apenas se le parece.
  if (DE_DATOS.test(t) && !(ficha && normalizar(ficha.chip) === t)) {
    return {
      texto: 'Todavía no puedo leer tus números desde acá. Por WhatsApp sí: preguntámelo ahí y te contesto con tus datos.',
      persona: true,
    }
  }
  if (ficha) return { texto: ficha.respuesta, accion: ficha.accion && { texto: ficha.accion.label, ruta: ficha.accion.ruta, ancla: ficha.accion.ancla } }
  return { texto: 'No tengo esa respuesta todavía. Te contesta una persona por WhatsApp, con tu pregunta ya escrita.', persona: true }
}

export type Sugerencia = { texto: string; icono: NombreIcono }

/** Ejemplos de lo que se le puede preguntar, con sus campos: animales, plata y una duda de la sección donde está. */
export function sugerenciasDe(campos: CampoMapa[], categoria: CategoriaFicha, fichas: Ficha[], ve: PermisosAsistente = TODO): Sugerencia[] {
  const cabezas = (c: CampoMapa) => c.potreros.reduce((n, p) => n + p.cabezas, 0)
  const grande = [...campos].sort((a, b) => cabezas(b) - cabezas(a))[0]
  const duda = fichas.find((f) => f.categoria === categoria)
  return [
    ...(ve.hacienda ? [{ texto: grande ? `¿Cuántos animales hay en ${grande.nombre}?` : '¿Cuántos animales hay?', icono: 'Vaca' as const }] : []),
    ...(ve.plata ? [{ texto: '¿Cuánto gasté este mes?', icono: 'Plata' as const }] : []),
    ...(duda ? [{ texto: duda.chip, icono: 'Ayuda' as const }] : []),
  ]
}
