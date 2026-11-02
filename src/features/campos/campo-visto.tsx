import { Icono } from '@/components/tropero/icono'
import type { CampoElegible } from '@/features/campos/campo-elegido'

/**
 * Qué campo se está viendo, en la cabecera de cada pantalla: sólo lo dice, no
 * se elige acá. El campo se elige en la barra izquierda (Lau, 29/10).
 */
export function CampoVisto({ campos, elegido }: { campos: CampoElegible[]; elegido: CampoElegible | null }) {
  if (campos.length === 0) return null
  return (
    <div className="flex shrink-0 flex-col items-start gap-1.5">
      <span className="rounded-full bg-superficie/90 px-2 text-[12.5px] font-semibold text-texto-suave">Estás viendo</span>
      <span className="inline-flex h-11 items-center gap-2 rounded-full bg-superficie px-4 text-[15px] font-bold whitespace-nowrap text-texto shadow-[0_2px_10px_rgba(19,27,22,0.12)]">
        {elegido ? (
          <span className="grid size-[20px] shrink-0 place-items-center rounded-[6px] text-[10.5px] font-extrabold text-white" style={{ background: elegido.color }}>
            {elegido.letra}
          </span>
        ) : (
          <Icono nombre="Campos" tamano={16} className="text-texto-suave" />
        )}
        {elegido ? elegido.nombre : 'Todos tus campos'}
      </span>
    </div>
  )
}
