import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Layers,
  MapPin,
  PencilLine,
  Store,
  Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Croquis } from '@/features/campo/recorrida/croquis'
import type { RecPotrero } from '@/features/campo/recorrida/db'
import { CLabel } from '../ui'
import { Encabezado, IconoDestino, OpcionDestino, Seguir } from './ui-manga'
import { ComposicionPotrero } from './composicion'
import { MapaSalidas } from './mapa-salidas'
import type { CategoriaAnimal } from './api'
import {
  LADOS,
  colorLado,
  destinoLabel,
  etiquetaDeCategorias,
  ladoFlecha,
  ladoLabel,
  ordenarPorLado,
  planDestete,
  planPorCategoria,
  planTacto,
  sinAsignar,
  type Destino,
  type Lado,
  type ModoSalida,
  type PlanSalidas,
  type Salida,
} from './salidas'

/**
 * Prearmado del aparte: qué grupos salen, cómo se llaman, a dónde van y por qué
 * lado del cepo. Se hace UNA vez, antes de que entre el primer animal.
 *
 * El orden de las preguntas es el del trabajo, no el de la máquina: primero QUÉ
 * separás (que es lo que el productor ya tiene decidido cuando junta la
 * hacienda), después a dónde va cada grupo, y recién al final por qué puerta
 * sale. La puerta es lo único que la app no puede deducir.
 */

