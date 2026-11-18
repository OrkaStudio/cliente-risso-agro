// Después de guardar algo en la cola del teléfono: ¿subió o quedó en el teléfono?
//
// La cola guarda primero en el teléfono (Dexie) y sube en segundo plano. Decir «Listo»
// apenas se guarda sería suponer que subió; por eso se mira el estado REAL de lo guardado
// (Lau, 18/11: «no quiero suposiciones ni cosas que no podemos cumplir»):
//   · sin señal → «Guardado en el teléfono» (sube con señal y la app abierta);
//   · subió (sincronizada) dentro de un rato corto → «Listo»;
//   · sigue pendiente → «Guardado en el teléfono»;
//   · el servidor lo rechazó → «No salió», sin «Probar de nuevo»: lo guardado sigue en la cola
//     con su error (la pantalla lo muestra para reintentar o descartar) y reintentar desde el
//     botón lo cargaría dos veces.
import { Motivo } from '@/components/tropero/use-accion'

type EstadoCola = 'pendiente' | 'sincronizada' | 'error'

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Cuánto se espera a que suba antes de decir «Guardado en el teléfono». */
export const ESPERA_SUBIDA_MS = 3500

export async function comoQuedo(estado: () => Promise<EstadoCola | undefined>, ms = ESPERA_SUBIDA_MS): Promise<'telefono' | void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'telefono'
  const hasta = Date.now() + ms
  for (;;) {
    const e = await estado()
    if (e === 'sincronizada') return
    if (e === 'error') throw new Motivo('No salió: quedó en la lista de problemas', { reintentar: false })
    if (Date.now() >= hasta) return 'telefono'
    await espera(250)
  }
}
