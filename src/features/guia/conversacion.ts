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

export function responderLocal(texto: string, fichas: Ficha[]): Respuesta {
  const t = normalizar(texto)
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
export function sugerenciasDe(campos: CampoMapa[], categoria: CategoriaFicha, fichas: Ficha[]): Sugerencia[] {
  const cabezas = (c: CampoMapa) => c.potreros.reduce((n, p) => n + p.cabezas, 0)
  const grande = [...campos].sort((a, b) => cabezas(b) - cabezas(a))[0]
  const duda = fichas.find((f) => f.categoria === categoria)
  return [
    { texto: grande ? `¿Cuántos animales tengo en ${grande.nombre}?` : '¿Cuántos animales tengo?', icono: 'Vaca' },
    { texto: '¿Cuánto gasté este mes?', icono: 'Plata' },
    ...(duda ? [{ texto: duda.chip, icono: 'Ayuda' as const }] : []),
  ]
}
