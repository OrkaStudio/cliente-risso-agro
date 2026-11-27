import mapa from '@/assets/tropero/acceso-mapa.webp'
import celu from '@/assets/tropero/acceso-celu.webp'
import grano from '@/assets/tropero/grano.png'

/**
 * El fondo del acceso (Lau, 26/11: «que no quede tan desalineado con la landing»).
 * La aurora, las líneas de potreros y el grano de troppero.com detrás de todo; en la
 * compu, a la derecha, el campo de verdad en el satélite con sus potreros pintados,
 * lo que avisó el encargado marcado en el 7B y el celular cruzando la división.
 * Es decorado: no se lee con lector de pantalla ni se puede tocar.
 */
export function EscenaAcceso() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#fff1da]">
      <Aurora />
      <div className="absolute top-4 right-4 bottom-4 left-1/2 hidden overflow-hidden rounded-[32px] bg-[#2b3424] shadow-[0_30px_70px_-40px_rgb(40_30_10/.7)] [container-type:size] md:block left-[54%]">
        {/* El mapa con su proporción, centrado; el aviso va en % del mapa, así queda sobre el 7B en cualquier pantalla. */}
        <div className="absolute top-1/2 aspect-[1880/2380] -translate-x-1/2 -translate-y-1/2" style={{ height: 'max(108cqh, 140cqw)', left: 'calc(50% + 4cqw)' }}>
          <img src={mapa} alt="" className="foto-llega size-full" />
          <span className="absolute bottom-[36.6%] left-[35.4%] flex items-center gap-1.5 rounded-[12px] bg-[#fff1ec] py-1.5 pr-3 pl-2 text-[12.5px] font-bold whitespace-nowrap text-[#a32d1a] shadow-[0_14px_28px_-12px_rgb(0_0_0/.5)] after:absolute after:-bottom-1.5 after:left-3.5 after:size-3 after:rotate-45 after:rounded-[2px] after:bg-[#fff1ec]">
            <i className="size-2 rounded-full bg-[#c8401a] shadow-[0_0_0_5px_rgb(200_64_26/.2)]" />
            7B: eléctrico cortado
          </span>
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(18_14_8/.72)_0,rgb(18_14_8/.15)_32%,rgb(18_14_8/0)_60%,rgb(18_14_8/.35)_100%)]" />
        <span className="absolute top-[118px] left-10 inline-flex items-center gap-2 rounded-full bg-[rgb(255_250_242/.92)] py-1 pr-3 pl-1 text-[13px] font-semibold text-texto">
          <b className="grid size-[22px] place-items-center rounded-[6px] bg-[#3b7bf0] text-[12px] text-white">B</b>
          La Porteña · 71 ha · 138 cab
        </span>
        <div className="absolute right-7 bottom-7 w-[250px] rounded-[14px_14px_14px_4px] bg-[#dcf8c6] px-3.5 py-2.5 text-[13.5px] leading-snug text-[#2a1a10] shadow-[0_18px_32px_-16px_rgb(40_60_20/.55)]">
          <b className="block text-[12px] text-[#b85c2e]">Encargado</b>
          Se cortó el eléctrico del 7B. Ya lo estamos arreglando.
          <small className="float-right mt-1 ml-2.5 text-[12px] text-[#7a8a70]">9:12</small>
        </div>
      </div>
      {/* El celular cruza la división: el Inicio, para no repetir el mapa. */}
      <div className="absolute top-[40%] left-[calc(54%-120px)] hidden h-[412px] w-[190px] -rotate-[5deg] rounded-[32px] bg-[#1d1410] p-[7px] shadow-[inset_0_0_0_1.5px_rgb(255_255_255/.3),0_50px_90px_-30px_rgb(60_30_5/.6)] min-[1360px]:block">
        <img src={celu} alt="" className="foto-llega h-full w-full rounded-[26px] object-cover object-top" />
      </div>
    </div>
  )
}

/** La aurora de la landing, con las líneas de los potreros y el grano encima. */
function Aurora() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(48%_70%_at_96%_0,#ff9d57_0,transparent_72%),radial-gradient(46%_70%_at_0_100%,#9fd39b_0,transparent_72%),radial-gradient(44%_60%_at_62%_112%,#ffd25e_0,transparent_74%),radial-gradient(36%_46%_at_28%_0,#ffe3b8_0,transparent_75%)]" />
      <svg className="absolute inset-0 size-full" viewBox="0 0 1440 900" preserveAspectRatio="none">
        <g fill="none" stroke="#8a6a4a" strokeOpacity=".15" strokeWidth="1.3" vectorEffect="non-scaling-stroke">
          <path d="M-20 160 L300 80 L620 190 L760 150" />
          <path d="M-20 470 L250 400 L560 510 L760 460" />
          <path d="M-20 740 L360 670 L670 800 L760 780" />
          <path d="M300 80 L250 400 L360 670 L330 920" />
          <path d="M620 190 L560 510 L670 800 L650 920" />
        </g>
      </svg>
      <div className="absolute inset-0 opacity-50 mix-blend-multiply" style={{ backgroundImage: `url(${grano})`, backgroundSize: '160px' }} />
    </>
  )
}

/** El mapa en una franja, arriba del formulario: sólo en el celular, donde no entra la columna. */
export function FranjaMapa() {
  return (
    <div aria-hidden className="mb-6 h-[150px] overflow-hidden rounded-[24px] shadow-[0_20px_40px_-24px_rgb(90_40_10/.6)] md:hidden">
      <img src={mapa} alt="" className="foto-llega size-full object-cover object-[30%_55%]" />
    </div>
  )
}

/** El trazo rojo de la landing debajo de las últimas palabras del título. */
export function ConTrazo({ texto, claro = false }: { texto: string; claro?: boolean }) {
  const limpio = texto.replace(/[.]$/, '')
  const punto = limpio !== texto ? '.' : ''
  const palabras = limpio.split(' ')
  const n = palabras.length >= 3 ? 2 : 1
  const antes = palabras.slice(0, -n).join(' ')
  const marcado = palabras.slice(-n).join(' ')
  return (
    <>
      {antes && `${antes} `}
      <span className="relative whitespace-nowrap">
        {/* El punto adentro, pegado: si queda afuera, los lectores de pantalla leen «Pruebas .». */}
        {marcado}
        {punto}
        <svg viewBox="0 0 200 14" preserveAspectRatio="none" className="absolute -bottom-[0.16em] -left-[2%] h-[0.2em] w-[104%] overflow-visible" aria-hidden>
          <path d="M3 9.5C40 4 92 3.2 130 5.2c24 1.3 44 3.1 67 1.6" fill="none" stroke={claro ? '#f2b36b' : '#c8401a'} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
    </>
  )
}
