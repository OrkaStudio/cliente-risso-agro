import { useState } from 'react'
import { ArrowLeft, CloudOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Croquis } from '@/features/campo/recorrida/croquis'
import type { RecPotrero } from '@/features/campo/recorrida/db'
import type { CategoriaAnimal } from './api'
import { CLabel } from '../ui'
import { useOrigen } from './use-origen'
import { ComposicionPotrero } from './composicion'
import { cabezasBovinas, soloBovinos } from './bovinos'

export type Origen = {
  potreroId: string
  potreroNombre: string
  campoNombre: string
  /** Tropa elegida. null = el potrero no tiene tropas (animales sueltos). */
  loteId: string | null
  loteNombre: string | null
  cabezas: number
  /** Categorías presentes: el prearmado del aparte solo pregunta por lo que hay. */
  categorias: CategoriaAnimal[]
  /** Potreros del campo CON su dibujo: el destino del aparte también se toca
   *  en el croquis, no se elige de una lista. */
  potrerosDelCampo: RecPotrero[]
  campoColor: string
}

/**
 * Segunda pantalla: de dónde salen los animales, elegido SOBRE EL CROQUIS.
 *
 * Reusa el croquis de la Recorrida entero —polígonos reales, foco, astillas con
 * pin, GPS, todo desde cache y sin señal— y le pone su propio panel abajo. El
 * productor ya sabe leer este dibujo: es la misma pantalla con la que recorre.
 */
