import { drenarPlata } from '@/features/campo/plata/use-plata'

/**
 * Drenado CENTRAL del Modo Campo — el espejo de `seed-offline.ts`.
 *
 * Por qué existe: el sembrado estaba centralizado (TASK-048) pero el drenado
 * no. Cada cola subía sólo mientras su pantalla estaba montada, y de las cuatro
 * únicamente la Recorrida vive en el Inicio. O sea: el productor volvía del
 * campo, agarraba señal, abría la app y caía en Inicio — se subían las
 * observaciones y NADA más. La manga, los nacimientos, los movimientos y la
 * plata seguían en el teléfono hasta que entrara a cada pantalla. Y el chip del
 * header decía "Listo", porque medía el sembrado, no lo que faltaba subir.
 *
 * Las cinco funciones son LAS MISMAS que usan las pantallas: cada una se
 * exporta desde su hook y conserva ahí su single-flight, así que llamarlas
 * desde acá y desde la pantalla a la vez no duplica trabajo ni sube dos veces.
 */

// Sólo Plata desde el 18/11: la recorrida, los nacimientos/movimientos y la manga salieron
// de la app (se hacen por WhatsApp con el bot; el código está en archivo/).
export type ColaCampo = 'plata'

export type DrenajeResultado = {
  /** Colas que fallaron. Vacío = subió todo lo que había. */
  fallaron: ColaCampo[]
}

/* Single-flight del conjunto: dos disparos juntos (volvió la señal + la app
 * pasó a primer plano) no arrancan dos pasadas. */
let enVuelo: Promise<DrenajeResultado> | null = null

export function drenarOffline(): Promise<DrenajeResultado> {
  if (enVuelo) return enVuelo
  const corrida = (async (): Promise<DrenajeResultado> => {
    // En paralelo: son colas independientes y una que falla no puede frenar a
    // las otras — lo que se pueda subir, que suba.
    const tareas: [ColaCampo, Promise<void>][] = [['plata', drenarPlata()]]
    const res = await Promise.allSettled(tareas.map(([, p]) => p))
    const fallaron = res
      .map((r, i) => (r.status === 'rejected' ? tareas[i][0] : null))
      .filter((c): c is ColaCampo => c !== null)
    return { fallaron }
  })()
  enVuelo = corrida
  try {
    return corrida
  } finally {
    void corrida.finally(() => {
      enVuelo = null
    })
  }
}
