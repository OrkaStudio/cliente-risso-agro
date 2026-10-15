import { useRef, useState } from 'react'
import { Icono } from '@/components/tropero/icono'
import { Segmentos } from '@/components/tropero/segmentos'
import { cn } from '@/lib/utils'
import { leerArchivo } from './leer-archivo'
import { soloDigitos } from './planilla'

/** «Soltá acá el Excel»: se suelta o se toca para buscarlo. */
export function ZonaArchivo({ titulo, bajada, onArchivo, cargando = false }: { titulo: string; bajada: string; onArchivo: (f: File) => void; cargando?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => (e.preventDefault(), setEncima(true))}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault()
        setEncima(false)
        const f = e.dataTransfer.files[0]
        if (f) onArchivo(f)
      }}
      className={cn(
        'flex w-full flex-col items-center gap-1.5 rounded-[18px] border-2 border-dashed px-5 py-7 text-center transition-colors',
        encima ? 'border-principal bg-principal-suave' : 'border-principal/60 bg-superficie hover:bg-principal-suave/50',
      )}
    >
      <span className="text-principal">{cargando ? <span className="block size-6 animate-spin rounded-full border-2 border-principal/30 border-t-principal" /> : <Icono nombre="Descargar" />}</span>
      <span className="text-[16px] font-bold text-texto">{titulo}</span>
      <span className="text-[13.5px] text-texto-suave">{bajada}</span>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onArchivo(f)
          e.target.value = ''
        }}
      />
    </button>
  )
}

export type Conocida = { caravana: string; visual: string | null; rfid: string | null; etiqueta: string; detalle?: string; /** «Figura como vendida»: la que la cuenta ya dio de baja. */ marca?: string }
type Modo = 'despues' | 'lista' | 'planilla'

/**
 * Las caravanas que salieron (página 35, «Revisá · Las caravanas»). En la compu
 * no se tipea ni se usa el bastón: se deja para después (la salida queda sin
 * identificar y el número ya está bien), se
 * eligen de una lista donde cada una se reconoce por lo que es, o se sube la
 * planilla de la venta. Sólo acepta las `posibles` (las del potrero que sale).
 */
export function CaravanasQueSalieron({
  posibles,
  elegidas,
  onCambio,
  cuantas,
  conDespues = true,
}: {
  posibles: Conocida[]
  elegidas: string[]
  onCambio: (cs: string[]) => void
  /** Cuántas salen en total (para decir «2 de 12»). */
  cuantas: number
  conDespues?: boolean
}) {
  const [modo, setModo] = useState<Modo>(conDespues ? 'despues' : 'lista')
  const [aviso, setAviso] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)

  const buscar = (c: string) => {
    const d = soloDigitos(c)
    return posibles.find((p) => (p.visual && soloDigitos(p.visual) === d) || (p.rfid && soloDigitos(p.rfid) === d)) ?? null
  }
  const opciones = [
    ...(conDespues ? [{ valor: 'despues' as Modo, texto: 'Después' }] : []),
    { valor: 'lista' as Modo, texto: 'De la lista' },
    { valor: 'planilla' as Modo, texto: 'Con planilla' },
  ]

  return (
    <div>
      <Segmentos etiqueta="Las caravanas" opciones={opciones} valor={modo} onCambio={(m) => (setModo(m), setAviso(null), m === 'despues' && onCambio([]))} />
      {modo === 'despues' && (
        <p className="mt-3 rounded-[14px] bg-superficie px-4 py-3 text-[14px] text-texto">
          Restamos del número ahora y las fichas no cambian. Cuando sepas cuál fue, lo decís desde la ficha del animal o desde Hacienda.</p>
      )}
      {modo === 'lista' && (
        <>
          <p className="mt-3 mb-3 text-[14px] text-texto-suave">Tocá {cuantas === 1 ? 'la que salió' : 'las que salieron'}. Cada una dice qué es, para reconocerla sin acordarte del número.</p>
          <ElegirDeLista posibles={posibles} elegidas={elegidas} cuantas={cuantas} onCambio={onCambio} />
        </>
      )}
      {modo === 'planilla' && (
        <div className="mt-3">
          <ZonaArchivo
            titulo="Soltá acá la planilla de la venta"
            bajada="La de la consignataria o la del veterinario. Excel o CSV: leemos los números de caravana."
            cargando={leyendo}
            onArchivo={async (f) => {
              setLeyendo(true)
              try {
                const filas = await leerArchivo(f)
                const halladas = [...new Set(filas.flat().map((c) => soloDigitos(String(c ?? ''))).filter((d) => d.length >= 3).flatMap((d) => (buscar(d) ? [buscar(d)!.caravana] : [])))]
                const nuevas = halladas.filter((c) => !elegidas.includes(c))
                onCambio([...elegidas, ...nuevas].slice(0, cuantas))
                setAviso(halladas.length ? (nuevas.length > cuantas - elegidas.length ? `Salieron ${cuantas}: sumamos las primeras.` : null) : 'En la planilla no encontramos caravanas de este potrero.')
              } catch {
                setAviso('No pudimos leer ese archivo. Probá con un Excel (.xlsx) o un CSV.')
              } finally {
                setLeyendo(false)
              }
            }}
          />
        </div>
      )}
      {modo === 'planilla' && elegidas.length > 0 && (
        <p className="mt-3 text-[14px] font-semibold text-texto">
          Encontramos {elegidas.length} de {cuantas}.{elegidas.length < cuantas ? ' Las que falten quedan sin identificar hasta que digas cuáles fueron.' : ''}
        </p>
      )}
      {aviso && <p className="mt-2 text-[13.5px] font-semibold text-estado-atencion-texto">{aviso}</p>}
    </div>
  )
}

