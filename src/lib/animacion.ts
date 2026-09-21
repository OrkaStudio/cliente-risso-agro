/**
 * La curva con la que entra todo en la app: arranca rápido y aterriza largo
 * (expo-out). Es lo que hace que el movimiento se sienta resuelto y no
 * empujado — un `easeOut` común frena parejo y queda mecánico.
 *
 * Vive acá y no junto al componente que la usa porque exportar una constante
 * desde un archivo de componentes rompe el fast refresh de Vite.
 */
export const CURVA = [0.16, 1, 0.3, 1] as const
