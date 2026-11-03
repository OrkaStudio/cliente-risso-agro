import { useState } from 'react'
import { Beef } from 'lucide-react'
import { toast } from 'sonner'
import { GORDO_FUENTE } from '@/features/cotizaciones/api'
import { useCargarGordo, useGordoActual, useNovilloCanuelas } from '@/features/cotizaciones/hooks'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Grupo, PanelLateral } from '@/components/tropero/panel-lateral'
import { CampoFecha } from '@/components/ui/campo-fecha'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { PILDORA } from './pildora'

const hoy = hoyLocal

function fmtFecha(f: string) {
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

/**
 * Slot del gordo en el ticker. El precio sale solo de Cañuelas (edge
 * function); la carga manual queda de respaldo: si el productor cargó uno
 * más nuevo que el remate, o Cañuelas no responde, se muestra el suyo.
 */
export function GordoSlot({ empresaId }: { empresaId: string }) {
  const manual = useGordoActual(empresaId)
  const canuelas = useNovilloCanuelas()
  // El más reciente manda; a igual fecha, el manual (lo puso él a propósito).
  const gordo = {
    ...manual,
    data:
      canuelas.data && (!manual.data || canuelas.data.fecha > manual.data.fecha)
        ? { valor: canuelas.data.valor, fecha: canuelas.data.fecha, auto: true }
        : manual.data
          ? { ...manual.data, auto: false }
          : null,
  }
  const cargar = useCargarGordo()
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [error, setError] = useState<string | null>(null)

  function abrir() {
    setValor(gordo.data ? String(gordo.data.valor) : '')
    setFecha(hoy())
    setError(null)
    setOpen(true)
  }

  async function guardar() {
    setError(null)
    const n = Number(valor)
    if (!valor || Number.isNaN(n) || n <= 0)
      return setError('Ingresá un valor válido')
    try {
      await cargar.mutateAsync({ empresaId, valor: n, fecha })
      toast.success('Precio del gordo actualizado')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      {gordo.data ? (
        <button
          type="button"
          onClick={abrir}
          disabled={!empresaId}
          title={`Gordo — $${gordo.data.valor.toLocaleString('es-AR')}/kg · ${fmtFecha(gordo.data.fecha)}${gordo.data.auto ? ' · Cañuelas, promedio novillos' : ' · cargado a mano'} · tocá para actualizar`}
          className={PILDORA}
        >
          <Beef className="size-4 text-principal" />
          <span className="text-[13px] text-texto-suave">Gordo</span>
          <b className="cifra text-[15px] font-bold text-texto">
            ${Math.round(gordo.data.valor).toLocaleString('es-AR')}
            <span className="ml-0.5 text-[12px] font-medium text-texto-suave">/kg</span>
          </b>
        </button>
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={!empresaId}
          title="Cargar el precio del gordo"
          className={cn(PILDORA, 'text-[13px] font-semibold text-principal')}
        >
          <Beef className="size-4 text-principal" />
          Cargar el gordo
        </button>
      )}

      {/* Panel lateral, como el resto de los formularios del rediseño (Lau, 03/11). */}
      <PanelLateral
        abierto={open}
        onCerrar={() => setOpen(false)}
        titulo="Precio del gordo"
        bajada={gordo.data ? `Hoy: $${Math.round(gordo.data.valor).toLocaleString('es-AR')}/kg, ${gordo.data.auto ? 'de Cañuelas' : 'cargado a mano'} el ${fmtFecha(gordo.data.fecha)}.` : undefined}
        pie={
          <BotonPrincipal icono="Guardar" cargando={cargar.isPending} disabled={cargar.isPending || !empresaId} onClick={guardar}>
            Guardar
          </BotonPrincipal>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void guardar()
          }}
        >
          <CampoTexto
            etiqueta="Precio por kg vivo"
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="0"
            unidad="$/kg"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            error={error ?? undefined}
            autoFocus
          />
          <a
            href={GORDO_FUENTE.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-principal px-3.5 py-[7px] text-[14.5px] font-bold text-principal hover:bg-principal-suave"
          >
            <Icono nombre="Siguiente" tamano={16} />
            Buscá el precio en {GORDO_FUENTE.nombre}
          </a>
          <Grupo titulo="Fecha" className="mt-7">
            <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Fecha" max={hoy()} />
          </Grupo>
        </form>
      </PanelLateral>
    </>
  )
}
