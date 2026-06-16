import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useCamposConPotreros } from '@/features/campos/hooks'
import type { CampoConPotreros } from '@/features/campos/api'
import { CampoFormDialog, PotreroFormDialog } from '@/features/campos/campos-dialogs'
import { tipoCampoLabel } from '@/features/campos/labels'
import { SuperficieMapa } from '@/features/campos/superficie-mapa'

function CampoSection({
  campo,
  empresaId,
}: {
  campo: CampoConPotreros
  empresaId: string
}) {
  const ha = campo.totalHa > 0 ? campo.totalHa : campo.hectareas
  return (
    <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <MapPin className="size-[19px] shrink-0 text-field" />
          <Link
            to={`/campos/${campo.id}`}
            className="truncate font-heading text-[19px] font-bold text-ink transition-colors hover:text-field-deep"
          >
            {campo.nombre}
          </Link>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {tipoCampoLabel[campo.tipo]}
          </span>
          <span className="tnum hidden text-[13px] font-medium text-faint sm:inline">
            · {campo.potreros.length}{' '}
            {campo.potreros.length === 1 ? 'potrero' : 'potreros'} ·{' '}
            {campo.totalCabezas} cab{ha != null ? ` · ${ha} ha` : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CampoFormDialog
            empresaId={empresaId}
            campo={{
              id: campo.id,
              nombre: campo.nombre,
              tipo: campo.tipo,
              hectareas: campo.hectareas,
              empresa_id: empresaId,
              created_at: '',
            }}
            triggerLabel="Editar"
            triggerVariant="outline"
          />
          <PotreroFormDialog
            empresaId={empresaId}
            campoId={campo.id}
            triggerLabel="+ Potrero"
            triggerVariant="outline"
          />
        </div>
      </header>

      {campo.potreros.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Este campo no tiene potreros todavía.
        </p>
      ) : (
        <SuperficieMapa potreros={campo.potreros} ratio={3} />
      )}
    </section>
  )
}

export function CamposPage() {
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const campos = useCamposConPotreros()

  const totalPotreros =
    campos.data?.reduce((s, c) => s + c.potreros.length, 0) ?? 0
  const totalCabezas =
    campos.data?.reduce((s, c) => s + c.totalCabezas, 0) ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
            Campos
          </h1>
          <p className="mt-1 text-[14.5px] font-medium text-muted-foreground">
            {campos.data?.length ?? 0}{' '}
            {(campos.data?.length ?? 0) === 1 ? 'campo' : 'campos'} ·{' '}
            {totalPotreros} potreros · {totalCabezas} cabezas
          </p>
        </div>
        <CampoFormDialog empresaId={empresaId} triggerLabel="+ Nuevo campo" />
      </div>

      {campos.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : campos.error ? (
        <p className="text-sm text-destructive">
          Error al cargar: {(campos.error as Error).message}
        </p>
      ) : !campos.data || campos.data.length === 0 ? (
        <section className="rounded-[14px] border border-border bg-card p-10 text-center shadow-[0_1px_2px_rgba(16,24,19,0.05)]">
          <p className="text-sm text-muted-foreground">
            Todavía no hay campos. Creá el primero con “+ Nuevo campo”.
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-5">
          {campos.data.map((c) => (
            <CampoSection key={c.id} campo={c} empresaId={empresaId} />
          ))}
        </div>
      )}
    </div>
  )
}
