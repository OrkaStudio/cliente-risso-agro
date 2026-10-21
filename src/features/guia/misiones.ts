import { catastroAutomatico, plural, type Resumen } from '@/features/guia/estado'

/**
 * Misiones del asistente — enseñar HACIENDO (TASK-063, segunda vuelta).
 *
 * Una misión es una cosa chica y real que el productor termina en minutos
 * usando la app de verdad: la burbuja se pega al botón que toca, dice UNA
 * línea, y cada paso se da por hecho cuando pasó lo que tenía que pasar
 * (se abrió el diálogo, se guardó el contorno) — nunca por "Seguir". La
 * página queda usable entera; no hay velo.
 *
 * Reglas de redacción: una línea, un verbo, ≤ 12 palabras, en criollo. Decir
 * dónde está el dato físico cuando hace falta (la boleta de ARBA). Nada de
 * explicar la pantalla: el productor la está viendo.
 *
 * Definiciones PURAS (sin React ni DOM): se prueban con vitest. El motor que
 * las corre vive en mision.tsx.
 */

export type MisionId = 'campo-en-mapa' | 'primer-potrero' | 'ubicar-hacienda'

/** Lo que un paso puede mirar para saber si ya pasó. */
export type Contexto = {
  resumen: Resumen
  pathname: string
  /** Consultas al DOM ya resueltas por el motor (puras para el paso). */
  dialogoAbierto: boolean
  /** Anclas `data-guia` presentes en pantalla ahora. */
  anclas: Set<string>
}

export type PasoMision = {
  /** Ruta donde vive el botón; el motor lleva al productor si no está ahí. */
  ruta: string
  /** `data-guia` del elemento al que se pega la burbuja. */
  ancla: string
  texto: string
  /** El elemento vive dentro de un diálogo: la burbuja va por encima del modal. */
  sobreDialogo?: boolean
  /** Ya pasó lo que este paso esperaba → el motor avanza solo. */
  hecho: (c: Contexto) => boolean
  /**
   * En esa pantalla acompaña otro: el editor del mapa de Campos tiene su propio
   * asistente, que sabe en qué paso está. El motor sólo lleva hasta ahí y espera
   * (sin burbuja encima), para no hablar dos veces.
   */
  delega?: boolean
}

export type Mision = {
  id: MisionId
  /** Cómo se llama en la pastilla y el panel ("Traé tu campo al mapa"). */
  titulo: (r: Resumen) => string
  /** Hay algo que hacer con los datos de hoy. */
  aplica: (r: Resumen) => boolean
  /** Ya está hecha (los datos mandan; la clave en guia_vista sólo evita
   *  festejar dos veces). */
  hecha: (r: Resumen) => boolean
  /** La invitación, sincera: qué gana y cuánto cuesta. */
  invitacion: (r: Resumen) => { pregunta: string; porQue: string; minutos: number }
  pasos: (r: Resumen) => PasoMision[]
  /** Ancla donde se festeja el resultado (el mapa, la lista) y qué se dice. */
  festejo: (r: Resumen) => { ancla: string; ruta: string; texto: string }
  /** Ítem del checklist que cumple (la pastilla lanza la misión desde ahí). */
  item: 'campo' | 'potreros' | 'tropas'
}

/** El campo que la misión 1 trae al mapa: el primero sin contorno. */
function campoObjetivo(r: Resumen) {
  return r.sinContorno[0] ?? null
}

const campoEnMapa: Mision = {
  id: 'campo-en-mapa',
  item: 'campo',
  titulo: (r) => {
    const c = campoObjetivo(r)
    return c && r.campos > 1 ? `Traé ${c.nombre} al mapa` : 'Traé tu campo al mapa'
  },
  aplica: (r) => r.campos >= 1 && r.sinContorno.length > 0,
  hecha: (r) => r.campos >= 1 && r.sinContorno.length === 0,
  invitacion: (r) => {
    const c = campoObjetivo(r)
    const auto = catastroAutomatico(c?.provincia ?? null)
    return {
      pregunta: c ? `¿Traemos ${c.nombre} al mapa?` : '¿Traemos tu campo al mapa?',
      porQue: auto
        ? 'Con la boleta de ARBA a mano, aparece solo.'
        : 'Marcás las esquinas sobre el satélite, y listo.',
      minutos: 2,
    }
  },
  pasos: (r) => {
    const c = campoObjetivo(r)
    if (!c) return []
    // Se arma en Campos, con el asistente del editor (encontrarlo, el borde, los potreros).
    return [
      {
        ruta: `/campos?campo=${c.id}`,
        ancla: 'campos-editor',
        texto: '',
        delega: true,
        hecho: (x) => !x.resumen.sinContorno.some((s) => s.id === c.id),
      },
    ]
  },
  festejo: (r) => {
    // Al festejar el campo ya no está en sinContorno: se nombra por lo que
    // quedó. Con un solo campo alcanza "tu campo".
    const nombre = r.campos > 1 ? 'el campo' : 'tu campo'
    return {
      ruta: '/campos',
      ancla: 'campos-mapa',
      texto: `Ahí está ${nombre}, de verdad. Ahora los potreros van adentro.`,
    }
  },
}

