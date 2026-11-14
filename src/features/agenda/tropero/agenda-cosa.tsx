import { Icono } from '@/components/tropero/icono'
import type { Vencimiento } from '@/features/agenda/api'
import { cn } from '@/lib/utils'
import { claseDe, cuotaDe, datosDe, estadoTexto, fechaDe, medioDe, pactadoDe, tituloDe } from './agenda'
import { useNombres } from '@/features/empresa/use-nombres'
import { usePermiso } from '@/features/empresa/use-permiso'

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const diaSemana = (f: string) => mayuscula(new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''))

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

/** Un pago o cobro, en una fila como las de Plata: el día, qué es, sus datos en gris, el monto y qué hacer. */
export function Cosa({ v, hoy, onAbrir, compacto = false }: { v: Vencimiento; hoy: string; onAbrir: (v: Vencimiento) => void; compacto?: boolean }) {
  const cobro = v.tipo === 'ingreso'
  const clase = claseDe(v, hoy)
  const hecho = clase === 'hecho'
  const f = fechaDe(v)
  const estado = estadoTexto(v, hoy)
  const datos = [v.contraparte ? `${cobro ? 'De' : 'A'} ${v.contraparte}` : v.categoria, v.campo, cuotaDe(v), pactadoDe(v), medioDe(v)].filter(Boolean) as string[]
  // Quién lo cargó (si no fue uno) y si es nuevo; marcarlo pagado es de quien carga la plata (permisos, 13/11).
  const { quienCargo } = useNombres()
  const { carga } = usePermiso('plata')
  const autor = quienCargo(v.createdBy, v.canal)
  return (
    <li>
      <button type="button" onClick={() => onAbrir(v)} className="group flex w-full items-center gap-4 rounded-[14px] px-3 py-3.5 text-left transition-colors hover:bg-superficie-hundida/60">
        <span className="w-10 shrink-0 text-center">
          <span className={cn('block text-[12.5px] font-semibold', f === hoy ? 'text-principal' : 'text-texto-suave')}>{f === hoy ? 'Hoy' : diaSemana(f)}</span>
          <span className={cn('t-cifra block', f === hoy ? 'text-principal' : 'text-texto')}>{Number(f.slice(8))}</span>
        </span>
        <span aria-hidden className={cn('h-10 w-1 shrink-0 rounded-full', hecho ? 'bg-neutro-200' : cobro ? 'bg-estado-bien' : 'bg-estado-problema/80')} />
        <span className="min-w-0 flex-1">
          <span className={cn('flex items-center gap-2 truncate text-[16.5px] font-semibold', hecho ? 'text-texto-suave' : 'text-texto')}>
            {carga && v.nuevo && <span className="shrink-0 rounded-full bg-principal px-2 py-0.5 text-[12px] font-bold text-principal-texto">Nuevo</span>}
            <span className="truncate">{cobro ? 'Cobrás' : 'Pagás'}: {tituloDe(v)}</span>
          </span>
          <span className="block truncate text-[14.5px] text-texto-suave">
            <span className={cn(clase === 'vencido' && 'font-semibold text-estado-problema-texto')}>{estado.texto}</span>
            {datos.length > 0 && ` · ${datos.join(' · ')}`}
          </span>
          {autor && <span className="block truncate text-[13.5px] font-semibold text-acento-texto">{autor}</span>}
        </span>
        <span className={cn('flex shrink-0 items-center gap-5', compacto && 'flex-col items-end gap-1.5')}>
          <span className={cn('t-cifra shrink-0 text-right', hecho ? 'text-texto-suave' : cobro ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
            {cobro ? '+' : '−'}
            {pesos(v.monto)}
          </span>
          {hecho ? (
            <span className="inline-flex h-9 w-[124px] shrink-0 items-center justify-center gap-1.5 text-[14px] font-semibold text-texto-suave">
              <Icono nombre="Guardar" tamano={16} /> {cobro ? 'Cobrado' : 'Pagado'}
            </span>
          ) : !carga ? null : (
            <span className="inline-flex h-9 w-[124px] shrink-0 items-center justify-center rounded-full border border-principal/60 text-[14px] font-semibold text-principal transition-colors group-hover:border-principal group-hover:bg-principal group-hover:text-principal-texto">
              {cobro ? 'Ya lo cobré' : 'Ya lo pagué'}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
