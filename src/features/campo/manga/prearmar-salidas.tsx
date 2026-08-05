import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, MapPin, Store, Warehouse } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categoriaLabel } from '@/features/hacienda/labels'
import { Croquis } from '@/features/campo/recorrida/croquis'
import type { RecPotrero } from '@/features/campo/recorrida/db'
import { CLabel } from '../ui'
import { Encabezado, OpcionDestino, Seguir } from './ui-manga'
import { ComposicionPotrero } from './composicion'
import type { CategoriaAnimal } from './api'
import {
  colorLado,
  ladoLabel,
  mapeoDestete,
  sinAsignar,
  RESULTADOS_TACTO,
  type Destino,
  type Lado,
  type ModoSalida,
  type PlanSalidas,
} from './salidas'

/**
 * Prearmado del aparte: qué hay a cada lado del cepo y qué categoría va a cada
 * uno. Se hace UNA vez, antes de que entre el primer animal.
 *
 * Es lo que permite trabajar con el rodeo mezclado —que es como viene— sin
 * tocar el teléfono: una vez mapeado, el sistema resuelve cada animal solo a
 * partir de su caravana y le dice al operario para qué lado abrir.
 */

export function PrearmarSalidas({
  titulo,
  presentes,
  potreros,
  campoNombre,
  campoColor,
  origenId,
  esDestete,
  modo,
  onListo,
  onVolver,
}: {
  titulo: string
  /** Categorías que hay en la tropa elegida: solo se pregunta por lo que existe. */
  presentes: CategoriaAnimal[]
  /** Potreros del campo CON su dibujo: el destino se toca en el croquis, que
   *  es el mismo mapa con el que el productor recorre. */
  potreros: RecPotrero[]
  campoNombre: string
  campoColor: string
  /** Potrero del que salen los animales: se marca en el croquis y no se puede
   *  elegir como destino (mover al mismo potrero no existe). */
  origenId: string
  /** En un destete el mapeo se propone solo: madres a un lado, crías al otro. */
  esDestete: boolean
  /** De dónde va a salir el lado de cada animal durante el trabajo. */
  modo: ModoSalida
  onListo: (plan: PlanSalidas) => void
  onVolver: () => void
}) {
  const [usaFrente, setUsaFrente] = useState(false)
  const [destinos, setDestinos] = useState<Record<Lado, Destino>>({
    izq: { k: 'queda' },
    der: { k: 'queda' },
    frente: { k: 'queda' },
  })
  const [porCategoria, setPorCategoria] = useState<
    Partial<Record<CategoriaAnimal, Lado>>
  >(() => (esDestete ? mapeoDestete(presentes) : {}))
  const [abrirDestino, setAbrirDestino] = useState<Lado | null>(null)
  const [mirandoCroquis, setMirandoCroquis] = useState<Lado | null>(null)
  const [potreroTocado, setPotreroTocado] = useState<string | null>(null)

  const lados: Lado[] = usaFrente ? ['izq', 'der', 'frente'] : ['izq', 'der']
  const plan: PlanSalidas = {
    modo,
    salidas: lados.map((lado) => ({ lado, destino: destinos[lado] })),
    porCategoria,
    porResultado:
      modo === 'resultado' ? { prenada: 'izq', vacia: 'der' } : undefined,
  }
  // El mapeo por categoría solo se pide cuando el lado sale de la categoría.
  const faltan = modo === 'categoria' ? sinAsignar(plan, presentes) : []

  if (abrirDestino) {
    const lado = abrirDestino
    const c = colorLado[lado]
    const elegir = (d: Destino) => {
      setDestinos((prev) => ({ ...prev, [lado]: d }))
      setAbrirDestino(null)
      setMirandoCroquis(null)
    }

    // El potrero se TOCA en el dibujo. Nadie recuerda los números de memoria,
    // pero todos reconocen la forma de su campo.
    if (mirandoCroquis === lado) {
      const elegido = potreros.find((p) => p.id === potreroTocado)
      return (
        <div className="flex h-full flex-col">
          <Encabezado
            titulo={`${ladoLabel[lado]} → ¿a qué potrero?`}
            sub="Tocalo en el croquis"
            onVolver={() => setMirandoCroquis(null)}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <Croquis
              potreros={potreros}
              colorHex={campoColor}
              campoNombre={campoNombre}
              seleccionadoId={potreroTocado}
              onSeleccionar={setPotreroTocado}
              panel={(p) => (
                <motion.div
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="max-h-[52vh] shrink-0 overflow-y-auto border-t-2 bg-[var(--c-panel)] px-4 pb-4 pt-3.5"
                  style={{ borderColor: c.borde }}
                >
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="c-display truncate text-[19px] text-[var(--c-ink)]">
                        Potrero {p.nombre}
                      </div>
                      {/* QUÉ hay del otro lado, no sólo cuántos: mandar
                          terneros a un potrero con toros no es lo mismo. */}
                      <div className="mt-1.5">
                        <ComposicionPotrero
                          items={p.composicion ?? []}
                          compacto
                          vacioTexto="Está vacío"
                        />
                      </div>
                    </div>
                    <span
                      className="c-display shrink-0 rounded-lg px-2.5 py-1 text-[12px]"
                      style={{ backgroundColor: c.fondo, color: c.tinta }}
                    >
                      {ladoLabel[lado]}
                    </span>
                  </div>
                  {p.id === origenId ? (
                    <p className="mt-3 rounded-xl bg-[var(--c-sunk)] px-3 py-2.5 text-center text-[13px] text-[var(--c-ink-soft)]">
                      De acá salen los animales — elegí otro potrero
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        elegir({ k: 'potrero', id: p.id, nombre: p.nombre })
                      }
                      className="c-display c-hard mt-3.5 flex h-14 w-full items-center justify-center rounded-xl text-[17px] text-white"
                      style={{ backgroundColor: c.borde }}
                    >
                      Van acá
                    </button>
                  )}
                </motion.div>
              )}
            />
          </div>
          {!elegido && null}
        </div>
      )
    }

    return (
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        <Encabezado
          titulo={`¿A dónde da la ${ladoLabel[lado].toLowerCase()}?`}
          sub="Elegí una vez, vale toda la jornada"
          onVolver={() => setAbrirDestino(null)}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
          <OpcionDestino
            icono={<MapPin className="size-5" />}
            titulo="A otro potrero"
            detalle="Lo mueve de verdad — cambia el stock"
            acento={c}
            onClick={() => setMirandoCroquis(lado)}
          />
          <OpcionDestino
            icono={<Store className="size-5" />}
            titulo="Venta"
            detalle="Queda marcado; lo resolvés en Oficina"
            acento={c}
            onClick={() => elegir({ k: 'venta' })}
          />
          <OpcionDestino
            icono={<Warehouse className="size-5" />}
            titulo="Un corral"
            detalle="Aparte temporal, se decide después"
            acento={c}
            onClick={() => elegir({ k: 'corral', nombre: 'Corral' })}
          />
          <OpcionDestino
            icono={<ArrowLeft className="size-5" />}
            titulo="Vuelve al potrero"
            detalle="Sale por acá pero no se mueve"
            acento={c}
            onClick={() => elegir({ k: 'queda' })}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <Encabezado
        titulo={titulo}
        sub="Cómo se aparta"
        onVolver={onVolver}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3.5">
        {/* 1 · Qué hay a cada lado del cepo */}
        <div>
          <CLabel className="mb-1.5 block">¿A dónde da cada lado?</CLabel>
          <div className="flex flex-col gap-2">
            {lados.map((lado) => {
              const c = colorLado[lado]
              const d = destinos[lado]
              return (
                <button
                  key={lado}
                  type="button"
                  onClick={() => setAbrirDestino(lado)}
                  className="flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left"
                  style={{ borderColor: c.borde, backgroundColor: c.fondo }}
                >
                  <span
                    className="c-display shrink-0 text-[15px]"
                    style={{ color: c.tinta }}
                  >
                    {ladoLabel[lado]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right text-[14px] text-[var(--c-ink)]">
                    {d.k === 'potrero'
                      ? `Potrero ${d.nombre}`
                      : d.k === 'venta'
                        ? 'Venta'
                        : d.k === 'corral'
                          ? d.nombre
                          : 'Vuelve al potrero'}
                  </span>
                </button>
              )
            })}
          </div>
          {!usaFrente && (
            <button
              type="button"
              onClick={() => setUsaFrente(true)}
              className="c-label mt-2 !text-[11px] underline underline-offset-2"
            >
              + Agregar una tercera salida
            </button>
          )}
        </div>

        {/* 2 · Qué sale por dónde. Cambia según de dónde venga el lado. */}
        {modo === 'resultado' ? (
          <div>
            <CLabel className="mb-1 block">¿Qué sale por dónde?</CLabel>
            <p className="mb-2 text-[12.5px] leading-snug text-[var(--c-ink-soft)]">
              El resultado del tacto decide el lado: el mismo toque registra y
              aparta.
            </p>
            <div className="flex flex-col gap-2">
              {RESULTADOS_TACTO.map((r, i) => {
                const l: Lado = i === 0 ? 'izq' : 'der'
                const c = colorLado[l]
                return (
                  <div
                    key={r.clave}
                    className="flex items-center gap-3 rounded-xl border-2 px-4 py-3"
                    style={{ borderColor: c.borde, backgroundColor: c.fondo }}
                  >
                    <span className="c-display flex-1 text-[15.5px]" style={{ color: c.tinta }}>
                      {r.label}
                    </span>
                    <span className="text-[13px] font-bold" style={{ color: c.tinta }}>
                      {ladoLabel[l]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : modo === 'libre' ? (
          <p className="rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 py-2.5 text-[12.5px] leading-snug text-[var(--c-ink-soft)]">
            Durante el trabajo elegís el lado y queda puesto: todos los que
            escanees van ahí hasta que lo cambies. Se toca cuando movés la
            puerta, no en cada animal.
          </p>
        ) : (
        <div>
          <CLabel className="mb-1 block">¿Qué sale por dónde?</CLabel>
          <p className="mb-2 text-[12.5px] leading-snug text-[var(--c-ink-soft)]">
            En la manga viene todo mezclado. Con esto cargado, al escanear la app
            te dice para qué lado va cada animal.
          </p>
          {presentes.length === 0 && (
            <p className="rounded-xl border border-[var(--c-warn)]/45 bg-[var(--c-warn-soft)] px-3 py-2.5 text-[12.5px] leading-snug text-[var(--c-warn-deep)]">
              No sabemos qué categorías hay en esta tropa — entrá una vez con
              señal para bajarlas. Sin eso no se puede apartar solo: la app no
              tiene con qué decidir el lado.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {presentes.map((cat) => (
              <div
                key={cat}
                className="rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 py-2.5"
              >
                <div className="c-display mb-1.5 text-[15px] text-[var(--c-ink)]">
                  {categoriaLabel[cat]}
                </div>
                <div className="flex gap-1.5">
                  {lados.map((lado) => {
                    const on = porCategoria[cat] === lado
                    const c = colorLado[lado]
                    return (
                      <button
                        key={lado}
                        type="button"
                        onClick={() =>
                          setPorCategoria((prev) => ({ ...prev, [cat]: lado }))
                        }
                        className={cn(
                          'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border-2 text-[13.5px] font-bold',
                        )}
                        style={
                          on
                            ? { borderColor: c.borde, backgroundColor: c.fondo, color: c.tinta }
                            : {
                                borderColor: 'var(--c-line-strong)',
                                color: 'var(--c-ink-soft)',
                              }
                        }
                      >
                        {on && <Check className="size-3.5" strokeWidth={3.5} />}
                        {ladoLabel[lado]}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {faltan.length > 0 && (
            <p className="c-label mt-2 !text-[11px] !normal-case !text-[var(--c-warn-deep)]">
              Sin asignar: {faltan.map((c) => categoriaLabel[c]).join(', ')}. Si
              queda así, esos animales no se apartan.
            </p>
          )}
        </div>
        )}
      </div>

      <Seguir
        onClick={() => onListo(plan)}
        disabled={modo === 'categoria' && Object.keys(porCategoria).length === 0}
      >
        Empezar
      </Seguir>
    </div>
  )
}
