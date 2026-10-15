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
import { Potreros } from './entradas-salidas-panel'
import { useCambiarCaravana, useCrearAnimal, useDarBaja, useMoverAnimales, usePotreros, useRegistrarEvento } from '@/features/hacienda/hooks'
import { categoriaLabel, categoriasPorEspecie, type Especie } from '@/features/hacienda/labels'
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

// ===== Cambiar caravana =====

const MOTIVOS_CARAVANA = [
  { valor: 'Se perdió', texto: 'Se perdió' },
  { valor: 'Se rompió', texto: 'Se rompió' },
  { valor: 'Estaba mal cargada', texto: 'Estaba mal cargada' },
]

export function CambiarCaravana({ animal, abierto, onCerrar }: { animal: AnimalPanel; abierto: boolean; onCerrar: () => void }) {
  const [rfid, setRfid] = useState('')
  const [visual, setVisual] = useState('')
  const [motivo, setMotivo] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const mut = useCambiarCaravana(animal.id)

  async function guardar() {
    setError(null)
    if (!rfid.trim()) return setError('Escribí el número de la electrónica nueva.')
    try {
      await mut.mutateAsync({ animalId: animal.id, nuevoRfid: rfid, nuevaVisual: visual, motivo: motivo[0] })
      toast.success(`Listo: el animal tiene caravana nueva${visual.trim() ? `, la ${visual.trim()}` : ''}`, { description: 'La anterior queda en su historia.' })
      setRfid('')
      setVisual('')
      setMotivo([])
      onCerrar()
    } catch (e) {
      setError(errorTexto(e))
    }
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Otra caravana para este animal"
      bajada="Lo que tiene hoy queda en su historia, con la fecha del cambio."
      pie={
        <BotonPrincipal icono="Guardar" cargando={mut.isPending} disabled={mut.isPending} onClick={guardar}>
          Guardar la caravana nueva
        </BotonPrincipal>
      }
    >
      <div className="flex items-center gap-4 rounded-[18px] bg-superficie px-5 py-4">
        <span className="text-[14px] text-texto-suave">Tiene hoy</span>
        <span className="cifra rounded-[8px] border-[1.5px] border-principal px-2 py-0.5 text-[20px] font-bold text-principal">{animal.visual ?? '—'}</span>
        <span className="cifra truncate text-[15px] text-texto-suave">{animal.rfid ?? 'sin electrónica'}</span>
      </div>
      <div className="mt-6 flex flex-col gap-4">
        <CampoTexto etiqueta="La electrónica nueva" ayuda="Los 15 números del chip." inputMode="numeric" autoFocus value={rfid} onChange={(e) => setRfid(e.target.value)} />
        <CampoTexto etiqueta="La visible nueva (opcional)" inputMode="numeric" value={visual} onChange={(e) => setVisual(e.target.value)} />
      </div>
      <Grupo titulo="¿Por qué la cambiaste?" className="mt-6">
        <Opciones etiqueta="Por qué" opciones={MOTIVOS_CARAVANA} elegidas={motivo} onTocar={(v) => setMotivo((xs) => (xs[0] === v ? [] : [v]))} />
      </Grupo>
      <ErrorDelPanel texto={error} />
    </PanelLateral>
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
