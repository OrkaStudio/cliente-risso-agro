import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Beef, Check, LayoutGrid, Layers, Map as MapIcon, Pencil } from 'lucide-react'
import {
  colorCategoria,
  categoriaLabel,
  especieColor,
  especieLabel,
  propositoLabel,
  type Especie,
} from '@/features/lotes/domain'
import {
  campoDe,
  campos,
  codigoLote,
  composicionDe,
  totalLote,
  useLotes,
  type Lote,
} from '@/features/lotes/store'
import { potreros as potrerosSeed, type Campo } from '@/features/lotes/mock'
import { CrearLoteDialog } from '@/features/lotes/lotes-dialogs'
import { CampoMapaReal } from '@/features/lotes/campo-mapa-real'
import { CampoVista } from '@/features/lotes/campo-vista'
import { CatastroDialog } from '@/features/lotes/catastro-dialog'
import { tieneGeometria } from '@/features/lotes/geo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Vista = 'mapa' | 'lista'

/* ===== KPI (barra instrumental, igual que Inicio/Campos) ===== */
function Kpi({
  label,
  icon: Icon,
  iconColor,
  value,
  unit,
  detail,
}: {
  label: string
  icon: typeof Beef
  iconColor: string
  value: string
  unit?: string
  detail?: string
}) {
  return (
    <div className="flex min-h-[92px] flex-1 flex-col items-center justify-center px-[22px] py-[18px] text-center">
      <div className="flex items-center justify-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="size-4" style={{ color: iconColor }} />
        {label}
      </div>
      <div className="mt-2 flex items-baseline justify-center gap-1">
        <span className="tnum text-[26px] font-bold leading-none text-ink">
          {value}
        </span>
        {unit && <span className="text-base text-muted-foreground">{unit}</span>}
      </div>
      {detail && (
        <div className="mt-[7px] text-xs font-medium text-muted-foreground">
          {detail}
        </div>
      )}
    </div>
  )
}

/* ===== Tarjeta de un lote (linkea a la ficha) ===== */
function LoteCard({ lote }: { lote: Lote }) {
  const total = totalLote(lote)
  const comp = composicionDe(lote)
  const hex = campoDe(lote.campoId)?.color.hex ?? 'var(--field)'
  const codigo = codigoLote(lote)
  return (
    <Link
      to={`/potreros/${lote.id}`}
      className="flex flex-col gap-3.5 rounded-[14px] border border-l-[5px] p-[18px] shadow-[0_1px_2px_rgba(16,24,19,0.05)] transition-shadow hover:shadow-[0_4px_18px_rgba(16,24,19,0.08)]"
      style={{
        borderColor: 'var(--border)',
        borderLeftColor: hex,
        background: `color-mix(in srgb, ${hex} 6%, var(--card))`,
      }}
    >
      {/* encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex min-w-[3.5rem] shrink-0 flex-col items-center justify-center rounded-xl px-3 py-1.5 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
            style={{ background: hex }}
            title={`${lote.potreros.length > 1 ? 'Potreros' : 'Potrero'} ${lote.potreros.join(' y ') || '—'}`}
          >
            <span className="text-[8px] font-bold uppercase tracking-[0.08em] opacity-80">
              {lote.potreros.length > 1 ? 'Potreros' : 'Potrero'}
            </span>
            <span className="tnum font-heading text-[22px] font-bold leading-none">
              {lote.potreros.join(' · ') || '—'}
            </span>
          </div>
          <div className="min-w-0">
            <h4 className="truncate font-heading text-[15px] font-semibold text-ink">
              Lote {codigo}
            </h4>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ background: especieColor[lote.especie] }}
                />
                {especieLabel[lote.especie]}
              </span>
              <span className="text-faint">·</span>
              <span>{propositoLabel[lote.proposito]}</span>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum text-[22px] font-bold leading-none text-ink">
            {total}
          </div>
          <div className="text-[9.5px] font-bold uppercase tracking-wide text-faint">
            cabezas
          </div>
        </div>
      </div>

      {/* barra de composición */}
      {total > 0 ? (
        <>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            {comp.map((c) => (
              <span
                key={c.categoria}
                style={{
                  width: `${(c.cantidad / total) * 100}%`,
                  background: colorCategoria(c.categoria),
                }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {comp.map((c) => (
              <div
                key={c.categoria}
                className="flex items-center gap-2.5 text-[13px]"
              >
                <span
                  className="size-[10px] shrink-0 rounded-[3px]"
                  style={{ background: colorCategoria(c.categoria) }}
                />
                <span className="text-ink">{categoriaLabel(c.categoria)}</span>
                <span className="tnum ml-auto font-bold text-ink">
                  {c.cantidad}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[13px] text-faint">Sin animales — tocá para cargar.</p>
      )}
    </Link>
  )
}

/* ===== Encabezado de campo (compartido) ===== */
function CampoHeader({ campo, lotes }: { campo: Campo; lotes: Lote[] }) {
  const delCampo = lotes.filter((l) => l.campoId === campo.id)
  const cabezas = delCampo.reduce((s, l) => s + totalLote(l), 0)
  const potreros = potrerosSeed.filter((p) => p.campoId === campo.id)
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex size-9 items-center justify-center rounded-xl font-heading text-[16px] font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
          style={{ background: campo.color.hex }}
          title={`Color ${campo.color.nombre}`}
        >
          {campo.color.letra}
        </span>
        <h3 className="font-heading text-[26px] font-bold tracking-[-0.02em] text-ink">
          {campo.nombre}
        </h3>
      </div>
      <span className="tnum text-[13px] text-faint">
        {potreros.length} potreros · {delCampo.length}{' '}
        {delCampo.length === 1 ? 'lote' : 'lotes'} · {cabezas} cab ·{' '}
        {campo.hectareas} ha
      </span>
    </div>
  )
}

/* ===== Vista LISTA: un bloque por campo con tarjetas de lote ===== */
function CampoBloque({ campo, lotes }: { campo: Campo; lotes: Lote[] }) {
  const delCampo = lotes.filter((l) => l.campoId === campo.id)
  return (
    <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]">
      <CampoHeader campo={campo} lotes={lotes} />
      {delCampo.length === 0 ? (
        <p className="py-2 text-[13px] text-faint">
          Este campo todavía no tiene lotes.
        </p>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {delCampo.map((l) => (
            <LoteCard key={l.id} lote={l} />
          ))}
        </div>
      )}
    </section>
  )
}

/* ===== Vista MAPA: selector de campo + vista contenida / edición satelital ===== */
function MapaVista({ lotes }: { lotes: Lote[] }) {
  const navigate = useNavigate()
  const [campoId, setCampoId] = useState(campos[0]?.id ?? '')
  const [ver, setVer] = useState(0)
  // Modo satelital (editar) explícito: arranca activo solo si el campo todavía
  // no está delimitado. No se deriva de la geometría para no saltar al traer
  // el catastro a mitad de la edición.
  const [editar, setEditar] = useState(
    () => !tieneGeometria(campos[0]?.id ?? ''),
  )
  const campo = campos.find((c) => c.id === campoId) ?? campos[0]
  const potreros = potrerosSeed.filter((p) => p.campoId === campo.id)
  const delCampo = lotes.filter((l) => l.campoId === campo.id)

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de campo */}
      <div className="flex flex-wrap gap-2">
        {campos.map((c) => {
          const activo = c.id === campo.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCampoId(c.id)
                setEditar(!tieneGeometria(c.id))
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                activo
                  ? 'border-transparent text-white'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
              style={activo ? { background: c.color.hex } : undefined}
            >
              <span
                className="size-2.5 rounded-full"
                style={{
                  background: activo ? 'rgba(255,255,255,0.9)' : c.color.hex,
                }}
              />
              {c.nombre}
            </button>
          )
        })}
      </div>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]">
        <CampoHeader campo={campo} lotes={lotes} />

        {editar ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <CatastroDialog
                campoId={campo.id}
                onAplicado={() => setVer((v) => v + 1)}
              />
              <Button size="sm" onClick={() => setEditar(false)}>
                <Check className="size-4" />
                Listo
              </Button>
              <span className="text-[12.5px] text-muted-foreground">
                Traé el contorno del catastro y dibujá los potreros adentro.
              </span>
            </div>
            <CampoMapaReal
              key={`${campo.id}-${ver}`}
              campo={campo}
              potreros={potreros}
              lotes={delCampo}
            />
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Usá la herramienta de polígono (arriba a la izquierda) para{' '}
              <b>dibujar cada potrero</b> y ponele su número. Cuando termines,
              tocá <b>Listo</b> para ver el campo limpio.
            </p>
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditar(true)}
              >
                <Pencil className="size-4" />
                Editar potreros
              </Button>
            </div>
            <CampoVista
              key={campo.id}
              campo={campo}
              lotes={delCampo}
              onVerLote={(id) => navigate(`/potreros/${id}`)}
            />
          </>
        )}
      </section>
    </div>
  )
}

