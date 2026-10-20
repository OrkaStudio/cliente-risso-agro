import { useState } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { Grupo, Opciones, PanelLateral } from '@/components/tropero/panel-lateral'
import { Segmentos } from '@/components/tropero/segmentos'
import { CampoFecha } from '@/components/ui/campo-fecha'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useMapa } from '@/features/mapa/api'
import { ElegirCampo, Potreros } from './entradas-salidas-panel'
import type { Correccion } from '@/features/hacienda/api'
import { useCorregirAnimal, useCrearAnimal, useDarBaja, useMoverAnimales, usePotreros, useRegistrarEvento } from '@/features/hacienda/hooks'
import { categoriaLabel, categoriasPorEspecie, especiePorCategoria, type Especie } from '@/features/hacienda/labels'
import type { Database } from '@/lib/supabase/types'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'

// Los paneles de Hacienda (página 35): se abren por la derecha sobre el rodeo
// o la ficha, piden lo justo con botones grandes y dicen qué cambió.

type Categoria = Database['public']['Enums']['categoria_animal']
export type AnimalPanel = { id: string; empresaId: string; visual: string | null; rfid: string | null; potreroId: string | null }

const nombreDe = (a: AnimalPanel) => a.visual ?? a.rfid?.slice(-4) ?? 'animal'
const errorTexto = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')

