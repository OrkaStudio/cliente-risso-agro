import { Tooltip } from '@base-ui/react/tooltip'
import { useMemo, useState } from 'react'
import { Icono } from '@/components/tropero/icono'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import type { Vencimiento } from '@/features/agenda/api'
import { fmtCompact } from '@/features/analitica/compute'
import { AnotarPlata } from '@/features/analitica/tropero/anotar-plata'
import { cn } from '@/lib/utils'
import { fechaDe, mesVecino, nombreMes, pendiente, porDia, semanasDelMes, tituloDe } from './agenda'
import { type Clase, PILDORA, claseDe, estadoTexto } from './agenda'
import { Cosa, Detalle } from './agenda-cosa'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const diaLargo = (f: string) => mayuscula(new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const POR_DIA = 3

/** Cómo se ve cada cosa: rojo lo que debés (fuerte si ya venció), verde lo que entra, gris lo resuelto. */
const CHIP: Record<Clase, { caja: string; barra: string; monto: string; nombre: string }> = {
  paga: { caja: 'bg-estado-problema-suave/75 hover:bg-estado-problema-suave', barra: 'bg-estado-problema', monto: 'text-estado-problema-texto', nombre: 'text-texto' },
  vencido: { caja: 'bg-estado-problema hover:bg-estado-problema-texto', barra: 'bg-superficie/70', monto: 'text-superficie', nombre: 'text-superficie' },
  cobra: { caja: 'bg-estado-bien-suave/80 hover:bg-estado-bien-suave', barra: 'bg-estado-bien', monto: 'text-estado-bien-texto', nombre: 'text-texto' },
  hecho: { caja: 'bg-superficie-hundida/80 hover:bg-superficie-hundida', barra: 'bg-neutro-300', monto: 'text-texto-suave', nombre: 'text-texto-suave' },
}
const verboDe = (v: Vencimiento, c: Clase) => (c === 'hecho' ? (v.tipo === 'ingreso' ? 'Cobrado' : 'Pagado') : c === 'vencido' ? 'Venció' : v.tipo === 'ingreso' ? 'Cobrás' : 'Pagás')

/**
 * El calendario de la Agenda (Lau, 05/11: «lo más importante es el calendario»).
 * Arriba, cuánto falta pagar (en rojo) y cobrar en el mes. Cada cosa es un botón
 * con el monto y el nombre; al pasar el mouse muestra su detalle y al tocarla
 * abre «¿Lo pagaste?». Tocar el número del día abre ese día entero.
 */
export function AgendaCalendario({ items, hoy, empresaId, campoId, onAbrir }: { items: Vencimiento[]; hoy: string; empresaId: string; campoId?: string; onAbrir: (v: Vencimiento) => void }) {
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [dia, setDia] = useState<string | null>(null)
  const [ultimoDia, setUltimoDia] = useState<string | null>(null)
  if (dia && dia !== ultimoDia) setUltimoDia(dia)
  const dias = useMemo(() => porDia(items, hoy), [items, hoy])
  const delMes = [...dias.values()].filter((d) => d.fecha.startsWith(mes)).flatMap((d) => d.items)
  const pagos = delMes.filter((v) => pendiente(v) && v.tipo === 'gasto')
  const cobros = delMes.filter((v) => pendiente(v) && v.tipo === 'ingreso')
  const pagados = delMes.filter((v) => !pendiente(v) && v.tipo === 'gasto')
  const vencidosMes = pagos.filter((v) => fechaDe(v) < hoy).length
  const suma = (vs: Vencimiento[]) => vs.reduce((s, v) => s + v.monto, 0)
  const cuantosEn = (ym: string) => items.filter((v) => pendiente(v) && v.fechaVencimiento!.startsWith(ym)).length
  const siguiente = mesVecino(mes, 1)
  const anterior = mesVecino(mes, -1)
  const verDia = ultimoDia ? (dias.get(ultimoDia)?.items ?? []) : []
  const semanas = semanasDelMes(mes)

  return (
    <section aria-label={`Calendario de ${nombreMes(mes)}`} className="rounded-[28px] border border-borde bg-superficie shadow-[0_1px_2px_rgba(19,27,22,0.04),0_12px_32px_-18px_rgba(19,27,22,0.18)]">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <h2 className="titulo-display text-[32px] leading-none text-texto">
            {mayuscula(nombreMes(mes))}
            {mes.slice(0, 4) !== hoy.slice(0, 4) ? ` ${mes.slice(0, 4)}` : ''}
          </h2>
          {mes !== hoy.slice(0, 7) && (
            <button type="button" onClick={() => setMes(hoy.slice(0, 7))} className="h-9 rounded-full bg-tinta px-3.5 text-[14px] font-bold text-superficie hover:bg-neutro-800">
              Volver a hoy
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-full bg-superficie-hundida p-1">
          <button type="button" onClick={() => setMes(anterior)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14.5px] font-bold text-texto hover:bg-superficie">
            <Icono nombre="Atrás" tamano={16} /> {mayuscula(nombreMes(anterior))}
          </button>
          <span aria-hidden className="h-5 w-px bg-borde" />
          <button type="button" onClick={() => setMes(siguiente)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14.5px] font-bold text-texto hover:bg-superficie">
            {mayuscula(nombreMes(siguiente))}
            {cuantosEn(siguiente) > 0 && <span className="rounded-full bg-principal px-2 py-0.5 text-[12.5px] text-principal-texto">{cuantosEn(siguiente)} por resolver</span>}
            <Icono nombre="Siguiente" tamano={16} />
          </button>
        </div>
      </header>

      {/* El mes en tres números: lo que debés (rojo), lo que entra (verde) y lo ya pagado (gris). */}
      <div className="grid gap-3 px-6 pb-6 sm:grid-cols-3">
        <Numero titulo="Te falta pagar" monto={suma(pagos)} tono="problema" detalle={pagos.length ? `${pagos.length} ${pagos.length === 1 ? 'pago' : 'pagos'}${vencidosMes ? ` · ${vencidosMes} ${vencidosMes === 1 ? 'vencido' : 'vencidos'}` : ''}` : 'Nada por pagar'} alerta={vencidosMes > 0} />
        <Numero titulo="Te falta cobrar" monto={suma(cobros)} tono="bien" detalle={cobros.length ? `${cobros.length} ${cobros.length === 1 ? 'cobro' : 'cobros'}` : 'Nada por cobrar'} />
        <Numero titulo="Ya pagaste" monto={suma(pagados)} tono="neutro" detalle={pagados.length ? `${pagados.length} ${pagados.length === 1 ? 'pago' : 'pagos'} de ${nombreMes(mes)}` : 'Todavía nada'} />
      </div>

      <div className="grid grid-cols-7 border-y border-borde bg-superficie-hundida/60">
        {DIAS.map((d) => (
          <span key={d} className="py-2.5 text-center text-[13px] font-bold tracking-[0.04em] text-texto-suave uppercase">
            <span className="hidden 2xl:inline">{d}</span>
            <span className="2xl:hidden">{d.slice(0, 3)}</span>
          </span>
        ))}
      </div>
      <Tooltip.Provider delay={150} closeDelay={60}>
        <div className="grid grid-cols-7 overflow-hidden rounded-b-[28px]">
          {semanas.flat().map((f, i) => {
            const ultimaFila = i >= (semanas.length - 1) * 7
            const borde = cn(!ultimaFila && 'border-b', i % 7 !== 0 && 'border-l', 'border-borde/70')
            if (f.slice(0, 7) !== mes) return <div key={f} aria-hidden className={cn('min-h-[128px]', borde)} />
            const vs = dias.get(f)?.items ?? []
            const esHoy = f === hoy
            return (
              <div key={f} className={cn('flex min-h-[128px] min-w-0 flex-col gap-1.5 p-2', borde, esHoy && 'bg-trigo-50')}>
                <button type="button" onClick={() => setDia(f)} aria-label={`Ver el ${diaLargo(f)}: ${vs.length ? `${vs.length} ${vs.length === 1 ? 'cosa' : 'cosas'}` : 'nada'}`} className="group/num flex flex-col items-center self-center rounded-[12px] px-2 pt-0.5 pb-1">
                  <span className={cn('cifra grid size-9 place-items-center rounded-full text-[17px] leading-none font-bold transition-colors', esHoy ? 'bg-principal text-principal-texto' : f < hoy ? 'text-texto-suave group-hover/num:bg-superficie-hundida' : 'text-texto group-hover/num:bg-superficie-hundida')}>
                    {Number(f.slice(8))}
                  </span>
                  {esHoy && <span className="mt-0.5 text-[11.5px] font-bold tracking-[0.06em] text-principal uppercase">Hoy</span>}
                </button>
                {vs.slice(0, vs.length > POR_DIA ? POR_DIA - 1 : POR_DIA).map((v) => (
                  <Chip key={v.id} v={v} hoy={hoy} onAbrir={onAbrir} />
                ))}
                {vs.length > POR_DIA && (
                  <button type="button" onClick={() => setDia(f)} className="rounded-[10px] border-[1.5px] border-dashed border-borde py-1.5 text-[13.5px] font-bold text-texto hover:border-principal hover:text-principal">
                    Ver las {vs.length}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Tooltip.Provider>

      {/* Un día entero, en el panel lateral: cada cosa con todo y su botón. */}
      <PanelLateral
        abierto={!!dia}
        onCerrar={() => setDia(null)}
        titulo={ultimoDia ? `${diaLargo(ultimoDia)}${ultimoDia === hoy ? ', hoy' : ''}` : ''}
        bajada={verDia.length ? `${verDia.length === 1 ? 'Una cosa' : `${verDia.length} cosas`} este día. Tocá una para marcarla o ver su detalle.` : 'No hay nada este día.'}
        ancho
        pie={
          ultimoDia && ultimoDia >= hoy && empresaId ? (
            <AnotarPlata
              empresaId={empresaId}
              campoInicial={campoId}
              vence
              venceInicial={ultimoDia}
              renderTrigger={(abrir) => (
                <button type="button" onClick={() => abrir()} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-principal text-[15.5px] font-bold text-principal hover:bg-principal-suave">
                  <Icono nombre="Agregar" tamano={16} />
                  Anotar algo para este día
                </button>
              )}
            />
          ) : undefined
        }
      >
        <ul className="flex flex-col divide-y divide-borde/70">
          {verDia.map((v) => (
            <Cosa
              key={v.id}
              v={v}
              hoy={hoy}
              onAbrir={(x) => {
                setDia(null)
                onAbrir(x)
              }}
              compacto
            />
          ))}
        </ul>
      </PanelLateral>
    </section>
  )
}

function Numero({ titulo, monto, tono, detalle, alerta = false }: { titulo: string; monto: number; tono: 'problema' | 'bien' | 'neutro'; detalle: string; alerta?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-[20px] px-5 py-4', tono === 'problema' ? 'bg-estado-problema-suave/70' : tono === 'bien' ? 'bg-estado-bien-suave/70' : 'bg-superficie-hundida/70')}>
      <span className="text-[14.5px] font-bold text-texto">{titulo}</span>
      <b className={cn('cifra text-[30px] leading-none', tono === 'problema' ? 'text-estado-problema-texto' : tono === 'bien' ? 'text-estado-bien-texto' : 'text-texto-suave')}>{pesos(monto)}</b>
      <span className={cn('text-[14px] font-semibold', alerta ? 'text-estado-problema-texto' : 'text-texto-suave')}>{detalle}</span>
    </div>
  )
}

/** Una cosa del día: monto y nombre; al pasar el mouse, su detalle; al tocarla, «¿Lo pagaste?». */
function Chip({ v, hoy, onAbrir }: { v: Vencimiento; hoy: string; onAbrir: (v: Vencimiento) => void }) {
  const clase = claseDe(v, hoy)
  const e = CHIP[clase]
  const cobro = v.tipo === 'ingreso'
  const verbo = verboDe(v, clase)
  const estado = estadoTexto(v, hoy)
  return (
    <Tooltip.Root>
      <Tooltip.Trigger type="button" onClick={() => onAbrir(v)} aria-label={`${verbo} ${fmtCompact(v.monto)}: ${tituloDe(v)}`} className={cn('flex min-w-0 gap-1.5 rounded-[10px] py-1.5 pr-2 pl-1.5 text-left transition-colors', e.caja)}>
        <span aria-hidden className={cn('w-[3px] shrink-0 rounded-full', e.barra)} />
        <span className="min-w-0">
          <span className={cn('block truncate text-[13.5px] leading-tight font-bold', e.monto)}>
            {/* En pantallas angostas manda el monto: el color ya dice qué es. */}
            <span className="hidden 2xl:inline">{clase === 'hecho' ? '✓ ' : ''}{verbo} </span>
            <span className="2xl:hidden">{clase === 'hecho' ? '✓ ' : clase === 'vencido' ? '! ' : cobro ? '+' : '−'}</span>
            <span className="cifra text-[15px]">{fmtCompact(v.monto)}</span>
          </span>
          <span className={cn('block truncate text-[13px] leading-tight font-semibold', e.nombre)}>{tituloDe(v)}</span>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={10} collisionPadding={16} className="z-40">
          <Tooltip.Popup className="w-[290px] origin-[var(--transform-origin)] rounded-[20px] border border-borde bg-superficie p-4 shadow-[0_18px_40px_-12px_rgba(19,27,22,0.35)] transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[12.5px] font-bold', PILDORA[estado.clase])}>{estado.texto}</span>
            <p className="mt-2 text-[16px] leading-snug font-bold text-texto">
              {clase === 'hecho' ? (cobro ? 'Cobraste' : 'Pagaste') : cobro ? 'Cobrás' : 'Pagás'}: {tituloDe(v)}
            </p>
            <p className={cn('cifra mt-1 text-[26px] leading-none font-bold', clase === 'hecho' ? 'text-texto-suave' : cobro ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
              {cobro ? '+' : '−'}
              {pesos(v.monto)}
            </p>
            <Detalle v={v} className="mt-3 border-t border-borde pt-3" />
            <p className="mt-3 text-[13px] font-bold text-principal">{clase === 'hecho' ? 'Tocá para ver el detalle' : cobro ? 'Tocá si ya lo cobraste' : 'Tocá si ya lo pagaste'}</p>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
