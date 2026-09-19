import { useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check, Receipt } from 'lucide-react'
import { crearAlquilerDeCampo, frecuenciaLabel, type Frecuencia } from '@/features/analitica/api'
import { useInvalidarMovimientos } from '@/features/agenda/hooks'
import { useCampos } from '@/features/campos/hooks'
import { cargarGordo } from '@/features/cotizaciones/api'
import { useDolarBlue, useGordoActual, useNovilloCanuelas } from '@/features/cotizaciones/hooks'
import { formatearNumero, numeroDeFormateado } from '@/features/onboarding/numeros'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * El alquiler de un campo como está pactado, en un diálogo de una pregunta
 * por pantalla. Vive en Analítica (es un gasto) y la guía lo empuja para
 * los campos alquilados una vez terminado el onboarding — cuando tiene el
 * contrato a mano, no mientras arma su campo.
 *
 * Cuatro pantallas: ¿en qué está pactado? → ¿cuánto? → ¿cómo se paga? →
 * así queda. Si es en kilos de novillo o en dólares, el precio sale de la
 * cotización que ya tiene la app (gordo del ticker, dólar blue); sólo si no
 * hay cotización del gordo se pide una vez, y queda cargada. Cada cuota es
 * una estimación que se corrige al pagar, en la Agenda.
 */

type Unidad = 'kg_novillo' | 'qq_soja' | 'qq_maiz' | 'dolares' | 'pesos'

const UNIDADES: { valor: Unidad; titulo: string; detalle: string; nombre: string; precioDe: string | null }[] = [
  { valor: 'kg_novillo', titulo: 'En kilos de novillo', detalle: 'Lo más común en ganadería', nombre: 'kg de novillo', precioDe: 'el kilo de novillo' },
  { valor: 'qq_soja', titulo: 'En quintales de soja', detalle: 'Lo más común en agricultura', nombre: 'qq de soja', precioDe: 'el quintal de soja' },
  { valor: 'qq_maiz', titulo: 'En quintales de maíz', detalle: '', nombre: 'qq de maíz', precioDe: 'el quintal de maíz' },
  { valor: 'dolares', titulo: 'En dólares', detalle: 'Tomamos el blue del día', nombre: 'US$', precioDe: 'el dólar' },
  { valor: 'pesos', titulo: 'En pesos', detalle: 'Un monto fijo', nombre: '$', precioDe: null },
]
const FRECUENCIAS: { valor: Frecuencia; detalle: string }[] = [
  { valor: 'mensual', detalle: '12 pagos por año' },
  { valor: 'trimestral', detalle: '4 pagos por año' },
  { valor: 'semestral', detalle: '2 pagos por año' },
  { valor: 'anual', detalle: '1 pago por año' },
]
const MESES: Record<Frecuencia, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 }

type Sub = 'campo' | 'unidad' | 'cantidad' | 'pago' | 'precio' | 'resumen'

function pesos(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}
function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
}

/** Una opción grande: se toca y avanza. */
function Opcion({ activa, onClick, titulo, detalle }: { activa: boolean; onClick: () => void; titulo: string; detalle?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors',
        activa ? 'border-primary bg-primary/10' : 'border-input hover:border-ring hover:bg-secondary/40',
      )}
    >
      <span>
        <span className={cn('block text-sm font-semibold', activa ? 'text-primary' : 'text-foreground')}>{titulo}</span>
        {detalle ? <span className="block text-xs text-muted-foreground">{detalle}</span> : null}
      </span>
      {activa ? <Check className="size-4 shrink-0 text-primary" strokeWidth={2.5} /> : <ArrowRight className="size-4 shrink-0 text-muted-foreground/50" />}
    </button>
  )
}

