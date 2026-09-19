import { useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Receipt } from 'lucide-react'
import { crearAlquilerDeCampo, frecuenciaLabel, type Frecuencia } from '@/features/analitica/api'
import { AuthHeading, BOTON_PRINCIPAL, ErrorCampo } from '@/features/auth/auth-layout'
import { Reveal } from '@/features/auth/reveal'
import { cargarGordo } from '@/features/cotizaciones/api'
import { useDolarBlue } from '@/features/cotizaciones/hooks'
import { formatearNumero, numeroDeFormateado } from '@/features/onboarding/numeros'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * El alquiler de un campo, como un diálogo: UNA pregunta por pantalla,
 * opciones grandes para elegir (no para escribir), avance solo al elegir,
 * y al final la cuenta dicha en castellano. Es la regla "one thing per
 * page" de GOV.UK aplicada a la pregunta más rara del onboarding — los
 * alquileres se pactan en kilos de novillo, quintales, dólares o pesos, y
 * eso no se pregunta de una sola vez.
 *
 * Lo que se guarda: una serie de cuotas de un año desde el primer pago
 * (Agenda + rentabilidad del campo). Si no es en pesos, cada cuota es una
 * estimación al precio de hoy; el precio del novillo queda como cotización
 * del gordo.
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

type Sub = 'unidad' | 'cantidad' | 'frecuencia' | 'fecha' | 'precio' | 'resumen'

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

/** Una opción grande: se toca y avanza. Reconocer, no recordar. */
function Opcion({
  activa,
  onClick,
  titulo,
  detalle,
}: {
  activa: boolean
  onClick: () => void
  titulo: string
  detalle?: string
}) {
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
      {activa ? (
        <Check className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
      ) : (
        <ArrowRight className="size-4 shrink-0 text-muted-foreground/50" />
      )}
    </button>
  )
}