export function ElegirOrigen({
  titulo,
  onListo,
  onVolver,
}: {
  titulo: string
  onListo: (o: Origen) => void
  onVolver: () => void
}) {
  const o = useOrigen()
  const [loteIdx, setLoteIdx] = useState(0)

  if (o.cargando) {
    return <p className="c-label p-8 text-center !text-[13px]">Cargando el campo…</p>
  }

  if (o.sinCache) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <CloudOff className="size-10 text-[var(--c-faint)]" />
        <p className="c-display text-[16px] text-[var(--c-ink)]">
          Todavía no bajaste los campos
        </p>
        <p className="text-[13.5px] text-[var(--c-ink-soft)]">
          Entrá una vez con señal y el croquis queda guardado en el teléfono.
        </p>
      </div>
    )
  }

  const panel = (p: RecPotrero) => {
    const tropas = p.tropas ?? []
    const varias = tropas.length > 1
    const elegida = tropas[Math.min(loteIdx, Math.max(0, tropas.length - 1))]
    const sinTropasConocidas = p.tropas === undefined && p.cabezas > 0
    // Solo bovinos: son los únicos que llevan caravana, y sin caravana el
    // bastón no identifica a nadie.
    const compo = (elegida?.composicion ?? p.composicion ?? []) as {
      categoria: CategoriaAnimal
      cabezas: number
    }[]
    // Sin composición en el cache no se puede saber QUÉ hay, pero sí que hay:
    // se cae al total del potrero en vez de trabar la manga. Un cache viejo no
    // puede impedir trabajar — sí avisar de qué se está perdiendo.
    const sinCompo = compo.length === 0 && p.cabezas > 0
    const bovinos = sinCompo ? p.cabezas : cabezasBovinas(compo)

    return (
      <div className="max-h-[52vh] shrink-0 overflow-y-auto border-t border-[var(--c-line-strong)] bg-[var(--c-panel)] px-4 pb-4 pt-3.5 shadow-[0_-5px_18px_-10px_rgba(0,0,0,.2)]">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="c-display truncate text-[20px] text-[var(--c-ink)]">
              Potrero {p.nombre}
            </div>
            <div className="truncate text-[12.5px] text-[var(--c-ink-soft)]">
              {o.campo?.nombre}
            </div>
          </div>
          <div className="shrink-0 text-right leading-none">
            <span className="c-mono block text-[27px] font-bold text-[var(--c-ink)]">
              {bovinos}
            </span>
            <CLabel className="mt-0.5 !text-[9.5px]">cabezas</CLabel>
          </div>
        </div>

        {/* Qué hay adentro, con la misma lectura que la Recorrida. Solo si de
            verdad SABEMOS la composición: "no hay bovinos" y "no sé qué hay"
            son cosas distintas y decir la primera cuando pasa la segunda es
            mentirle al productor. */}
        {!sinCompo && (
          <div className="mt-2.5">
            <ComposicionPotrero
              items={compo}
              compacto
              vacioTexto="Sin bovinos acá — en la manga solo entran los que llevan caravana"
            />
          </div>
        )}

        {/* La tropa se pregunta SOLO si hay más de una: con una sola, preguntar
            es un toque robado — y ya no es ambigua, el potrero la desambiguó. */}
        {varias && (
          <>
            <CLabel className="mb-1.5 mt-3 block">Tropas en este potrero</CLabel>
            <div className="flex flex-col gap-1.5">
              {tropas.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLoteIdx(i)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left',
                    i === loteIdx
                      ? 'border-2 border-[var(--c-ok)] bg-[var(--c-ok-soft)]'
                      : 'border-[var(--c-line-strong)] bg-[var(--c-panel)]',
                  )}
                >
                  <span className="c-display min-w-0 flex-1 truncate text-[14.5px] text-[var(--c-ink)]">
                    {t.nombre}
                  </span>
                  <span className="c-mono shrink-0 text-[16px] font-bold text-[var(--c-ink)]">
                    {t.cabezas}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {sinCompo && (
          <p className="c-label mt-2 !text-[11px] !normal-case !text-[var(--c-warn-deep)]">
            No sabemos qué categorías hay acá — entrá una vez con señal para
            bajarlas.
          </p>
        )}
        {sinTropasConocidas && (
          <p className="c-label mt-2.5 !text-[11px] !normal-case !text-[var(--c-warn-deep)]">
            Entrá una vez con señal para saber qué tropas hay acá.
          </p>
        )}

        <button
          type="button"
          disabled={bovinos === 0}
          onClick={() =>
            onListo({
              potreroId: p.id,
              potreroNombre: p.nombre,
              campoNombre: o.campo?.nombre ?? '',
              loteId: elegida?.id ?? null,
              loteNombre: elegida?.nombre ?? null,
              cabezas: bovinos,
              // De la tropa elegida si hay varias; si no, del potrero entero.
              categorias: [...new Set(soloBovinos(compo).map((c) => c.categoria))],
              // TODOS los potreros: el croquis se muestra entero para poder
              // ubicarse. El de origen va marcado, no escondido.
              potrerosDelCampo: o.potreros,
              campoColor: o.campo?.colorHex ?? '#178a55',
            })
          }
          className="c-display c-hard mt-3.5 flex h-14 w-full items-center justify-center rounded-xl border border-transparent bg-[var(--c-ok)] text-[17px] text-white disabled:opacity-40"
        >
          {bovinos === 0
            ? 'Acá no hay bovinos'
            : varias && elegida
              ? `Empezar con ${elegida.nombre}`
              : 'Empezar'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-3 py-2">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a elegir la actividad"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--c-ink-soft)]"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="c-display truncate text-[15px] text-[var(--c-ink)]">
            {titulo}
          </div>
          <CLabel className="!text-[10px]">Elegí de dónde salen</CLabel>
        </div>
      </div>

      {/* Selector de campo: solo si hay más de uno. */}
      {o.campos.length > 1 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--c-line)] bg-[var(--c-panel)] px-3 py-2">
          {o.campos.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                o.elegirCampo(c.id)
                setLoteIdx(0)
              }}
              className={cn(
                'c-display shrink-0 rounded-full border px-3.5 py-1.5 text-[13px]',
                c.id === o.campoActivo
                  ? 'border-transparent text-white'
                  : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
              )}
              style={
                c.id === o.campoActivo ? { backgroundColor: c.colorHex } : undefined
              }
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <Croquis
          potreros={o.potreros}
          colorHex={o.campo?.colorHex ?? '#178a55'}
          campoNombre={o.campo?.nombre ?? ''}
          seleccionadoId={o.potreroId}
          onSeleccionar={(id) => {
            o.setPotreroId(id)
            setLoteIdx(0)
          }}
          panel={panel}
        />
      </div>
    </div>
  )
}
