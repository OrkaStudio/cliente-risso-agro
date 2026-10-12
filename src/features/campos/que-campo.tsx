import { Icono } from '@/components/tropero/icono'
import { cn } from '@/lib/utils'
import type { CampoElegible } from './campo-elegido'

/**
 * Qué campo estás mirando: todo el Inicio (hacienda, avisos, plata, recorrida y
 * clima) es de ese campo, o de todos juntos. Con un solo campo, sólo lo nombra.
 */
export function QueCampo({ campos, elegido, elegir }: { campos: CampoElegible[]; elegido: CampoElegible | null; elegir: (id: string | null) => void }) {
  if (campos.length === 0) return null
  const letra = (c: CampoElegible) => (
    <span className="grid size-[20px] shrink-0 place-items-center rounded-[6px] text-[10.5px] font-extrabold text-white" style={{ background: c.color }}>
      {c.letra}
    </span>
  )
  const opcion = (activo: boolean) =>
    cn(
      'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-bold whitespace-nowrap transition-colors',
      activo ? 'bg-tinta text-superficie' : 'text-texto hover:bg-superficie-hundida',
    )
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <span className="rounded-full bg-superficie/90 px-2 text-[12.5px] font-semibold text-texto-suave">Estás viendo</span>
      {campos.length === 1 ? (
        <span className="inline-flex h-11 items-center gap-2 rounded-full bg-superficie px-4 text-[15px] font-bold text-texto shadow-[0_2px_10px_rgba(19,27,22,0.12)]">
          {letra(campos[0]!)} {campos[0]!.nombre}
        </span>
      ) : campos.length <= 4 ? (
        <div role="radiogroup" aria-label="Qué campo estás viendo" className="flex gap-1 rounded-full bg-superficie p-1 shadow-[0_2px_10px_rgba(19,27,22,0.12)]">
          <button type="button" role="radio" aria-checked={!elegido} onClick={() => elegir(null)} className={opcion(!elegido)}>
            Todos
          </button>
          {campos.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={elegido?.id === c.id} onClick={() => elegir(c.id)} className={opcion(elegido?.id === c.id)}>
              {letra(c)} {c.nombre}
            </button>
          ))}
        </div>
      ) : (
        <label className="relative inline-flex h-11 items-center rounded-full bg-superficie shadow-[0_2px_10px_rgba(19,27,22,0.12)]">
          <span className="sr-only">Qué campo estás viendo</span>
          <select
            value={elegido?.id ?? ''}
            onChange={(e) => elegir(e.target.value || null)}
            className="h-full appearance-none rounded-full bg-transparent pr-10 pl-4 text-[15px] font-bold text-texto"
          >
            <option value="">Todos tus campos</option>
            {campos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.letra} · {c.nombre}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 rotate-90 text-texto-suave">
            <Icono nombre="Siguiente" tamano={16} />
          </span>
        </label>
      )}
    </div>
  )
}
