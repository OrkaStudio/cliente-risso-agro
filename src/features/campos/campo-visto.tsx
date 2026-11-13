import { Icono } from '@/components/tropero/icono'
import type { CampoElegible } from '@/features/campos/campo-elegido'
import { useQuienMira } from '@/features/empresa/use-quien-mira'

/**
 * Qué campo se está viendo, en la cabecera de cada pantalla: sólo lo dice, no
 * se elige acá. El campo se elige en la barra izquierda (Lau, 29/10).
 */
export function CampoVisto({ campos, elegido }: { campos: CampoElegible[]; elegido: CampoElegible | null }) {
  const quien = useQuienMira()
  if (campos.length === 0) return null
  return (
    // Una línea chica arriba del título, del lado del texto: se lee siempre (Lau, 08/11).
    <p className="flex items-center gap-2 text-[14px] font-semibold text-texto-suave">
      Estás viendo
      {elegido ? (
        <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] text-[10px] font-extrabold text-white" style={{ background: elegido.color }}>
          {elegido.letra}
        </span>
      ) : (
        <Icono nombre="Campos" tamano={16} className="text-texto-suave" />
      )}
      <b className="text-texto">{elegido ? elegido.nombre : quien.todosLosCampos}</b>
    </p>
  )
}