function VistaToggle({
  vista,
  setVista,
}: {
  vista: Vista
  setVista: (v: Vista) => void
}) {
  const items: [Vista, string, typeof MapIcon][] = [
    ['mapa', 'Mapa', MapIcon],
    ['lista', 'Lista', LayoutGrid],
  ]
  return (
    <div className="inline-flex rounded-xl border border-border bg-card p-1">
      {items.map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          onClick={() => setVista(v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
            vista === v
              ? 'bg-field-soft text-field-deep'
              : 'text-muted-foreground hover:text-ink',
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

export function LotesPage() {
  const lotes = useLotes()
  const [vista, setVista] = useState<Vista>('mapa')
  const totalCabezas = lotes.reduce((s, l) => s + totalLote(l), 0)
  const porEspecie = (e: Especie) =>
    lotes.filter((l) => l.especie === e).reduce((s, l) => s + totalLote(l), 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
            Potreros
          </h1>
          <p className="mt-1 text-[14.5px] font-medium text-muted-foreground">
            {lotes.length} lotes · {campos.length} campos · cada lote es una
            tropa dentro de un potrero
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <VistaToggle vista={vista} setVista={setVista} />
          <CrearLoteDialog />
        </div>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)] [&>*+*]:border-l [&>*+*]:border-border">
        <Kpi
          label="Lotes"
          icon={Layers}
          iconColor="var(--field)"
          value={String(lotes.length)}
          detail={`${campos.length} campos`}
        />
        <Kpi
          label="Hacienda total"
          icon={Beef}
          iconColor="var(--tierra)"
          value={String(totalCabezas)}
          unit="cab"
        />
        <Kpi
          label="Bovinos"
          icon={Beef}
          iconColor={especieColor.bovino}
          value={String(porEspecie('bovino'))}
          detail="cabezas"
        />
        <Kpi
          label="Ovinos"
          icon={Beef}
          iconColor={especieColor.ovino}
          value={String(porEspecie('ovino'))}
          detail="cabezas"
        />
        <Kpi
          label="Equinos"
          icon={Beef}
          iconColor={especieColor.equino}
          value={String(porEspecie('equino'))}
          detail="cabezas"
        />
      </div>

      {/* Vista mapa (satélite real) o lista (tarjetas) */}
      {vista === 'mapa' ? (
        <MapaVista lotes={lotes} />
      ) : (
        campos.map((c) => <CampoBloque key={c.id} campo={c} lotes={lotes} />)
      )}
    </div>
  )
}
