import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Grupo, Opciones, PanelLateral } from '@/components/tropero/panel-lateral'
import { CampoFecha } from '@/components/ui/campo-fecha'
import type { Vencimiento } from '@/features/agenda/api'
import { useLiquidar, useRevertirLiquidacion } from '@/features/agenda/hooks'
import { formatearNumero, numeroDeFormateado } from '@/features/onboarding/numeros'
import { hoyLocal } from '@/lib/fecha'
import type { Database } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { PILDORA, datosDe, estadoTexto, mesCorto, tituloDe } from './agenda'

type Medio = Database['public']['Enums']['medio_pago']
const MEDIOS: { valor: Medio; texto: string }[] = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'cheque', texto: 'Cheque' },
  { valor: 'mercadopago', texto: 'Mercado Pago' },
]
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const ayer = () => new Date(Date.parse(`${hoyLocal()}T12:00:00`) - 86_400_000).toISOString().slice(0, 10)
const fechaLarga = (f: string) => `${Number(f.slice(8, 10))} de ${mesCorto(f)}`

/**
 * «¿Lo pagaste?» (Figma página 35, «Agenda · ¿Lo pagaste?» y «Un eCheq»), en el
 * panel lateral. Sí, por lo previsto, o fue otro monto (las cuotas estimadas del
 * alquiler); cuándo; cómo; y la foto si quiere. Al marcarlo sale de la Agenda y
 * queda en Plata, con «Deshacer» en el aviso. Si ya estaba pagado, se puede volver
 * a pendiente.
 */
export function PagarPanel({ item, empresaId, onCerrar, onVolver }: { item: Vencimiento | null; empresaId: string; onCerrar: () => void; onVolver?: () => void }) {
  // El último abierto queda mientras el panel sale: no se corta en seco.
  const [ultimo, setUltimo] = useState(item)
  if (item && item !== ultimo) setUltimo(item)
  const v = item ?? ultimo
  if (!v) return null
  return <Formulario key={v.id} v={v} abierto={!!item} empresaId={empresaId} onCerrar={onCerrar} onVolver={onVolver} />
}

