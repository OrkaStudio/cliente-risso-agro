import type { Nivel } from '@/features/inicio/para-atender-api'

/**
 * El chip de nivel es el ÚNICO elemento que carga color en una fila. El ícono va
 * neutro y las señales en texto plano: este panel convive con otros cuatro en el
 * Inicio, y tres portadores de color por fila (ícono + puntito + chip) lo
 * convertían en ruido.
 *
 * Vive aparte de los componentes porque lo comparten el panel y la cabecera "Hoy"
 * (un archivo de componentes que además exporta constantes rompe fast-refresh).
 */
export const nivelUI: Record<Nivel, { chip: string; punto: string; label: string }> = {
  atender: { chip: 'bg-destructive/10 text-destructive', punto: 'bg-destructive', label: 'Atender' },
  prevenir: { chip: 'bg-sol-soft text-sol-deep', punto: 'bg-sol-deep/70', label: 'Prevenir' },
  nota: { chip: 'bg-secondary text-muted-foreground', punto: 'bg-sky', label: 'Nota' },
}

/* `punto` se usa SÓLO en el detalle desplegado, donde hay que distinguir cuál de
 * las señales es la grave. En la fila cerrada el chip sigue siendo el único
 * portador de color. */
