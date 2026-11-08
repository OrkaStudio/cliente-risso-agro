import { Icono } from '@/components/tropero/icono'
import type { CampoElegible } from '@/features/campos/campo-elegido'

/**
 * Qué campo se está viendo, en la cabecera de cada pantalla: sólo lo dice, no
 * se elige acá. El campo se elige en la barra izquierda (Lau, 29/10).
 */
export function CampoVisto({ campos, elegido }: { campos: CampoElegible[]; elegido: CampoElegible | null }) {
  if (campos.length === 0) return null
  return (
    // Sólo texto (Lau, 08/11: sin cápsulas): lo que se ve y, en chico, que se cambia en la barra.
    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
      <span className="text-[12.5px] font-semibold tracking-[0.04em] text-texto-suave uppercase">Estás viendo</span>
      <span className="inline-flex items-center gap-2 text-[16px] font-bold whitespace-nowrap text-texto">
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
