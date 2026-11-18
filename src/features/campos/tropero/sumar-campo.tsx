import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Aviso } from '@/components/tropero/aviso'
import { BotonPrincipal } from '@/components/tropero/boton'
import { useAccion } from '@/components/tropero/use-accion'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { Segmentos } from '@/components/tropero/segmentos'
import { useCrearCampo } from '@/features/campos/hooks'
import { LocalidadCampo } from '@/features/onboarding/tropero/localidad-campo'
import { leerHectareas, nombrePropio } from '@/features/onboarding/tropero/modelo'
import type { Localidad } from '@/lib/geocoding'
import { useQuienMira } from '@/features/empresa/use-quien-mira'

/**
 * «+ Sumar un campo» en el panel lateral (Lau, 03/11: todos los formularios con
 * el formato nuevo). Pide lo mismo que el alta del onboarding: cómo se llama,
 * dónde está, si es propio o alquilado y las hectáreas. La actividad sale de sus
 * potreros cuando los dibuje.
 */
export function SumarCampo({ empresaId, clase, onCreado }: { empresaId: string; clase: string; onCreado: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [vez, setVez] = useState(0)
  // Sumar un campo es del dueño, no se delega (permisos, 13/11).
  if (!useQuienMira().dueno) return null
  return (
    <>
      <button
        type="button"
        className={clase}
        onClick={() => {
          setVez((v) => v + 1)
          setAbierto(true)
        }}
      >
        + Sumar un campo
      </button>
      {/* La key cambia al abrir, no al cerrar: arranca vacío y sale con su animación. */}
      <Formulario key={vez} empresaId={empresaId} abierto={abierto} onCerrar={() => setAbierto(false)} onCreado={onCreado} />
    </>
  )
}

function Formulario({ empresaId, abierto, onCerrar, onCreado }: { empresaId: string; abierto: boolean; onCerrar: () => void; onCreado: (id: string) => void }) {
  const [nombre, setNombre] = useState('')
  const [localidad, setLocalidad] = useState<Localidad | null>(null)
  const [tipo, setTipo] = useState<'propio' | 'alquilado'>('propio')
  const [hectareas, setHectareas] = useState('')
  const [intento, setIntento] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const crear = useCrearCampo()

  const n = leerHectareas(hectareas)
  const errores = {
    nombre: !nombre.trim() ? 'Falta cómo se llama el campo.' : undefined,
    localidad: !localidad ? 'Elegí el pueblo de la lista.' : undefined,
    hectareas: n === null ? 'Faltan las hectáreas: están en la boleta de ARBA del campo.' : !(n > 0) ? 'Tiene que ser un número mayor que cero.' : undefined,
  }
  const valido = !errores.nombre && !errores.localidad && !errores.hectareas

  async function guardar() {
    setIntento(true)
    setError(null)
    if (!valido || !localidad || n === null) return 'falta'
    {
      const nuevo = await crear.mutateAsync({
        empresaId,
        nombre: nombre.trim(),
        tipo,
        hectareas: n,
        actividad: null,
        ubicacion: { localidad: localidad.nombre, provincia: localidad.provincia, lat: localidad.lat, lon: localidad.lon },
      })
      creado.current = nuevo.id
      const n2 = nombre.trim()
      return () => toast.success(`Listo: sumamos ${n2}`, { description: 'Ahora dibujá su borde y sus potreros.' })
    }
  }
  // Guarda y pasa a dibujarlo: lo que confirma es la pantalla nueva (sin «Listo»).
  // Si no sale, el motivo lo dice el botón.
  const creado = useRef('')
  const sumar = useAccion(guardar, {
    sinListo: true,
    alTerminar: () => {
      onCerrar()
      onCreado(creado.current)
    },
  })

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Sumar un campo"
      bajada="Con la ubicación te mostramos el clima de tu campo todos los días."
      pie={
        <BotonPrincipal icono="Siguiente" accion={sumar} disabled={sumar.estado === 'reposo' && !empresaId}>
          {crear.isPending ? 'Guardando…' : 'Guardar el campo'}
        </BotonPrincipal>
      }
    >
      <form
        className="flex flex-col gap-[18px]"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void sumar.correr()
        }}
      >
        <CampoTexto
          etiqueta="Cómo se llama"
          value={nombre}
          placeholder="La Porteña"
          maxLength={60}
          autoFocus
          onChange={(e) => setNombre(nombrePropio(e.target.value))}
          error={intento ? errores.nombre : undefined}
        />
        <LocalidadCampo valor={localidad} onCambio={setLocalidad} error={intento ? errores.localidad : undefined} />
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold text-texto">¿Es tuyo o lo alquilás?</span>
          <Segmentos
            etiqueta="El campo es"
            valor={tipo}
            onCambio={setTipo}
            opciones={[
              { valor: 'propio', texto: 'Es mío' },
              { valor: 'alquilado', texto: 'Lo alquilo' },
            ]}
          />
          {tipo === 'alquilado' && <p className="text-[12.5px] text-texto-suave">El contrato lo cargás después, en Plata.</p>}
        </div>
        <CampoTexto
          etiqueta="Cuántas hectáreas"
          inputMode="decimal"
          unidad="ha"
          value={hectareas}
          placeholder="353"
          onChange={(e) => setHectareas(e.target.value.replace(/[^\d.,]/g, ''))}
          error={intento ? errores.hectareas : undefined}
        />
        {error && (
          <Aviso tipo="problema" titulo="No se pudo guardar">
            {error}
          </Aviso>
        )}
        <button type="submit" hidden />
      </form>
    </PanelLateral>
  )
}
