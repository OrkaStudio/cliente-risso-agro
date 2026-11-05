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
import { cuandoVence, mesCorto, pactadoDe, tituloDe } from './agenda'

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
export function PagarPanel({ item, empresaId, onCerrar }: { item: Vencimiento | null; empresaId: string; onCerrar: () => void }) {
  // El último abierto queda mientras el panel sale: no se corta en seco.
  const [ultimo, setUltimo] = useState(item)
  if (item && item !== ultimo) setUltimo(item)
  const v = item ?? ultimo
  if (!v) return null
  return <Formulario key={v.id} v={v} abierto={!!item} empresaId={empresaId} onCerrar={onCerrar} />
}

function Formulario({ v, abierto, empresaId, onCerrar }: { v: Vencimiento; abierto: boolean; empresaId: string; onCerrar: () => void }) {
  const liquidar = useLiquidar()
  const revertir = useRevertirLiquidacion()
  const archivo = useRef<HTMLInputElement>(null)
  const cobro = v.tipo === 'ingreso'
  const estimado = /\best\.\s/.test(v.descripcion ?? '')
  const [otroMonto, setOtroMonto] = useState(estimado)
  const [monto, setMonto] = useState(formatearNumero(String(Math.round(v.monto))))
  const [cuando, setCuando] = useState<'hoy' | 'ayer' | 'otra'>('hoy')
  const [fecha, setFecha] = useState(hoyLocal())
  const [medio, setMedio] = useState<Medio | ''>(v.medio && v.medio !== 'otro' ? v.medio : '')
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hoy = hoyLocal()
  const ya = v.estado === 'liquidado'
  const titulo = tituloDe(v)
  const venc = v.fechaVencimiento ? cuandoVence(v.fechaVencimiento, hoy) : null
  const esCheque = v.medio === 'cheque'
  const montoReal = otroMonto ? (numeroDeFormateado(monto) ?? 0) : v.monto
  const verbo = cobro ? 'cobraste' : 'pagaste'
  const detalle = [v.categoria, v.campo, pactadoDe(v), v.fechaVencimiento && !ya ? `${venc && venc.tono === 'mal' ? 'vencía' : 'vence'} el ${fechaLarga(v.fechaVencimiento)}` : null].filter(Boolean).join(', ')

  async function marcar() {
    setError(null)
    if (!(montoReal > 0)) return setError('Escribí cuánto fue.')
    const dia = cuando === 'hoy' ? hoy : cuando === 'ayer' ? ayer() : fecha
    try {
      await liquidar.mutateAsync({ id: v.id, fecha: dia, monto: Math.round(montoReal) !== Math.round(v.monto) ? Math.round(montoReal) : undefined, extra: { medio: medio || undefined, empresaId, comprobanteImg: foto } })
      onCerrar()
      // El «plim»: queda confirmado con su resumen y se puede deshacer.
      toast.success(`Listo: ${titulo.toLowerCase()} pasó a Plata${v.categoria ? `, como ${v.categoria}` : ''}${v.campo ? ` de ${v.campo}` : ''}.`, {
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
      toast.success(`Listo: ${titulo.toLowerCase()} volvió a la Agenda.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo. Probá de nuevo.')
    }
  }

  const aviso = error && <p role="alert" className="mb-3 rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">{error}</p>

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      bajada={
        <span className="flex flex-col gap-2">
          {ya ? (
            <span className="w-fit rounded-full bg-estado-bien-suave px-2.5 py-0.5 text-[13px] font-bold text-estado-bien-texto">{cobro ? 'Cobrado' : 'Pagado'} el {fechaLarga(v.fechaCobroPago!)}</span>
          ) : (
            venc && <span className={cn('w-fit rounded-full px-2.5 py-0.5 text-[13px] font-bold', venc.tono === 'mal' ? 'bg-estado-problema-suave text-estado-problema-texto' : venc.tono === 'atencion' ? 'bg-estado-atencion-suave text-estado-atencion-texto' : 'bg-estado-bien-suave text-estado-bien-texto')}>{venc.texto}</span>
          )}
          {detalle && <span>{detalle.charAt(0).toUpperCase() + detalle.slice(1)}.</span>}
        </span>
      }
      pie={
        ya ? (
          <>
            {aviso}
            <button type="button" onClick={() => void volverAPendiente()} disabled={revertir.isPending} className="h-14 w-full rounded-full border-[1.5px] border-principal text-[16px] font-bold text-principal hover:bg-principal-suave disabled:opacity-50">
              No lo {verbo}: volver a la Agenda
            </button>
          </>
        ) : (
          <>
            {aviso}
            <p className="mb-3 text-[13.5px] text-texto-suave">Sale de la Agenda y queda en Plata{v.categoria ? ` como ${v.categoria}` : ''}{v.campo ? ` de ${v.campo}` : ''}.</p>
            <BotonPrincipal icono="Guardar" cargando={liquidar.isPending} disabled={liquidar.isPending} onClick={() => void marcar()}>
              {cobro ? 'Marcar cobrado' : 'Marcar pagado'}
            </BotonPrincipal>
          </>
        )
      }
    >
      <p className={cn('titulo-display cifra text-[44px] leading-none tracking-[-0.03em]', cobro ? 'text-estado-bien-texto' : 'text-texto')}>
        {cobro ? '+' : '−'}
        {pesos(ya ? v.monto : montoReal)}
      </p>

      {esCheque && (
        <div className="mt-5 rounded-[18px] border border-borde bg-superficie p-5">
          <p className="flex items-baseline justify-between gap-3">
            <b className="text-[17px] text-texto">{v.chequeBanco || (v.esEcheq ? 'eCheq' : 'Cheque')}</b>
            {v.chequeNumero && <span className="cifra text-[18px] font-bold text-texto-suave">{v.chequeNumero}</span>}
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[14px]">
            {v.contraparte && (
              <>
                <dt className="text-texto-suave">{cobro ? 'Lo emitió' : 'A la orden de'}</dt>
                <dd className="text-right font-semibold text-texto">{v.contraparte}</dd>
              </>
            )}
            {v.fechaVencimiento && (
              <>
                <dt className="text-texto-suave">{cobro ? 'Se cobra desde' : 'Te lo debitan'}</dt>
                <dd className="text-right font-semibold text-texto">{fechaLarga(v.fechaVencimiento)}</dd>
              </>
            )}
            <dt className="text-texto-suave">Tipo</dt>
            <dd className="text-right font-semibold text-texto">{v.esEcheq ? 'eCheq' : 'De papel'}</dd>
          </dl>
        </div>
      )}

      {!ya && (
        <>
          <p className="mt-6 mb-2.5 text-[14px] font-semibold text-texto-suave">¿Lo {verbo}?</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" aria-pressed={!otroMonto} onClick={() => setOtroMonto(false)} className={cn('h-12 rounded-full text-[15.5px] font-bold transition-colors', !otroMonto ? 'bg-principal text-principal-texto' : 'border-[1.5px] border-borde bg-superficie text-texto hover:border-neutro-300')}>
              Sí, {pesos(v.monto)}
            </button>
            <button type="button" aria-pressed={otroMonto} onClick={() => setOtroMonto(true)} className={cn('h-12 rounded-full text-[15.5px] font-bold transition-colors', otroMonto ? 'bg-principal text-principal-texto' : 'border-[1.5px] border-borde bg-superficie text-texto hover:border-neutro-300')}>
              Fue otro monto
            </button>
          </div>
          {otroMonto && (
            <CampoTexto className="mt-3" etiqueta={estimado ? 'Cuánto fue al precio de ese día' : 'Cuánto fue'} inputMode="numeric" unidad="$" value={monto} onChange={(e) => setMonto(formatearNumero(e.target.value))} autoFocus ayuda={estimado ? 'Lo de arriba era una estimación con el precio de cuando lo anotaste.' : undefined} />
          )}

          <Grupo titulo="Cuándo" className="mt-6">
            <Opciones etiqueta="Cuándo" opciones={[{ valor: 'hoy', texto: 'Hoy' }, { valor: 'ayer', texto: 'Ayer' }, { valor: 'otra', texto: 'Otra fecha' }]} elegidas={[cuando]} onTocar={setCuando} />
            {cuando === 'otra' && (
              <div className="mt-3">
                <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Qué día" max={hoy} />
              </div>
            )}
          </Grupo>
          {!esCheque && (
            <Grupo titulo={cobro ? 'Cómo lo cobraste' : 'Cómo lo pagaste'}>
              <Opciones etiqueta="Cómo" opciones={MEDIOS} elegidas={[medio]} onTocar={setMedio} />
            </Grupo>
          )}

          <input ref={archivo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => archivo.current?.click()} className="mt-6 flex w-full items-center gap-3 rounded-[16px] border-[1.5px] border-dashed border-borde px-4 py-3.5 text-left text-[14.5px] font-bold text-principal hover:border-principal">
            <Icono nombre="Foto" tamano={24} />
            {foto ? `Foto lista: ${foto.name}` : 'Sumar la foto del comprobante, si querés'}
          </button>
        </>
      )}
    </PanelLateral>
  )
}