/** Los potreros para elegir, agrupados por campo si hay más de uno. */
function ElegirPotrero({ valor, onElegir, excepto, campoId }: { valor: string | null; onElegir: (id: string) => void; excepto?: string | null; campoId?: string | null }) {
  const potreros = usePotreros()
  const { campos } = useCampoElegido()
  const grupos = campos
    .filter((c) => !campoId || c.id === campoId)
    .map((c) => ({ campo: c, potreros: (potreros.data ?? []).filter((p) => p.campo_id === c.id && p.id !== excepto) }))
    .filter((g) => g.potreros.length > 0)
  if (potreros.isLoading) return <div className="h-10 animate-pulse rounded-full bg-superficie-hundida" />
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((g) => (
        <div key={g.campo.id}>
          {grupos.length > 1 && (
            <p className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-texto">
              <span className="grid size-[18px] place-items-center rounded-[5px] text-[10px] font-extrabold text-white" style={{ background: g.campo.color }}>
                {g.campo.letra}
              </span>
              {g.campo.nombre}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {g.potreros.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={valor === p.id}
                onClick={() => onElegir(p.id)}
                className={cn(
                  'cifra inline-flex h-10 min-w-[56px] items-center justify-center rounded-[12px] border-[1.5px] px-3 text-[17px] font-bold transition-colors',
                  valor === p.id ? 'border-principal bg-principal text-principal-texto' : 'border-borde bg-superficie text-texto hover:border-neutro-300',
                )}
              >
                {p.nombre}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ErrorDelPanel({ texto }: { texto: string | null }) {
  if (!texto) return null
  return <p className="mt-5 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">{texto}</p>
}

// ===== Anotarle algo =====

type Que = 'sanidad' | 'pesaje' | 'destete' | 'movimiento' | 'tacto' | 'murio' | 'nota'
const QUE: { valor: Que; texto: string; icono: NombreIcono; boton: string }[] = [
  { valor: 'sanidad', texto: 'Sanidad', icono: 'Vacuna', boton: 'Anotar la sanidad' },
  { valor: 'pesaje', texto: 'Pesada', icono: 'Manga', boton: 'Anotar la pesada' },
  { valor: 'destete', texto: 'Destete', icono: 'Ternero', boton: 'Anotar el destete' },
  { valor: 'movimiento', texto: 'Se movió', icono: 'Campos', boton: 'Moverlo' },
  { valor: 'tacto', texto: 'Tacto', icono: 'Tacto', boton: 'Anotar el tacto' },
  { valor: 'murio', texto: 'Murió', icono: 'Borrar', boton: 'Anotar que murió' },
  { valor: 'nota', texto: 'Otra cosa', icono: 'Editar', boton: 'Anotarlo' },
]
const VACUNAS = ['Aftosa', 'Carbunclo', 'Mancha', 'Clostridiales', 'Antiparasitario', 'Brucelosis'] as const

export function AnotarleAlgo({ animal, abierto, onCerrar }: { animal: AnimalPanel; abierto: boolean; onCerrar: () => void }) {
  const [que, setQue] = useState<Que>('sanidad')
  const [fecha, setFecha] = useState(hoyLocal())
  const [vacunas, setVacunas] = useState<string[]>([])
  const [otro, setOtro] = useState('')
  const [lote, setLote] = useState('')
  const [quien, setQuien] = useState('')
  const [conRetiro, setConRetiro] = useState<'no' | 'si'>('no')
  const [retiro, setRetiro] = useState('')
  const [kg, setKg] = useState('')
  const [tacto, setTacto] = useState<'prenada' | 'vacia' | null>(null)
  const [meses, setMeses] = useState('')
  const [destino, setDestino] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const evento = useRegistrarEvento(animal.id)
  const potreros = usePotreros()
  const mover = useMoverAnimales()
  const baja = useDarBaja(animal.id)
  const ocupado = evento.isPending || mover.isPending || baja.isPending
  const elegido = QUE.find((q) => q.valor === que)!

  const cerrar = () => {
    setError(null)
    onCerrar()
  }

  async function guardar() {
    setError(null)
    try {
      if (que === 'movimiento') {
        if (!destino) return setError('Tocá el potrero al que fue.')
        await mover.mutateAsync({ empresaId: animal.empresaId, potreroDestinoId: destino, loteId: null, seleccion: { animalIds: [animal.id] } })
        toast.success(`Listo: el ${nombreDe(animal)} quedó en su potrero nuevo`, { description: 'Lo ves en su historia.' })
      } else if (que === 'murio') {
        await baja.mutateAsync({ animalId: animal.id, estado: 'muerto', fecha, motivo: nota })
        toast.success(`Listo: el ${nombreDe(animal)} quedó como muerto`, { description: 'Sale del rodeo; su ficha queda.' })
      } else {
        let datos: Record<string, unknown> | undefined
        let tipo: 'sanidad' | 'pesaje' | 'destete' | 'tacto' | 'nota' = que
        if (que === 'sanidad') {
          const tratamiento = [...vacunas, otro.trim()].filter(Boolean).join(', ')
          if (!tratamiento) return setError('Tocá qué le diste, o escribilo.')
          if (conRetiro === 'si' && !retiro) return setError('Poné hasta cuándo dura el retiro.')
          datos = { tratamiento, ...(conRetiro === 'si' ? { retiro_hasta: retiro } : {}), ...(lote.trim() ? { lote: lote.trim() } : {}), ...(quien.trim() ? { quien: quien.trim() } : {}) }
        } else if (que === 'pesaje') {
          const n = Number(kg.replace(',', '.'))
          if (!n || n <= 0 || n > 1500) return setError('Poné los kilos de la pesada.')
          datos = { kg: Math.round(n) }
        } else if (que === 'tacto') {
          if (!tacto) return setError('Tocá si está preñada o vacía.')
          datos = { resultado: tacto, ...(tacto === 'prenada' && Number(meses) > 0 ? { meses: Number(meses) } : {}) }
        } else if (que === 'nota') {
          if (!nota.trim()) return setError('Escribí qué pasó.')
          tipo = 'nota'
        }
        await evento.mutateAsync({ empresaId: animal.empresaId, animalId: animal.id, tipo, fecha, nota: que === 'nota' || que === 'destete' ? nota : '', datos })
        toast.success(`Listo: ${elegido.texto.toLowerCase()} anotada al ${nombreDe(animal)}`.replace('destete anotada', 'destete anotado').replace('otra cosa anotada', 'nota anotada'), { description: 'Lo ves en su historia.' })
      }
      cerrar()
    } catch (e) {
      setError(errorTexto(e))
    }
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={cerrar}
      titulo={`¿Qué le pasó al ${nombreDe(animal)}?`}
      pie={
        <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado} onClick={guardar}>
          {que === 'movimiento' && destino ? `Moverlo al ${potreros.data?.find((p) => p.id === destino)?.nombre ?? ''}` : elegido.boton}
        </BotonPrincipal>
      }
    >
      <div role="radiogroup" aria-label="Qué le pasó" className="grid grid-cols-3 gap-2.5">
        {QUE.map((q) => (
          <button
            key={q.valor}
            type="button"
            role="radio"
            aria-checked={que === q.valor}
            onClick={() => {
              setQue(q.valor)
              setError(null)
            }}
            className={cn(
              'flex h-[84px] flex-col items-start justify-between rounded-[18px] p-3.5 text-left text-[15px] font-bold transition-colors',
              que === q.valor ? 'bg-principal text-principal-texto' : 'bg-superficie text-texto hover:bg-superficie-hundida',
            )}
          >
            <Icono nombre={q.icono} />
            {q.texto}
          </button>
        ))}
      </div>

      <div className="mt-7">
        {que === 'sanidad' && (
          <>
            <Grupo titulo="Qué le diste">
              <Opciones etiqueta="Qué le diste" opciones={VACUNAS.map((v) => ({ valor: v, texto: v }))} elegidas={vacunas} onTocar={(v) => setVacunas((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]))} />
              <CampoTexto className="mt-3" etiqueta="Otra cosa" placeholder="Por ejemplo: oxitetraciclina" value={otro} onChange={(e) => setOtro(e.target.value)} />
            </Grupo>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <CampoTexto etiqueta="Lote del producto" value={lote} onChange={(e) => setLote(e.target.value)} />
              <CampoTexto etiqueta="Quién" value={quien} onChange={(e) => setQuien(e.target.value)} />
            </div>
            <Grupo titulo="¿Tiene retiro? Mientras dure, no se vende">
              <Segmentos etiqueta="Tiene retiro" opciones={[{ valor: 'no', texto: 'No' }, { valor: 'si', texto: 'Sí, hasta…' }]} valor={conRetiro} onCambio={setConRetiro} />
              {conRetiro === 'si' && (
                <div className="mt-3">
                  <CampoFecha value={retiro} onChange={setRetiro} ariaLabel="Retiro hasta" min={fecha} />
                </div>
              )}
            </Grupo>
          </>
        )}
        {que === 'pesaje' && (
          <CampoTexto etiqueta="Cuánto pesó" inputMode="decimal" unidad="kg" autoFocus value={kg} onChange={(e) => setKg(e.target.value)} />
        )}
        {que === 'tacto' && (
          <>
            <Grupo titulo="Qué dio">
              <Segmentos etiqueta="Resultado del tacto" opciones={[{ valor: 'prenada', texto: 'Preñada' }, { valor: 'vacia', texto: 'Vacía' }]} valor={tacto} onCambio={setTacto} />
            </Grupo>
            {tacto === 'prenada' && <CampoTexto className="mt-5" etiqueta="De cuántos meses (si lo dijo el veterinario)" inputMode="numeric" unidad="meses" value={meses} onChange={(e) => setMeses(e.target.value)} />}
          </>
        )}
        {que === 'movimiento' && (
          <Grupo titulo="A qué potrero fue">
            <ElegirPotrero valor={destino} onElegir={setDestino} excepto={animal.potreroId} />
          </Grupo>
        )}
        {(que === 'murio' || que === 'nota' || que === 'destete') && (
          <CampoTexto etiqueta={que === 'murio' ? 'De qué murió (si se sabe)' : que === 'destete' ? 'Algo para agregar (opcional)' : 'Qué pasó'} value={nota} onChange={(e) => setNota(e.target.value)} />
        )}
        {que !== 'movimiento' && (
          <Grupo titulo="Cuándo" className="mt-6">
            <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Cuándo" max={hoyLocal()} />
          </Grupo>
        )}
        <ErrorDelPanel texto={error} />
      </div>
    </PanelLateral>
  )
}

// ===== Corregir datos =====

export type AnimalCorregir = AnimalPanel & { categoria: Categoria | null; fechaNacimiento: string | null; raza: string | null; pelaje: string | null }
type Datos = { visual: string; rfid: string; categoria: Categoria | null; nacio: string; raza: string; pelaje: string; potreroId: string | null }

/**
 * Un solo panel para corregir lo que estaba mal cargado: la caravana, qué es,
 * cuándo nació, raza, pelaje y el potrero. Lo que cambia se marca con el valor
 * de antes, se guarda todo junto y lo de antes queda en su historia.
 */
export function CorregirDatos({ animal, abierto, onCerrar }: { animal: AnimalCorregir; abierto: boolean; onCerrar: () => void }) {
  const antes: Datos = { visual: animal.visual ?? '', rfid: (animal.rfid ?? '').replace(/\s/g, ''), categoria: animal.categoria, nacio: animal.fechaNacimiento ?? '', raza: animal.raza ?? '', pelaje: animal.pelaje ?? '', potreroId: animal.potreroId }
  const [d, setD] = useState<Datos>(antes)
  const [abiertoAntes, setAbiertoAntes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mut = useCorregirAnimal(animal.id)
  const { data: mapa } = useMapa(animal.empresaId)
  const { campos: identidad } = useCampoElegido()
  const potreros = usePotreros()
  const camposMapa = (mapa ?? []).filter((c) => c.potreros.length > 0)
  const campoDe = (id: string | null) => camposMapa.find((c) => c.potreros.some((p) => p.id === id))?.id ?? null
  const [campoId, setCampoId] = useState<string | null>(null)
  // Al abrir, el panel arranca con los datos de hoy.
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) {
      setD(antes)
      setError(null)
      setCampoId(null)
    }
  }
  const campo = camposMapa.find((c) => c.id === (campoId ?? campoDe(d.potreroId) ?? (camposMapa.length === 1 ? camposMapa[0]!.id : null)))
  const nombrePot = (id: string | null) => potreros.data?.find((p) => p.id === id)?.nombre ?? 'sin potrero'
  const fecha = (f: string) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : 'sin fecha')
  const especie = animal.categoria ? especiePorCategoria[animal.categoria] : 'bovino'

  const chip = d.rfid.replace(/\s/g, '')
  const cambia = {
    caravana: d.visual.trim() !== antes.visual || chip !== antes.rfid,
    que: d.categoria !== antes.categoria,
    nacio: d.nacio !== antes.nacio || d.raza.trim() !== antes.raza || d.pelaje.trim() !== antes.pelaje,
    potrero: d.potreroId !== antes.potreroId,
  }
  const lista = [cambia.caravana && 'caravana', cambia.que && 'qué es', cambia.nacio && 'nacimiento, raza o pelaje', cambia.potrero && 'potrero'].filter(Boolean) as string[]
  const problema =
    cambia.caravana && !d.visual.trim() && !chip
      ? 'Escribí la caravana visible, el chip o los dos.'
      : d.visual.trim() !== antes.visual && /\D/.test(d.visual.trim())
        ? 'La visible va sólo con números.'
        : chip !== antes.rfid && chip && !/^\d{15}$/.test(chip)
          ? `El chip tiene ${chip.replace(/\D/g, '').length} números: son 15.`
          : null

  async function guardar() {
    setError(null)
    const c: Correccion = {}
    // Sólo lo que cambió: el chip guardado puede tener espacios y no hay que «cambiarlo» por eso.
    if (d.visual.trim() !== antes.visual) c.visual = d.visual.trim() || null
    if (chip !== antes.rfid) c.rfid = chip || null
    if (cambia.que && d.categoria) c.categoria = d.categoria
    if (d.nacio !== antes.nacio) c.fecha_nacimiento = d.nacio || null
    if (d.raza.trim() !== antes.raza) c.raza = d.raza.trim() || null
    if (d.pelaje.trim() !== antes.pelaje) c.pelaje = d.pelaje.trim() || null
    if (cambia.potrero && d.potreroId) c.potrero_id = d.potreroId
    try {
      await mut.mutateAsync({ animalId: animal.id, cambios: c })
      toast.success(lista.length === 1 ? 'Listo: 1 cambio guardado' : `Listo: ${lista.length} cambios guardados`, { description: 'Lo de antes queda en su historia.' })
      onCerrar()
    } catch (e) {
      setError(errorTexto(e))
    }
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Corregir datos"
      bajada="Lo que está mal cargado. Lo de antes queda en su historia."
      pie={
        <div className="flex flex-col gap-2">
          <p className="text-center text-[13.5px] text-texto-suave">{problema ?? (lista.length ? `Cambia: ${lista.join(', ')}.` : 'Cambiá lo que esté mal.')}</p>
          <BotonPrincipal icono="Guardar" cargando={mut.isPending} disabled={mut.isPending || lista.length === 0 || !!problema} onClick={guardar}>
            {lista.length === 0 ? 'Guardar' : lista.length === 1 ? 'Guardar 1 cambio' : `Guardar ${lista.length} cambios`}
          </BotonPrincipal>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Bloque titulo="Caravana" antes={cambia.caravana ? (antes.visual || antes.rfid ? `Antes: ${antes.visual || '—'}${antes.rfid ? ` · chip ${antes.rfid.slice(-4)}` : ''}` : 'Antes: sin caravana') : null}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <CampoTexto etiqueta="Visible" inputMode="numeric" autoComplete="off" value={d.visual} onChange={(e) => setD({ ...d, visual: e.target.value })} />
            <CampoTexto etiqueta="Chip (15 números)" inputMode="numeric" autoComplete="off" value={d.rfid} onChange={(e) => setD({ ...d, rfid: e.target.value })} />
          </div>
          <p className="text-[13px] text-texto-suave">{antes.visual || antes.rfid ? 'Si se le cayó y le pusiste otra, escribí la nueva.' : 'Escribí la que le pusiste.'}</p>
        </Bloque>

        <Bloque titulo="Qué es" antes={cambia.que && antes.categoria ? `Antes: ${categoriaLabel[antes.categoria]}` : null}>
          <div className="flex flex-wrap gap-2">
            {categoriasPorEspecie[especie].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={d.categoria === c}
                onClick={() => setD({ ...d, categoria: c })}
                className={cn('h-10 rounded-full border-[1.5px] px-4 text-[14.5px] font-semibold transition-colors', d.categoria === c ? 'border-texto bg-texto text-superficie' : 'border-borde bg-superficie text-texto hover:border-neutro-300')}
              >
                {categoriaLabel[c]}
              </button>
            ))}
          </div>
        </Bloque>

        <Bloque titulo="Nació" antes={cambia.nacio ? `Antes: ${[fecha(antes.nacio), antes.raza || 'sin raza', antes.pelaje].filter(Boolean).join(' · ')}` : null}>
          <CampoFecha value={d.nacio} onChange={(v) => setD({ ...d, nacio: v })} ariaLabel="Cuándo nació" max={hoyLocal()} conBorrar />
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoTexto etiqueta="Raza" autoComplete="off" value={d.raza} onChange={(e) => setD({ ...d, raza: e.target.value })} />
            <CampoTexto etiqueta="Pelaje" autoComplete="off" value={d.pelaje} onChange={(e) => setD({ ...d, pelaje: e.target.value })} />
          </div>
        </Bloque>

        <Bloque titulo="Potrero" antes={cambia.potrero ? `Antes: ${nombrePot(antes.potreroId)}` : null}>
          {camposMapa.length > 1 && <ElegirCampo titulo="Campo" identidad={identidad} campos={camposMapa} valor={campo?.id ?? null} onCambio={setCampoId} />}
          {campo ? <Potreros campo={campo} elegido={d.potreroId} onElegir={(id) => setD({ ...d, potreroId: id })} dato={SIN_DATO} /> : <p className="text-[14px] text-texto-suave">Elegí el campo.</p>}
          <p className="text-[13px] text-texto-suave">Tocá el potrero donde está. En su historia queda como que pasó ahí hoy.</p>
        </Bloque>
      </div>
      <ErrorDelPanel texto={error} />
    </PanelLateral>
  )
}

const SIN_DATO = () => null

function Bloque({ titulo, antes, children }: { titulo: string; antes: string | null; children: React.ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-[18px] border bg-superficie px-4 py-3.5', antes ? 'border-principal ring-1 ring-principal' : 'border-borde')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15.5px] font-bold text-texto">{titulo}</h3>
        {antes && <span className="rounded-full bg-principal-suave px-2.5 py-0.5 text-[12.5px] font-semibold text-principal">{antes}</span>}
      </div>
      {children}
    </section>
  )
}

// ===== Dar de baja =====

export function DarDeBaja({ animal, abierto, onCerrar }: { animal: AnimalPanel; abierto: boolean; onCerrar: () => void }) {
  const [por, setPor] = useState<'vendido' | 'muerto' | null>(null)
  const [fecha, setFecha] = useState(hoyLocal())
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mut = useDarBaja(animal.id)

  async function guardar() {
    setError(null)
    if (!por) return setError('Tocá si se vendió o murió.')
    try {
      await mut.mutateAsync({ animalId: animal.id, estado: por, fecha, motivo: nota })
      toast.success(`Listo: el ${nombreDe(animal)} salió del rodeo`, { description: por === 'vendido' ? 'La plata de la venta se anota en Plata.' : 'Su ficha y su historia quedan.' })
      onCerrar()
    } catch (e) {
      setError(errorTexto(e))
    }
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Sale el ${nombreDe(animal)}`}
      bajada="Deja de contar en el rodeo. Su ficha y su historia quedan para siempre."
      pie={
        <BotonPrincipal icono="Guardar" cargando={mut.isPending} disabled={mut.isPending} onClick={guardar}>
          {por === 'muerto' ? 'Anotar que murió' : por === 'vendido' ? 'Anotar la venta' : 'Darlo de baja'}
        </BotonPrincipal>
      }
    >
      <Grupo titulo="Qué pasó">
        <Segmentos etiqueta="Motivo de baja" opciones={[{ valor: 'vendido', texto: 'Se vendió' }, { valor: 'muerto', texto: 'Murió' }]} valor={por} onCambio={setPor} />
      </Grupo>
      <Grupo titulo="Cuándo">
        <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Cuándo" max={hoyLocal()} />
      </Grupo>
      <CampoTexto className="mt-6" etiqueta={por === 'muerto' ? 'De qué murió (si se sabe)' : 'Algo para agregar (opcional)'} value={nota} onChange={(e) => setNota(e.target.value)} />
      <ErrorDelPanel texto={error} />
    </PanelLateral>
  )
}

// ===== Un animal nuevo =====

const ORIGEN = [
  { valor: 'nacimiento', texto: 'Nació en el campo' },
  { valor: 'compra', texto: 'Comprado' },
  { valor: 'vecino', texto: 'De un vecino' },
] as const

export function AnimalNuevo({ empresaId, especie, abierto, onCerrar, onVolver }: { empresaId: string; especie: Especie; abierto: boolean; onCerrar: () => void; onVolver?: () => void }) {
  const { elegido } = useCampoElegido()
  const [rfid, setRfid] = useState('')
  const [visual, setVisual] = useState('')
  const [categoria, setCategoria] = useState<Categoria | null>(null)
  const [origen, setOrigen] = useState<(typeof ORIGEN)[number]['valor']>('compra')
  const [potrero, setPotrero] = useState<string | null>(null)
  const [nacio, setNacio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mut = useCrearAnimal()

  async function guardar() {
    setError(null)
    if (!rfid.trim()) return setError('Escribí la caravana electrónica. Si todavía no tiene, sumalo con «Entraron»: entra sin caravana y se la cargás después.')
    if (!categoria) return setError('Tocá qué es.')
    if (!potrero) return setError('Tocá el potrero donde queda.')
    try {
      await mut.mutateAsync({ empresaId, numeroRfid: rfid, numeroVisual: visual, categoria, potreroId: potrero, origen, fechaNacimiento: nacio || null })
      toast.success(`Listo: ${categoriaLabel[categoria].toLowerCase()} sumada al rodeo`.replace(/(ternero|novillo|toro|carnero|cordero|padrillo|potrillo|capón) sumada/, '$1 sumado'), { description: 'Ya está en la lista y en su potrero.' })
      setRfid('')
      setVisual('')
      setCategoria(null)
      setPotrero(null)
      setNacio('')
      onCerrar()
    } catch (e) {
      setError(errorTexto(e))
    }
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      onVolver={onVolver}
      titulo="Un animal nuevo"
      bajada="Para los que entran de a uno, con su caravana. Si son muchos, usá «Entraron»."
      pie={
        <BotonPrincipal icono="Agregar" cargando={mut.isPending} disabled={mut.isPending} onClick={guardar}>
          Sumar al rodeo
        </BotonPrincipal>
      }
    >
      <div className="flex flex-col gap-4">
        <CampoTexto etiqueta="Caravana electrónica" ayuda="Los 15 números del chip." inputMode="numeric" autoFocus value={rfid} onChange={(e) => setRfid(e.target.value)} />
        <CampoTexto etiqueta="Caravana visible (opcional)" inputMode="numeric" value={visual} onChange={(e) => setVisual(e.target.value)} />
      </div>
      <Grupo titulo="Qué es" className="mt-6">
        <Opciones etiqueta="Qué es" opciones={categoriasPorEspecie[especie].map((c) => ({ valor: c, texto: categoriaLabel[c] }))} elegidas={categoria ? [categoria] : []} onTocar={(c) => setCategoria(c)} />
      </Grupo>
      <Grupo titulo="De dónde viene">
        <Opciones etiqueta="De dónde viene" opciones={[...ORIGEN]} elegidas={[origen]} onTocar={(o) => setOrigen(o)} />
      </Grupo>
      <Grupo titulo="Dónde queda">
        <ElegirEnCroquis empresaId={empresaId} valor={potrero} onElegir={setPotrero} campoInicial={elegido?.id ?? null} />
      </Grupo>
      <Grupo titulo="Cuándo nació (si se sabe)">
        <CampoFecha value={nacio} onChange={setNacio} ariaLabel="Cuándo nació" max={hoyLocal()} conBorrar />
      </Grupo>
      <ErrorDelPanel texto={error} />
    </PanelLateral>
  )
}

/** Elegir un potrero sobre el croquis: el campo arriba (con su letra) y el mapa compacto debajo. */
function ElegirEnCroquis({ empresaId, valor, onElegir, campoInicial }: { empresaId: string; valor: string | null; onElegir: (id: string) => void; campoInicial: string | null }) {
  const { data: mapa } = useMapa(empresaId)
  const { campos: identidad } = useCampoElegido()
  const campos = (mapa ?? []).filter((c) => c.potreros.length > 0)
  const [campoId, setCampoId] = useState<string | null>(campoInicial)
  const campo = campos.find((c) => c.id === campoId) ?? campos.find((c) => c.potreros.some((p) => p.id === valor)) ?? campos[0]
  if (!campo) return <div className="h-10 animate-pulse rounded-full bg-superficie-hundida" />
  const potrero = campo.potreros.find((p) => p.id === valor)
  return (
    <div>
      {campos.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {campos.map((c) => {
            const id = identidad.find((i) => i.id === c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={campo.id === c.id}
                onClick={() => setCampoId(c.id)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-full border-[1.5px] px-3 text-[14px] font-bold transition-colors',
                  campo.id === c.id ? 'border-tinta bg-tinta text-superficie' : 'border-borde bg-superficie text-texto hover:border-neutro-300',
                )}
              >
                {id && (
                  <span className="grid size-[20px] place-items-center rounded-[6px] text-[10.5px] font-extrabold text-white" style={{ background: id.color }}>
                    {id.letra}
                  </span>
                )}
                {c.nombre}
              </button>
            )
          })}
        </div>
      )}
      <Potreros campo={campo} elegido={valor} onElegir={onElegir} className="h-[240px]" />
      <p className="mt-2 text-[13.5px] text-texto-suave">{potrero ? `Queda en el ${potrero.nombre} de ${campo.nombre}.` : 'Tocá el potrero en el mapa.'}</p>
    </div>
  )
}
