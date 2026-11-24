import { Icono } from '@/components/tropero/icono'
import type { Vencimiento } from '@/features/agenda/api'
import { cn } from '@/lib/utils'
import { claseDe, cuotaDe, datosDe, estadoTexto, fechaDe, medioDe, pactadoDe, tituloDe } from './agenda'
import { Autor } from '@/features/analitica/tropero/revisar-movimientos'
import { soloNombre } from '@/features/analitica/tropero/plata'
import { useNombres } from '@/features/empresa/use-nombres'
import { usePermiso } from '@/features/empresa/use-permiso'

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

/** El detalle en filas (para el mini popup del calendario y el panel). */
export function Detalle({ v, className }: { v: Vencimiento; className?: string }) {
  const filas = datosDe(v)
  if (!filas.length) return null
  return (
    <dl className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-[14px]', className)}>
      {filas.map(([k, val]) => (
        <div key={k} className="contents">
          <dt className="text-texto-suave">{k}</dt>
          <dd className="truncate text-right font-semibold text-texto">{val}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Un pago o cobro, con la misma fila que Movimientos (Lau, 24/11): a la izquierda si pagás o
 * cobrás; qué es; debajo, en gris y en una línea, cuándo vence, a quién, de qué campo y quién
 * lo cargó; el monto, y «Ya lo pagué» chico a la derecha. El día va como separador arriba.
 */
export function Cosa({ v, hoy, onAbrir, compacto = false }: { v: Vencimiento; hoy: string; onAbrir: (v: Vencimiento) => void; compacto?: boolean }) {
  const cobro = v.tipo === 'ingreso'
  const clase = claseDe(v, hoy)
  const hecho = clase === 'hecho'
  const estado = estadoTexto(v, hoy)
  const datos = [v.contraparte ? `${cobro ? 'De' : 'A'} ${v.contraparte}` : v.categoria, v.campo, cuotaDe(v), pactadoDe(v), medioDe(v)].filter(Boolean) as string[]
  // Quién lo cargó (si no fue uno) y si es nuevo; marcarlo pagado es de quien carga la plata (permisos, 13/11).
  const { quienCargo } = useNombres()
  const { carga } = usePermiso('plata')
  const autor = quienCargo(v.createdBy, v.canal)
  const nuevo = carga && v.nuevo
  return (
    <li>
      <button type="button" onClick={() => onAbrir(v)} className={cn('group relative flex w-full items-center gap-3.5 py-3.5 text-left transition-colors hover:bg-superficie-hundida/40', compacto ? 'px-2' : 'px-5')}>
        {nuevo && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-principal" />}
        <span aria-hidden className={cn('grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-bold', hecho ? 'bg-superficie-hundida text-texto-suave/60' : cobro ? 'bg-estado-bien-suave text-estado-bien-texto' : clase === 'vencido' ? 'bg-estado-problema-suave text-estado-problema-texto' : 'bg-superficie-hundida text-texto-suave')}>
          {hecho ? <Icono nombre="Guardar" tamano={16} /> : cobro ? '+' : '−'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn('truncate text-[15px] font-semibold', hecho ? 'text-texto-suave' : 'text-texto')}>
              <span className="sr-only">{cobro ? 'Cobrás' : 'Pagás'}: </span>
              {tituloDe(v)}
            </span>
            {nuevo && <span className="shrink-0 rounded-full bg-principal-suave px-1.5 py-px text-[11px] font-bold text-principal">Nuevo</span>}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-texto-suave">
            <span className="truncate">
              {/* Lo pagado ya lo dice la derecha; acá, cuándo vence (en rojo si ya venció). */}
              {!hecho && <span className={cn(clase === 'vencido' ? 'font-semibold text-estado-problema-texto' : fechaDe(v) === hoy && 'font-semibold text-principal')}>{estado.texto}</span>}
              {!hecho && datos.length > 0 && ' · '}
              {datos.join(' · ')}
            </span>
            {autor && (
              <>
                <span aria-hidden>·</span>
                <Autor nombre={soloNombre(autor)} whatsapp={v.canal === 'whatsapp'} />
              </>
            )}
          </span>
        </span>
        <span className={cn('flex shrink-0 items-center gap-3', compacto && 'flex-col items-end gap-1')}>
          <span className={cn('t-cifra shrink-0 text-right text-[16px]', hecho ? 'text-texto-suave' : cobro ? 'text-estado-bien-texto' : 'text-texto')}>
            {cobro ? '+' : '−'}
            {pesos(v.monto)}
          </span>
          {hecho ? (
            <span className="inline-flex h-8 w-[112px] shrink-0 items-center justify-center text-[13px] font-semibold text-texto-suave max-sm:hidden">{cobro ? 'Cobrado' : 'Pagado'}</span>
          ) : !carga ? null : (
            <span className="inline-flex h-8 w-[112px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-texto shadow-[inset_0_0_0_1.5px_var(--borde)] transition-colors group-hover:bg-principal group-hover:text-principal-texto group-hover:shadow-none">
              {cobro ? 'Ya lo cobré' : 'Ya lo pagué'}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
