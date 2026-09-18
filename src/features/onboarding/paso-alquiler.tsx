import { useState, type FormEvent } from 'react'
import { CalendarDays, Receipt } from 'lucide-react'
import { crearAlquilerDeCampo, frecuenciaLabel, type Frecuencia } from '@/features/analitica/api'
import { AuthHeading, BOTON_PRINCIPAL, ErrorCampo } from '@/features/auth/auth-layout'
import { Reveal } from '@/features/auth/reveal'
import { cargarGordo } from '@/features/cotizaciones/api'
import { useDolarBlue } from '@/features/cotizaciones/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatearNumero, numeroDeFormateado } from '@/features/onboarding/numeros'
import { cn } from '@/lib/utils'

/**
 * El alquiler de un campo, como está pactado. Casi nunca es un precio fijo
 * en pesos: en ganadería se pacta en kilos de novillo por hectárea por año,
 * en agricultura en quintales de soja o maíz, a veces en dólares. Se carga
 * el contrato tal cual, cómo se paga (eso es lo que va al calendario) y, si
 * no es en pesos, a cuánto está hoy para estimar cada cuota — al pagar se
 * ajusta al precio del día. El precio del novillo que ponga acá queda como
 * cotización del gordo y ya alimenta el ticker.
 */

export type UnidadAlquiler = 'pesos' | 'dolares' | 'kg_novillo' | 'qq_soja' | 'qq_maiz'

const UNIDADES: { valor: UnidadAlquiler; chip: string; nombre: string; precioDe: string | null }[] = [
  { valor: 'pesos', chip: '$', nombre: '$', precioDe: null },
  { valor: 'dolares', chip: 'US$', nombre: 'US$', precioDe: 'el dólar' },
  { valor: 'kg_novillo', chip: 'kg novillo', nombre: 'kg de novillo', precioDe: 'el kilo de novillo' },
  { valor: 'qq_soja', chip: 'qq soja', nombre: 'qq de soja', precioDe: 'el quintal de soja' },
  { valor: 'qq_maiz', chip: 'qq maíz', nombre: 'qq de maíz', precioDe: 'el quintal de maíz' },
]

const FRECUENCIAS: Frecuencia[] = ['mensual', 'trimestral', 'semestral', 'anual']
const MESES: Record<Frecuencia, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 }

