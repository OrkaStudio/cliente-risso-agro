import { useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categoriaNombre, coloresPorCategoria } from '@/features/hacienda/labels'
import type { CategoriaAnimal, TropaRec } from '../recorrida/api'
import type { RecPotrero } from '../recorrida/db'
import { CLabel, CSheet } from '../ui'

/** Lo que se anota de una sentada: cuántos de cada sexo, y a qué tropa entran. */
export type NacimientoDeclarado = {
  categoria: CategoriaAnimal
  cantidad: number
}

/** Golpecito corto al contar. El de confirmar (manga/plata) es de 50ms; este se
 *  repite muchas veces seguidas, así que va bien más liviano. */
function tap() {
  if ('vibrate' in navigator) navigator.vibrate(15)
}

/**
 * Anotar nacimientos parado en el potrero. En parición no se encuentra UN
 * ternero: se encuentran varios, y mezclados. Por eso hay DOS contadores
 * (machos y hembras) en la misma hoja y una sola confirmación.
 *
 * Arrancan los dos en cero: la hoja no supone nada, y el caso más común (nace
 * uno solo) son dos toques — sumar y anotar.
 *
 * Se usa a pleno sol, con guantes y el animal moviéndose: cada sexo es una
 * FICHA con su número enorme, que se prende en verde al tener carga. Poco
 * contenido, pero con cuerpo — nada de campos de formulario flotando.
 *
 * No persiste nada: entrega los nacimientos al caller (que los encola offline,
 * uno por categoría → cada uno con su propia clave de idempotencia).
 */
