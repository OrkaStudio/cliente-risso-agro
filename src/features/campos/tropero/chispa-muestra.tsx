// Página interna de desarrollo (/estilo/chispa): todos los gestos de Chispa a la
// vez, animados, para que Lau los compare. Vuela de verdad (de un lado al otro),
// festeja y guiña se repiten solos. No existe en producción.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useSpring, useVelocity } from 'framer-motion'
import { Logo } from '@/components/tropero/logo'
import { cn } from '@/lib/utils'
import { Chispa, type Animo } from './mascota'

type Gesto = 'normal' | 'habla' | 'vuela' | 'piensa' | 'festeja' | 'guina' | 'duerme'

const GESTOS: { g: Gesto; nombre: string; que: string }[] = [
  { g: 'normal', nombre: 'Quieta', que: 'Flota, respira, se mece apenas y mira alrededor.' },
  { g: 'habla', nombre: 'Habla', que: 'Asiente mientras la boca acompaña lo que escribe.' },
  { g: 'vuela', nombre: 'Vuela', que: 'Mira a dónde va, toma impulso, se inclina y deja una cola de luz.' },
  { g: 'piensa', nombre: 'Piensa', que: 'Mira arriba buscando, con su nube de «…».' },
  { g: 'festeja', nombre: 'Festeja', que: 'Se agacha, salta estirada, cae y se mece contenta.' },
  { g: 'guina', nombre: 'Guiña', que: 'Ladea la cabeza, cierra un ojo y sonríe de costado.' },
  { g: 'duerme', nombre: 'Duerme', que: 'Se inclina, cierra los ojos y suben las «z».' },
]
const FRASES = ['Arrastrá el mapa hasta ver tu campo.', 'Tocá el potrero que querés dibujar.', '¡Listo! Vamos con el que sigue.']

// Un pedazo del satélite de Chascomús (Esri, zoom 14), como fondo de verdad.
const TESELAS = [
  [9927, 5552],
  [9927, 5553],
  [9928, 5552],
  [9928, 5553],
]

