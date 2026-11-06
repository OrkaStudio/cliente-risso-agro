import { useState } from 'react'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Grupo, PanelLateral } from '@/components/tropero/panel-lateral'
import { Aviso } from '@/components/tropero/aviso'
import { cn } from '@/lib/utils'
import { useCategorias } from '@/features/analitica/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { LABORES, laborPorTipo, type TipoLabor } from '@/features/potrero/labores'
import { useRegistrarLabor } from '@/features/potrero/hooks'
import { CampoFecha } from '@/components/ui/campo-fecha'
import { hoyLocal } from '@/lib/fecha'

/**
 * Cargar una labor agrícola.
 *
 * La forma es SIEMPRE la misma —qué, cuándo, una nota y cuánto costó— y sólo
 * cambia una fila según el tipo: la siembra pregunta qué se sembró, la cosecha
 * cuántos kilos salieron. Ningún otro tipo agrega nada; lo que no tiene campo
 * propio va en la nota, a propósito, hasta que alguien necesite filtrar por eso.
 *
 * El monto es opcional y es lo que convierte esto en algo más que un bloc de
 * notas: si se carga, el gasto queda imputado a ESTE potrero y a la actividad
 * agrícola, y la Analítica por potrero se llena sola con lo que el productor
 * iba a cargar igual.
 *
 * En el panel lateral, como el resto de los formularios del rediseño (Lau, 03/11).
 */
export function CargarLaborDialog({
  potreroId,
  potreroNombre,
  open,
  onOpenChange,
}: {
  potreroId: string
  potreroNombre: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { data: membresia } = useEmpresa()
  const empresaId = membresia?.empresa_id
  const categorias = useCategorias()
  const registrar = useRegistrarLabor(potreroId)

  const [tipo, setTipo] = useState<TipoLabor>('siembra')
  const [fecha, setFecha] = useState(() => hoyLocal())
  const [cultivo, setCultivo] = useState('')
  const [kg, setKg] = useState('')
  const [nota, setNota] = useState('')
  const [monto, setMonto] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Cada vez que se abre arranca de cero.
  const [abiertoAntes, setAbiertoAntes] = useState(open)
  if (open !== abiertoAntes) {
    setAbiertoAntes(open)
    if (open) {
      setTipo('siembra')
      setFecha(hoyLocal())
      setCultivo('')
      setKg('')
      setNota('')
      setMonto('')
      setError(null)
    }
  }

  const labor = laborPorTipo.get(tipo)!

  async function guardar() {
    setError(null)
    if (!empresaId) return

    const montoNum = monto.trim() ? Number(monto) : null
    if (montoNum != null && (Number.isNaN(montoNum) || montoNum <= 0)) {
      setError('El monto tiene que ser un número mayor a cero.')
      return
    }
    if (labor.pideCultivo && !cultivo.trim()) {
      setError('Decí qué se sembró — es lo que se lee sobre el potrero en el mapa.')
      return
    }

    // La categoría se resuelve por NOMBRE: son globales y compartidas, así que
    // hardcodear un uuid ataría el código a esta base.
    const categoriaId = montoNum ? (categorias.data?.find((c) => c.nombre === labor.categoria)?.id ?? null) : null
    if (montoNum && !categoriaId) {
      setError(`No encontré la categoría "${labor.categoria}" para imputar el gasto. Cargá la labor sin monto y sumá el gasto desde Plata.`)
      return
    }

    try {
      await registrar.mutateAsync({
        empresaId,
        potreroId,
        tipo,
        fecha,
        nota: nota.trim() || null,
        cultivo: labor.pideCultivo ? cultivo.trim() : null,
        kg: labor.pideKg && kg.trim() ? Number(kg) : null,
        monto: montoNum,
        categoriaId,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la labor')
    }
  }

  return (
    <PanelLateral chico
      abierto={open}
      onCerrar={() => onOpenChange(false)}
      titulo="Cargar labor"
      bajada={`Potrero ${potreroNombre}`}
      pie={
        <BotonPrincipal icono="Guardar" cargando={registrar.isPending} disabled={registrar.isPending || !empresaId} onClick={() => void guardar()}>
          {registrar.isPending ? 'Guardando…' : 'Guardar labor'}
        </BotonPrincipal>
      }
    >
      <Grupo titulo="¿Qué se hizo?">
        <div role="radiogroup" aria-label="Qué se hizo" className="grid grid-cols-3 gap-2.5">
          {LABORES.map((l) => {
            const on = tipo === l.tipo
            return (
              <button
                key={l.tipo}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTipo(l.tipo)}
                className={cn(
                  'flex h-[84px] flex-col items-start justify-between rounded-[18px] p-3.5 text-left text-[15px] font-bold transition-colors',
                  on ? 'bg-principal text-principal-texto' : 'bg-superficie text-texto hover:bg-superficie-hundida',
                )}
              >
                <l.Icon className="size-5" />
                {l.label}
              </button>
            )
          })}
        </div>
        <p className="mt-2.5 text-[13.5px] text-texto-suave">{labor.ayuda}</p>
      </Grupo>

      <Grupo titulo="¿Cuándo?">
        <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Cuándo" max={hoyLocal()} />
      </Grupo>

      {/* La única fila que cambia según el tipo. */}
      {labor.pideCultivo && <CampoTexto className="mt-6" etiqueta="¿Qué se sembró?" value={cultivo} onChange={(e) => setCultivo(e.target.value)} placeholder="Raigrás, avena, soja…" autoComplete="off" />}
      {labor.pideKg && <CampoTexto className="mt-6" etiqueta="Kilos cosechados" type="number" inputMode="decimal" min="0" unidad="kg" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="38000" />}

      <CampoTexto className="mt-6" etiqueta="Nota · opcional" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Variedad, producto, dosis, quién lo hizo…" autoComplete="off" />

      <CampoTexto
        className="mt-6"
        etiqueta="¿Cuánto costó? · opcional"
        type="number"
        inputMode="decimal"
        min="0"
        unidad="$"
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
        placeholder="Dejalo vacío si todavía no sabés"
        ayuda={monto.trim() ? `Se carga como gasto en "${labor.categoria}", imputado a este potrero.` : 'Si lo cargás, el gasto queda imputado a este potrero sin volver a tipearlo.'}
      />

      {error && (
        <div className="mt-6">
          <Aviso tipo="problema" titulo="No se pudo guardar">
            {error}
          </Aviso>
        </div>
      )}
    </PanelLateral>
  )
}
