import { useQuery } from '@tanstack/react-query'
import type { DolarDia } from './plata'

/** El blue de cada día desde 2011 (argentinadatos.com, público). Para comparar años en dólares. */
export function useDolarHistorico() {
  return useQuery({
    queryKey: ['dolar-historico'],
    staleTime: 6 * 3_600_000,
    queryFn: async (): Promise<DolarDia[]> => {
      const r = await fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/blue')
      if (!r.ok) throw new Error(`argentinadatos ${r.status}`)
      const j = (await r.json()) as { fecha: string; venta: number }[]
      return j.map((x) => ({ fecha: x.fecha, venta: x.venta })).sort((a, b) => a.fecha.localeCompare(b.fecha))
    },
  })
}