function Formulario({ v, abierto, empresaId, onCerrar, onVolver }: { v: Vencimiento; abierto: boolean; empresaId: string; onCerrar: () => void; onVolver?: () => void }) {
  const liquidar = useLiquidar()
  const revertir = useRevertirLiquidacion()
  const archivo = useRef<HTMLInputElement>(null)
  const cobro = v.tipo === 'ingreso'
  const estimado = /\best\.\s/.test(v.descripcion ?? '')
  const [otroMonto, setOtroMonto] = useState(estimado)
  const [monto, setMonto] = useState(formatearNumero(String(Math.round(v.monto))))
  const [cuando, setCuando] = useState<'hoy' | 'ayer' | 'otra' | ''>('')
  const [fecha, setFecha] = useState(hoyLocal())
  const [medio, setMedio] = useState<Medio | ''>(v.medio && v.medio !== 'otro' ? v.medio : '')
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hoy = hoyLocal()
  const ya = v.estado === 'liquidado'
  const titulo = tituloDe(v)
  const esCheque = v.medio === 'cheque'
  const montoReal = otroMonto ? (numeroDeFormateado(monto) ?? 0) : v.monto

  async function marcar() {
    setError(null)
    if (!(montoReal > 0)) return setError('Escribí cuánto fue.')
    if (!cuando) return setError(`Tocá cuándo lo ${cobro ? 'cobraste' : 'pagaste'}.`)
    const dia = cuando === 'hoy' ? hoy : cuando === 'ayer' ? ayer() : fecha
    try {
      await liquidar.mutateAsync({ id: v.id, fecha: dia, monto: Math.round(montoReal) !== Math.round(v.monto) ? Math.round(montoReal) : undefined, extra: { medio: medio || undefined, empresaId, comprobanteImg: foto } })
      onCerrar()
      // El «plim»: queda confirmado con su resumen y se puede deshacer.
      toast.success(`Listo: ${cobro ? 'cobraste' : 'pagaste'} ${titulo.toLowerCase()}`, {
        description: `Pasó a Plata${v.categoria ? `, como ${v.categoria}` : ''}${v.campo ? ` de ${v.campo}` : ''}.`,
        action: { label: 'Deshacer', onClick: () => revertir.mutate({ id: v.id, fechaVencimiento: v.fechaVencimiento, fechaCobroPago: dia }) },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }

  async function volverAPendiente() {
    try {
      await revertir.mutateAsync(v)
      onCerrar()
      toast.success(`Listo: ${titulo.toLowerCase()} volvió a la Agenda`, { description: 'Sale de Plata hasta que lo marques de nuevo.' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo. Probá de nuevo.')
    }
  }

  const aviso = error && <p role="alert" className="mb-3 rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">{error}</p>
  const estado = estadoTexto(v, hoy)

  return (
    <PanelLateral chico={ya}
      abierto={abierto}
      onCerrar={onCerrar}
      onVolver={onVolver}
      volverTexto="Volver a la lista"
      titulo={titulo}
      bajada={<span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[13px] font-bold', PILDORA[estado.clase])}>{estado.texto}</span>}
      pie={
        ya ? (
          <>
            {aviso}
            <button type="button" onClick={() => void volverAPendiente()} disabled={revertir.isPending} className="h-14 w-full rounded-full border-[1.5px] border-borde bg-superficie text-[16px] font-bold text-texto hover:border-principal hover:text-principal disabled:opacity-50">
              Lo marqué por error: volver a pendiente
            </button>
          </>
        ) : (
          <>
            {aviso}
            <BotonPrincipal icono="Guardar" cargando={liquidar.isPending} disabled={liquidar.isPending} onClick={() => void marcar()}>
              {cobro ? 'Marcar cobrado' : 'Marcar pagado'}
              {otroMonto && montoReal > 0 ? ` ${pesos(montoReal)}` : ''}
            </BotonPrincipal>
            <p className="mt-2.5 text-center text-[13.5px] text-texto-suave">Queda en Plata{v.categoria ? ` como ${v.categoria}` : ''}{v.campo ? ` de ${v.campo}` : ''}.</p>
          </>
        )
      }
    >
      {/* Lo que es, en la tarjeta de Troppero (la misma de las invitaciones): arriba el monto, abajo sus datos. */}
      <div className="overflow-hidden rounded-[22px] border border-principal/25">
        <div className={cn('px-5 pt-5 pb-5', ya ? 'bg-superficie-hundida/70' : 'bg-gradient-to-br from-terracota-50 to-trigo-100')}>
        <p className="text-[13px] font-bold tracking-[0.04em] text-texto-suave uppercase">{ya ? (cobro ? 'Cobraste' : 'Pagaste') : cobro ? 'Vas a cobrar' : 'Tenés que pagar'}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className={cn('t-numero', ya ? 'text-texto-suave' : cobro ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
            {cobro ? '+' : '−'}
            {pesos(ya ? v.monto : montoReal)}
          </p>
          {!ya && !otroMonto && (
            <button type="button" onClick={() => setOtroMonto(true)} className="mb-1 h-10 shrink-0 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[14px] font-bold text-texto hover:border-principal hover:text-principal">
              Fue otro monto
            </button>
          )}
        </div>
        {!ya && otroMonto && (
          <CampoTexto className="mt-4" etiqueta={estimado ? 'Cuánto fue al precio de ese día' : 'Cuánto fue'} inputMode="numeric" unidad="$" value={monto} onChange={(e) => setMonto(formatearNumero(e.target.value))} autoFocus={!estimado} ayuda={estimado ? `Lo anotado era una estimación: ${pesos(v.monto)}.` : `Lo previsto era ${pesos(v.monto)}.`} />
        )}
        </div>
        {(datosDe(v).length > 0 || v.fechaVencimiento) && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 border-t border-principal/15 bg-superficie/80 px-5 py-4 text-[14.5px]">
            {[...datosDe(v), ...(v.fechaVencimiento ? [[ya || v.fechaVencimiento < hoy ? 'Vencía' : 'Vence', fechaLarga(v.fechaVencimiento)] as [string, string]] : []), ...(esCheque ? [['Tipo', v.esEcheq ? 'eCheq' : 'De papel'] as [string, string]] : [])].map(([k, val]) => (
              <div key={k} className="contents">
                <dt className="text-texto-suave">{k}</dt>
                <dd className="truncate text-right font-semibold text-texto">{val}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {!ya && (
        <>
          <Grupo titulo={cobro ? '¿Cuándo lo cobraste?' : '¿Cuándo lo pagaste?'} className="mt-6">
            <Opciones etiqueta="Cuándo" opciones={[{ valor: 'hoy', texto: 'Hoy' }, { valor: 'ayer', texto: 'Ayer' }, { valor: 'otra', texto: 'Otro día' }]} elegidas={[cuando]} onTocar={setCuando} />
            {cuando === 'otra' && (
              <div className="mt-3">
                <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Qué día" max={hoy} />
              </div>
            )}
          </Grupo>
          {!esCheque && (
            <Grupo titulo={cobro ? '¿Cómo lo cobraste?' : '¿Cómo lo pagaste?'}>
              <Opciones etiqueta="Cómo" opciones={MEDIOS} elegidas={[medio]} onTocar={setMedio} />
            </Grupo>
          )}

          <input ref={archivo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => archivo.current?.click()} className="mt-6 flex w-full items-center gap-3 rounded-[16px] border-[1.5px] border-dashed border-borde px-4 py-3.5 text-left text-[14.5px] font-bold text-principal hover:border-principal">
            <Icono nombre="Foto" tamano={24} />
            {foto ? `Foto lista: ${foto.name}` : 'Sumar la foto del comprobante (opcional)'}
          </button>
        </>
      )}
    </PanelLateral>
  )
}
