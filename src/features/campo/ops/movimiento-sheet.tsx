import { useState } from 'react'
import { ArrowRight, Check, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categoriaNombre, coloresPorCategoria } from '@/features/hacienda/labels'
import type { CategoriaAnimal, TropaRec } from '../recorrida/api'
import type { RecPotrero } from '../recorrida/db'
import { CLabel, CSheet } from '../ui'
import type { CantidadPorCategoria, ModoMovimiento } from './db'

/** Golpecito corto al ajustar. Ver nacimiento-sheet. */
function tap() {
  if ('vibrate' in navigator) navigator.vibrate(15)
}

/**
 * Confirmar un movimiento parado en el potrero, con el destino ya elegido en el
 * croquis.
 *
 * El MODO NO SE ELIGE: se deriva de lo que el productor toca.
 *   · se lleva todo            → `todo`       (el server mueve lo que haya)
 *   · saca categorías enteras  → `categorias` (todas las de las que quedan)
 *   · cambia algún número      → `cantidades` (tolerante)
 * Los dos primeros no tienen ningún número que deba coincidir con el server, y
 * son justamente el camino natural: arrastrar toda la tropa, o "se fueron los
 * terneros". El productor cae en el modo robusto sin saber que existe.
 *
 * No persiste nada: entrega la declaración al caller, que la encola offline.
 */