export function NacimientoSheet({
  open,
  potrero,
  campoNombre,
  colorHex,
  onGuardar,
  onClose,
}: {
  open: boolean
  potrero: RecPotrero | null
  /** Campo al que pertenece el potrero (identidad en el encabezado). */
  campoNombre: string
  /** Color IDENTIDAD del campo — el mismo punto que usa el panel del potrero. */
  colorHex: string
  onGuardar: (n: {
    nacimientos: NacimientoDeclarado[]
    loteId: string | null
    loteNombre: string | null
  }) => void
  onClose: () => void
}) {
  const tropas = potrero?.tropas ?? []
  const [machos, setMachos] = useState(0)
  const [hembras, setHembras] = useState(0)
  // Con una sola tropa se autoselecciona; con varias arranca sin elegir.
  const [loteId, setLoteId] = useState<string | null>(
    tropas.length === 1 ? tropas[0].id : null,
  )

  if (!potrero) return null

  const total = machos + hembras
  const debeElegirTropa = tropas.length > 1
  const listo = total > 0 && (!debeElegirTropa || loteId != null)

  const guardar = () => {
    if (total === 0) return
    if ('vibrate' in navigator) navigator.vibrate(50)
    const nacimientos: NacimientoDeclarado[] = []
    if (machos > 0) nacimientos.push({ categoria: 'ternero', cantidad: machos })
    if (hembras > 0) nacimientos.push({ categoria: 'ternera', cantidad: hembras })
    const tropa = tropas.find((t) => t.id === loteId) ?? null
    onGuardar({
      nacimientos,
      loteId: tropa?.id ?? null,
      loteNombre: tropa?.nombre ?? null,
    })
  }

  return (
    <CSheet
      open={open}
      title={`Nació · Potrero ${potrero.nombre}`}
      header={
        // Centrado y con la identidad del campo: en una recorrida se abren y
        // cierran muchos potreros seguidos, y equivocarse de potrero al anotar
        // es un error que después nadie encuentra. El punto de color es el
        // mismo del panel, así que se reconoce sin leer.
        <div className="mb-3 flex flex-col items-center gap-0.5 border-b border-[var(--c-line)] pb-2.5">
          <CLabel className="!text-[11px]">Nació en</CLabel>
          <div className="flex max-w-full items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: colorHex }}
            />
            <span className="c-display truncate text-[22px] leading-tight text-[var(--c-ink)]">
              Potrero {potrero.nombre}
            </span>
          </div>
          <span className="max-w-full truncate text-[12.5px] text-[var(--c-ink-soft)]">
            {campoNombre}
          </span>
        </div>
      }
      footer={
        <button
          type="button"
          disabled={!listo}
          onClick={guardar}
          className="c-display c-hard flex h-14 w-full items-center justify-center gap-1.5 rounded-xl border border-transparent bg-[var(--c-ok)] text-[17px] text-white active:scale-[0.99] disabled:opacity-45"
        >
          {/* Con el contador en cero va como UN texto: dos nodos de texto
              adyacentes colapsan en un solo item de flex y el gap no los
              separaba ("Anotarnacimiento"). */}
          {total > 0 ? (
            <>
              Anotar
              <span className="c-mono text-[19px] font-extrabold">{total}</span>
              {total > 1 ? 'nacimientos' : 'nacimiento'}
            </>
          ) : (
            'Anotar nacimiento'
          )}
        </button>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-3.5 pb-0.5">
        {/* Cuántos de cada sexo. Entrada escalonada (c-rise), como el resto de
            los bloques de las hojas de detalle. */}
        <div className="c-rise" style={{ animationDelay: '20ms' }}>
          <CLabel className="mb-2 !text-[12px]">Cuántos nacieron</CLabel>
          <div className="flex flex-col gap-2.5">
            <FichaSexo
              titulo="Machos"
              sub="terneros"
              valor={machos}
              onCambiar={setMachos}
            />
            <FichaSexo
              titulo="Hembras"
              sub="terneras"
              valor={hembras}
              onCambiar={setHembras}
            />
          </div>
        </div>

        {/* Tropa. Con una sola no hay nada que decidir → una ficha calma que da
            contexto (a qué grupo real entran). La composición aparece SOLO
            cuando hay que elegir entre varias: ahí sí se usa para decidir. */}
        <div className="c-rise" style={{ animationDelay: '70ms' }}>
          <CLabel className="mb-2 !text-[12px]">
            {tropas.length === 0
              ? 'Tropa'
              : tropas.length === 1
                ? 'Entran a la tropa'
                : 'Elegí a qué tropa entran'}
          </CLabel>
          {tropas.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3.5 py-3 text-[14px] text-[var(--c-ink-soft)]">
              Sin tropa cargada — quedan sueltos y los asignás después.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {tropas.map((t) => (
                <TropaOpcion
                  key={t.id}
                  tropa={t}
                  seleccionada={loteId === t.id}
                  unica={tropas.length === 1}
                  onClick={() => setLoteId(t.id)}
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
 * Ficha de un sexo: una superficie con el número ENORME (44px) y sus dos
 * botones de 56px. Se prende entera en verde al tener carga — el estado se ve
 * de reojo, sin leer. El "−" se apaga en cero: nunca hay un toque que no haga
 * nada sin explicar por qué.
 */
function FichaSexo({
  titulo,
  sub,
  valor,
  onCambiar,
}: {
  titulo: string
  sub: string
  valor: number
  onCambiar: (n: number) => void
}) {
  const activo = valor > 0
  return (
    <div
      className={cn(
        'c-hard-sm flex items-center gap-2 rounded-2xl border-2 px-3 py-2.5 transition-colors',
        activo
          ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)]'
          : 'border-[var(--c-line)] bg-[var(--c-panel)]',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="c-display truncate text-[18px] leading-tight text-[var(--c-ink)]">
          {titulo}
        </span>
        <span className="truncate text-[11px] uppercase tracking-wide text-[var(--c-ink-soft)]">
          {sub}
        </span>
      </div>
      <button
        type="button"
        disabled={valor === 0}
        onClick={() => {
          tap()
          onCambiar(Math.max(0, valor - 1))
        }}
        aria-label={`Restar ${titulo.toLowerCase()}`}
        className="flex size-14 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)] transition-transform active:scale-90 disabled:opacity-25 disabled:active:scale-100"
      >
        <Minus className="size-7" strokeWidth={2.5} />
      </button>
      <div className="flex w-[62px] shrink-0 items-center justify-center">
        {/* `key` remonta el número en cada cambio → replay del c-stamp: el
            conteo se SIENTE, que es lo que confirma el toque con guantes. */}
        <span
          key={valor}
          className={cn(
            'c-mono c-stamp text-[44px] font-extrabold leading-none tabular-nums',
            activo ? 'text-[var(--c-ok-deep)]' : 'text-[var(--c-ink)]/30',
          )}
        >
          {valor}
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          tap()
          onCambiar(valor + 1)
        }}
        aria-label={`Sumar ${titulo.toLowerCase()}`}
        className="flex size-14 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)] transition-transform active:scale-90"
      >
        <Plus className="size-7" strokeWidth={2.5} />
      </button>
    </div>
  )
}

/**
 * Una tropa con su COMPOSICIÓN a la vista — siempre, haya una o varias.
 *
 * No está sólo para elegir: saber de qué está hecho el lote al que entra la
 * cría es información que el productor usa (200 vacas con 4 terneros nacidos
 * dice algo muy distinto que 200 con 80). Con varios lotes en el potrero pasa
 * de valiosa a imprescindible, porque es lo único que los distingue.
 *
 * Se lee en filas —punto, categoría, número a la derecha— igual que el panel
 * del potrero, en vez de chips apretados que se parten en dos renglones.
 */
function TropaOpcion({
  tropa,
  seleccionada,
  unica,
  onClick,
}: {
  tropa: TropaRec
  seleccionada: boolean
  /** Única tropa del potrero: no hay nada que elegir, es sólo contexto. */
  unica: boolean
  onClick: () => void
}) {
  const col = coloresPorCategoria(tropa.composicion.map((c) => c.categoria))
  const marcada = seleccionada || unica
  return (
    <button
      type="button"
      disabled={unica}
      onClick={onClick}
      className={cn(
        'c-hard-sm rounded-xl border-2 px-3.5 py-3 text-left transition-colors disabled:active:scale-100',
        marcada
          ? 'border-[var(--c-ok)] bg-[var(--c-panel)]'
          : 'border-[var(--c-line)] bg-[var(--c-panel)]',
      )}
    >
      <div className="flex items-center gap-2">
        {marcada && (
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
            <div
              key={c.categoria}
              className="flex items-center gap-2 text-[13.5px]"
            >
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
