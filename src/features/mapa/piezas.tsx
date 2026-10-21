import { useEffect, useRef, useState } from 'react'
import { Aviso } from '@/components/tropero/aviso'
import { BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { cn } from '@/lib/utils'
import { buscarLugar, type Lugar } from './api'
import { haTexto, type compararBorde } from './reglas'

// Piezas del mapa del campo que comparten el tutorial (celular) y el editor de Campos.

/**
 * Cómo se dibuja, en tres pasos que se van tildando a medida que se marcan
 * esquinas: siempre se ve en qué va y qué sigue.
 */
export function ComoSeDibuja({ puntos, movil, que }: { puntos: number; movil: boolean; que: string }) {
  const verbo = movil ? 'Tocá' : 'Hacé clic en'
  const actual = puntos === 0 ? 0 : puntos < 3 ? 1 : 2
  const pasos = [
    `${verbo} una esquina ${que}`,
    puntos > 0 ? `Seguí el alambrado: van ${puntos} ${puntos === 1 ? 'esquina' : 'esquinas'}` : 'Seguí el alambrado, esquina por esquina',
    'Cerrá en el primer punto',
  ]
  return (
    <ol className="flex flex-col gap-1 rounded-[18px] bg-superficie p-2" aria-live="polite">
      {pasos.map((t, i) => {
        const hecho = i < actual
        const ahora = i === actual
        return (
          <li
            key={i}
            className={cn(
              'flex items-center gap-3 rounded-[12px] px-2.5 py-2 text-[15px] transition-colors duration-300',
              ahora ? 'bg-principal-suave font-bold text-texto' : hecho ? 'text-texto-suave' : 'text-texto-suave/70',
            )}
          >
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold transition-colors duration-300',
                hecho ? 'bg-estado-bien text-superficie' : ahora ? 'bg-principal text-principal-texto' : 'border-[1.5px] border-borde',
              )}
            >
              {hecho ? <Icono nombre="Guardar" tamano={16} /> : i + 1}
            </span>
            {t}
          </li>
        )
      })}
    </ol>
  )
}


/** Lo medido contra lo cargado en el alta, de un vistazo: dos números y un veredicto. */
export function Comparacion({
  medido,
  alta,
  comp,
  revisar = 'Revisá que sea tu campo. Si el campo mide eso, corregimos el alta.',
}: {
  medido: number
  alta: number | null
  comp: ReturnType<typeof compararBorde>
  /** Qué hacer si no cuadra. */
  revisar?: string
}) {
  const tono = comp === 'muy-distinto' ? 'problema' : comp === 'coincide' || comp === 'sin-alta' ? 'bien' : 'atencion'
  const veredicto = {
    'sin-alta': 'Borde listo',
    coincide: 'Coincide con el alta',
    adentro: 'Un poco más chico que el alta',
    afuera: 'Un poco más grande que el alta',
    'muy-distinto': 'No cuadra con el alta',
  }[comp]
  return (
    <div className={cn('flex flex-col gap-3 rounded-[20px] border-[1.5px] bg-superficie px-5 py-4',
      tono === 'problema' ? 'border-estado-problema/60' : tono === 'bien' ? 'border-estado-bien' : 'border-estado-atencion/60')}>
      <div className="flex items-end gap-6">
        <div>
          <p className="titulo-display text-[34px] leading-none text-texto">{haTexto(medido)}</p>
          <p className="mt-1 text-[13px] font-semibold text-texto-suave">ha en el mapa</p>
        </div>
        {alta !== null && (
          <div>
            <p className="titulo-display text-[34px] leading-none text-texto-suave">{haTexto(alta)}</p>
            <p className="mt-1 text-[13px] font-semibold text-texto-suave">ha en el alta</p>
          </div>
        )}
      </div>
      <p className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-bold',
        tono === 'problema' ? 'bg-estado-problema-suave text-estado-problema-texto' : tono === 'bien' ? 'bg-estado-bien text-superficie' : 'bg-estado-atencion-suave text-estado-atencion-texto')}>
        <Icono nombre={tono === 'problema' ? 'Ayuda' : 'Guardar'} tamano={16} />
        {veredicto}
      </p>
      {comp === 'muy-distinto' && (
        <p className="text-[14px] text-texto-suave">{revisar}</p>
      )}
    </div>
  )
}

