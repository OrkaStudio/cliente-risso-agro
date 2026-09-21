import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']

/**
 * Equivalente Vaca (EV): la unidad con la que se mide la carga de un campo en
 * Argentina. 1 EV son los requerimientos anuales de una vaca de 400 kg que
 * gesta y cría un ternero hasta el destete a los 6 meses, incluido el pasto
 * que come el ternero (18,54 Mcal de energía metabolizable por día).
 *
 * Por qué existe este archivo: contar cabezas y dividir por hectáreas MIENTE.
 * Una oveja come la sexta parte que una vaca y un caballo come un 20 % más,
 * así que "3 por hectárea" puede ser holgado o imposible según qué animal sea.
 *
 * Fuente: tabla simplificada de la E.E.A. Balcarce (adaptación del sistema de
 * Coop, 1965) y Cocimano, Lange y Menvielle (1975), «Estudio sobre
 * equivalencias ganaderas», tal como los recopila Bavera (2006) para el Curso
 * de Producción Bovina de Carne, FAV UNRC — Sitio Argentino de Producción
 * Animal, `70-equivalencias_ganaderas.pdf`.
 *
 * Se usa la tabla SIMPLIFICADA a propósito: la detallada de Cocimano pide peso
 * vivo, estado fisiológico y ganancia diaria en gramos, tres datos que el
 * productor no tiene a mano cargando el campo por primera vez. La simplificada
 * da un valor por categoría y es la que se usa a campo.
 */
export const EV_POR_CATEGORIA: Record<Categoria, number> = {
  // Bovinos (Balcarce). La vaca ES la unidad, por definición.
  vaca: 1,
  toro: 1.3,
  vaquillona: 0.7, // de 1 a 2 años; desde los 2 o preñada sube a 0,8
  novillo: 0.8, // desde los 2 años o más de 300 kg
  ternero: 0.6, // del destete al año
  ternera: 0.6,

  // Ovinos. La relación general es 1 EV = 6,3 EO, o sea 1 EO = 0,16 EV.
  // Oveja de 50 kg en mantenimiento: 1,06 EV cada 10 → 0,106; con cordero al
  // pie en lactancia trepa a 0,244. Se toma el equivalente oveja general
  // (0,16), que es el promedio del año y el número que se usa a campo.
  oveja: 0.16,
  carnero: 0.15, // 70 kg en mantenimiento: 1,47 EV cada 10
  cordero: 0.09, // borrego de 30 kg: 0,52 EO ≈ 0,08 EV; se redondea para arriba
  cordera: 0.09,

  // ⚠ CAPÓN está clasificado como BOVINO en `categoriasPorEspecie` y aparece en
  // la pestaña Bovinos junto a Novillo y Toro. Un capón es un ovino castrado:
  // la clasificación es un error del modelo, anterior a este archivo. El EV
  // sigue al animal y no a la pestaña donde está mal guardado — un capón come
  // como un ovino. Si se decide reclasificarlo, este valor ya es el correcto.
  capon: 0.16,

  // Equinos. El valor general del yeguarizo es 1,20 EV (un caballo come MÁS
  // que una vaca). Adulto de 400-500 kg en mantenimiento: 0,76-0,88; con
  // trabajo liviano 1,02-1,14. Se toma el valor general.
  yegua: 1.2,
  padrillo: 1.2,
  potrillo: 0.6, // del nacimiento al destete, incluida la leche
  potranca: 0.6,
}

/**
 * Receptividad: cuántos EV por hectárea y por año aguanta un campo sin
 * degradarse. No es una constante — depende de la lluvia, el suelo y el
 * recurso forrajero —, pero estos dos números acotan la conversación:
 *
 * - Campo natural de la Pampa Deprimida: 0,6 a 0,8 EV/ha/año (Ecología
 *   Austral, cálculo de receptividad a escala de potrero). En la Pampa
 *   semiárida —La Pampa, oeste de Buenos Aires— es menos.
 * - Pastura implantada bien manejada llega al orden de 2,5 EV/ha.
 *
 * Arriba de eso ya no es un campo cargado: es un número mal escrito.
 */
export const RECEPTIVIDAD = {
  /** Lo que rinde un campo natural, sin pastura implantada. */
  campoNatural: { min: 0.6, max: 0.8 },
  /** Techo de una pastura implantada bien manejada. */
  pasturaImplantada: 2.5,
} as const

/** Cabezas por categoría → carga total en EV. */
export function evDeCabezas(cabezas: Partial<Record<Categoria, number>>): number {
  let ev = 0
  for (const [cat, n] of Object.entries(cabezas) as [Categoria, number | undefined][]) {
    ev += (n ?? 0) * EV_POR_CATEGORIA[cat]
  }
  return ev
}

/** "1,06" — el EV siempre con dos decimales: 0,16 redondeado a 0 no dice nada. */
export function formatearEv(ev: number): string {
  return ev.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
