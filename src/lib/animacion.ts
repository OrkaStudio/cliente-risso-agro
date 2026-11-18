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
// Las duraciones están a velocidad normal. Los resortes usan `visualDuration`: lo que
// tarda en verse llegar, aunque el rebote siga un instante más.

/** Al apretar: el botón se hunde y rebota al soltar. */
export const HUNDIR = { escala: 0.95, resorte: { type: "spring", visualDuration: 0.2, bounce: 0.55 } } as const
/** Al apretar un botón chico (cabe menos): se hunde un poco más. */
export const HUNDIR_CHICO = { escala: 0.93, resorte: HUNDIR.resorte } as const

/** Cambios de forma (la píldora que se encoge mientras carga y se vuelve a abrir). */
export const RESORTE = { type: "spring", visualDuration: 0.35, bounce: 0.25 } as const
/** Lo que salta: el texto que cambia y el ícono que entra al círculo. */
export const SALTO = { type: "spring", visualDuration: 0.3, bounce: 0.55 } as const

/** El «no» (falló o está apagado): la píldora se sacude de costado. */
export const SACUDIDA = { recorrido: [0, -10, 9, -6, 4, -2, 0], duracion: 0.42 } as const

/** El cargando aparece sólo si tarda más de esto (así no parpadea)… */
export const DEMORA_CARGANDO_MS = 300
/** …y si aparece, queda al menos esto (así no aparece y desaparece de golpe). */
export const MINIMO_CARGANDO_MS = 400

/** «Listo», en tres tiempos: el pasto llena el círculo desde el centro… */
export const LISTO_LLENAR = { type: "spring", visualDuration: 0.3, bounce: 0.35 } as const
/** …el tilde se dibuja de un trazo (el camino del check de lucide)… */
export const LISTO_TILDE = { camino: "M20 6 9 17l-5-5", duracion: 0.32, demora: 0.14, curva: [0.65, 0, 0.35, 1] } as const
/** …y el botón asiente una vez. */
export const LISTO_ASENTIR = { escala: [1, 1.035, 1], tiempos: [0, 0.4, 1], duracion: 0.45, demora: 0.1 } as const
/** Cuánto se ve el «Listo» antes de que el botón vuelva a como estaba. */
export const LISTO_MS = 1400
/** «En el teléfono» (sin señal) se ve un poco más: es la noticia distinta. */
export const TELEFONO_MS = 1800