export function Totales({ t }: { t: { hectareas: number; potreros: number; cabezas: number } }) {
  return (
    <div className="flex gap-8">
      {[
        [t.hectareas, 'hectáreas'],
        [t.potreros, 'potreros'],
        [t.cabezas, 'cabezas'],
      ].map(([v, n]) => (
        <div key={n} className="flex flex-col">
          <span className="titulo-display text-[40px] leading-none text-texto">{v}</span>
          <span className="mt-1 text-[13.5px] text-texto-suave">{n}</span>
        </div>
      ))}
    </div>
  )
}

export function Buscador({
  abierto,
  cerca,
  onElegir,
  className = 'max-md:hidden',
}: {
  /** Por defecto se esconde en el celular (en el tutorial va encima del mapa). */
  className?: string
  abierto: boolean
  cerca?: { lat: number; lon: number }
  onElegir: (l: Lugar) => void
}) {
  const [texto, setTexto] = useState('')
  const [lugares, setLugares] = useState<Lugar[]>([])
  const [nada, setNada] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (abierto) input.current?.focus()
  }, [abierto])
  useEffect(() => {
    if (texto.trim().length < 3) return
    let vivo = true
    const t = window.setTimeout(() => {
      buscarLugar(texto, cerca)
        .then((r) => {
          if (!vivo) return
          setLugares(r)
          setNada(r.length === 0)
        })
        .catch(() => vivo && setNada(true))
    }, 350)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [texto, cerca])
  const lista = texto.trim().length < 3 ? [] : lugares
  return (
    <div className={cn('pointer-events-auto relative w-full max-w-[420px]', className)}>
      <label className="flex items-center gap-2 rounded-[14px] bg-superficie px-4 shadow-md">
        <Icono nombre="Buscar" tamano={16} className="text-texto-suave" />
        <input
          ref={input}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscá un camino, paraje o estancia"
          aria-label="Buscá un camino, paraje o estancia"
          className="w-full bg-transparent py-3 text-[15px] text-texto outline-none placeholder:text-texto-suave/70"
        />
      </label>
      {(lista.length > 0 || (nada && texto.trim().length >= 3)) && (
        <ul className="mt-2 overflow-hidden rounded-[14px] bg-superficie py-1.5 shadow-lg">
          {lista.map((l) => (
            <li key={`${l.lat},${l.lon}`}>
              <button
                type="button"
                onClick={() => {
                  onElegir(l)
                  setLugares([])
                  setTexto(l.nombre)
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14.5px] font-semibold text-texto hover:bg-principal-suave"
              >
                <Icono nombre="Ubicación" tamano={16} className="shrink-0 text-principal" />
                <span className="truncate">{l.nombre}</span>
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="px-4 py-2.5 text-[14px] text-texto-suave">No lo encontramos. Probá con otro nombre.</li>}
        </ul>
      )}
    </div>
  )
}

export function Boleta({
  ocupado,
  error,
  onTraer,
  onAMano,
}: {
  ocupado: boolean
  error: string | null
  onTraer: (d: { partido: string; circ: string; parcela: string }) => void
  onAMano: () => void
}) {
  const [partido, setPartido] = useState('')
  const [circ, setCirc] = useState('')
  const [parcela, setParcela] = useState('')
  const listo = partido.trim() && parcela.trim()
  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault()
        if (listo) onTraer({ partido, circ, parcela })
      }}
    >
      <div className="flex flex-col gap-1 rounded-[14px] bg-estado-atencion-suave px-4 py-3">
        <p className="text-[12.5px] font-semibold text-estado-atencion-texto">Impuesto inmobiliario rural, arriba a la izquierda</p>
        <p className="cifra text-[18px] font-bold text-estado-atencion-texto">Partido 027, Circ. II, Parcela 1758A</p>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <CampoTexto etiqueta="Partido" inputMode="numeric" value={partido} placeholder="027" onChange={(e) => setPartido(e.target.value)} />
        <CampoTexto etiqueta="Circunscripción" value={circ} placeholder="II" onChange={(e) => setCirc(e.target.value)} />
        <CampoTexto etiqueta="Parcela" value={parcela} placeholder="1758A" onChange={(e) => setParcela(e.target.value)} />
      </div>
      {error && <Aviso tipo="problema" titulo="No salió el borde">{error}</Aviso>}
      <BotonPrincipal type="submit" icono="Siguiente" cargando={ocupado} disabled={!listo || ocupado}>
        {ocupado ? 'Buscando en el catastro…' : 'Traer el borde'}
      </BotonPrincipal>
      <BotonChico type="button" className="self-start" onClick={onAMano}>
        No encuentro el número: lo marco en el mapa
      </BotonChico>
    </form>
  )
}

