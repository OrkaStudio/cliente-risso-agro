import { toast } from 'sonner'

import type { MovimientoConDetalle } from '@/features/analitica/api'
import { useDesmarcarRevisados, useMarcarRevisados } from '@/features/analitica/hooks'

/** La fecha que ordena Plata y Movimientos: la de pago si ya se pagó. */
export const fechaDe = (m: MovimientoConDetalle) => m.fecha_cobro_pago ?? m.fecha_devengo

/** Dar por bueno, con el aviso de qué implica y Deshacer. */
export function useDarPorBueno() {
  const revisar = useMarcarRevisados()
  const desmarcar = useDesmarcarRevisados()
  return async (ids: string[], que: string) => {
    await revisar.mutateAsync(ids)
    toast.success(`Listo: ${que}`, {
      description: 'Ya no figura como nuevo y quien lo cargó no lo puede cambiar.',
      action: { label: 'Deshacer', onClick: () => desmarcar.mutate(ids) },
    })
  }
}