function pesos(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function Chips<T extends string>({
  valor,
  opciones,
  onChange,
  ariaLabel,
  chico = false,
}: {
  valor: T
  opciones: { valor: T; etiqueta: string }[]
  onChange: (v: T) => void
  ariaLabel: string
  chico?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={ariaLabel}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'rounded-lg border px-3 text-sm font-medium transition-colors',
            chico ? 'h-8 text-xs' : 'h-9',
            valor === o.valor
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-input text-muted-foreground hover:border-ring',
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}

export function PasoAlquiler({
  empresaId,
  campo,
  ocupado,
  setOcupado,
  onListo,
}: {
  empresaId: string
  campo: { id: string; nombre: string; hectareas: number }
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onListo: (resumen: string | null) => void
}) {
  const dolar = useDolarBlue()
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState<UnidadAlquiler>('kg_novillo')
  const [base, setBase] = useState<'ha' | 'total'>('ha')
  const [periodo, setPeriodo] = useState<'anio' | 'mes'>('anio')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('trimestral')
  const [primerPago, setPrimerPago] = useState(hoyISO())
  const [precio, setPrecio] = useState('')
  const [errores, setErrores] = useState<{ cantidad?: string; precio?: string; fecha?: string; general?: string }>({})

  const u = UNIDADES.find((x) => x.valor === unidad)!
  const cant = numeroDeFormateado(cantidad)
  // El dólar se trae solo; el resto lo pone él.
  const precioNum = unidad === 'dolares' ? (dolar.data?.venta ?? null) : numeroDeFormateado(precio)

  // Cuánto es cada cuota: lo pactado por año, dividido en los pagos del año.
  const unidadesAnio = cant !== null ? cant * (base === 'ha' ? campo.hectareas : 1) * (periodo === 'mes' ? 12 : 1) : null
  const cuotasAnio = 12 / MESES[frecuencia]
  const unidadesCuota = unidadesAnio !== null ? unidadesAnio / cuotasAnio : null
  const montoCuota =
    unidadesCuota === null ? null : unidad === 'pesos' ? unidadesCuota : precioNum !== null ? unidadesCuota * precioNum : null

  // "$ 5.000.000" pero "120 kg de novillo": la moneda va adelante.
  const esMoneda = unidad === 'pesos' || unidad === 'dolares'
  const cantidadConUnidad = esMoneda ? `${u.nombre} ${cantidad}` : `${cantidad} ${u.nombre}`
  const pactado =
    cant !== null
      ? `${cantidadConUnidad}${base === 'ha' ? ' por ha' : ''} por ${periodo === 'mes' ? 'mes' : 'año'}`
      : null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errores = {}
    if (cant === null || cant <= 0) errs.cantidad = 'Cuánto, según el contrato'
    if (unidad !== 'pesos' && unidad !== 'dolares' && (precioNum === null || precioNum <= 0))
      errs.precio = `A cuánto está hoy ${u.precioDe}, para estimar la cuota`
    if (unidad === 'dolares' && precioNum === null) errs.precio = 'No pudimos traer el dólar de hoy. Probá de nuevo en un rato.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(primerPago)) errs.fecha = 'La fecha del primer pago'
    setErrores(errs)
    if (Object.keys(errs).length || montoCuota === null || cant === null) return

    setOcupado(true)
    try {
      const detalle = `${cantidadConUnidad}${base === 'ha' ? '/ha' : ''}/${periodo === 'mes' ? 'mes' : 'año'}`
      const estimado = unidad === 'pesos' ? '' : ` · est. a ${pesos(precioNum!)}${unidad === 'dolares' ? ' (blue)' : ''}`
      await crearAlquilerDeCampo({
        empresaId,
        campoId: campo.id,
        montoCuota: Math.round(montoCuota),
        frecuencia,
        primeraFecha: primerPago,
        descripcion: `Alquiler ${campo.nombre} · ${detalle}${estimado}`,
      })
      // El precio del novillo que acaba de poner es LA cotización del gordo.
      if (unidad === 'kg_novillo' && precioNum) {
        try {
          await cargarGordo({ empresaId, valor: precioNum, fecha: hoyISO(), nota: 'Cargado en el onboarding' })
        } catch {
          /* el alquiler ya quedó; el gordo se carga desde el ticker */
        }
      }
      onListo(`${pesos(montoCuota)} ${frecuenciaLabel[frecuencia].toLowerCase()}`)
    } catch (err) {
      setErrores({ general: err instanceof Error ? err.message : 'No se pudo guardar el alquiler.' })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <AuthHeading
        icono={Receipt}
        titulo={`El alquiler de ${campo.nombre}`}
        subtitulo="Como está en el contrato. Cada pago queda en la Agenda y en la rentabilidad del campo."
      />
      <form onSubmit={guardar} className="mt-5 grid gap-4" noValidate>
        {/* 1 · Cómo está pactado */}
        <Reveal delay={0.14} className="grid gap-2">
          <Label htmlFor="alq-cantidad">¿Cómo está pactado?</Label>
          <div className="flex items-center gap-2">
            <Input
              id="alq-cantidad"
              inputMode="decimal"
              className="h-11 w-36 text-lg font-semibold tabular-nums"
              value={cantidad}
              onChange={(e) => {
                setCantidad(formatearNumero(e.target.value))
                setErrores((x) => ({ ...x, cantidad: undefined }))
              }}
              placeholder="120"
              aria-invalid={!!errores.cantidad}
              autoFocus
            />
            <span className="text-sm text-muted-foreground">de</span>
          </div>
          <Chips
            ariaLabel="Unidad"
            valor={unidad}
            onChange={(v) => {
              setUnidad(v)
              // En pesos o dólares lo común es el total del campo; en kilos o
              // quintales, por hectárea.
              setBase(v === 'pesos' || v === 'dolares' ? 'total' : 'ha')
              setErrores((x) => ({ ...x, precio: undefined }))
            }}
            opciones={UNIDADES.map((x) => ({ valor: x.valor, etiqueta: x.chip }))}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <Chips
              chico
              ariaLabel="Base"
              valor={base}
              onChange={setBase}
              opciones={[
                { valor: 'ha', etiqueta: 'por hectárea' },
                { valor: 'total', etiqueta: 'en total' },
              ]}
            />
            <Chips
              chico
              ariaLabel="Período"
              valor={periodo}
              onChange={setPeriodo}
              opciones={[
                { valor: 'anio', etiqueta: 'por año' },
                { valor: 'mes', etiqueta: 'por mes' },
              ]}
            />
          </div>
          <ErrorCampo mensaje={errores.cantidad} />
        </Reveal>

        {/* 2 · Cómo se paga: esto es lo que va al calendario */}
        <Reveal delay={0.2} className="grid gap-2">
          <Label>¿Cómo se paga?</Label>
          <Chips
            ariaLabel="Frecuencia de pago"
            valor={frecuencia}
            onChange={setFrecuencia}
            opciones={FRECUENCIAS.map((f) => ({ valor: f, etiqueta: frecuenciaLabel[f] }))}
          />
          <div className="flex items-center gap-2">
            <Label htmlFor="alq-fecha" className="shrink-0 text-sm font-normal text-muted-foreground">
              Primer pago
            </Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                id="alq-fecha"
                type="date"
                className="w-44 pl-9 tabular-nums"
                value={primerPago}
                onChange={(e) => {
                  setPrimerPago(e.target.value)
                  setErrores((x) => ({ ...x, fecha: undefined }))
                }}
                aria-invalid={!!errores.fecha}
              />
            </div>
          </div>
          <ErrorCampo mensaje={errores.fecha} />
        </Reveal>

        {/* 3 · A cuánto está hoy (sólo si no es en pesos) */}
        {unidad !== 'pesos' && (
          <Reveal delay={0.24} className="grid gap-2">
            <Label htmlFor="alq-precio">¿A cuánto está hoy {u.precioDe}?</Label>
            {unidad === 'dolares' ? (
              <p className="text-sm text-muted-foreground">
                {dolar.data
                  ? `Dólar blue: ${pesos(dolar.data.venta)}. Lo tomamos de la cotización del día.`
                  : dolar.isLoading
                    ? 'Buscando el dólar de hoy…'
                    : 'No pudimos traer el dólar de hoy.'}
              </p>
            ) : (
              <div className="relative w-44">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="alq-precio"
                  inputMode="decimal"
                  className="pl-7 tabular-nums"
                  value={precio}
                  onChange={(e) => {
                    setPrecio(formatearNumero(e.target.value))
                    setErrores((x) => ({ ...x, precio: undefined }))
                  }}
                  placeholder={unidad === 'kg_novillo' ? '2.900' : '30.000'}
                  aria-invalid={!!errores.precio}
                />
              </div>
            )}
            {errores.precio ? (
              <ErrorCampo mensaje={errores.precio} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Sirve para estimar cada cuota. Al pagar, la ajustás al precio de ese día.
                {unidad === 'kg_novillo' ? ' Este precio queda como tu cotización del gordo.' : ''}
              </p>
            )}
          </Reveal>
        )}

        {/* La cuenta, en vivo */}
        <Reveal delay={0.28}>
          <div
            className={cn(
              'rounded-lg border px-3.5 py-3 text-sm transition-colors',
              montoCuota !== null ? 'border-primary/50 bg-primary/5' : 'border-border',
            )}
          >
            {montoCuota !== null ? (
              <>
                <p className="text-[15px] font-semibold tabular-nums">
                  {pesos(montoCuota)}{' '}
                  <span className="font-normal text-muted-foreground">
                    {frecuenciaLabel[frecuencia].toLowerCase()}
                    {unidad !== 'pesos' ? ' · estimado' : ''}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {pactado}
                  {base === 'ha' ? ` · ${campo.hectareas.toLocaleString('es-AR')} ha` : ''} · {cuotasAnio}{' '}
                  {cuotasAnio === 1 ? 'pago' : 'pagos'} por año desde el {fechaCorta(primerPago)}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {pactado ? `${pactado}. Falta el precio de hoy para calcular la cuota.` : 'Cargá lo pactado y te mostramos cada cuota.'}
              </p>
            )}
          </div>
        </Reveal>

        <ErrorCampo mensaje={errores.general} />
        <Reveal delay={0.32} className="grid gap-2">
          <Button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
            {ocupado ? 'Guardando…' : 'Guardar el alquiler'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={ocupado}
            onClick={() => onListo(null)}
          >
            Lo cargo después
          </Button>
        </Reveal>
      </form>
    </>
  )
}