const primerPotrero: Mision = {
  id: 'primer-potrero',
  item: 'potreros',
  titulo: (r) =>
    r.potreros - r.potrerosDibujados === 1 ? 'Dibujá el potrero que falta' : 'Dibujá tu primer potrero',
  // Con el contorno puesto y potreros cargados que faltan dibujar.
  aplica: (r) => r.potreros > 0 && r.potrerosDibujados < r.potreros && r.sinContorno.length < r.campos,
  hecha: (r) => r.potreros > 0 && r.potrerosDibujados >= 1,
  invitacion: (r) => ({
    pregunta: `¿Dibujamos el primero de tus ${plural(r.potreros, 'potrero', 'potreros')}?`,
    porQue: 'Lo elegís de la lista y marcás sus esquinas.',
    minutos: 1,
  }),
  pasos: (r) => {
    const antes = r.potrerosDibujados
    return [
      {
        ruta: '/campos',
        ancla: 'campos-editor',
        texto: '',
        delega: true,
        hecho: (x) => x.resumen.potrerosDibujados > antes,
      },
    ]
  },
  festejo: (r) => ({
    ruta: '/campos',
    ancla: 'campos-mapa',
    texto:
      r.potreros - r.potrerosDibujados > 0
        ? `Uno menos. ${plural(r.potreros - r.potrerosDibujados, 'queda', 'quedan')} — cuando quieras, de a uno.`
        : 'Todos los potreros dibujados. El mapa ya es tu campo.',
  }),
}

const ubicarHacienda: Mision = {
  id: 'ubicar-hacienda',
  item: 'tropas',
  titulo: (r) => `Ubicá ${plural(r.sinPotrero, 'animal', 'animales')} en su potrero`,
  aplica: (r) => r.sinPotrero > 0 && r.potreros > 0,
  hecha: (r) => r.cabezas > 0 && r.sinPotrero === 0,
  invitacion: (r) => ({
    pregunta: `¿Ubicamos tus ${plural(r.sinPotrero, 'animal', 'animales')} sin potrero?`,
    porQue: 'Campo, potrero y cuántos van. Nada más.',
    minutos: 1,
  }),
  pasos: (r) => {
    const antes = r.sinPotrero
    return [
      {
        ruta: '/hacienda',
        ancla: 'hacienda-ubicar',
        texto: 'Tocá «Ubicar en un potrero».',
        hecho: (x) => x.dialogoAbierto || x.resumen.sinPotrero < antes,
      },
      {
        ruta: '/hacienda',
        ancla: 'ubicar-form',
        sobreDialogo: true,
        texto: 'Campo, potrero y cuántos de cada categoría. Confirmá.',
        hecho: (x) => x.resumen.sinPotrero < antes,
      },
    ]
  },
  festejo: (r) => ({
    ruta: '/hacienda',
    ancla: 'hacienda-stock',
    texto:
      r.sinPotrero > 0
        ? `Ubicados. ${plural(r.sinPotrero, 'queda', 'quedan')} sin potrero, cuando quieras.`
        : 'Toda la hacienda en su potrero. La Recorrida ya sabe dónde está cada tropa.',
  }),
}

export const MISIONES: Record<MisionId, Mision> = {
  'campo-en-mapa': campoEnMapa,
  'primer-potrero': primerPotrero,
  'ubicar-hacienda': ubicarHacienda,
}

/** Orden natural del camino: contorno → potreros → hacienda ubicada. */
export const ORDEN_MISIONES: MisionId[] = ['campo-en-mapa', 'primer-potrero', 'ubicar-hacienda']

/** La próxima misión que aplica con los datos de hoy (o ninguna). */
export function proximaMision(r: Resumen): Mision | null {
  for (const id of ORDEN_MISIONES) {
    const m = MISIONES[id]
    if (m.aplica(r) && !m.hecha(r)) return m
  }
  return null
}

/** Misión que resuelve un ítem del checklist, si aplica hoy. */
export function misionDeItem(item: string, r: Resumen): Mision | null {
  for (const id of ORDEN_MISIONES) {
    const m = MISIONES[id]
    if (m.item === item && m.aplica(r) && !m.hecha(r)) return m
  }
  return null
}
