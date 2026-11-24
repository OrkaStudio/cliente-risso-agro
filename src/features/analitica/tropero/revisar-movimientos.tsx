// Las piezas de Movimientos (Lau, 24/11: «unificar los movimientos y revisar, con la visual de
// revisar»). Una sola fila para los dos: la fecha, qué fue, en qué y de qué campo como chips,
// el monto, y si es nuevo, «Corregir» y «Está bien» ahí mismo. Y la pestaña «Para revisar»:
// qué mirar y qué hace cada botón, «Está todo bien», agrupado por quién lo cargó.
//
// «Está bien» cierra el movimiento: deja de ser nuevo y quien lo cargó ya no lo puede cambiar
// (la base sólo le deja corregir lo suyo mientras nadie lo revisó). Por eso se puede deshacer,
// y mirarlo sin tocar nada no lo da por revisado.
import { AnimatePresence, motion } from 'framer-motion'

import { Boton } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { useAccion } from '@/components/tropero/use-accion'
import type { MovimientoConDetalle } from '@/features/analitica/api'
import { fmtCompact, formatARS } from '@/features/analitica/compute'
import { LogoWhatsapp } from '@/components/tropero/audio-whatsapp'
import { fechaDe, useDarPorBueno } from './dar-por-bueno'
import { soloNombre } from './plata'
import { cn } from '@/lib/utils'

const monto = (m: MovimientoConDetalle) => `${m.tipo === 'ingreso' ? '+' : '−'}${formatARS(Number(m.monto)).replace('-', '').replace(/\s/g, '')}`
/** Quién lo cargó, corto: la inicial y el nombre, y el globito de WhatsApp si entró por ahí. */
export function Autor({ nombre, whatsapp }: { nombre: string; whatsapp: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="relative grid size-[18px] shrink-0 place-items-center rounded-full bg-acento text-[10px] font-extrabold text-acento-texto">
        {nombre.charAt(0).toUpperCase()}
        {whatsapp && (
          <span className="absolute -right-1 -bottom-1 grid size-3 place-items-center rounded-full bg-[#25d366] text-white ring-[1.5px] ring-superficie">
            <LogoWhatsapp className="size-2" />
          </span>
        )}
      </span>
      <span className="truncate">{nombre}</span>
    </span>
  )
}


/**
 * Un movimiento, con aire y sin ruido (Lau, 24/11): a la izquierda si salió o entró; el
 * título; debajo, en gris y en una línea, en qué, de qué campo y quién lo cargó; el monto.
 * `fecha`: se muestra en la línea de abajo (cuando la lista no va agrupada por día).
 * `nuevo`: lo cargó otro y no se revisó: la marca y sus dos botones, ahí mismo.
 */