/**
 * La lista para elegir: cada caravana con lo que la hace reconocible. Si sale
 * una sola, tocar otra la reemplaza (como una opción); si salen varias, se
 * marcan hasta completar la cuenta.
 */
export function ElegirDeLista({ posibles, elegidas, cuantas, onCambio }: { posibles: Conocida[]; elegidas: string[]; cuantas: number; onCambio: (cs: string[]) => void }) {
  const tocar = (c: string) => {
    if (elegidas.includes(c)) return onCambio(elegidas.filter((x) => x !== c))
    if (cuantas === 1) return onCambio([c])
    if (elegidas.length < cuantas) onCambio([...elegidas, c])
  }
  return (
    <div>
      <div role={cuantas === 1 ? 'radiogroup' : 'group'} className="grid grid-cols-2 gap-2">
        {posibles.map((p) => {
          const si = elegidas.includes(p.caravana)
          const lleno = !si && cuantas > 1 && elegidas.length >= cuantas
          return (
            <button
              key={p.caravana}
              type="button"
              role={cuantas === 1 ? 'radio' : undefined}
              aria-checked={cuantas === 1 ? si : undefined}
              aria-pressed={cuantas === 1 ? undefined : si}
              disabled={lleno}
              onClick={() => tocar(p.caravana)}
              className={cn(
                'flex items-center gap-3 rounded-[14px] border-[1.5px] px-3 py-2.5 text-left transition-colors disabled:opacity-45',
                si ? 'border-principal bg-principal-suave' : 'border-borde bg-superficie hover:border-neutro-300',
              )}
            >
              <span className={cn('cifra shrink-0 rounded-[8px] border-[1.5px] px-1.5 text-[18px] leading-tight font-bold', si ? 'border-principal bg-principal text-principal-texto' : 'border-principal text-principal')}>
                {p.visual ?? p.rfid?.slice(-4) ?? 's/c'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold text-texto">{p.etiqueta}</span>
                {p.detalle && <span className="block truncate text-[12.5px] text-texto-suave">{p.detalle}</span>}
                {p.marca && <span className="mt-0.5 inline-block rounded-full bg-superficie-hundida px-2 text-[11.5px] font-semibold text-texto-suave">{p.marca}</span>}
              </span>
            </button>
          )
        })}
      </div>
      {cuantas > 1 && <p className="mt-2 text-[13.5px] font-semibold text-texto">{elegidas.length} de {cuantas}</p>}
    </div>
  )
}