export function ChispaMuestra() {
  const [grande, setGrande] = useState(true)
  const [satelite, setSatelite] = useState(false)
  const [parpadea, setParpadea] = useState(false)
  useEffect(() => {
    const iv = setInterval(() => {
      setParpadea(true)
      setTimeout(() => setParpadea(false), 140)
    }, 3600)
    return () => clearInterval(iv)
  }, [])
  const tam = grande ? 140 : 76

  return (
    <div className="h-full overflow-y-auto bg-fondo p-8 text-texto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <header className="flex flex-wrap items-center gap-4">
          <Logo alto={28} />
          <h1 className="titulo-display text-[28px]">Chispa · sus gestos</h1>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setGrande((g) => !g)} className="h-9 rounded-full border-[1.5px] border-borde bg-superficie px-3.5 text-[14px] font-bold">
            {grande ? 'Ver en tamaño real (76 px)' : 'Ver de cerca (140 px)'}
          </button>
          <button type="button" onClick={() => setSatelite((s) => !s)} className="h-9 rounded-full border-[1.5px] border-borde bg-superficie px-3.5 text-[14px] font-bold">
            {satelite ? 'Fondo claro' : 'Fondo satélite'}
          </button>
          <Link to="/campos" className="inline-flex h-9 items-center rounded-full bg-principal px-4 text-[14px] font-bold text-principal-texto hover:bg-terracota-600">
            Verla en el tutorial
          </Link>
          <span className="text-[13.5px] text-texto-suave">Mové el mouse sobre cada una: te sigue con los ojos.</span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {GESTOS.map(({ g, nombre, que }) => (
            <article key={g} className="flex flex-col gap-3 rounded-[22px] border border-borde bg-superficie p-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-[18px] font-extrabold">{nombre}</h2>
                <p className="text-[13.5px] text-texto-suave">{que}</p>
              </div>
              <Escena gesto={g} satelite={satelite} parpadea={parpadea} tam={tam} />
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function Escena({ gesto, satelite, parpadea, tam }: { gesto: Gesto; satelite: boolean; parpadea: boolean; tam: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mira, setMira] = useState({ x: 0, y: 0 })
  const [mouse, setMouse] = useState(false)

  // Festeja y guiña se repiten solos (vuelven a quieta un rato y arrancan de nuevo).
  const [enGesto, setEnGesto] = useState(true)
  useEffect(() => {
    if (gesto !== 'festeja' && gesto !== 'guina') return
    const t = setTimeout(() => setEnGesto((e) => !e), enGesto ? 3400 : 1400)
    return () => clearTimeout(t)
  }, [gesto, enGesto])

  // Habla: escribe una frase, se calla un momento y sigue con otra.
  const [frase, setFrase] = useState(0)
  const [habla, setHabla] = useState(true)
  useEffect(() => {
    if (gesto !== 'habla') return
    const t = setTimeout(
      () => {
        if (habla) setHabla(false)
        else {
          setFrase((f) => (f + 1) % FRASES.length)
          setHabla(true)
        }
      },
      habla ? FRASES[frase]!.length * 60 + 900 : 1300,
    )
    return () => clearTimeout(t)
  }, [gesto, habla, frase])

  const animo: Animo = gesto === 'habla' || gesto === 'vuela' ? 'normal' : (gesto === 'festeja' || gesto === 'guina') && !enGesto ? 'normal' : gesto
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        setMouse(true)
        setMira({ x: (e.clientX - (r.left + r.width / 2)) / 120, y: (e.clientY - (r.top + r.height / 2)) / 120 })
      }}
      onMouseLeave={() => {
        setMouse(false)
        setMira({ x: 0, y: 0 })
      }}
      className={cn('relative grid h-[260px] place-items-center overflow-hidden rounded-[16px]', satelite ? 'bg-tinta' : 'border border-borde bg-fondo')}
    >
      {satelite && (
        <div aria-hidden className="absolute inset-0 grid grid-cols-2 grid-rows-2 opacity-95">
          {TESELAS.map(([y, x]) => (
            <img key={`${y}-${x}`} alt="" src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/14/${y}/${x}`} className="size-full object-cover" />
          ))}
        </div>
      )}
      {gesto === 'vuela' ? (
        <Viajera tam={tam} parpadea={parpadea} />
      ) : (
        <div className="relative flex flex-col items-center gap-3">
          <Chispa tam={tam} animo={animo} habla={gesto === 'habla' && habla} parpadea={parpadea} mira={mouse ? mira : { x: 0, y: 0 }} />
          {gesto === 'habla' && <span className="h-[34px] max-w-[260px] rounded-[14px] bg-superficie/95 px-3 py-1.5 text-center text-[13px] font-semibold text-texto shadow-md">{habla ? FRASES[frase] : '…'}</span>}
        </div>
      )}
    </div>
  )
}

/** Vuela de un costado al otro con el mismo resorte del tutorial: mira, toma impulso y sale. */
function Viajera({ tam, parpadea }: { tam: number; parpadea: boolean }) {
  const recorrido = tam * 0.85
  const meta = useMotionValue(-recorrido)
  const x = useSpring(meta, { stiffness: 34, damping: 12.5, mass: 1.15, restDelta: 0.2 })
  const vx = useVelocity(x)
  const vy = useMotionValue(0)
  const prepara = useMotionValue(0)
  const [hacia, setHacia] = useState(1)
  useEffect(() => {
    let lado = 1
    let t1: ReturnType<typeof setTimeout>
    let t2: ReturnType<typeof setTimeout>
    const ciclo = () => {
      setHacia(lado)
      prepara.set(1)
      t1 = setTimeout(() => {
        prepara.set(0)
        meta.set(lado * recorrido)
        lado = -lado
        t2 = setTimeout(ciclo, 2300)
      }, 300)
    }
    t2 = setTimeout(ciclo, 900)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [meta, prepara, recorrido])
  return (
    <motion.div style={{ x }}>
      <Chispa tam={tam} parpadea={parpadea} mira={{ x: hacia, y: 0 }} viaje={{ vx, vy, prepara }} />
    </motion.div>
  )
}