export function FilaMovimiento({
  m,
  nuevo,
  quien,
  fecha = false,
  sinCampo = false,
  sinMarca = false,
  onAbrir,
  onBien,
}: {
  m: MovimientoConDetalle
  nuevo: boolean
  quien?: string | null
  fecha?: boolean
  /** Con un campo elegido en la barra, el campo de cada fila sobra. */
  sinCampo?: boolean
  /** En «Para revisar» todos son nuevos: la marca sobra. */
  sinMarca?: boolean
  onAbrir: (m: MovimientoConDetalle, editar?: boolean) => void
  onBien: (m: MovimientoConDetalle) => void
}) {
  const f = fechaDe(m)
  const ingreso = m.tipo === 'ingreso'
  const meta = [fecha ? `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}` : null, m.categoria?.nombre ?? 'Sin categoría', sinCampo ? null : (m.campo?.nombre ?? 'Sin campo')].filter(Boolean).join(' · ')
  return (
    <motion.li layout initial={false} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="group relative flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-superficie-hundida/40">
      {/* Lo nuevo, con una raya a la izquierda: se ve sin gritar. */}
      {nuevo && !sinMarca && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-principal" />}
      <span aria-hidden className={cn('grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-bold', ingreso ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-superficie-hundida text-texto-suave')}>
        {ingreso ? '+' : '−'}
      </span>
      <button type="button" onClick={() => onAbrir(m)} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-texto">{m.descripcion || m.categoria?.nombre || (ingreso ? 'Ingreso' : 'Gasto')}</span>
          {nuevo && !sinMarca && <span className="shrink-0 rounded-full bg-principal-suave px-1.5 py-px text-[11px] font-bold text-principal">Nuevo</span>}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-texto-suave">
          <span className="truncate">{meta}</span>
          {quien && (
            <>
              <span aria-hidden>·</span>
              <Autor nombre={soloNombre(quien)} whatsapp={m.canal === 'whatsapp'} />
            </>
          )}
        </span>
      </button>
      <span className={cn('t-cifra shrink-0 text-right text-[16px]', ingreso ? 'text-estado-bien-texto' : 'text-texto')}>{monto(m)}</span>
      {nuevo && (
        <div className="flex shrink-0 gap-1.5">
          <button type="button" onClick={() => onAbrir(m, true)} className="h-8 rounded-full px-3 text-[13px] font-bold text-texto shadow-[inset_0_0_0_1.5px_var(--borde)] hover:shadow-[inset_0_0_0_1.5px_var(--principal)] max-sm:px-2.5">
            Corregir
          </button>
          <button type="button" onClick={() => onBien(m)} aria-label={`Está bien: ${m.descripcion ?? ''}`} className="flex h-8 items-center gap-1 rounded-full bg-pasto-100 px-3 text-[13px] font-bold text-pasto-800 hover:bg-pasto-200">
            <Icono nombre="Guardar" tamano={16} />
            <span className="max-sm:hidden">Está bien</span>
          </button>
        </div>
      )}
    </motion.li>
  )
}

/** El día, como separador dentro del mes: «Lunes 24». */
export function Dia({ ymd }: { ymd: string }) {
  const texto = new Date(`${ymd}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' }).replace(/^\w/, (c) => c.toUpperCase())
  return (
    <li role="presentation" className="bg-fondo/60 px-5 pt-3 pb-1.5 text-[12px] font-bold tracking-[0.04em] text-texto-suave uppercase">
      {texto}
    </li>
  )
}

/** Un grupo: su encabezado (un mes, una persona) y sus filas, en una sola caja. */
/** `animar`: las filas salen con animación (en «Para revisar», de a una). En la lista larga, no: al filtrar se van de una. */
export function Grupo({ titulo, icono, detalle, etiqueta, animar = false, children }: { titulo: React.ReactNode; icono?: React.ReactNode; detalle?: React.ReactNode; etiqueta: string; animar?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={etiqueta} className="overflow-hidden rounded-[20px] bg-superficie shadow-[inset_0_0_0_1px_var(--borde)]">
      <header className="flex items-center gap-3 border-b border-borde px-5 py-3.5">
        {icono}
        <p className="min-w-0 flex-1 truncate text-[16px] font-bold text-texto">{titulo}</p>
        {detalle && <span className="shrink-0 text-[13.5px] text-texto-suave">{detalle}</span>}
      </header>
      <ul className="divide-y divide-borde/50">
        {animar ? <AnimatePresence initial={false}>{children}</AnimatePresence> : children}
      </ul>
    </section>
  )
}

/** La pestaña «Para revisar»: qué mirar, «Está todo bien» y lo nuevo agrupado por quién lo cargó. */
export function RevisarMovimientos({
  nuevos,
  quienCargo,
  onAbrir,
  onVerTodos,
}: {
  nuevos: MovimientoConDetalle[]
  quienCargo: (createdBy: string | null | undefined, canal?: string | null) => string | null
  onAbrir: (m: MovimientoConDetalle, editar?: boolean) => void
  onVerTodos: () => void
}) {
  const darPorBueno = useDarPorBueno()
  const todoBien = useAccion(async () => {
    await darPorBueno(nuevos.map((m) => m.id), nuevos.length === 1 ? 'lo diste por bueno' : `diste por buenos los ${nuevos.length}`)
  })

  const grupos: { quien: string; movs: MovimientoConDetalle[] }[] = []
  for (const m of [...nuevos].sort((a, b) => fechaDe(b).localeCompare(fechaDe(a)))) {
    const quien = (quienCargo(m.created_by, m.canal) ?? 'Tu equipo').replace(/^Cargó /, '')
    const g = grupos.find((x) => x.quien === quien)
    if (g) g.movs.push(m)
    else grupos.push({ quien, movs: [m] })
  }
  const salio = nuevos.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto), 0)
  const entro = nuevos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)

  if (nuevos.length === 0)
    return (
      <div className="flex flex-col items-center gap-4 rounded-[24px] bg-superficie px-6 py-12 text-center shadow-[inset_0_0_0_1px_var(--borde)]">
        <span className="grid size-14 place-items-center rounded-full bg-pasto-100 text-pasto-700">
          <Icono nombre="Guardar" />
        </span>
        <div>
          <p className="t-seccion text-texto">Estás al día</p>
          <p className="mt-1 text-[15px] text-texto-suave">Cuando tu equipo cargue algo, aparece acá para que lo mires.</p>
        </div>
        <button type="button" onClick={onVerTodos} className="inline-flex h-11 items-center rounded-full bg-principal px-5 text-[15px] font-bold text-principal-texto">
          Ver todos los movimientos
        </button>
      </div>
    )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[15.5px] text-texto-suave">
          <b className="text-texto">{nuevos.length === 1 ? '1 movimiento' : `${nuevos.length} movimientos`}</b> de todos tus campos
          {salio > 0 && <> · salieron <b className="text-estado-problema-texto">{fmtCompact(salio)}</b></>}
          {entro > 0 && <> · entraron <b className="text-estado-bien-texto">{fmtCompact(entro)}</b></>}. Ya cuentan en tus números.
        </p>
        <Boton accion={todoBien} icono="Guardar" className="h-11 rounded-full px-5 text-[15px] font-bold">
          Está todo bien
        </Boton>
      </div>

      {/* Qué mirar y qué hace cada botón, una sola vez. */}
      <div className="grid gap-2 rounded-[18px] bg-superficie-hundida/50 p-3.5 text-[14px] leading-snug text-texto sm:grid-cols-3">
        <p className="flex items-start gap-2">
          <Icono nombre="Ver" tamano={16} className="mt-0.5 shrink-0 text-texto-suave" />
          <span><b>Mirá</b> que el monto, en qué y de qué campo estén bien: con eso se arman tus números.</span>
        </p>
        <p className="flex items-start gap-2">
          <Icono nombre="Editar" tamano={16} className="mt-0.5 shrink-0 text-texto-suave" />
          <span><b>Corregir</b> cambia lo que esté mal, y Plata y la Agenda se actualizan al toque.</span>
        </p>
        <p className="flex items-start gap-2">
          <Icono nombre="Guardar" tamano={16} className="mt-0.5 shrink-0 text-pasto-700" />
          <span><b>Está bien</b> lo da por bueno: sale de esta lista y quien lo cargó ya no lo puede cambiar.</span>
        </p>
      </div>

      {grupos.map((g) => (
        <Grupo
          key={g.quien}
          animar
          etiqueta={`Cargó ${g.quien}`}
          titulo={g.quien}
          icono={<span className="grid size-8 shrink-0 place-items-center rounded-full bg-acento font-heading text-[13px] font-extrabold text-acento-texto">{g.quien.charAt(0).toUpperCase()}</span>}
          detalle={g.movs.length === 1 ? '1 para revisar' : `${g.movs.length} para revisar`}
        >
          {g.movs.map((m) => (
            <FilaMovimiento key={m.id} m={m} nuevo sinMarca fecha onAbrir={onAbrir} onBien={(x) => void darPorBueno([x.id], 'lo diste por bueno')} />
          ))}
        </Grupo>
      ))}
    </div>
  )
}
