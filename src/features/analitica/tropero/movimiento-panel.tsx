import { useState } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { CampoFecha } from '@/components/ui/campo-fecha'
import type { MovimientoConDetalle } from '@/features/analitica/api'
import { formatARS } from '@/features/analitica/compute'
import { useAnularMovimiento, useCorregirMovimiento } from '@/features/analitica/hooks'
import { useNombres } from '@/features/empresa/use-nombres'
import { usePermiso } from '@/features/empresa/use-permiso'
import { formatearNumero, numeroDeFormateado } from '@/features/onboarding/numeros'
import { comprobanteTexto, medioTexto } from './plata'

/**
 * Un movimiento abierto (permisos, entrega 4): qué es, quién lo cargó y por
 * dónde, y —para quien carga la plata— corregirlo o anularlo. Anular no borra:
 * deja de contar y queda el rastro.
 */
export function MovimientoPanel({ m, onCerrar }: { m: MovimientoConDetalle | null; onCerrar: () => void }) {
  // El último abierto queda mientras el panel sale: no se corta en seco.
  const [ultimo, setUltimo] = useState(m)
  if (m && m !== ultimo) setUltimo(m)
  const v = m ?? ultimo
  if (!v) return null
  return <Detalle key={v.id} m={v} abierto={!!m} onCerrar={onCerrar} />
}

function Detalle({ m, abierto, onCerrar }: { m: MovimientoConDetalle; abierto: boolean; onCerrar: () => void }) {
  const { carga } = usePermiso('plata')
  const { quienCargo } = useNombres()
  const corregir = useCorregirMovimiento()
  const anular = useAnularMovimiento()
  const [editando, setEditando] = useState(false)
  const [seguro, setSeguro] = useState(false)
  const [monto, setMonto] = useState(formatearNumero(String(Math.round(Number(m.monto)))))
  const [detalle, setDetalle] = useState(m.descripcion ?? '')
  const [fecha, setFecha] = useState(m.fecha_devengo)
  const ingreso = m.tipo === 'ingreso'
  const titulo = m.descripcion || m.categoria?.nombre || (ingreso ? 'Ingreso' : 'Gasto')
  const quien = quienCargo(m.created_by, m.canal)
  const datos: [string, string][] = [
    ['Categoría', m.categoria?.nombre ?? '—'],
    ['Campo', m.campo?.nombre ?? '—'],
    ...(m.potrero ? [['Potrero', m.potrero.nombre] as [string, string]] : []),
    ...(m.contraparte ? [['Con', m.contraparte] as [string, string]] : []),
    ['Fecha', new Date(`${m.fecha_devengo}T12:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })],
    ...(medioTexto(m) ? [['Cómo', medioTexto(m)!] as [string, string]] : []),
    ...(comprobanteTexto(m) ? [['Comprobante', comprobanteTexto(m)!] as [string, string]] : []),
    ...(quien ? [['Lo cargó', quien.replace(/^Cargó /, '')] as [string, string]] : []),
  ]

  async function guardar() {
    const n = numeroDeFormateado(monto)
    if (!n || n <= 0) return toast.error('El monto tiene que ser mayor a cero.')
    try {
      await corregir.mutateAsync({ id: m.id, monto: n, descripcion: detalle.trim(), fecha })
      toast.success('Listo: el movimiento quedó corregido', { description: 'Los totales de Plata ya lo toman así.' })
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  async function anularlo() {
    try {
      await anular.mutateAsync(m.id)
      toast.success('Listo: lo anulaste', { description: 'Ya no cuenta en Plata ni en la Agenda.' })
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anular.')
    }
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      chico
      titulo={editando ? 'Corregir el movimiento' : titulo}
      bajada={editando ? 'Lo que se tipeó mal. Los totales se actualizan solos.' : `${ingreso ? 'Entró' : 'Salió'} ${formatARS(Number(m.monto)).replace('-', '')}`}
      pie={
        !carga ? undefined : editando ? (
          <BotonPrincipal icono="Guardar" cargando={corregir.isPending} disabled={corregir.isPending} onClick={() => void guardar()}>
            Guardar
          </BotonPrincipal>
        ) : seguro ? (
          <div className="flex flex-col gap-2 rounded-[16px] bg-estado-problema-suave p-4">
            <p className="text-[14.5px] font-semibold text-estado-problema-texto">¿Lo anulás? Deja de contar en Plata y en la Agenda; queda el rastro.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void anularlo()} disabled={anular.isPending} className="h-11 flex-1 rounded-full bg-estado-problema text-[15px] font-bold text-superficie disabled:opacity-50">
                Sí, anularlo
              </button>
              <button type="button" onClick={() => setSeguro(false)} className="h-11 flex-1 rounded-full border-[1.5px] border-borde bg-superficie text-[15px] font-bold text-texto">
                No
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setEditando(true)} className="h-12 flex-1 rounded-full bg-principal text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600">
              Corregir
            </button>
            <button type="button" onClick={() => setSeguro(true)} className="h-12 flex-1 rounded-full border-[1.5px] border-borde bg-superficie text-[15.5px] font-bold text-estado-problema-texto hover:border-estado-problema">
              Anular
            </button>
          </div>
        )
      }
    >
      {editando ? (
        <div className="flex flex-col gap-4">
          <CampoTexto etiqueta="Monto" inputMode="numeric" unidad="$" value={monto} onChange={(e) => setMonto(formatearNumero(e.target.value))} autoFocus />
          <CampoTexto etiqueta="Detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder={m.categoria?.nombre ?? ''} />
          <div className="flex flex-col gap-2">
            <span className="text-[14.5px] font-semibold text-texto">Fecha</span>
            <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Fecha" />
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-[15px]">
          {datos.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-texto-suave">{k}</dt>
              <dd className="text-right font-semibold text-texto">{val}</dd>
            </div>
          ))}
        </dl>
      )}
    </PanelLateral>
  )
}
