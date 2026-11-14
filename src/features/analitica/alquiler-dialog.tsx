import { useState } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { Grupo, Opciones, PanelLateral } from '@/components/tropero/panel-lateral'
import { CampoFecha } from '@/components/ui/campo-fecha'
import { crearAlquilerDeCampo, frecuenciaLabel, type Frecuencia } from '@/features/analitica/api'
import { useInvalidarMovimientos } from '@/features/agenda/hooks'
import { useCampos } from '@/features/campos/hooks'
import { cargarGordo } from '@/features/cotizaciones/api'
import { useDolarBlue, useGordoActual, useNovilloCanuelas } from '@/features/cotizaciones/hooks'
import { formatearNumero, numeroDeFormateado } from '@/features/onboarding/numeros'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { MarcaCampo } from '@/features/campos/opciones-campo'
import { cn } from '@/lib/utils'

/**
 * El alquiler de un campo como está pactado, en el panel lateral, una pregunta
 * por pantalla (Figma página 35, «Alquiler» en 4 pasos; Lau, 03/11). Vive en Analítica (es un gasto) y la guía lo empuja para
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
  return `$${Math.round(n).toLocaleString('es-AR')}`
}
function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  const { campos: identidadCampos } = useCampoElegido()
  const campos = useCampos()
  const dolar = useDolarBlue()
  const gordo = useGordoActual(empresaId)
  const canuelas = useNovilloCanuelas()
  const invalidar = useInvalidarMovimientos()

  // Los alquilados primero; si no hay ninguno marcado así, cualquiera de sus campos
  // (antes no preguntaba y «Guardar» no hacía nada).
  const marcados = (campos.data ?? []).filter((c) => c.tipo === 'alquilado')
  const alquilados = marcados.length ? marcados : (campos.data ?? [])
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
  // Sólo cuando ya eligió en qué está pactado: si no, el total de pasos cambia al elegir.
  const pidePrecio = unidad !== null && unidad !== 'pesos' && precioAuto === null

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

  async function guardar(e?: { preventDefault: () => void }) {
    e?.preventDefault()
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
      toast.success(`Listo: anotamos el alquiler de ${campo.nombre}`, { description: `${pesos(montoCuota)} ${frecuenciaLabel[frecuencia].toLowerCase()}; cada pago lo ves en la Agenda.` })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el alquiler.')
    } finally {
      setOcupado(false)
    }
  }


  const labelCantidad = !u
    ? ''
    : esMoneda
      ? `¿Cuánto por ${periodo === 'mes' ? 'mes' : 'año'}${base === 'ha' ? ', por hectárea' : ''}?`
      : `¿Cuántos ${u.nombre} por ${base === 'ha' ? 'hectárea por ' : ''}${periodo === 'mes' ? 'mes' : 'año'}?`

  const TITULO: Record<Sub, string> = {
    campo: '¿De qué campo?',
    unidad: '¿En qué está pactado?',
    cantidad: esMoneda ? '¿Cuánto?' : u ? `¿Cuántos ${u.nombre.split(' ')[0]}?` : '¿Cuánto?',
    pago: '¿Cuándo se paga?',
    precio: u ? `¿A cuánto está hoy ${u.precioDe}?` : '¿A cuánto está hoy?',
    resumen: 'Así queda',
  }
  const confirmar = sub === 'cantidad' ? confirmarCantidad : sub === 'pago' ? confirmarPago : sub === 'precio' ? confirmarPrecio : null
  // Los próximos pagos, para ver cómo queda en la Agenda.
  const proximos = Array.from({ length: Math.min(3, cuotasAnio) }, (_, i) => {
    const [y, m, d] = primerPago.split('-').map(Number) as [number, number, number]
    const f = new Date(y, m - 1 + i * MESES[frecuencia], d)
    return { dia: f.getDate(), mes: f.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') }
  })

  return (
    <PanelLateral
      abierto={open}
      onCerrar={() => onOpenChange(false)}
      onVolver={anterior ? () => (setError(null), setSub(anterior)) : undefined}
      titulo={TITULO[sub]}
      bajada={
        <span className="flex items-center gap-3">
          {campo ? `El alquiler de ${campo.nombre}` : 'El alquiler'}, paso {indice + 1} de {ORDEN.length}
          <span aria-hidden className="flex gap-1">
            {ORDEN.map((x, i) => (
              <span key={x} className={cn('h-1.5 w-6 rounded-full', i <= indice ? 'bg-principal' : 'bg-borde')} />
            ))}
          </span>
        </span>
      }
      pie={
        sub === 'resumen' ? (
          <>
            {error && <p role="alert" className="mb-3 rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
            <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado || montoCuota === null} onClick={() => void guardar()}>
              {ocupado ? 'Guardando…' : 'Guardar el alquiler'}
            </BotonPrincipal>
          </>
        ) : confirmar ? (
          <>
            {error && <p role="alert" className="mb-3 rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
            <BotonPrincipal icono="Siguiente" onClick={confirmar}>
              Seguir
            </BotonPrincipal>
          </>
        ) : undefined
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (confirmar) confirmar()
          else if (sub === 'resumen') void guardar(e)
        }}
      >
        {sub === 'campo' && (
          <div className="flex flex-col gap-3">
            {alquilados.map((c) => (
              <OpcionGrande key={c.id} activa={campoId === c.id} icono="Campos" marca={(() => { const id = identidadCampos.find((x) => x.id === c.id); return id ? <MarcaCampo letra={id.letra} color={id.color} className="size-12 text-[18px] ring-2 ring-superficie" /> : undefined })()} titulo={c.nombre} detalle={c.hectareas ? `${c.hectareas.toLocaleString('es-AR')} ha` : ''} onClick={() => (setCampoId(c.id), setSub('unidad'))} />
            ))}
          </div>
        )}

        {sub === 'unidad' && (
          <div className="flex flex-col gap-3">
            <p className="mb-1 text-[15px] text-texto-suave">Como dice el contrato. Si es en kilos o en quintales, la app lo pasa a pesos cada vez que se paga.</p>
            {UNIDADES.map((x) => (
              <OpcionGrande key={x.valor} activa={unidad === x.valor} icono={x.valor === 'kg_novillo' ? 'Vaca' : x.valor === 'pesos' || x.valor === 'dolares' ? 'Plata' : 'Campos'} titulo={x.titulo} detalle={x.detalle} onClick={() => elegirUnidad(x.valor)} />
            ))}
          </div>
        )}

        {sub === 'cantidad' && u && (
          <>
            <label className="flex items-baseline gap-2">
              {esMoneda && <span className="titulo-display shrink-0 text-[40px] text-texto-suave">{u.nombre}</span>}
              <input
                inputMode="decimal"
                aria-label={labelCantidad}
                value={cantidad}
                placeholder={esMoneda ? '5.000.000' : '120'}
                onChange={(e) => (setCantidad(formatearNumero(e.target.value)), setError(null))}
                autoFocus
                className="titulo-display cifra min-w-[2ch] max-w-full bg-transparent text-[64px] [field-sizing:content] leading-tight tracking-[-0.03em] text-texto outline-none placeholder:text-texto/25"
              />
              {!esMoneda && <span className="shrink-0 text-[22px] font-bold text-texto">{u.nombre.split(' ')[0]}</span>}
            </label>
            {!esMoneda && <p className="text-[16px] font-semibold text-texto-suave">{u.nombre.split(' ').slice(1).join(' ')}</p>}
            <Grupo titulo="Por" className="mt-6">
              <Opciones etiqueta="Por" opciones={[{ valor: 'mes', texto: 'Mes' }, { valor: 'anio', texto: 'Año' }]} elegidas={[periodo]} onTocar={(v) => setPeriodo(v as 'mes' | 'anio')} />
            </Grupo>
            <Grupo titulo="Para">
              <Opciones etiqueta="Para" opciones={[{ valor: 'total', texto: 'Todo el campo' }, { valor: 'ha', texto: hectareas ? `Cada hectárea (${hectareas.toLocaleString('es-AR')} ha)` : 'Cada hectárea' }]} elegidas={[base]} onTocar={(v) => setBase(v as 'ha' | 'total')} />
            </Grupo>
            {unidadesAnio !== null && unidadesAnio > 0 && unidad !== 'pesos' && precioAuto !== null && (
              <div className="mt-6 rounded-[18px] bg-acento px-5 py-4 text-acento-texto">
                <p className="text-[14px]">Con {unidad === 'dolares' ? 'el blue' : 'el gordo'} de hoy son</p>
                <p className="titulo-display cifra text-[24px]">{pesos((unidadesAnio / (periodo === 'mes' ? 12 : 1)) * precioAuto)} por {periodo === 'mes' ? 'mes' : 'año'}</p>
              </div>
            )}
          </>
        )}

        {sub === 'pago' && (
          <>
            <Grupo titulo="Cada cuánto">
              <Opciones etiqueta="Cada cuánto" opciones={FRECUENCIAS.map((f) => ({ valor: f.valor, texto: frecuenciaLabel[f.valor] }))} elegidas={[frecuencia]} onTocar={setFrecuencia} />
            </Grupo>
            <Grupo titulo="El próximo pago">
              <CampoFecha value={primerPago} onChange={(v) => (setPrimerPago(v), setError(null))} ariaLabel="El próximo pago" />
            </Grupo>
            <p className="mt-4 text-[14px] text-texto-suave">Desde ahí armamos un año de pagos en la Agenda. Después los renovás o cancelás desde ahí.</p>
          </>
        )}

        {sub === 'precio' && u && (
          <>
            <label className="flex items-baseline gap-2">
              <span className="titulo-display shrink-0 text-[40px] text-texto-suave">$</span>
              <input inputMode="decimal" aria-label={`Precio de hoy de ${u.precioDe}`} value={precio} placeholder={unidad === 'kg_novillo' ? '3.900' : '30.000'} onChange={(e) => (setPrecio(formatearNumero(e.target.value)), setError(null))} autoFocus className="titulo-display cifra min-w-[2ch] max-w-full bg-transparent text-[56px] [field-sizing:content] leading-tight text-texto outline-none placeholder:text-texto/25" />
            </label>
            <p className="mt-3 text-[14px] text-texto-suave">
              Con esto estimamos cada cuota; al pagar, la ajustás al precio de ese día.
              {unidad === 'kg_novillo' ? ' Queda como tu cotización del gordo.' : ''}
            </p>
          </>
        )}

        {sub === 'resumen' && u && (
          <>
            <p className="text-[16px] text-texto">
              {esMoneda ? `${u.nombre} ${cantidad}` : `${cantidad} ${u.nombre}`}
              {base === 'ha' ? ` por hectárea (${(hectareas ?? 0).toLocaleString('es-AR')} ha)` : ' en total'} por {periodo === 'mes' ? 'mes' : 'año'}; {cuotasAnio} {cuotasAnio === 1 ? 'pago' : 'pagos'} por año.
            </p>
            {montoCuota !== null ? (
              <ul className="mt-5 border-t border-borde">
                {proximos.map((p, i) => (
                  <li key={i} className="flex items-center gap-4 border-b border-borde py-3.5">
                    <span className="w-10 text-center">
                      <b className="t-cifra block text-texto">{p.dia}</b>
                      <span className="text-[12.5px] font-semibold text-texto-suave">{p.mes}</span>
                    </span>
                    <span>
                      <b className="t-cifra text-texto">
                        {i > 0 && unidad !== 'pesos' ? '≈ ' : ''}
                        {pesos(montoCuota)}
                      </b>
                      <span className="block text-[13.5px] text-texto-suave">{unidad === 'pesos' ? 'monto fijo' : i === 0 ? `con ${u.precioDe} a ${pesos(precioNum!)}` : 'se recalcula ese día'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-[14px] text-texto-suave">{unidad === 'dolares' ? 'No pudimos traer el dólar de hoy. Probá de nuevo en un rato.' : 'Falta un dato para calcular.'}</p>
            )}
            <p className="mt-4 text-[14px] text-texto-suave">Van a la Agenda. Plata los cuenta en lo que viene.</p>
          </>
        )}
        <button type="submit" hidden />
      </form>
    </PanelLateral>
  )
}

/** Una opción grande del panel: se toca y avanza. */
function OpcionGrande({ activa, onClick, titulo, detalle, icono, marca }: { activa: boolean; onClick: () => void; titulo: string; detalle?: string; icono: NombreIcono; marca?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-4 rounded-[20px] px-5 py-4 text-left transition-colors', activa ? 'bg-principal text-principal-texto' : 'bg-superficie text-texto hover:bg-superficie-hundida')}>
      {marca ?? (
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', activa ? 'bg-acento text-acento-texto' : 'bg-superficie-hundida text-texto')}>
          <Icono nombre={icono} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-heading text-[18px] font-extrabold">{titulo}</span>
        {detalle ? <span className={cn('block text-[14px]', activa ? 'text-principal-texto/85' : 'text-texto-suave')}>{detalle}</span> : null}
      </span>
    </button>
  )
}
