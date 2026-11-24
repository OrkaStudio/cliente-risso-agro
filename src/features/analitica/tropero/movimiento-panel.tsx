import { useState } from 'react'
import { toast } from 'sonner'
import { Boton, BotonPrincipal } from '@/components/tropero/boton'
import { useAccion } from '@/components/tropero/use-accion'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { CampoFecha } from '@/components/ui/campo-fecha'
import type { MovimientoConDetalle } from '@/features/analitica/api'
import { formatARS } from '@/features/analitica/compute'
import { useAnularMovimiento, useCategorias, useCorregirMovimiento } from '@/features/analitica/hooks'
import { Segmentos } from '@/components/tropero/segmentos'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { OpcionesCampo } from '@/features/campos/opciones-campo'
import { useNombres } from '@/features/empresa/use-nombres'
import { usePermiso } from '@/features/empresa/use-permiso'
import { formatearNumero, numeroDeFormateado } from '@/features/onboarding/numeros'
import { comprobanteTexto, medioTexto } from './plata'
import { useDarPorBueno } from './dar-por-bueno'
import { Autor } from './revisar-movimientos'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/** El link de la foto del comprobante (guardada en privado): dura una hora. */
function useFotoComprobante(path: string | null): string | null {
  const q = useQuery({
    queryKey: ['comprobante', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
  return q.data ?? null
}

/**
 * Un movimiento abierto (permisos, entrega 4): qué es, quién lo cargó y por
 * dónde, y —para quien carga la plata— corregirlo o anularlo. Anular no borra:
 * deja de contar y queda el rastro.
 */
/** `editar`: abre directo en «Corregir» (desde Revisar, donde ya se tocó «Corregir»). */
export function MovimientoPanel({ m, onCerrar, editar = false }: { m: MovimientoConDetalle | null; onCerrar: () => void; editar?: boolean }) {
  // El último abierto queda mientras el panel sale: no se corta en seco.
  const [ultimo, setUltimo] = useState(m)
  if (m && m !== ultimo) setUltimo(m)
  const v = m ?? ultimo
  if (!v) return null
  return <Detalle key={`${v.id}${editar}`} m={v} abierto={!!m} onCerrar={onCerrar} editar={editar} />
}

function Detalle({ m, abierto, onCerrar, editar }: { m: MovimientoConDetalle; abierto: boolean; onCerrar: () => void; editar: boolean }) {
  const { carga } = usePermiso('plata')
  const { quienCargo } = useNombres()
  const corregir = useCorregirMovimiento()
  const anular = useAnularMovimiento()
  const [editando, setEditando] = useState(editar)
  const [seguro, setSeguro] = useState(false)
  const [monto, setMonto] = useState(formatearNumero(String(Math.round(Number(m.monto)))))
  const [detalle, setDetalle] = useState(m.descripcion ?? '')
  const pagado = !!m.fecha_cobro_pago
  const [fecha, setFecha] = useState(m.fecha_cobro_pago ?? m.fecha_devengo)
  // Lo que más se carga mal desde el WhatsApp: si salió o entró, en qué y de qué campo (Lau, 24/11).
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>(m.tipo)
  const [categoriaId, setCategoriaId] = useState(m.categoria_id ?? '')
  const [campoId, setCampoId] = useState(m.campo_id ?? '')
  const categorias = useCategorias()
  const { campos } = useCampoElegido()
  const opcionesCategoria = (categorias.data ?? []).filter((c) => c.aplica_a === null || c.aplica_a === tipo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const ingreso = m.tipo === 'ingreso'
  const titulo = m.descripcion || m.categoria?.nombre || (ingreso ? 'Ingreso' : 'Gasto')
  const quien = quienCargo(m.created_by, m.canal)
  const nuevo = carga && !m.revisado_at
  const darPorBueno = useDarPorBueno()
  const fechaLarga = new Date(`${m.fecha_cobro_pago ?? m.fecha_devengo}T12:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  // Los datos, cada uno con su ícono: primero lo que arma los números (en qué, de qué campo).
  const datos: { icono: NombreIcono; k: string; v: string }[] = [
    { icono: 'Plata', k: ingreso ? 'De qué' : 'En qué', v: m.categoria?.nombre ?? 'Sin categoría' },
    { icono: 'Campos', k: 'Campo', v: [m.campo?.nombre ?? 'Sin campo', m.potrero ? `potrero ${m.potrero.nombre}` : null].filter(Boolean).join(' · ') },
    ...(m.contraparte ? [{ icono: 'Usuario' as NombreIcono, k: ingreso ? 'Te pagó' : 'A quién', v: m.contraparte }] : []),
    ...(medioTexto(m) ? [{ icono: 'Comprobante' as NombreIcono, k: 'Cómo', v: medioTexto(m)! }] : []),
    ...(comprobanteTexto(m) ? [{ icono: 'Comprobante' as NombreIcono, k: 'Comprobante', v: comprobanteTexto(m)! }] : []),
  ]
  // La foto del comprobante, si la sacaron: está guardada en privado, se pide un link por un rato.
  const foto = useFotoComprobante(m.comprobante_url)

  async function guardar() {
    const n = numeroDeFormateado(monto)
    if (!n || n <= 0) {
      toast.error('El monto tiene que ser mayor a cero.')
      return 'falta'
    }
    if (!categoriaId || !opcionesCategoria.some((c) => c.id === categoriaId)) {
      toast.error(`Elegí ${tipo === 'gasto' ? 'en qué se fue' : 'de qué entró'}.`)
      return 'falta'
    }
    if (!campoId) {
      toast.error('Elegí de qué campo es.')
      return 'falta'
    }
    await corregir.mutateAsync({ id: m.id, tipo, categoriaId, campoId, monto: n, descripcion: detalle.trim(), fecha, pagado })
    return () => toast.success('Listo: el movimiento quedó corregido', { description: 'Los totales de Plata ya lo toman así.' })
  }
  async function anularlo() {
    await anular.mutateAsync(m.id)
    return () => toast.success('Listo: lo anulaste', { description: 'Ya no cuenta en Plata ni en la Agenda.' })
  }
  // Corregir dice «Listo». Anular no se puede deshacer: ya preguntó antes, y lo que confirma
  // es que el movimiento ya no está (sin «Listo»). Si algo no sale, el motivo lo dice el botón.
  const corregirAccion = useAccion(guardar, { alTerminar: onCerrar })
  const anularAccion = useAccion(anularlo, { sinListo: true, alTerminar: onCerrar })

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      chico
      titulo={editando ? 'Corregir el movimiento' : titulo}
      bajada={editando ? 'Cambiá lo que esté mal. Plata y la Agenda se actualizan solas.' : fechaLarga.replace(/^\w/, (c) => c.toUpperCase())}
      pie={
        !carga ? undefined : editando ? (
          <BotonPrincipal icono="Siguiente" accion={corregirAccion}>
            Guardar
          </BotonPrincipal>
        ) : seguro ? (
          <div className="flex flex-col gap-2 rounded-[16px] bg-estado-problema-suave p-4">
            <p className="text-[14.5px] font-semibold text-estado-problema-texto">¿Lo anulás? Deja de contar en Plata y en la Agenda; queda el rastro.</p>
            <div className="flex gap-2">
              <Boton accion={anularAccion} className="h-11 flex-1 rounded-full bg-estado-problema text-[15px] font-bold text-superficie hover:bg-estado-problema">
                Sí, anularlo
              </Boton>
              <button type="button" onClick={() => setSeguro(false)} className="h-11 flex-1 rounded-full border-[1.5px] border-borde bg-superficie text-[15px] font-bold text-texto">
                No
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2.5">
              {nuevo && (
                <button
                  type="button"
                  onClick={() => void darPorBueno([m.id], 'lo diste por bueno').then(onCerrar)}
                  className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-pasto-100 text-[15.5px] font-bold text-pasto-800 hover:bg-pasto-200"
                >
                  <Icono nombre="Guardar" tamano={16} />
                  Está bien
                </button>
              )}
              <button type="button" onClick={() => setEditando(true)} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-principal text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600">
                <Icono nombre="Editar" tamano={16} />
                Corregir
              </button>
            </div>
            <button type="button" onClick={() => setSeguro(true)} className="h-9 self-center rounded-full px-3 text-[14px] font-semibold text-estado-problema-texto hover:bg-estado-problema-suave">
              Anular este movimiento
            </button>
          </div>
        )
      }
    >
      {editando ? (
        <div className="flex flex-col gap-4">
          <Segmentos etiqueta="Salió o entró" valor={tipo === 'gasto' ? 'salio' : 'entro'} onCambio={(v) => (setTipo(v === 'salio' ? 'gasto' : 'ingreso'), setCategoriaId(''))} opciones={[{ valor: 'salio', texto: 'Salió' }, { valor: 'entro', texto: 'Entró' }]} />
          <CampoTexto etiqueta="Monto" inputMode="numeric" unidad="$" value={monto} onChange={(e) => setMonto(formatearNumero(e.target.value))} />
          <label className="flex flex-col gap-2">
            <span className="text-[14.5px] font-semibold text-texto">{tipo === 'gasto' ? 'En qué' : 'De qué'}</span>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="h-12 rounded-[14px] border-[1.5px] border-borde bg-superficie px-3 text-[15px] text-texto outline-none focus:border-principal">
              <option value="">Elegí una</option>
              {opcionesCategoria.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          {campos.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-[14.5px] font-semibold text-texto">De qué campo</span>
              <OpcionesCampo campos={campos} elegido={campoId} onElegir={setCampoId} />
            </div>
          )}
          <CampoTexto etiqueta="Detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder={m.categoria?.nombre ?? ''} />
          <div className="flex flex-col gap-2">
            <span className="text-[14.5px] font-semibold text-texto">Fecha</span>
            <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Fecha" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Lo primero: cuánto, y si salió o entró. */}
          <div className="flex items-center gap-3">
            <span className={cn('grid size-11 shrink-0 place-items-center rounded-full text-[20px] font-bold', ingreso ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-superficie-hundida text-texto')}>{ingreso ? '+' : '−'}</span>
            <div>
              <p className="text-[13px] font-semibold text-texto-suave">{ingreso ? 'Entró' : 'Salió'}{m.estado === 'anulado' ? ' · anulado' : ''}</p>
              <p className={cn('t-numero', ingreso ? 'text-estado-bien-texto' : 'text-texto')}>{formatARS(Number(m.monto)).replace('-', '').replace(/\s/g, '')}</p>
            </div>
          </div>
          {nuevo && (
            <p className="flex items-start gap-2 rounded-[14px] bg-principal-suave/50 px-3.5 py-2.5 text-[13.5px] leading-snug text-texto">
              <span className="mt-0.5 shrink-0 rounded-full bg-principal px-1.5 py-px text-[11px] font-bold text-principal-texto">Nuevo</span>
              <span>Lo cargó tu equipo y todavía no lo revisaste. Si está bien, dalo por bueno; si no, corregilo.</span>
            </p>
          )}
          {/* Los datos, cada uno con su ícono. */}
          <dl className="divide-y divide-borde/60 overflow-hidden rounded-[16px] bg-superficie shadow-[inset_0_0_0_1px_var(--borde)]">
            {datos.map((d) => (
              <div key={d.k} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-superficie-hundida text-texto-suave">
                  <Icono nombre={d.icono} tamano={16} />
                </span>
                <dt className="w-24 shrink-0 text-[13.5px] text-texto-suave">{d.k}</dt>
                <dd className="min-w-0 flex-1 text-right text-[14.5px] font-semibold text-texto">{d.v}</dd>
              </div>
            ))}
          </dl>
          {quien && (
            <div className="flex items-center gap-2.5 px-1 text-[13.5px] text-texto-suave">
              <Autor nombre={quien.replace(/^Cargó /, '').replace(/ · por WhatsApp$/, '')} whatsapp={m.canal === 'whatsapp'} />
              <span>{m.canal === 'whatsapp' ? '· lo mandó por WhatsApp' : '· lo cargó en la app'}</span>
            </div>
          )}
          {foto && (
            <a href={foto} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-[16px] shadow-[inset_0_0_0_1px_var(--borde)]">
              <img src={foto} alt="El comprobante" className="max-h-56 w-full object-cover transition-transform group-hover:scale-[1.02]" />
              <span className="block bg-superficie px-3.5 py-2 text-[13px] font-semibold text-texto">Ver el comprobante</span>
            </a>
          )}
        </div>
      )}
    </PanelLateral>
  )
}