export function MovimientoSheet({
  open,
  origen,
  destino,
  campoNombre,
  colorHex,
  onGuardar,
  onClose,
}: {
  open: boolean
  origen: RecPotrero | null
  destino: RecPotrero | null
  campoNombre: string
  colorHex: string
  onGuardar: (m: {
    movidos: CantidadPorCategoria[]
    modo: ModoMovimiento
    loteId: string | null
    loteNombre: string | null
  }) => void
  onClose: () => void
}) {
  const tropas = origen?.tropas ?? []
  const [loteId, setLoteId] = useState<string | null>(
    tropas.length === 1 ? tropas[0].id : null,
  )
  /** Cuántos se lleva de cada categoría. Arranca VACÍO: la hoja no supone nada,
   *  igual que la de nacimientos. Un toque distraído no puede llevarse la tropa
   *  entera — para eso hay que pedirlo. */
  const [llevar, setLlevar] = useState<Map<CategoriaAnimal, number>>(new Map())

  if (!origen || !destino) return null

  const tropa = tropas.find((t) => t.id === loteId) ?? null
  const compo = tropa?.composicion ?? origen.composicion ?? []
  const col = coloresPorCategoria(compo.map((c) => c.categoria))

  const cuanto = (c: CategoriaAnimal): number => llevar.get(c) ?? 0

  const setCuanto = (c: CategoriaAnimal, n: number) => {
    tap()
    const m = new Map(llevar)
    m.set(c, n)
    setLlevar(m)
  }

  /** Atajo del caso más común: se abrió la portera y pasó todo. */
  const llevarTodo = () => {
    tap()
    setLlevar(new Map(compo.map((c) => [c.categoria, c.cabezas])))
  }
  const yaEstaTodo =
    compo.length > 0 && compo.every((c) => cuanto(c.categoria) === c.cabezas)

  /** Lo que HAY para llevar (del potrero, o de la tropa elegida). */
  const disponible = compo.reduce((s, c) => s + c.cabezas, 0)

  const movidos: CantidadPorCategoria[] = compo
    .map((c) => ({ categoria: c.categoria, cantidad: cuanto(c.categoria) }))
    .filter((m) => m.cantidad > 0)
  const total = movidos.reduce((s, m) => s + m.cantidad, 0)

  // Modo DERIVADO: el más robusto que describa fielmente lo que eligió.
  const modo: ModoMovimiento = (() => {
    const parcialEnAlguna = compo.some((c) => {
      const n = cuanto(c.categoria)
      return n > 0 && n < c.cabezas
    })
    if (parcialEnAlguna) return 'cantidades'
    const todasEnteras = compo.every((c) => cuanto(c.categoria) > 0)
    return todasEnteras ? 'todo' : 'categorias'
  })()

  const debeElegirTropa = tropas.length > 1
  const listo = total > 0 && (!debeElegirTropa || loteId != null)

  const guardar = () => {
    if (!listo) return
    if ('vibrate' in navigator) navigator.vibrate(50)
    onGuardar({
      movidos,
      modo,
      loteId: tropa?.id ?? null,
      loteNombre: tropa?.nombre ?? null,
    })
  }

  return (
    <CSheet
      open={open}
      title={`Mover a Potrero ${destino.nombre}`}
      header={
        // Desde → hasta, de un golpe. Antes eran tres renglones de texto
        // ("DEL 3D SE MUEVEN A" / "Potrero 4D" / "Está vacío · Los Pampas")
        // para decir algo que se entiende mejor mirándolo.
        <div className="mb-3 border-b border-[var(--c-line)] pb-3">
          <div className="flex items-center gap-2">
            <ExtremoPotrero
              rotulo="Desde"
              nombre={origen.nombre}
              detalle={`${disponible} cab.`}
            />
            <ArrowRight
              className="size-7 shrink-0 text-[var(--c-ink-soft)]"
              strokeWidth={2.5}
            />
            <ExtremoPotrero
              rotulo="Hasta"
              nombre={destino.nombre}
              detalle={destino.cabezas > 0 ? `${destino.cabezas} cab.` : 'vacío'}
              destacado
              colorHex={colorHex}
            />
          </div>
          <p className="mt-1.5 text-center text-[12.5px] text-[var(--c-ink-soft)]">
            {campoNombre}
          </p>
        </div>
      }
      footer={
        <>
          {/* Qué se le va a pedir al server, en criollo. Va en el PIE porque
              describe lo que hace el botón — y porque en el cuerpo, con las
              filas grandes, quedaba cortada abajo del pliegue. */}
          {total > 0 && (
            <p className="mb-2 text-center text-[13.5px] text-[var(--c-ink-soft)]">
              {modo === 'todo'
                ? 'Se mueve la tropa entera.'
                : modo === 'categorias'
                  ? 'Se mueven todas las de esas categorías.'
                  : 'Si hay menos, se mueve lo que haya.'}
            </p>
          )}
        <button
          type="button"
          disabled={!listo}
          onClick={guardar}
          className="c-display c-hard flex h-14 w-full items-center justify-center gap-1.5 rounded-xl border border-transparent bg-[var(--c-ok)] text-[17px] text-white active:scale-[0.99] disabled:opacity-45"
        >
          {total > 0 ? (
            <>
              Mover
              <span className="c-mono text-[19px] font-extrabold">{total}</span>
              {total === 1 ? 'animal' : 'animales'}
            </>
          ) : (
            'Elegí qué se lleva'
          )}
        </button>
        </>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-3.5 pb-0.5">
        {tropas.length > 1 && (
          <div className="c-rise" style={{ animationDelay: '20ms' }}>
            <CLabel className="mb-2 !text-[12px]">Qué tropa se mueve</CLabel>
            <div className="flex flex-col gap-2">
              {tropas.map((t) => (
                <TropaOpcion
                  key={t.id}
                  tropa={t}
                  seleccionada={loteId === t.id}
                  onClick={() => {
                    setLoteId(t.id)
                    // Cambiar de tropa reinicia la selección: los números de la
                    // anterior no significan nada acá.
                    setLlevar(new Map())
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="c-rise" style={{ animationDelay: '60ms' }}>
          <CLabel className="mb-2 !text-[12px]">Qué se lleva</CLabel>
          {compo.length > 0 && (
            <button
              type="button"
              onClick={llevarTodo}
              disabled={yaEstaTodo}
              className={cn(
                'c-display mb-2 flex h-10 w-full items-center justify-center rounded-xl border-2 text-[15px] transition-colors',
                yaEstaTodo
                  ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
                  : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)] active:scale-[0.99]',
              )}
            >
              {yaEstaTodo ? 'Se lleva toda la tropa' : 'Llevar toda la tropa'}
            </button>
          )}
          {compo.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3.5 py-3 text-[14px] text-[var(--c-ink-soft)]">
              Este potrero no tiene animales cargados.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {compo.map((c) => (
                <FilaCategoria
                  key={c.categoria}
                  nombre={categoriaNombre(c.categoria, c.cabezas)}
                  color={col[c.categoria]}
                  total={c.cabezas}
                  valor={cuanto(c.categoria)}
                  onCambiar={(n) => setCuanto(c.categoria, n)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </CSheet>
  )
}

/**
 * Una categoría con cuántas se llevan. Tocar el nombre la saca entera (o la
 * vuelve a meter): es el gesto de "los terneros no van". El −/+ es para el caso
 * raro de llevarse una parte.
 */
/** Un extremo del movimiento (origen o destino) en el encabezado. */
function ExtremoPotrero({
  rotulo,
  nombre,
  detalle,
  destacado,
  colorHex,
}: {
  rotulo: string
  nombre: string
  detalle: string
  destacado?: boolean
  colorHex?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center rounded-xl border-2 px-2 py-2',
        destacado
          ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)]'
          : 'border-[var(--c-line)] bg-[var(--c-sunk)]',
      )}
    >
      <CLabel className="!text-[10.5px]">{rotulo}</CLabel>
      <div className="flex max-w-full items-center gap-1.5">
        {destacado && colorHex && (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: colorHex }}
          />
        )}
        <span className="c-display truncate text-[24px] leading-tight text-[var(--c-ink)]">
          {nombre}
        </span>
      </div>
      <span className="c-mono truncate text-[12.5px] text-[var(--c-ink-soft)]">
        {detalle}
      </span>
    </div>
  )
}

/**
 * Una categoría: cuántas se lleva SOBRE cuántas hay, siempre a la vista.
 *
 * La fracción resuelve la ambigüedad que tenía el número solo: antes valía dos
 * cosas distintas según el estado (en reposo el stock, elegida lo que se
 * llevaba), así que un "27" no decía si eran las que había o las que iban.
 *
 * Arranca en 0 y se suma: la hoja no supone nada. Tocar el NOMBRE se lleva la
 * categoría entera —el gesto de "se van los terneros", que si no serían nueve
 * toques— y volver a tocarlo la saca.
 */
function FilaCategoria({
  nombre,
  color,
  total,
  valor,
  onCambiar,
}: {
  nombre: string
  color: string
  total: number
  valor: number
  onCambiar: (n: number) => void
}) {
  const va = valor > 0
  return (
    <div
      className={cn(
        'c-hard-sm flex items-center gap-1.5 rounded-xl border-2 px-2.5 py-2 transition-colors',
        va
          ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)]'
          : 'border-[var(--c-line)] bg-[var(--c-panel)]',
      )}
    >
      <button
        type="button"
        onClick={() => onCambiar(va ? 0 : total)}
        aria-label={va ? `Sacar ${nombre}` : `Llevar todas las ${nombre}`}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
      >
        <span
          className="size-3.5 shrink-0 rounded-full"
          style={{ background: color, opacity: va ? 1 : 0.5 }}
        />
        <span className="c-display min-w-0 truncate text-[19px] leading-tight text-[var(--c-ink)]">
          {nombre}
        </span>
      </button>

      <button
        type="button"
        disabled={valor === 0}
        onClick={() => onCambiar(Math.max(0, valor - 1))}
        aria-label={`Restar ${nombre}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)] transition-transform active:scale-90 disabled:opacity-20 disabled:active:scale-100"
      >
        <Minus className="size-5" strokeWidth={2.5} />
      </button>

      {/* Lo que se lleva SOBRE lo que hay. */}
      <span className="flex shrink-0 items-baseline justify-center gap-px">
        <span
          key={valor}
          className={cn(
            'c-mono c-stamp text-[28px] font-extrabold leading-none tabular-nums',
            // El cero va en tinta suave SÓLIDA, no en opacidad: al 35% se leía
            // como una mancha y no como un número.
            va ? 'text-[var(--c-ok-deep)]' : 'text-[var(--c-ink-soft)]',
          )}
        >
          {valor}
        </span>
        <span className="c-mono text-[15px] font-semibold leading-none text-[var(--c-ink-soft)]">
          /{total}
        </span>
      </span>

      <button
        type="button"
        disabled={valor >= total}
        onClick={() => onCambiar(Math.min(total, valor + 1))}
        aria-label={`Sumar ${nombre}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)] transition-transform active:scale-90 disabled:opacity-20 disabled:active:scale-100"
      >
        <Plus className="size-5" strokeWidth={2.5} />
      </button>
    </div>
  )
}

/** Tropa elegible con su composición a la vista (mismo criterio que nacimiento). */
function TropaOpcion({
  tropa,
  seleccionada,
  onClick,
}: {
  tropa: TropaRec
  seleccionada: boolean
  onClick: () => void
}) {
  const col = coloresPorCategoria(tropa.composicion.map((c) => c.categoria))
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'c-hard-sm rounded-xl border-2 px-3.5 py-3 text-left transition-colors',
        seleccionada
          ? 'border-[var(--c-ok)] bg-[var(--c-panel)]'
          : 'border-[var(--c-line)] bg-[var(--c-panel)]',
      )}
    >
      <div className="flex items-center gap-2">
        {seleccionada && (
          <Check
            className="size-[18px] shrink-0 text-[var(--c-ok-deep)]"
            strokeWidth={3}
          />
        )}
        <span className="c-display truncate text-[17px] text-[var(--c-ink)]">
          {tropa.nombre}
        </span>
        <span className="c-mono ml-auto shrink-0 text-[13px] font-semibold text-[var(--c-ink-soft)]">
          {tropa.cabezas} cab.
        </span>
      </div>
      {tropa.composicion.length > 0 && (
        <div className="mt-2 grid gap-1 rounded-lg bg-[var(--c-sunk)] px-3 py-2">
          {tropa.composicion.map((c) => (
            <div key={c.categoria} className="flex items-center gap-2 text-[13.5px]">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: col[c.categoria] }}
              />
              <span className="min-w-0 truncate text-[var(--c-ink)]">
                {categoriaNombre(c.categoria, c.cabezas)}
              </span>
              <span className="c-mono ml-auto shrink-0 font-semibold text-[var(--c-ink)]">
                {c.cabezas}
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  )
}
