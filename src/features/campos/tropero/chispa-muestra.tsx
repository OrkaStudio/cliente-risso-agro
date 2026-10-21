// Página interna de desarrollo (/estilo/chispa): las variantes de Chispa una al
// lado de la otra, animadas, sobre el satélite y sobre la tarjeta, para que Lau
// elija. No existe en producción.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/tropero/logo'
import { cn } from '@/lib/utils'
import { Chispa, type Animo, type Variante } from './mascota'

type Estado = Animo | 'habla' | 'vuela'

const VARIANTES: { v: Variante; nombre: string; idea: string }[] = [
  { v: 'terracota', nombre: 'Terracota', idea: 'Esfera lisa, brillo de vidrio y resplandor quieto. Nada titila: la vida la dan los ojos y los movimientos lentos.' },
  { v: 'terracota-oscura', nombre: 'Terracota oscura', idea: 'La misma, un tono más profundo.' },
  { v: 'sage', nombre: 'Referencia (Sage)', idea: 'La del video, en azul, con los mismos gestos.' },
]

const ESTADOS: { e: Estado | 'auto'; texto: string }[] = [
  { e: 'auto', texto: 'Automático' },
  { e: 'normal', texto: 'Quieta' },
  { e: 'habla', texto: 'Habla' },
  { e: 'vuela', texto: 'Vuela' },
  { e: 'piensa', texto: 'Piensa' },
  { e: 'festeja', texto: 'Festeja' },
  { e: 'guina', texto: 'Guiña' },
  { e: 'duerme', texto: 'Duerme' },
]
const RONDA: { e: Estado; ms: number; dice: string }[] = [
  { e: 'normal', ms: 2200, dice: '¡Hola! Te acompaño a armar tu campo.' },
  { e: 'habla', ms: 2600, dice: 'Arrastrá el mapa hasta ver tu campo.' },
  { e: 'vuela', ms: 1200, dice: 'Vamos al siguiente paso.' },
  { e: 'piensa', ms: 2600, dice: 'Buscando la parcela en el catastro…' },
  { e: 'festeja', ms: 2000, dice: '¡Uno menos! Vamos con el que sigue.' },
  { e: 'guina', ms: 1500, dice: '¡Acá estoy!' },
  { e: 'duerme', ms: 2800, dice: '' },
]
const DICE: Partial<Record<Estado, string>> = Object.fromEntries(RONDA.map((r) => [r.e, r.dice]))

// Un pedazo del satélite de Chascomús (Esri, zoom 14), como fondo de verdad.
const TESELAS = [
  [9927, 5552],
  [9927, 5553],
  [9928, 5552],
  [9928, 5553],
]

export function ChispaMuestra() {
  const [elegido, setElegido] = useState<Estado | 'auto'>('auto')
  const [paso, setPaso] = useState(0)
  const [grande, setGrande] = useState(true)
  const [parpadea, setParpadea] = useState(false)

  useEffect(() => {
    if (elegido !== 'auto') return
    const t = setTimeout(() => setPaso((p) => (p + 1) % RONDA.length), RONDA[paso]!.ms)
    return () => clearTimeout(t)
  }, [elegido, paso])
  useEffect(() => {
    const iv = setInterval(() => {
      setParpadea(true)
      setTimeout(() => setParpadea(false), 140)
    }, 3200)
    return () => clearInterval(iv)
  }, [])

  const estado: Estado = elegido === 'auto' ? RONDA[paso]!.e : elegido
  const dice = elegido === 'auto' ? RONDA[paso]!.dice : (DICE[estado] ?? '')

  return (
    <div className="h-full overflow-y-auto bg-fondo p-8 text-texto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <header className="flex flex-wrap items-center gap-4">
          <Logo alto={28} />
          <h1 className="titulo-display text-[28px]">Chispa · ¿cuál es Tropero?</h1>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          {ESTADOS.map(({ e, texto }) => (
            <button
              key={e}
              type="button"
              aria-pressed={elegido === e}
              onClick={() => setElegido(e)}
              className={cn('h-9 rounded-full border-[1.5px] px-3.5 text-[14px] font-bold transition-colors', elegido === e ? 'border-texto bg-texto text-superficie' : 'border-borde bg-superficie hover:border-texto-suave')}
            >
              {texto}
            </button>
          ))}
          <span className="mx-2 h-6 w-px bg-borde" />
          <button type="button" onClick={() => setGrande((g) => !g)} className="h-9 rounded-full border-[1.5px] border-borde bg-superficie px-3.5 text-[14px] font-bold">
            {grande ? 'Ver en tamaño real (76 px)' : 'Ver de cerca (150 px)'}
          </button>
          <span className="text-[13.5px] text-texto-suave">Mové el mouse sobre cada una: te sigue con los ojos.</span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {VARIANTES.map(({ v, nombre, idea }) => (
            <article key={v} className="flex flex-col gap-3 rounded-[22px] border border-borde bg-superficie p-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[18px] font-extrabold">{nombre}</h2>
                <p className="min-h-[60px] text-[13.5px] text-texto-suave">{idea}</p>
              </div>
              <Escena fondo="satelite" variante={v} estado={estado} dice={dice} parpadea={parpadea} tam={grande ? 150 : 76} />
              <Escena fondo="tarjeta" variante={v} estado={estado} dice={dice} parpadea={parpadea} tam={grande ? 150 : 76} />
              <Link to={`/campos?chispa=${v}`} className="inline-flex h-10 items-center justify-center rounded-full bg-principal px-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600">
                Probarla en el tutorial
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function Escena({ fondo, variante, estado, dice, parpadea, tam }: { fondo: 'satelite' | 'tarjeta'; variante: Variante; estado: Estado; dice: string; parpadea: boolean; tam: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mira, setMira] = useState({ x: 0, y: 0 })
  const animo: Animo = estado === 'habla' || estado === 'vuela' ? 'normal' : estado
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        setMira({ x: (e.clientX - (r.left + r.width / 2)) / 120, y: (e.clientY - (r.top + r.height / 2)) / 120 })
      }}
      onMouseLeave={() => setMira({ x: 0, y: 0 })}
      className={cn('relative grid h-[230px] place-items-center overflow-hidden rounded-[16px]', fondo === 'tarjeta' ? 'border border-borde bg-fondo' : 'bg-tinta')}
    >
      {fondo === 'satelite' && (
        <div aria-hidden className="absolute inset-0 grid grid-cols-2 grid-rows-2 opacity-95">
          {TESELAS.map(([y, x]) => (
            <img key={`${y}-${x}`} alt="" src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/14/${y}/${x}`} className="size-full object-cover" />
          ))}
        </div>
      )}
      <div className="relative flex flex-col items-center gap-2">
        <Chispa tam={tam} variante={variante} animo={animo} habla={estado === 'habla'} vuela={estado === 'vuela'} parpadea={parpadea} mira={mira} />
        {dice && <span className="max-w-[230px] rounded-[14px] bg-superficie/95 px-3 py-1.5 text-center text-[13px] font-semibold text-texto shadow-md">{dice}</span>}
      </div>
    </div>
  )
}
