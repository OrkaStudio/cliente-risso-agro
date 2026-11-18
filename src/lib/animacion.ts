/**
 * La curva con la que entra todo en la app: arranca rápido y aterriza largo
 * (expo-out). Es lo que hace que el movimiento se sienta resuelto y no
 * empujado — un `easeOut` común frena parejo y queda mecánico.
 *
 * Vive acá y no junto al componente que la usa porque exportar una constante
 * desde un archivo de componentes rompe el fast refresh de Vite.
 */
export const CURVA = [0.16, 1, 0.3, 1] as const

// ===== El movimiento de los botones (B · Con cuerpo, elegida por Lau el 18/11) =====
// Más suave el mismo 18/11 (Lau: «va muy rápido»): el giro siempre se ve (al menos
// MINIMO_CARGANDO_MS), y el pasto, el tilde y la palabra llegan con menos rebote.
// Las duraciones están a velocidad normal. Los resortes usan `visualDuration`: lo que
// tarda en verse llegar, aunque el rebote siga un instante más.

/** Al apretar: el botón se hunde y rebota al soltar. */
export const HUNDIR = { escala: 0.95, resorte: { type: "spring", visualDuration: 0.2, bounce: 0.55 } } as const
/** Al apretar un botón chico (cabe menos): se hunde un poco más. */
export const HUNDIR_CHICO = { escala: 0.93, resorte: HUNDIR.resorte } as const

/** Cambios de forma (la píldora que se encoge mientras carga y se vuelve a abrir). */
export const RESORTE = { type: "spring", visualDuration: 0.35, bounce: 0.25 } as const
/** Lo que salta: el texto que cambia y el ícono que entra al círculo. */
export const SALTO = { type: "spring", visualDuration: 0.42, bounce: 0.28 } as const

/** El «no» (falló o está apagado): la píldora se sacude de costado. */
export const SACUDIDA = { recorrido: [0, -10, 9, -6, 4, -2, 0], duracion: 0.42 } as const

/** El cargando aparece sólo si tarda más de esto (así no parpadea)… */
export const DEMORA_CARGANDO_MS = 60
/** …y si aparece, queda al menos esto (así no aparece y desaparece de golpe). */
export const MINIMO_CARGANDO_MS = 700

/** «Listo», en tres tiempos: el pasto llena el círculo desde el centro… */
export const LISTO_LLENAR = { type: "spring", visualDuration: 0.5, bounce: 0.15 } as const
/** Al volver, el pasto se recoge hacia el centro (sin rebote) y destapa el color de siempre.
 *  Desvanecerlo lo mezclaba con el de abajo y pasaba por un beige sucio. */
export const LISTO_RECOGER = { type: "spring", visualDuration: 0.4, bounce: 0 } as const
/** …el tilde se dibuja de un trazo (el camino del check de lucide)… */
export const LISTO_TILDE = { camino: "M20 6 9 17l-5-5", duracion: 0.5, demora: 0.28, curva: [0.65, 0, 0.35, 1] } as const
/** …y el botón asiente una vez. */
export const LISTO_ASENTIR = { escala: [1, 1.025, 1], tiempos: [0, 0.45, 1], duracion: 0.65, demora: 0.25 } as const
/** Cuando la palabra cambia («Guardar borrador» → «Listo»), el botón se achica o se
 *  agranda a la par, sin rebote: un ancho que rebota se ve como algo que se rompe. */
export const CAMBIO_ANCHO = { type: "spring", visualDuration: 0.45, bounce: 0 } as const
/** Cuánto se ve el «Listo» antes de que el botón vuelva a como estaba. */
export const LISTO_MS = 1800
/** «En el teléfono» (sin señal) se ve un poco más: es la noticia distinta. */
export const TELEFONO_MS = 2200
