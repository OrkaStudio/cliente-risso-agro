import { useState } from 'react'
import { Icono } from '@/components/tropero/icono'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { cn } from '@/lib/utils'

/**
 * Qué campo se está viendo, y para cambiarlo (Lau, 17/11): va en la portada de
 * Hoy y de Plata, así el logo de arriba tiene lugar. El mismo campo para las
 * dos (y para el clima de Hoy).
 */
export function ElegirCampo() {
  const inicio = useCampoElegido()
  const clima = useCampoClima()
  const [abierto, setAbierto] = useState(false)
  const campo = inicio.elegido
  const varios = inicio.campos.length > 1
  if (inicio.campos.length === 0) return null
  const elegir = (id: string | null) => {
    inicio.elegir(id)
    if (id) clima.elegir(id)
    setAbierto(false)
  }
  return (
    <div className="relative self-start">
      <button
        type="button"
        onClick={() => varios && setAbierto((x) => !x)}
        aria-expanded={varios ? abierto : undefined}
        aria-label={`Estás viendo ${campo?.nombre ?? 'todos los campos'}${varios ? '. Cambiar' : ''}`}
        className="flex h-9 max-w-[240px] items-center gap-1.5 rounded-full bg-superficie/92 pr-3 pl-1 text-[13.5px] font-bold text-texto backdrop-blur-md"
      >
        {campo ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: campo.color }}>
            {campo.letra}
          </span>
        ) : (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-superficie-hundida text-texto-suave">
            <Icono nombre="Campos" tamano={16} />
          </span>
        )}
        <span className="truncate">{campo?.nombre ?? 'Todos los campos'}</span>
        {varios && <Icono nombre="Desplegar" tamano={16} className={cn('shrink-0 transition-transform', abierto && 'rotate-180')} />}
      </button>
      {abierto && (
        <ul className="absolute top-11 left-0 z-30 min-w-[240px] overflow-hidden rounded-[18px] bg-superficie py-1.5 text-texto shadow-[0_16px_40px_rgba(19,27,22,0.24)]">
          {[null, ...inicio.campos].map((c) => (
            <li key={c?.id ?? 'todos'}>
              <button type="button" onClick={() => elegir(c?.id ?? null)} className={cn('flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px]', (c?.id ?? null) === (campo?.id ?? null) && 'font-bold')}>
                {c ? (
                  <span className="grid size-6 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: c.color }}>
                    {c.letra}
                  </span>
                ) : (
                  <span className="grid size-6 place-items-center text-texto-suave">
                    <Icono nombre="Campos" tamano={16} />
                  </span>
                )}
                {c?.nombre ?? 'Todos los campos'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
