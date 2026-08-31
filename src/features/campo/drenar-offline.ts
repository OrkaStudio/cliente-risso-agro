import { drenarRecorrida } from '@/features/campo/recorrida/use-recorrida'
import { drenarOps } from '@/features/campo/ops/use-ops'
import { drenarCaravaneo } from '@/features/campo/manga/use-manga'
import { drenarTrabajos } from '@/features/campo/manga/use-trabajos'
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

export type ColaCampo = 'recorrida' | 'ops' | 'caravaneo' | 'trabajos' | 'plata'

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
    const tareas: [ColaCampo, Promise<void>][] = [
      ['recorrida', drenarRecorrida()],
      ['ops', drenarOps()],
      ['caravaneo', drenarCaravaneo()],
      ['trabajos', drenarTrabajos()],
      ['plata', drenarPlata()],
    ]
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
