import { ElegirCampo } from './elegir-campo'
import { BAJADA, TITULO } from './sistema'

/** El título de cada sección y, debajo, para qué sirve. */
export function Encabezado({ id, titulo, bajada }: { id: string; titulo: string; bajada: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 id={id} className={TITULO}>
        {titulo}
      </h2>
      <p className={BAJADA}>{bajada}</p>
    </div>
  )
}

/** La portada de una sección: su imagen, el campo que se ve (para cambiarlo) y el nombre. */
export function Portada({ id, titulo, imagen, posicion = '50% 60%' }: { id: string; titulo: string; imagen: string; posicion?: string }) {
  return (
    <div className="relative z-10 h-[150px] rounded-[20px]">
      <div className="absolute inset-0 overflow-hidden rounded-[20px] bg-[#e8c77e]">
        <img src={imagen} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: posicion }} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(251_250_246/0.92)_30%,rgb(251_250_246/0.2)_75%,transparent)]" />
      </div>
      <div className="absolute top-3.5 left-3.5 flex flex-col gap-1">
        <ElegirCampo />
        <h1 id={id} className="mt-1.5 px-1 titulo-display text-[30px] text-texto">
          {titulo}
        </h1>
      </div>
    </div>
  )
}