/** Una pregunta del diálogo: entra desde la derecha, sale a la izquierda. */
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
  const [sub, setSub] = useState<Sub>('unidad')
  const [unidad, setUnidad] = useState<Unidad | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [base, setBase] = useState<'ha' | 'total'>('ha')
  const [periodo, setPeriodo] = useState<'anio' | 'mes'>('anio')
  const [frecuencia, setFrecuencia] = useState<Frecuencia | null>(null)
  const [primerPago, setPrimerPago] = useState(hoyISO())
  const [precio, setPrecio] = useState('')
  const [error, setError] = useState<string | null>(null)

  const u = UNIDADES.find((x) => x.valor === unidad) ?? null
  const esMoneda = unidad === 'pesos' || unidad === 'dolares'
  const cant = numeroDeFormateado(cantidad)
  const precioNum = unidad === 'dolares' ? (dolar.data?.venta ?? null) : numeroDeFormateado(precio)

  // Cuánto es cada cuota: lo pactado por año, dividido en los pagos del año.
  const unidadesAnio = cant !== null ? cant * (base === 'ha' ? campo.hectareas : 1) * (periodo === 'mes' ? 12 : 1) : null
  const cuotasAnio = frecuencia ? 12 / MESES[frecuencia] : null
  const unidadesCuota = unidadesAnio !== null && cuotasAnio ? unidadesAnio / cuotasAnio : null
  const montoCuota =
    unidadesCuota === null ? null : unidad === 'pesos' ? unidadesCuota : precioNum !== null ? unidadesCuota * precioNum : null

  const ORDEN: Sub[] = ['unidad', 'cantidad', 'frecuencia', 'fecha', ...(unidad === 'pesos' || unidad === 'dolares' ? [] : ['precio' as Sub]), 'resumen']
  const indice = ORDEN.indexOf(sub)
  const anterior = ORDEN[indice - 1] ?? null
  const siguiente = ORDEN[indice + 1] ?? null

  function elegirUnidad(v: Unidad) {
    // Cambiar la unidad vacía la cantidad: 5.000.000 kg no es un error del
    // productor, es un resto nuestro.
    if (v !== unidad) setCantidad('')
    setUnidad(v)
    // En pesos o dólares lo común es el total del campo; en kilos o
    // quintales, por hectárea.
    setBase(v === 'pesos' || v === 'dolares' ? 'total' : 'ha')
    setPeriodo(v === 'pesos' ? 'mes' : 'anio')
    setError(null)
    setSub('cantidad')
  }
  function confirmarCantidad() {
    if (cant === null || cant <= 0) {
      setError('Cuánto, según el contrato')
      return
    }
    setError(null)
    setSub('frecuencia')
  }
  function elegirFrecuencia(f: Frecuencia) {
    setFrecuencia(f)
    setError(null)
    setSub('fecha')
  }
  function confirmarFecha() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(primerPago)) {
      setError('La fecha del primer pago')
      return
    }
    setError(null)
    setSub(siguiente ?? 'resumen')
  }
  function confirmarPrecio() {
    if (precioNum === null || precioNum <= 0) {
      setError(`A cuánto está hoy ${u?.precioDe}, para estimar la cuota`)
      return
    }
    setError(null)
    setSub('resumen')
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!u || !frecuencia || montoCuota === null || cant === null) return
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
      if (unidad === 'kg_novillo' && precioNum) {
        try {
          await cargarGordo({ empresaId, valor: precioNum, fecha: hoyISO(), nota: 'Cargado en el onboarding' })
        } catch {
          /* el alquiler ya quedó; el gordo se carga desde el ticker */
        }
      }
      onListo(`${pesos(montoCuota)} ${frecuenciaLabel[frecuencia].toLowerCase()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el alquiler.')
    } finally {
      setOcupado(false)
    }
  }

  // Enter en un input = el botón "Siguiente" de esa pregunta.
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (sub === 'cantidad') confirmarCantidad()
    else if (sub === 'fecha') confirmarFecha()
    else if (sub === 'precio') confirmarPrecio()
    else if (sub === 'resumen') void guardar(e)
  }

  const labelCantidad = !u
    ? ''
    : esMoneda
      ? `¿Cuánto por ${periodo === 'mes' ? 'mes' : 'año'}${base === 'ha' ? ', por hectárea' : ''}?`
      : `¿Cuántos ${u.nombre} por ${base === 'ha' ? 'hectárea por ' : ''}${periodo === 'mes' ? 'mes' : 'año'}?`

  return (
    <>
      <AuthHeading
        icono={Receipt}
        titulo={`El alquiler de ${campo.nombre}`}
        subtitulo="Unas preguntas cortas. Con eso, cada pago queda en tu Agenda y en la cuenta del campo."
      />

      {/* Dónde vamos: puntos, uno por pregunta. */}
      <Reveal delay={0.12} className="mt-4 flex items-center gap-1.5">
        {ORDEN.map((s, i) => (
          <span
            key={s}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i < indice ? 'w-4 bg-primary' : i === indice ? 'w-6 bg-primary' : 'w-4 bg-border',
            )}
          />
        ))}
        <span className="ml-1 text-[11px] text-muted-foreground">
          {indice + 1} de {ORDEN.length}
        </span>
      </Reveal>

      <form onSubmit={onSubmit} className="mt-4" noValidate>
        <Reveal delay={0.16}>
          <AnimatePresence mode="wait" initial={false}>
            {sub === 'unidad' && (
              <Pregunta clave="unidad">
                <p className="text-[15px] font-semibold">¿En qué está pactado el alquiler?</p>
                <div className="grid gap-1.5">
                  {UNIDADES.map((x) => (
                    <Opcion
                      key={x.valor}
                      activa={unidad === x.valor}
                      onClick={() => elegirUnidad(x.valor)}
                      titulo={x.titulo}
                      detalle={x.detalle}
                    />
                  ))}
                </div>
              </Pregunta>
            )}

            {sub === 'cantidad' && u && (
              <Pregunta clave="cantidad">
                <p className="text-[15px] font-semibold">{labelCantidad}</p>
                <div className="relative">
                  {esMoneda && (
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-lg text-muted-foreground">
                      {u.nombre}
                    </span>
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
                    <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground">
                      {u.nombre}
                    </span>
                  )}
                </div>
                {/* Cambiar la base o el período, sin salir de la pregunta. */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setBase(base === 'ha' ? 'total' : 'ha')}
                    className="underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {base === 'ha' ? 'Es por el total del campo, no por hectárea' : 'Es por hectárea, no por el total'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodo(periodo === 'anio' ? 'mes' : 'anio')}
                    className="underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {periodo === 'anio' ? 'Es por mes, no por año' : 'Es por año, no por mes'}
                  </button>
                </div>
                <ErrorCampo mensaje={error} />
                <Button type="button" onClick={confirmarCantidad} className={BOTON_PRINCIPAL}>
                  Siguiente <ArrowRight className="size-4" />
                </Button>
              </Pregunta>
            )}

            {sub === 'frecuencia' && (
              <Pregunta clave="frecuencia">
                <p className="text-[15px] font-semibold">¿Cada cuánto se paga?</p>
                <div className="grid gap-1.5">
                  {FRECUENCIAS.map((f) => (
                    <Opcion
                      key={f.valor}
                      activa={frecuencia === f.valor}
                      onClick={() => elegirFrecuencia(f.valor)}
                      titulo={frecuenciaLabel[f.valor]}
                      detalle={f.detalle}
                    />
                  ))}
                </div>
              </Pregunta>
            )}

            {sub === 'fecha' && (
              <Pregunta clave="fecha">
                <p className="text-[15px] font-semibold">¿Cuándo es el próximo pago?</p>
                <Input
                  type="date"
                  className="h-12 w-full text-lg tabular-nums"
                  value={primerPago}
                  onChange={(e) => {
                    setPrimerPago(e.target.value)
                    setError(null)
                  }}
                  aria-label="Fecha del próximo pago"
                  aria-invalid={!!error}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Desde ahí armamos un año de pagos {frecuencia ? frecuenciaLabel[frecuencia].toLowerCase() + 'es' : ''} en la
                  Agenda. Después los renovás o cancelás desde ahí.
                </p>
                <ErrorCampo mensaje={error} />
                <Button type="button" onClick={confirmarFecha} className={BOTON_PRINCIPAL}>
                  Siguiente <ArrowRight className="size-4" />
                </Button>
              </Pregunta>
            )}

            {sub === 'precio' && u && (
              <Pregunta clave="precio">
                <p className="text-[15px] font-semibold">¿A cuánto está hoy {u.precioDe}?</p>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-lg text-muted-foreground">
                    $
                  </span>
                  <Input
                    inputMode="decimal"
                    className="h-12 pl-8 text-xl font-semibold tabular-nums"
                    value={precio}
                    onChange={(e) => {
                      setPrecio(formatearNumero(e.target.value))
                      setError(null)
                    }}
                    placeholder={unidad === 'kg_novillo' ? '2.900' : '30.000'}
                    aria-label={`Precio de hoy de ${u.precioDe}`}
                    aria-invalid={!!error}
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Con esto estimamos cada cuota. Al pagar, la ajustás al precio de ese día.
                  {unidad === 'kg_novillo' ? ' Y queda como tu cotización del gordo.' : ''}
                </p>
                <ErrorCampo mensaje={error} />
                <Button type="button" onClick={confirmarPrecio} className={BOTON_PRINCIPAL}>
                  Ver la cuenta <ArrowRight className="size-4" />
                </Button>
              </Pregunta>
            )}

            {sub === 'resumen' && u && frecuencia && (
              <Pregunta clave="resumen">
                <p className="text-[15px] font-semibold">Así queda</p>
                <div className="rounded-lg border border-primary/50 bg-primary/5 px-3.5 py-3">
                  {montoCuota !== null ? (
                    <>
                      <p className="text-[22px] font-bold tabular-nums leading-tight">
                        {pesos(montoCuota)}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                          {frecuenciaLabel[frecuencia].toLowerCase()}
                          {unidad !== 'pesos' ? ' · estimado' : ''}
                        </span>
                      </p>
                      <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                        <li>
                          {esMoneda ? `${u.nombre} ${cantidad}` : `${cantidad} ${u.nombre}`}
                          {base === 'ha' ? ` por hectárea (${campo.hectareas.toLocaleString('es-AR')} ha)` : ' en total'} por{' '}
                          {periodo === 'mes' ? 'mes' : 'año'}
                        </li>
                        <li>
                          {cuotasAnio} {cuotasAnio === 1 ? 'pago' : 'pagos'} por año, el primero el {fechaLarga(primerPago)}
                        </li>
                        {unidad !== 'pesos' && precioNum !== null && (
                          <li>
                            {u.precioDe![0]!.toUpperCase() + u.precioDe!.slice(1)} a {pesos(precioNum)} hoy
                            {unidad === 'dolares' ? ' (blue)' : ''}
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
                <ErrorCampo mensaje={error} />
                <Button type="submit" disabled={ocupado || montoCuota === null} className={BOTON_PRINCIPAL}>
                  {ocupado ? 'Guardando…' : 'Guardar el alquiler'}
                </Button>
              </Pregunta>
            )}
          </AnimatePresence>
        </Reveal>

        <Reveal delay={0.2} className="mt-3 flex items-center justify-between">
          {anterior ? (
            <button
              type="button"
              onClick={() => {
                setError(null)
                setSub(anterior)
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Volver
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onListo(null)}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Lo cargo después
          </button>
        </Reveal>
      </form>
    </>
  )
}
