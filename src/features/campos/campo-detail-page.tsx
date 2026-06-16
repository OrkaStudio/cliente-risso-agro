import { Link, useParams } from 'react-router-dom'
import { Beef, ChevronLeft, LandPlot, MapPin } from 'lucide-react'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useCamposConPotreros } from '@/features/campos/hooks'
import { CampoFormDialog, PotreroFormDialog } from '@/features/campos/campos-dialogs'
import { tipoCampoLabel } from '@/features/campos/labels'
import { SuperficieMapa } from '@/features/campos/superficie-mapa'
import { Panel } from '@/components/panel'

function StatCell({
  label,
  icon: Icon,
  iconColor,
  value,
  unit,
}: {
  label: string
  icon: typeof Beef
  iconColor: string
  value: string
  unit?: string
}) {
  return (
    <div className="flex min-h-[88px] flex-1 flex-col justify-center px-[22px] py-[18px]">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="size-4" style={{ color: iconColor }} />
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="tnum text-[26px] font-bold leading-none text-ink">
          {value}
        </span>
        {unit && <span className="text-base text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

export function CampoDetailPage() {
  const { id = '' } = useParams()
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const campos = useCamposConPotreros()

  if (campos.isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>
  }
  if (campos.error) {
    return (
      <div className="text-sm text-destructive">
        Error al cargar: {(campos.error as Error).message}
      </div>
    )
  }
  const campo = campos.data?.find((c) => c.id === id)
  if (!campo) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Campo no encontrado.</p>
        <Link
          to="/campos"
          className="text-sm font-semibold text-field-deep hover:underline"
        >
          ← Volver a Campos
        </Link>
      </div>
    )
  }

  const ha = campo.totalHa > 0 ? campo.totalHa : campo.hectareas

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div>
        <Link
          to="/campos"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          Campos
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <MapPin className="size-6 shrink-0 text-field" />
            <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
              {campo.nombre}
            </h1>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
              {tipoCampoLabel[campo.tipo]}
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
              triggerLabel="Editar campo"
              triggerVariant="outline"
            />
            <PotreroFormDialog
              empresaId={empresaId}
              campoId={campo.id}
              triggerLabel="+ Nuevo potrero"
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)] [&>*+*]:border-l [&>*+*]:border-border">
        <StatCell
          label="Potreros"
          icon={MapPin}
          iconColor="var(--field)"
          value={String(campo.potreros.length)}
        />
        <StatCell
          label="Hacienda"
          icon={Beef}
          iconColor="var(--tierra)"
          value={String(campo.totalCabezas)}
          unit="cab"
        />
        <StatCell
          label="Superficie"
          icon={LandPlot}
          iconColor="var(--sky)"
          value={ha != null && ha > 0 ? String(ha) : '—'}
          unit={ha != null && ha > 0 ? 'ha' : undefined}
        />
      </div>

      {/* Mapa de superficie */}
      {campo.potreros.length === 0 ? (
        <section className="rounded-[14px] border border-border bg-card p-10 text-center shadow-[0_1px_2px_rgba(16,24,19,0.05)]">
          <p className="text-sm text-muted-foreground">
            Este campo no tiene potreros todavía. Creá el primero con “+ Nuevo
            potrero”.
          </p>
        </section>
      ) : (
        <Panel
          title="Mapa de superficie"
          sub="cada bloque ∝ hectáreas · tocá uno para entrar"
        >
          <SuperficieMapa potreros={campo.potreros} ratio={2.3} />
        </Panel>
      )}
    </div>
  )
}