type Sub = 'criterio' | 'plan'

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
  esDestete: boolean
  /** Modo que impone la actividad. En un aparte suelto llega como `libre` y lo
   *  termina de decidir el productor en el primer paso. */
  modo: ModoSalida
  onListo: (plan: PlanSalidas) => void
  onVolver: () => void
}) {
  const inicial = useMemo(() => {
    if (modo === 'resultado') {
      const t = planTacto()
      return { salidas: t.salidas, porCategoria: {}, porResultado: t.porResultado }
    }
    if (esDestete) {
      const d = planDestete(presentes)
      return { salidas: d.salidas, porCategoria: d.porCategoria, porResultado: undefined }
    }
    return {
      salidas: [] as Salida[],
      porCategoria: {} as Partial<Record<CategoriaAnimal, string>>,
      porResultado: undefined,
    }
    // Se calcula una sola vez: recalcularlo pisaría lo que el productor editó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El aparte suelto es el único que llega sin grupos: los define el productor.
  const [sub, setSub] = useState<Sub>(modo === 'libre' ? 'criterio' : 'plan')
  const [modoFinal, setModoFinal] = useState<ModoSalida>(modo)
  const [salidas, setSalidas] = useState<Salida[]>(inicial.salidas)
  const [porCategoria, setPorCategoria] = useState(inicial.porCategoria)
  const [criterio, setCriterio] = useState<'categoria' | 'propio'>('categoria')
  // Arranca con TODAS marcadas: el caso normal es separar todo lo que hay,
  // y desmarcar lo que sobra es menos trabajo que marcar de cero.
  const [elegidas, setElegidas] = useState<Set<CategoriaAnimal>>(
    () => new Set(presentes),
  )
  const [nombres, setNombres] = useState<string[]>(['', ''])
  const [abrirDestino, setAbrirDestino] = useState<string | null>(null)
  const [mirandoCroquis, setMirandoCroquis] = useState<string | null>(null)
  const [potreroTocado, setPotreroTocado] = useState<string | null>(null)

  const plan: PlanSalidas = {
    modo: modoFinal,
    salidas,
    porCategoria,
    porResultado: inicial.porResultado,
  }
  const faltan = modoFinal === 'categoria' ? sinAsignar(plan, presentes) : []

  const editar = (id: string, cambio: Partial<Salida>) =>
    setSalidas((prev) => prev.map((s) => (s.id === id ? { ...s, ...cambio } : s)))

  /**
   * Mover un grupo a un lado ocupado INTERCAMBIA con el que estaba ahí. Dos
   * grupos por la misma puerta no existe físicamente, y avisarlo con un error
   * sería hacerle resolver a mano algo que solo tiene una salida posible.
   */
  const ponerLado = (id: string, lado: Lado) => {
    const actual = salidas.find((s) => s.id === id)
    const ocupa = salidas.find((s) => s.lado === lado && s.id !== id)
    setSalidas((prev) =>
      prev.map((s) => {
        if (s.id === id) return { ...s, lado }
        if (ocupa && s.id === ocupa.id && actual) return { ...s, lado: actual.lado }
        return s
      }),
    )
  }

  // ===== Paso 0 · ¿Qué apartás? — UNA pantalla (solo en el aparte suelto) =====
  //
  // Antes eran dos: elegir el criterio y, si era propio, otra para nombrar los
  // grupos. La segunda no aportaba una decisión nueva —era la misma,
  // continuada— y obligaba a ir y volver para comparar las dos formas de
  // separar. Ahora el criterio es un interruptor y lo que decide aparece
  // debajo, en vivo.
  if (sub === 'criterio') {
    const porCategoriaOk = criterio === 'categoria' && elegidas.size >= 2
    const nombresOk =
      criterio === 'propio' && nombres.filter((n) => n.trim()).length >= 2

    const OPCIONES = [
      {
        k: 'categoria' as const,
        Icono: Layers,
        nombre: 'Por categoría',
        pie: 'La app dice sola el lado',
        color: colorLado.izq,
      },
      {
        k: 'propio' as const,
        Icono: PencilLine,
        nombre: 'Por criterio mío',
        pie: 'Tocás en cada animal',
        color: colorLado.der,
      },
    ]

    return (
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        <Encabezado titulo={titulo} sub="¿Qué apartás?" onVolver={onVolver} />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5">
          {/* El interruptor: las dos formas de separar, siempre a la vista. */}
          <div className="grid shrink-0 grid-cols-2 gap-2">
            {OPCIONES.map(({ k, Icono, nombre, pie, color }) => {
              const on = criterio === k
              return (
                <motion.button
                  key={k}
                  type="button"
                  onClick={() => setCriterio(k)}
                  whileTap={{ scale: 0.98 }}
                  aria-pressed={on}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-2xl px-3 py-2.5 text-left transition-colors',
                    on ? 'border-2' : 'border border-[var(--c-line-strong)]',
                  )}
                  style={
                    on
                      ? { borderColor: color.borde, backgroundColor: color.fondo }
                      : { backgroundColor: 'var(--c-panel)' }
                  }
                >
                  <Icono
                    className="size-5 shrink-0"
                    style={{ color: on ? color.tinta : 'var(--c-faint)' }}
                  />
                  <span
                    className="c-display text-[14.5px] leading-tight"
                    style={{ color: on ? color.tinta : 'var(--c-ink)' }}
                  >
                    {nombre}
                  </span>
                  <span className="text-[11.5px] leading-snug text-[var(--c-ink-soft)]">
                    {pie}
                  </span>
                </motion.button>
              )
            })}
          </div>

          {criterio === 'categoria' ? (
            <div className="shrink-0">
              <CLabel className="mb-1.5 block">
                Cuáles separás — cada una es un grupo
              </CLabel>
              {presentes.length === 0 ? (
                <p className="rounded-xl border border-[var(--c-warn)]/45 bg-[var(--c-warn-soft)] px-3 py-2.5 text-[12.5px] leading-snug text-[var(--c-warn-deep)]">
                  No sabemos qué categorías hay en esta tropa — entrá una vez con
                  señal para bajarlas. Sin eso, apartar por categoría no puede
                  resolver solo.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {presentes.map((cat) => {
                    const on = elegidas.has(cat)
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() =>
                          setElegidas((prev) => {
                            const n = new Set(prev)
                            if (n.has(cat)) n.delete(cat)
                            else n.add(cat)
                            return n
                          })
                        }
                        aria-pressed={on}
                        className={cn(
                          'flex h-13 items-center gap-2.5 rounded-xl px-3 text-left transition-colors',
                          on
                            ? 'border-2 border-[var(--c-ok)] bg-[var(--c-ok-soft)]'
                            : 'border border-[var(--c-line-strong)] bg-[var(--c-panel)]',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md border-2',
                            on
                              ? 'border-[var(--c-ok)] bg-[var(--c-ok)]'
                              : 'border-[var(--c-line-strong)]',
                          )}
                        >
                          {on && (
                            <Check className="size-4 text-white" strokeWidth={3.5} />
                          )}
                        </span>
                        <span
                          className={cn(
                            'c-display min-w-0 flex-1 truncate text-[15.5px]',
                            on ? 'text-[var(--c-ok-deep)]' : 'text-[var(--c-ink)]',
                          )}
                        >
                          {etiquetaDeCategorias([cat])}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {presentes.length > 0 && elegidas.size < 2 && (
                <p className="c-label mt-2 !text-[11px] !normal-case !text-[var(--c-ink-soft)]">
                  Elegí al menos dos: apartar es separar una de otra.
                </p>
              )}
            </div>
          ) : (
            <div className="shrink-0">
              <CLabel className="mb-1.5 block">
                Cómo se llaman — es lo que vas a leer en el cepo
              </CLabel>
              <div className="flex flex-col gap-2">
                {nombres.map((n, i) => {
                  const c = colorLado[LADOS[i]]
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span
                        className="c-display w-6 shrink-0 text-center text-[17px] leading-none"
                        style={{ color: c.tinta }}
                        aria-hidden
                      >
                        {ladoFlecha[LADOS[i]]}
                      </span>
                      <input
                        value={n}
                        onChange={(e) =>
                          setNombres((prev) =>
                            prev.map((x, j) => (j === i ? e.target.value : x)),
                          )
                        }
                        maxLength={18}
                        placeholder={['Gordos', 'Flacas', 'Al toro'][i]}
                        className="c-display h-13 min-w-0 flex-1 rounded-xl border-2 px-3.5 text-[16px] text-[var(--c-ink)] outline-none"
                        style={{ borderColor: c.borde, backgroundColor: c.fondo }}
                      />
                    </div>
                  )
                })}
              </div>
              {nombres.length < 3 && (
                <button
                  type="button"
                  onClick={() => setNombres((p) => [...p, ''])}
                  className="c-label mt-2 !text-[11px] underline underline-offset-2"
                >
                  + Agregar un tercer grupo
                </button>
              )}
            </div>
          )}
        </div>

        <Seguir
          disabled={!porCategoriaOk && !nombresOk}
          onClick={() => {
            if (criterio === 'categoria') {
              const p = planPorCategoria(presentes.filter((c) => elegidas.has(c)))
              setSalidas(p.salidas)
              setPorCategoria(p.porCategoria)
              setModoFinal('categoria')
            } else {
              setSalidas(
                nombres
                  .map((n, i) => ({ n: n.trim(), i }))
                  .filter((x) => x.n.length > 0)
                  .map(({ n, i }) => ({
                    id: `g${i + 1}`,
                    etiqueta: n,
                    lado: LADOS[i],
                    destino: { k: 'queda' } as Destino,
                  })),
              )
              setModoFinal('libre')
            }
            setSub('plan')
          }}
        >
          Seguir
        </Seguir>
      </div>
    )
  }

  // ===== Elegir el potrero destino sobre el croquis =====
  if (mirandoCroquis) {
    const grupo = salidas.find((s) => s.id === mirandoCroquis)
    const c = colorLado[grupo?.lado ?? 'izq']
    return (
      <div className="flex h-full flex-col">
        <Encabezado
          titulo={`¿A dónde van ${(grupo?.etiqueta ?? '').toLowerCase()}?`}
          sub="Tocá el potrero en el croquis"
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
                // Sin alto propio: el techo y el scroll los pone la zona del
                // pulgar del croquis. Medir en `vh` acá recorta —el contenedor
                // no es el viewport y `html{zoom:1.06}` infla las unidades de
                // viewport un 6%—.
                className="border-t-2 bg-[var(--c-panel)] px-4 pb-4 pt-3.5"
                style={{ borderColor: c.borde }}
              >
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="c-display truncate text-[19px] text-[var(--c-ink)]">
                      Potrero {p.nombre}
                    </div>
                    {/* QUÉ hay del otro lado, no sólo cuántos: mandar terneros
                        a un potrero con toros no es lo mismo. */}
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
                    {grupo?.etiqueta}
                  </span>
                </div>
                {p.id === origenId ? (
                  <p className="mt-3 rounded-xl bg-[var(--c-sunk)] px-3 py-2.5 text-center text-[13px] text-[var(--c-ink-soft)]">
                    De acá salen los animales — elegí otro potrero
                  </p>
                ) : (
                  // Pegado al piso del panel: con un potrero destino de
                  // composición larga, la acción principal quedaba medio tapada
                  // contra el borde y se leía como cortada aunque scrolleara.
                  <div className="sticky bottom-0 -mx-4 mt-3.5 bg-[var(--c-panel)] px-4 pb-0.5 pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        editar(mirandoCroquis, {
                          destino: { k: 'potrero', id: p.id, nombre: p.nombre },
                        })
                        setMirandoCroquis(null)
                        setAbrirDestino(null)
                      }}
                      className="c-display c-hard flex h-14 w-full items-center justify-center rounded-xl text-[17px] text-white"
                      style={{ backgroundColor: c.borde }}
                    >
                      Van acá
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          />
        </div>
      </div>
    )
  }

  // ===== Elegir el tipo de destino de un grupo =====
  if (abrirDestino) {
    const grupo = salidas.find((s) => s.id === abrirDestino)
    const c = colorLado[grupo?.lado ?? 'izq']
    const elegir = (d: Destino) => {
      editar(abrirDestino, { destino: d })
      setAbrirDestino(null)
    }
    return (
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        <Encabezado
          titulo={`¿A dónde van ${(grupo?.etiqueta ?? '').toLowerCase()}?`}
          sub="Elegí una vez, vale toda la jornada"
          onVolver={() => setAbrirDestino(null)}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
          <OpcionDestino
            icono={<MapPin className="size-5" />}
            titulo="A otro potrero"
            detalle="Los mueve de verdad — cambia el stock del potrero"
            acento={c}
            onClick={() => {
              setPotreroTocado(null)
              setMirandoCroquis(abrirDestino)
            }}
          />
          <OpcionDestino
            icono={<Store className="size-5" />}
            titulo="Se venden"
            detalle="Quedan marcados para venta; la baja la hacés en Oficina"
            acento={c}
            onClick={() => elegir({ k: 'venta' })}
          />
          <OpcionDestino
            icono={<ArrowLeftRight className="size-5" />}
            titulo="Quedan en la manga"
            detalle="Encerrados, se decide después — no cambia el stock"
            acento={c}
            onClick={() => elegir({ k: 'manga' })}
          />
          <OpcionDestino
            icono={<Undo2 className="size-5" />}
            titulo="Vuelven al potrero"
            detalle="Salen por acá pero no se mueven de donde estaban"
            acento={c}
            onClick={() => elegir({ k: 'queda' })}
          />
        </div>
      </div>
    )
  }

  // ===== El plan completo =====
  const enOrden = ordenarPorLado(salidas)

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <Encabezado
        titulo={titulo}
        sub="Qué sale y a dónde va"
        onVolver={() => (modo === 'libre' ? setSub('criterio') : onVolver())}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        {/* El aparte entero de un vistazo, sobre la forma del campo. */}
        <MapaSalidas
          potreros={potreros}
          origenId={origenId}
          salidas={salidas}
        />

        {enOrden.map((s) => {
          const c = colorLado[s.lado]
          return (
            <div
              key={s.id}
              className="shrink-0 overflow-hidden rounded-2xl border-2 bg-[var(--c-panel)]"
              style={{ borderColor: c.borde }}
            >
              {/* Quién: el nombre del animal, que es lo que se lee después en
                  el cepo. Nunca el lado. */}
              <div
                className="flex items-center gap-2.5 px-4 py-2.5"
                style={{ backgroundColor: c.fondo }}
              >
                <span
                  className="c-display text-[22px] leading-none"
                  style={{ color: c.tinta }}
                  aria-hidden
                >
                  {ladoFlecha[s.lado]}
                </span>
                <span
                  data-testid="grupo-nombre"
                  className="c-display min-w-0 flex-1 truncate text-[18px]"
                  style={{ color: c.tinta }}
                >
                  {s.etiqueta}
                </span>
              </div>

              {/* A dónde va */}
              <button
                type="button"
                onClick={() => setAbrirDestino(s.id)}
                aria-label={`A dónde van ${s.etiqueta}`}
                className="flex w-full items-center gap-2 border-b border-[var(--c-line)] px-4 py-3 text-left"
              >
                <span className="c-label shrink-0 !text-[10.5px]">Van a</span>
                <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                  <IconoDestino
                    destino={s.destino}
                    className="text-[var(--c-ink-soft)]"
                  />
                  <span className="c-display truncate text-[15px] text-[var(--c-ink)]">
                    {destinoLabel(s.destino)}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-[var(--c-faint)]" />
              </button>

              {/* Por qué puerta. Lo único que la app no puede deducir, y por eso
                  lo último: el productor ya decidió todo lo demás. */}
              <div className="px-4 py-2.5">
                <CLabel className="mb-1.5 block">Salen por</CLabel>
                <div className="flex gap-1.5">
                  {LADOS.map((lado) => {
                    const on = s.lado === lado
                    const cl = colorLado[lado]
                    return (
                      <button
                        key={lado}
                        type="button"
                        onClick={() => ponerLado(s.id, lado)}
                        className={cn(
                          'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border-2 text-[13px] font-bold',
                        )}
                        style={
                          on
                            ? {
                                borderColor: cl.borde,
                                backgroundColor: cl.fondo,
                                color: cl.tinta,
                              }
                            : {
                                borderColor: 'var(--c-line-strong)',
                                color: 'var(--c-ink-soft)',
                              }
                        }
                      >
                        <span aria-hidden className="text-[15px] leading-none">
                          {ladoFlecha[lado]}
                        </span>
                        {ladoLabel[lado]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}

        {modoFinal === 'resultado' && (
          <p className="shrink-0 text-[12.5px] leading-snug text-[var(--c-ink-soft)]">
            El resultado del tacto decide el grupo: el mismo toque registra y
            aparta.
          </p>
        )}
        {modoFinal === 'libre' && (
          <p className="shrink-0 text-[12.5px] leading-snug text-[var(--c-ink-soft)]">
            Durante el trabajo elegís el grupo y queda puesto: todos los que
            escanees van ahí hasta que lo cambies. Se toca cuando movés la
            puerta, no en cada animal.
          </p>
        )}
        {faltan.length > 0 && (
          <p className="c-label shrink-0 !text-[11px] !normal-case !text-[var(--c-warn-deep)]">
            Sin asignar:{' '}
            {faltan.map((c) => etiquetaDeCategorias([c])).join(', ')}. Si queda
            así, esos animales no se apartan.
          </p>
        )}
      </div>

      <Seguir onClick={() => onListo(plan)} disabled={salidas.length === 0}>
        Empezar
      </Seguir>
    </div>
  )
}
