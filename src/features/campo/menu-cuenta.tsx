import { useState } from 'react'
import { Icono } from '@/components/tropero/icono'
import { useAuth } from '@/features/auth/auth-context'
import { ListaCambiarCuenta } from '@/features/empresa/elegir-cuenta'
import { useCuentas } from '@/features/empresa/use-empresa'
import { cn } from '@/lib/utils'

/** El avatar del celular: cambiar de cuenta y salir (con confirmación de dos toques). Arriba a la derecha en Hoy y en Plata. */
export function MenuCuenta({ inicial }: { inicial: string }) {
  const { signOut } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [salir, setSalir] = useState(false)
  // Con varias cuentas (un veterinario que atiende varios campos), el cambio vive acá.
  const varias = (useCuentas().data?.cuentas.length ?? 0) > 1
  const [cuentas, setCuentas] = useState(false)
  return (
    <div className="relative ml-auto">
      <button
        type="button"
        aria-label="Tu cuenta"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="grid size-10 place-items-center rounded-full bg-acento font-heading text-[16px] font-extrabold text-acento-texto"
      >
        {inicial.toUpperCase()}
      </button>
      {abierto && (
        <ul className="absolute top-12 right-0 z-20 min-w-[230px] overflow-hidden rounded-[14px] bg-superficie py-1.5 text-texto shadow-lg">
          {varias && (
            <li className="border-b border-borde">
              {cuentas ? (
                <ListaCambiarCuenta onElegido={() => setCuentas(false)} />
              ) : (
                <button type="button" onClick={() => setCuentas(true)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px] font-semibold">
                  <Icono nombre="Usuario" tamano={16} /> Cambiar de cuenta
                </button>
              )}
            </li>
          )}
          <li>
            <button
              type="button"
              onClick={() => (salir ? void signOut() : setSalir(true))}
              className={cn('flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px]', salir && 'bg-estado-problema-suave font-bold text-estado-problema-texto')}
            >
              <Icono nombre="Salir" tamano={16} /> {salir ? '¿Seguro? Tocá de nuevo' : 'Cerrar sesión'}
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