/** Dos opciones en un segmento: botones, no links. */
function Segmento<T extends string>({ valor, opciones, onChange, ariaLabel }: { valor: T; opciones: { valor: T; etiqueta: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="inline-flex rounded-lg bg-secondary p-0.5" role="radiogroup" aria-label={ariaLabel}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'h-8 rounded-md px-3 text-xs font-semibold transition-colors',
            valor === o.valor ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}

function Pregunta({ clave, children }: { clave: string; children: ReactNode }) {
  return (
    <motion.div
      key={clave}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="grid gap-3"
    >
      {children}
    </motion.div>
  )
}

export function AlquilerDialog({
  empresaId,
  campoId: campoInicial,
  open,
  onOpenChange,
}: {
  empresaId: string
  /** Campo ya elegido (desde la guía); si no, se pregunta. */
  campoId?: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const campos = useCampos()
  const dolar = useDolarBlue()
  const gordo = useGordoActual(empresaId)
  const canuelas = useNovilloCanuelas()
  const invalidar = useInvalidarMovimientos()

  const alquilados = (campos.data ?? []).filter((c) => c.tipo === 'alquilado')
  const [campoId, setCampoId] = useState<string | null>(campoInicial ?? null)
  const campo = (campos.data ?? []).find((c) => c.id === (campoId ?? campoInicial)) ?? (alquilados.length === 1 ? alquilados[0] : null)

  const [sub, setSub] = useState<Sub>(campoInicial || alquilados.length <= 1 ? 'unidad' : 'campo')
  const [unidad, setUnidad] = useState<Unidad | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [base, setBase] = useState<'ha' | 'total'>('ha')
  const [periodo, setPeriodo] = useState<'anio' | 'mes'>('anio')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('trimestral')
  const [primerPago, setPrimerPago] = useState(hoyISO())
  const [precio, setPrecio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const u = UNIDADES.find((x) => x.valor === unidad) ?? null
  const esMoneda = unidad === 'pesos' || unidad === 'dolares'
  const cant = numeroDeFormateado(cantidad)
  const hectareas = campo?.hectareas ?? null
  // El precio: dólar y novillo salen de la app; quintales los pone él.
  const precioAuto =
    unidad === 'dolares'
      ? (dolar.data?.venta ?? null)
      : unidad === 'kg_novillo'
        ? (canuelas.data?.valor ?? gordo.data?.valor ?? null)
        : null
  const precioNum = precioAuto ?? numeroDeFormateado(precio)
  const pidePrecio = unidad !== 'pesos' && precioAuto === null

  const unidadesAnio = cant !== null ? cant * (base === 'ha' ? (hectareas ?? 0) : 1) * (periodo === 'mes' ? 12 : 1) : null
  const cuotasAnio = 12 / MESES[frecuencia]
  const unidadesCuota = unidadesAnio !== null ? unidadesAnio / cuotasAnio : null
  const montoCuota = unidadesCuota === null ? null : unidad === 'pesos' ? unidadesCuota : precioNum !== null ? unidadesCuota * precioNum : null

  const ORDEN: Sub[] = [
    ...(campoInicial || alquilados.length <= 1 ? [] : ['campo' as Sub]),
    'unidad',
    'cantidad',
    'pago',
    ...(pidePrecio ? ['precio' as Sub] : []),
    'resumen',
  ]
  const indice = ORDEN.indexOf(sub)
  const anterior = ORDEN[indice - 1] ?? null
  const siguiente = ORDEN[indice + 1] ?? null

  function elegirUnidad(v: Unidad) {
    if (v !== unidad) setCantidad('')
    setUnidad(v)
    setBase(v === 'pesos' || v === 'dolares' ? 'total' : 'ha')
    setPeriodo(v === 'pesos' ? 'mes' : 'anio')
    setError(null)
    setSub('cantidad')
  }
  function confirmarCantidad() {
    if (cant === null || cant <= 0) return setError('Cuánto, según el contrato')
    if (base === 'ha' && !hectareas) return setError('Este campo no tiene hectáreas cargadas. Ponelas en Campos, o elegí "en total".')
    setError(null)
    setSub('pago')
  }
  function confirmarPago() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(primerPago)) return setError('La fecha del próximo pago')
    setError(null)
    setSub(siguiente ?? 'resumen')
  }
  function confirmarPrecio() {
    if (precioNum === null || precioNum <= 0) return setError(`A cuánto está hoy ${u?.precioDe}`)
    setError(null)
    setSub('resumen')
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!campo || !u || montoCuota === null || cant === null) return
    setOcupado(true)
    try {
      const cantidadConUnidad = esMoneda ? `${u.nombre} ${cantidad}` : `${cantidad} ${u.nombre}`
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
      // Si el precio del novillo lo puso él, queda como cotización del gordo.
      if (unidad === 'kg_novillo' && precioAuto === null && precioNum) {
        try {
          await cargarGordo({ empresaId, valor: precioNum, fecha: hoyISO(), nota: 'Cargado con el alquiler' })
        } catch {
          /* el alquiler ya quedó */
        }
      }
      invalidar()
      toast.success(`Alquiler de ${campo.nombre}: ${pesos(montoCuota)} ${frecuenciaLabel[frecuencia].toLowerCase()}, en la Agenda`)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el alquiler.')
    } finally {
      setOcupado(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (sub === 'cantidad') confirmarCantidad()
    else if (sub === 'pago') confirmarPago()
    else if (sub === 'precio') confirmarPrecio()
    else if (sub === 'resumen') void guardar(e)
  }

  const labelCantidad = !u
    ? ''
    : esMoneda
      ? `¿Cuánto por ${periodo === 'mes' ? 'mes' : 'año'}${base === 'ha' ? ', por hectárea' : ''}?`
      : `¿Cuántos ${u.nombre} por ${base === 'ha' ? 'hectárea por ' : ''}${periodo === 'mes' ? 'mes' : 'año'}?`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
              <Receipt className="size-[18px]" strokeWidth={1.75} />
            </span>
            <DialogTitle className="text-left font-heading text-[19px] leading-snug">
              {campo ? `El alquiler de ${campo.nombre}` : 'El alquiler'}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Dónde vamos */}
        <div className="flex items-center gap-1.5">
          {ORDEN.map((s, i) => (
            <span key={s} className={cn('h-1.5 rounded-full transition-all', i < indice ? 'w-4 bg-primary' : i === indice ? 'w-6 bg-primary' : 'w-4 bg-border')} />
          ))}
          <span className="ml-1 text-[11px] text-muted-foreground">{indice + 1} de {ORDEN.length}</span>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <AnimatePresence mode="wait" initial={false}>
            {sub === 'campo' && (
              <Pregunta clave="campo">
                <p className="text-[15px] font-semibold">¿De qué campo?</p>
                <div className="grid gap-1.5">
                  {alquilados.map((c) => (
                    <Opcion
                      key={c.id}
                      activa={campoId === c.id}
                      onClick={() => {
                        setCampoId(c.id)
                        setSub('unidad')
                      }}
                      titulo={c.nombre}
                      detalle={c.hectareas ? `${c.hectareas.toLocaleString('es-AR')} ha` : ''}
                    />
                  ))}
                </div>
              </Pregunta>
            )}

            {sub === 'unidad' && (
              <Pregunta clave="unidad">
                <p className="text-[15px] font-semibold">¿En qué está pactado?</p>
                <div className="grid gap-1.5">
                  {UNIDADES.map((x) => (
                    <Opcion key={x.valor} activa={unidad === x.valor} onClick={() => elegirUnidad(x.valor)} titulo={x.titulo} detalle={x.detalle} />
                  ))}
                </div>
              </Pregunta>
            )}

            {sub === 'cantidad' && u && (
              <Pregunta clave="cantidad">
                <p className="text-[15px] font-semibold">{labelCantidad}</p>
                <div className="relative">
                  {esMoneda && (
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-lg text-muted-foreground">{u.nombre}</span>
                  )}
                  <Input
                    inputMode="decimal"
                    className={cn('h-12 text-xl font-semibold tabular-nums', esMoneda ? (unidad === 'dolares' ? 'pl-14' : 'pl-8') : 'pr-28')}
                    value={cantidad}
                    onChange={(e) => {
                      setCantidad(formatearNumero(e.target.value))
                      setError(null)
                    }}
                    placeholder={esMoneda ? '5.000.000' : '120'}
                    aria-label={labelCantidad}
                    aria-invalid={!!error}
                    autoFocus
                  />
                  {!esMoneda && (
                    <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground">{u.nombre}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Segmento
                    ariaLabel="Base"
                    valor={base}
                    onChange={setBase}
                    opciones={[
                      { valor: 'ha', etiqueta: 'Por hectárea' },
                      { valor: 'total', etiqueta: 'En total' },
                    ]}
                  />
                  <Segmento
                    ariaLabel="Período"
                    valor={periodo}
                    onChange={setPeriodo}
                    opciones={[
                      { valor: 'anio', etiqueta: 'Por año' },
                      { valor: 'mes', etiqueta: 'Por mes' },
                    ]}
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="button" onClick={confirmarCantidad} className="h-11 w-full">
                  Siguiente <ArrowRight className="size-4" />
                </Button>
              </Pregunta>
            )}

            {sub === 'pago' && (
              <Pregunta clave="pago">
                <p className="text-[15px] font-semibold">¿Cómo se paga?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {FRECUENCIAS.map((f) => (
                    <button
                      key={f.valor}
                      type="button"
                      role="radio"
                      aria-checked={frecuencia === f.valor}
                      onClick={() => setFrecuencia(f.valor)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left transition-colors',
                        frecuencia === f.valor ? 'border-primary bg-primary/10' : 'border-input hover:border-ring',
                      )}
                    >
                      <span className={cn('block text-sm font-semibold', frecuencia === f.valor ? 'text-primary' : 'text-foreground')}>{frecuenciaLabel[f.valor]}</span>
                      <span className="block text-xs text-muted-foreground">{f.detalle}</span>
                    </button>
                  ))}
                </div>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Próximo pago</span>
                  <Input
                    type="date"
                    className="h-11 tabular-nums"
                    value={primerPago}
                    onChange={(e) => {
                      setPrimerPago(e.target.value)
                      setError(null)
                    }}
                    aria-invalid={!!error}
                  />
                </label>
                <p className="text-xs text-muted-foreground">Desde ahí armamos un año de pagos en la Agenda. Después los renovás o cancelás desde ahí.</p>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="button" onClick={confirmarPago} className="h-11 w-full">
                  {pidePrecio ? 'Siguiente' : 'Ver la cuenta'} <ArrowRight className="size-4" />
                </Button>
              </Pregunta>
            )}

            {sub === 'precio' && u && (
              <Pregunta clave="precio">
                <p className="text-[15px] font-semibold">¿A cuánto está hoy {u.precioDe}?</p>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-lg text-muted-foreground">$</span>
                  <Input
                    inputMode="decimal"
                    className="h-12 pl-8 text-xl font-semibold tabular-nums"
                    value={precio}
                    onChange={(e) => {
                      setPrecio(formatearNumero(e.target.value))
                      setError(null)
                    }}
                    placeholder={unidad === 'kg_novillo' ? '3.900' : '30.000'}
                    aria-label={`Precio de hoy de ${u.precioDe}`}
                    aria-invalid={!!error}
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Con esto estimamos cada cuota; al pagar, la ajustás al precio de ese día.
                  {unidad === 'kg_novillo' ? ' Queda como tu cotización del gordo.' : ''}
                </p>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="button" onClick={confirmarPrecio} className="h-11 w-full">
                  Ver la cuenta <ArrowRight className="size-4" />
                </Button>
              </Pregunta>
            )}

            {sub === 'resumen' && u && (
              <Pregunta clave="resumen">
                <p className="text-[15px] font-semibold">Así queda</p>
                <div className="rounded-lg border border-primary/50 bg-primary/5 px-3.5 py-3">
                  {montoCuota !== null ? (
                    <>
                      <p className="text-[22px] font-bold leading-tight tabular-nums">
                        {pesos(montoCuota)}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                          {frecuenciaLabel[frecuencia].toLowerCase()}
                          {unidad !== 'pesos' ? ' · estimado' : ''}
                        </span>
                      </p>
                      <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                        <li>
                          {esMoneda ? `${u.nombre} ${cantidad}` : `${cantidad} ${u.nombre}`}
                          {base === 'ha' ? ` por hectárea (${(hectareas ?? 0).toLocaleString('es-AR')} ha)` : ' en total'} por {periodo === 'mes' ? 'mes' : 'año'}
                        </li>
                        <li>
                          {cuotasAnio} {cuotasAnio === 1 ? 'pago' : 'pagos'} por año, el primero el {fechaLarga(primerPago)}
                        </li>
                        {unidad !== 'pesos' && precioNum !== null && (
                          <li>
                            {u.precioDe![0]!.toUpperCase() + u.precioDe!.slice(1)} a {pesos(precioNum)}
                            {unidad === 'dolares'
                              ? ' (blue de hoy)'
                              : unidad === 'kg_novillo' && canuelas.data
                                ? ` (Cañuelas, ${fechaLarga(canuelas.data.fecha)})`
                                : unidad === 'kg_novillo' && precioAuto !== null
                                  ? ' (tu cotización del gordo)'
                                  : ' hoy'}
                          </li>
                        )}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {unidad === 'dolares' ? 'No pudimos traer el dólar de hoy. Probá de nuevo en un rato.' : 'Falta un dato para calcular.'}
                    </p>
                  )}
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="submit" disabled={ocupado || montoCuota === null} className="h-11 w-full">
                  {ocupado ? 'Guardando…' : 'Guardar el alquiler'}
                </Button>
              </Pregunta>
            )}
          </AnimatePresence>

          {anterior && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-muted-foreground"
              onClick={() => {
                setError(null)
                setSub(anterior)
              }}
            >
              <ArrowLeft className="size-3.5" /> Volver
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
