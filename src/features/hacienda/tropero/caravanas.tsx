import { useRef, useState } from 'react'
import { Icono } from '@/components/tropero/icono'
import { Segmentos } from '@/components/tropero/segmentos'
import { cn } from '@/lib/utils'
import { leerArchivo } from './leer-archivo'
import { caravanasDeTexto, soloDigitos } from './planilla'

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

export type Conocida = { caravana: string; visual: string | null; rfid: string | null; etiqueta: string }
type Modo = 'despues' | 'una' | 'rango' | 'planilla'

/**
 * Las caravanas que salieron (página 35, «Revisá · Las caravanas»): después
 * (quedan pendientes), de a una, por rango o con la planilla del bastón. Sólo
 * acepta las que están entre las `posibles` (las del potrero que sale).
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
  /** Cuántas salen en total (para decir «7 de 12»). */
  cuantas: number
  conDespues?: boolean
}) {
  const [modo, setModo] = useState<Modo>(conDespues ? 'despues' : 'una')
  const [tipeo, setTipeo] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)

  const buscar = (c: string) => {
    const d = soloDigitos(c)
    return posibles.find((p) => (p.visual && soloDigitos(p.visual) === d) || (p.rfid && soloDigitos(p.rfid) === d)) ?? null
  }
  const sumar = (cs: string[]) => {
    const nuevas: string[] = []
    const no: string[] = []
    for (const c of cs) {
      const p = buscar(c)
      if (!p) no.push(c)
      else if (!elegidas.includes(p.caravana) && !nuevas.includes(p.caravana)) nuevas.push(p.caravana)
    }
    const lugar = Math.max(0, cuantas - elegidas.length)
    onCambio([...elegidas, ...nuevas.slice(0, lugar)])
    setAviso(
      no.length
        ? `${no.slice(0, 3).join(', ')}${no.length > 3 ? ` y ${no.length - 3} más` : ''}: no ${no.length === 1 ? 'está' : 'están'} en este potrero.`
        : nuevas.length > lugar
          ? `Salen ${cuantas}: sumamos las primeras.`
          : null,
    )
  }
  const opciones = [
    ...(conDespues ? [{ valor: 'despues' as Modo, texto: 'Después' }] : []),
    { valor: 'una' as Modo, texto: 'De a una' },
    { valor: 'rango' as Modo, texto: 'Rango' },
    { valor: 'planilla' as Modo, texto: 'Planilla' },
  ]

  return (
    <div>
      <Segmentos etiqueta="Las caravanas" opciones={opciones} valor={modo} onCambio={(m) => (setModo(m), setAviso(null), m === 'despues' && onCambio([]))} />
      {modo === 'despues' && <p className="mt-3 text-[14px] text-texto-suave">Quedan «pendientes de identificar» y se resuelven en la próxima manga o desde Hacienda.</p>}
      {modo === 'una' && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (tipeo.trim()) sumar(caravanasDeTexto(tipeo))
            setTipeo('')
          }}
        >
          <input
            aria-label="Caravana que salió"
            inputMode="numeric"
            autoFocus
            value={tipeo}
            onChange={(e) => setTipeo(e.target.value)}
            placeholder="Tipeá la caravana o leela con el bastón"
            className="h-11 min-w-0 flex-1 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[15px] text-texto outline-none focus:border-principal"
          />
          <button type="submit" className="h-11 rounded-full border-[1.5px] border-principal px-4 text-[14.5px] font-bold text-principal hover:bg-principal-suave">
            Sumar
          </button>
        </form>
      )}
      {modo === 'rango' && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (desde && hasta) sumar(caravanasDeTexto(`${soloDigitos(desde)}-${soloDigitos(hasta)}`).filter((c) => buscar(c)))
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13.5px] font-semibold text-texto-suave">
            Desde
            <input inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-11 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[15px] text-texto outline-none focus:border-principal" />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13.5px] font-semibold text-texto-suave">
            Hasta
            <input inputMode="numeric" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-11 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[15px] text-texto outline-none focus:border-principal" />
          </label>
          <button type="submit" className="h-11 rounded-full border-[1.5px] border-principal px-4 text-[14.5px] font-bold text-principal hover:bg-principal-suave">
            Sumar
          </button>
        </form>
      )}
      {modo === 'planilla' && (
        <div className="mt-3">
          <ZonaArchivo
            titulo="Soltá acá la planilla del bastón"
            bajada="Excel o CSV. Leemos los números de caravana."
            cargando={leyendo}
            onArchivo={async (f) => {
              setLeyendo(true)
              try {
                const filas = await leerArchivo(f)
                sumar(filas.flat().map((c) => soloDigitos(String(c ?? ''))).filter((d) => d.length >= 3 && buscar(d)))
              } catch {
                setAviso('No pudimos leer ese archivo. Probá con un Excel (.xlsx) o un CSV.')
              } finally {
                setLeyendo(false)
              }
            }}
          />
        </div>
      )}
      {elegidas.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            {elegidas.map((c) => {
              const p = posibles.find((x) => x.caravana === c)
              return (
                <button
                  key={c}
                  type="button"
                  title={`Sacar: ${p?.etiqueta ?? c}`}
                  onClick={() => onCambio(elegidas.filter((x) => x !== c))}
                  className="cifra inline-flex h-10 items-center gap-1.5 rounded-[10px] border-[1.5px] border-principal px-2.5 text-[18px] font-bold text-principal hover:bg-principal-suave"
                >
                  {p?.visual ?? c}
                  <Icono nombre="Cerrar" tamano={16} />
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[14px] font-semibold text-texto">
            {elegidas.length} de {cuantas}.{elegidas.length < cuantas ? ' El resto queda pendiente de identificar.' : ''}
          </p>
        </div>
      )}
      {aviso && <p className="mt-2 text-[13.5px] font-semibold text-estado-atencion-texto">{aviso}</p>}
    </div>
  )
}
