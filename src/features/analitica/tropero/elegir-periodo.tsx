// Elegir el período de Plata (Lau, 24/11: «no le queda claro los rangos de fecha en los
// que está filtrando»). Los tres de siempre (12 meses, esta campaña, la pasada) y
// «Fechas», que abre un calendario de rango con atajos. Debajo, siempre a la vista, el
// rango en palabras y contra qué se compara. Igual en la compu y en el celular: en el
// celular el calendario sube como hoja desde abajo; en la compu entra por la derecha.
import { useState } from 'react'

import { BotonPrincipal } from '@/components/tropero/boton'
import { CalendarioRango } from '@/components/tropero/calendario'
import { Icono } from '@/components/tropero/icono'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { cn } from '@/lib/utils'
import { DESDE_EL_PRINCIPIO, fechaCorta, periodoEntre, textoRango, type Periodo } from './plata'


const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Los atajos del calendario: los rangos que más se piden, armados con la fecha de hoy. */
function atajos(hoy: string): { texto: string; desde: string; hasta: string }[] {
  const [a, m] = hoy.split('-').map(Number) as [number, number]
  const finMes = (anio: number, mes: number) => ymd(new Date(anio, mes, 0))
  const mp = m === 1 ? 12 : m - 1
  const ap = m === 1 ? a - 1 : a
  return [
    // Igual que el período de 12 meses de Plata (en UTC: con la hora local se corría un día).
    { texto: 'Últimos 12 meses', desde: new Date(Date.parse(hoy) - 364 * 86_400_000).toISOString().slice(0, 10), hasta: hoy },
    { texto: 'Este mes', desde: `${hoy.slice(0, 7)}-01`, hasta: hoy },
    { texto: 'El mes pasado', desde: `${ap}-${String(mp).padStart(2, '0')}-01`, hasta: finMes(ap, mp) },
    { texto: 'Este año', desde: `${a}-01-01`, hasta: hoy },
    { texto: 'El año pasado', desde: `${a - 1}-01-01`, hasta: `${a - 1}-12-31` },
  ]
}

/** `conTodo`: suma el atajo «Desde el principio» (en Movimientos, para buscar algo viejo). */
export function ElegirPeriodo({ periodos, periodo, onElegir, hoy, celular = false, conTodo = false }: { periodos: Periodo[]; periodo: Periodo; onElegir: (p: Periodo) => void; hoy: string; celular?: boolean; conTodo?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  // Lo que se va eligiendo en el calendario (se aplica con el botón).
  const [d, setD] = useState(periodo.desde)
  const [h, setH] = useState(periodo.hasta)
  const abrir = () => {
    setD(periodo.desde)
    setH(periodo.hasta)
    setAbierto(true)
  }

  return (
    <div className="flex flex-col">
      {/* Un solo control (Lau, 24/11: menos ruido): el rango en palabras, que se toca para
          cambiarlo. «Últimos 12 meses» es un atajo más adentro del calendario. */}
      <button
        type="button"
        onClick={abrir}
        aria-label={`Período: ${textoRango(periodo.desde, periodo.hasta, hoy)}. Cambiar las fechas`}
        className={cn('flex h-10 items-center gap-2 rounded-full bg-superficie py-1 pr-2 pl-3 text-left text-[14px] font-semibold text-texto shadow-[inset_0_0_0_1.5px_var(--borde)] transition-shadow hover:shadow-[inset_0_0_0_1.5px_var(--principal)]', celular ? 'w-full' : 'w-fit')}
      >
        <Icono nombre="Agenda" tamano={16} className="shrink-0 text-principal" />
        <span className="min-w-0 flex-1 truncate">{textoRango(periodo.desde, periodo.hasta, hoy)}</span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-superficie-hundida px-2.5 py-1 text-[12.5px] font-bold text-texto-suave">
          Cambiar
          <Icono nombre="Desplegar" tamano={16} />
        </span>
      </button>

      <PanelLateral
        chico
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Elegí las fechas"
        bajada="Tocá el primer día y el último, o elegí un atajo."
        pie={
          <BotonPrincipal
            icono="Siguiente"
            className="w-full"
            disabled={!d || !h}
            onClick={() => {
              // «Últimos 12 meses» vuelve al período de siempre (con su comparación de año contra año).
              const doce = periodos.find((p) => p.clave === 'doce')
              onElegir(doce && doce.desde === d && doce.hasta === h ? doce : periodoEntre(d, h, hoy))
              setAbierto(false)
            }}
          >
            {d && h ? `Ver ${textoRango(d, h, hoy).replace(/^Del/, 'del')}` : d ? `Desde el ${fechaCorta(d)}: tocá el último día` : 'Tocá el primer día'}
          </BotonPrincipal>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {[...atajos(hoy), ...(conTodo ? [{ texto: 'Desde el principio', desde: DESDE_EL_PRINCIPIO, hasta: hoy }] : [])].map((a) => {
              const si = a.desde === d && a.hasta === h
              return (
                <button
                  key={a.texto}
                  type="button"
                  aria-pressed={si}
                  onClick={() => {
                    setD(a.desde)
                    setH(a.hasta)
                  }}
                  className={cn('h-8 shrink-0 rounded-full px-3 text-[13.5px] font-semibold whitespace-nowrap transition-colors', si ? 'bg-principal text-principal-texto' : 'bg-superficie text-texto shadow-[inset_0_0_0_1px_var(--borde)]')}
                >
                  {a.texto}
                </button>
              )
            })}
          </div>
          {d && h && <p className="px-1 text-[13px] text-texto-suave">Se compara con las mismas fechas del año anterior.</p>}
          <CalendarioRango
            etiqueta="Las fechas a mirar"
            desde={d}
            hasta={h}
            max={hoy}
            onCambio={(nd, nh) => {
              setD(nd)
              setH(nh)
            }}
          />
        </div>
      </PanelLateral>
    </div>
  )
}
