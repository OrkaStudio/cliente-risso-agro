import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { importarDibujosLocales } from '@/features/campos/importar-dibujos'

/**
 * Acción one-time: importa los dibujos de localStorage (Fase 0) a la base real.
 * Temporal — se quita cuando la migración a datos reales esté terminada.
 */
export function ImportarDibujosButton() {
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const qc = useQueryClient()
  const [cargando, setCargando] = useState(false)

  async function run() {
    if (!empresaId) {
      toast.error('No hay empresa cargada todavía.')
      return
    }
    setCargando(true)
    try {
      const r = await importarDibujosLocales(empresaId)
      await qc.invalidateQueries()
      toast.success(
        `Importado: ${r.campos} campos · ${r.potreros} potreros · ${r.infraestructura} marcadores`,
      )
    } catch (e) {
      toast.error(`No se pudo importar: ${(e as Error).message}`)
    } finally {
      setCargando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={cargando || !empresaId}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-ink disabled:opacity-50"
    >
      <Download className="size-4" />
      {cargando ? 'Importando…' : 'Importar mis dibujos a la base'}
    </button>
  )
}
