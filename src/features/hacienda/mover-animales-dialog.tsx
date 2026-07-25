import { useMemo, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  Layers,
  TriangleAlert,
} from 'lucide-react'
import {
  useMoverAnimales,
  useTropasDelPotrero,
  useTropasCampo,
} from '@/features/hacienda/hooks'
import type { ItemCargaMasiva, TropaDelPotrero } from '@/features/hacienda/api'
import { categoriaNombre } from '@/features/hacienda/labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { FormDialog, formItem, formLabel } from '@/components/form-dialog'
import { cn } from '@/lib/utils'

/** Punta del movimiento (origen o destino), resuelta en el mapa. */
export type PuntoMovimiento = {
  campoId: string
  campoNombre: string
  campoColor: string
  potreroId: string
  potreroNombre: string
  /** Cabezas al momento de elegirlo en el mapa (para la guía del panel). */
  cabezas?: number
}

/** Chip de una punta del viaje, con el color del campo como identidad. */
function PuntoChip({ punto }: { punto: PuntoMovimiento }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: punto.campoColor }}
      />
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-bold leading-tight text-ink">
          Potrero {punto.potreroNombre}
        </span>
        <span className="block truncate text-[11.5px] font-medium text-muted-foreground">
          {punto.campoNombre}
        </span>
      </span>
    </span>
  )
}

/** Botón de opción tipo segmento (mismo lenguaje que los toggles del mapa). */
function Opcion({
  activa,
  onClick,
  disabled,
  children,
}: {
  activa: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex-1 rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition-colors',
        activa
          ? 'border-primary bg-field-soft text-field-deep'
          : 'border-border bg-card text-muted-foreground hover:border-faint',
        disabled && 'cursor-not-allowed opacity-40 hover:border-border',
      )}
    >
      {children}
    </button>
  )
}

/** Nombre visible de una tropa (los sueltos no son una tropa). */
const nombreTropa = (t: TropaDelPotrero | null | undefined): string =>
  t?.nombre ?? 'los sueltos'

/** "30 vacas · 15 terneros" — la composición de una tropa, en criollo. */
function composTexto(t: TropaDelPotrero): string {
  return [...t.composicion]
    .sort((a, b) => b.cabezas - a.cabezas)
    .map((c) => `${c.cabezas} ${categoriaNombre(c.categoria, c.cabezas).toLowerCase()}`)
    .join(' · ')
}

/** Cómo se agrupan los animales al llegar. 'aparte' conserva su tropa (o los
 *  deja sueltos si venían así); 'juntar'/'otra' los suman a una tropa; 'nueva'
 *  arma una. */
type Agrup = 'aparte' | 'juntar' | 'nueva' | 'otra'

/**
 * Confirmación del movimiento elegido EN EL MAPA (origen y destino ya vienen
 * fijos). Reencuadrado alrededor de cómo lo piensa el productor: QUÉ se lleva
 * (con la composición a la vista), QUÉ HAY en el potrero destino, y —solo si el
 * destino está ocupado— si se juntan con lo que hay o quedan aparte. Lo demás
 * (tropa nueva, sumar a otra tropa del campo) vive en "más opciones".
 * La transacción y las reglas duras siguen en la RPC `mover_animales`.
 */
export function MoverAnimalesDialog({
  empresaId,
  origen,
  destino,
  onOpenChange,
}: {
  empresaId: string
  origen: PuntoMovimiento
  destino: PuntoMovimiento
  onOpenChange: (v: boolean) => void
}) {
  const tropas = useTropasDelPotrero(origen.potreroId)
  const tropasDestinoPotrero = useTropasDelPotrero(destino.potreroId)
  const tropasCampoDestino = useTropasCampo(destino.campoId)
  const mover = useMoverAnimales()

  const crossCampo = origen.campoId !== destino.campoId

  // 'sueltos' agrupa a los animales sin tropa (loteId null en la API).
  const [tropaSel, setTropaSel] = useState<string | null>(null)
  const [parte, setParte] = useState(false)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [agrupUser, setAgrupUser] = useState<Agrup | null>(null)
  const [juntarIdUser, setJuntarIdUser] = useState<string | null>(null)
  const [otraId, setOtraId] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [verMas, setVerMas] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lista: TropaDelPotrero[] = useMemo(
    () => tropas.data ?? [],
    [tropas.data],
  )
  // Con una sola tropa en el potrero no hay nada que elegir (derivado, sin efecto).
  const tropaKey =
    tropaSel ?? (lista.length === 1 ? (lista[0].loteId ?? 'sueltos') : null)

  const tropa = lista.find((t) => (t.loteId ?? 'sueltos') === tropaKey) ?? null
  const esSueltos = tropa != null && tropa.loteId === null
  const parcial = parte

  // ── Qué hay en el potrero destino (fix de "no sabés qué tropas hay") ──
  const contenidoDestino: TropaDelPotrero[] = useMemo(
    () => tropasDestinoPotrero.data ?? [],
    [tropasDestinoPotrero.data],
  )
  const destinoVacio = contenidoDestino.length === 0
  // Tropas con nombre presentes en el destino: son las candidatas a "juntar".
  const tropasDestino = useMemo(
    () => contenidoDestino.filter((t) => t.loteId !== null),
    [contenidoDestino],
  )
  const hayTropaDestino = tropasDestino.length > 0

  // Cruzar de campo con una PARTE de una tropa exige tropa destino explícita
  // (una tropa vive en un solo campo — invariante de la RPC): "aparte" no vale.
  const aparteInvalido = crossCampo && parcial && !esSueltos

  // Default del agrupamiento: NO destructivo → "aparte" (cada tropa conserva su
  // identidad). Solo cuando "aparte" es inválido cae a juntar/nueva.
  const agrupDefault: Agrup = aparteInvalido
    ? hayTropaDestino
      ? 'juntar'
      : 'nueva'
    : 'aparte'
  const agrup = agrupUser ?? agrupDefault

  const juntarId = juntarIdUser ?? tropasDestino[0]?.loteId ?? null
  const juntarTropa = tropasDestino.find((t) => t.loteId === juntarId) ?? null

  // "más opciones": sumar a una tropa del campo que NO esté ya en el destino
  // (esas ya salen en "juntar") ni sea la de origen.
  const otrasTropasCampo = (tropasCampoDestino.data ?? []).filter(
    (t) => t.id !== tropa?.loteId && !tropasDestino.some((d) => d.loteId === t.id),
  )
  const otraTropa = otrasTropasCampo.find((t) => t.id === otraId) ?? null

  const items: ItemCargaMasiva[] = useMemo(() => {
    if (!tropa) return []
    return tropa.composicion
      .map((c) => ({
        categoria: c.categoria,
        cantidad: parseInt(cantidades[c.categoria] ?? '', 10) || 0,
      }))
      .filter((it) => it.cantidad > 0)
  }, [tropa, cantidades])

  const totalAMover = parcial
    ? items.reduce((s, it) => s + it.cantidad, 0)
    : (tropa?.cabezas ?? 0)

  // Cantidad pedida que excede los sin-caravana de su categoría → se van a
  // reasignar animales identificados elegidos automáticamente. Avisar.
  const tocaCaravaneados = useMemo(() => {
    if (!parcial || !tropa) return 0
    return items.reduce((s, it) => {
      const c = tropa.composicion.find((x) => x.categoria === it.categoria)
      return s + Math.max(0, it.cantidad - (c?.sinCaravana ?? 0))
    }, 0)
  }, [parcial, tropa, items])

  const excedido = useMemo(() => {
    if (!parcial || !tropa) return null
    for (const it of items) {
      const c = tropa.composicion.find((x) => x.categoria === it.categoria)
      if (c && it.cantidad > c.cabezas) {
        return `Solo hay ${c.cabezas} ${categoriaNombre(c.categoria, c.cabezas).toLowerCase()} en este potrero`
      }
    }
    return null
  }, [parcial, tropa, items])

  // Una línea que explica QUÉ va a pasar con la opción elegida, en criollo.
  const explicacion = (() => {
    if (agrup === 'juntar')
      return `Se suman a "${nombreTropa(juntarTropa)}" — pasan a ser parte de esa tropa.`
    if (agrup === 'otra')
      return `Se suman a "${otraTropa?.nombre ?? '…'}".`
    if (agrup === 'nueva')
      return `Se arma una tropa nueva en ${destino.campoNombre} con los que movés.`
    // aparte
    if (esSueltos) return 'Llegan sin agrupar, como estaban.'
    if (crossCampo && !parcial)
      return `La tropa "${tropa?.nombre ?? ''}" se muda a ${destino.campoNombre}.`
    if (parcial)
      return `Siguen en "${tropa?.nombre ?? ''}", ahora repartida entre los dos potreros.`
    return `La tropa "${tropa?.nombre ?? ''}" pasa al potrero ${destino.potreroNombre}.`
  })()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!tropa) {
      setError('Elegí qué se mueve')
      return
    }
    if (parcial && totalAMover === 0) {
      setError('Anotá cuántos animales se mueven')
      return
    }
    if (excedido) {
      setError(excedido)
      return
    }
    if (agrup === 'juntar' && !juntarId) {
      setError('Elegí con qué tropa se juntan')
      return
    }
    if (agrup === 'otra' && !otraId) {
      setError('Elegí la tropa destino')
      return
    }
    if (agrup === 'nueva' && !nuevoNombre.trim()) {
      setError('Poné el nombre de la tropa nueva')
      return
    }
    const destinoRPC =
      agrup === 'juntar' && juntarId
        ? { loteId: juntarId }
        : agrup === 'otra' && otraId
          ? { loteId: otraId }
          : agrup === 'nueva'
            ? { nuevoNombre }
            : undefined
    mover.mutate(
      {
        empresaId,
        potreroOrigenId: origen.potreroId,
        potreroDestinoId: destino.potreroId,
        loteId: tropa.loteId,
        seleccion: parcial ? { items } : { todo: true },
        destino: destinoRPC,
      },
      {
        onSuccess: (res) => {
          toast.success(
            `${res.movidos} ${res.movidos === 1 ? 'animal movido' : 'animales movidos'} al potrero ${destino.potreroNombre}` +
              (res.tropaMudada ? ` — la tropa se mudó a ${destino.campoNombre}` : ''),
          )
          onOpenChange(false)
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  const aparteLabel = esSueltos ? 'Quedan sin agrupar' : 'Quedan aparte'

  return (
    <FormDialog
      open
      onOpenChange={onOpenChange}
      icon={ArrowRightLeft}
      title="Mover animales"
      subtitle="Elegí qué se mueve y cómo se agrupan al llegar. Todo queda en el historial de cada animal."
      onSubmit={onSubmit}
      footer={
        <Button
          type="submit"
          className="w-full"
          disabled={mover.isPending || !tropa || (parcial && totalAMover === 0)}
        >
          {mover.isPending
            ? 'Moviendo…'
            : totalAMover > 0
              ? `Mover ${totalAMover} ${totalAMover === 1 ? 'animal' : 'animales'}`
              : parcial
                ? 'Anotá cuántos se mueven'
                : 'Mover'}
        </Button>
      }
    >
      {/* Viaje: origen → destino (ya elegidos en el mapa) */}
      <motion.div variants={formItem} className="flex items-center gap-2">
        <PuntoChip punto={origen} />
        <ArrowRight className="size-4 shrink-0 text-field-deep" />
        <PuntoChip punto={destino} />
      </motion.div>

      {/* ── ¿Qué movés? ── */}
      {tropas.isLoading ? (
        <motion.p variants={formItem} className="text-[13px] text-muted-foreground">
          Cargando la hacienda del potrero…
        </motion.p>
      ) : lista.length === 0 ? (
        <motion.p variants={formItem} className="text-[13px] text-muted-foreground">
          Este potrero no tiene animales para mover.
        </motion.p>
      ) : (
        <>
          <motion.div variants={formItem}>
            <span className={formLabel}>¿Qué movés?</span>
            <div className="grid gap-2">
              {lista.map((t) => {
                const key = t.loteId ?? 'sueltos'
                const activa = tropaKey === key
                const unica = lista.length === 1
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (unica) return
                      setTropaSel(key)
                      setCantidades({})
                    }}
                    className={cn(
                      'rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                      activa
                        ? 'border-primary bg-field-soft'
                        : 'border-border bg-card hover:border-faint',
                      unica && 'cursor-default',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] font-bold text-ink">
                        <Layers className="size-3.5 shrink-0 text-field-deep" />
                        <span className="truncate">
                          {t.nombre ?? 'Sueltos (sin agrupar)'}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-[13px] font-semibold text-muted-foreground">
                        {t.cabezas} cab
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {composTexto(t)}
                    </p>
                  </button>
                )
              })}
            </div>
          </motion.div>

          {tropa && (
            <>
              {/* Cuánto se mueve */}
              <motion.div variants={formItem}>
                <span className={formLabel}>Cuánto se mueve</span>
                <div className="flex gap-2">
                  <Opcion activa={!parcial} onClick={() => setParte(false)}>
                    {esSueltos ? 'Todos' : 'Toda la tropa'} · {tropa.cabezas}
                  </Opcion>
                  <Opcion activa={parcial} onClick={() => setParte(true)}>
                    Solo una parte
                  </Opcion>
                </div>
              </motion.div>

              {parcial && (
                <motion.div variants={formItem} className="grid gap-2">
                  <p className="text-[12px] leading-snug text-muted-foreground">
                    Anotá cuántos se van de cada categoría (tocá “de&nbsp;N”
                    para usar todos los de esa categoría).
                  </p>
                  {tropa.composicion.map((c) => (
                    <div key={c.categoria} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-[13px] font-semibold text-ink">
                        {categoriaNombre(c.categoria, c.cabezas)}
                      </span>
                      <Input
                        inputMode="numeric"
                        placeholder="0"
                        value={cantidades[c.categoria] ?? ''}
                        onChange={(e) =>
                          setCantidades((prev) => ({
                            ...prev,
                            [c.categoria]: e.target.value,
                          }))
                        }
                        className="h-9 w-20 text-center"
                      />
                      <button
                        type="button"
                        title={`Mover ${c.cabezas === 1 ? 'el único' : `los ${c.cabezas}`}`}
                        onClick={() =>
                          setCantidades((prev) => ({
                            ...prev,
                            [c.categoria]: String(c.cabezas),
                          }))
                        }
                        className="text-[12.5px] text-faint underline-offset-2 transition-colors hover:text-field-deep hover:underline"
                      >
                        de {c.cabezas}
                      </button>
                    </div>
                  ))}
                  {totalAMover > 0 && (
                    <p className="text-[12.5px] font-semibold text-field-deep">
                      Vas a mover {totalAMover} de {tropa.cabezas} animales.
                    </p>
                  )}
                  {tocaCaravaneados > 0 && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-[#f5edd8] px-2.5 py-2 text-[12px] font-medium text-[#7a5a12]">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                      Va a incluir {tocaCaravaneados}{' '}
                      {tocaCaravaneados === 1 ? 'animal caravaneado' : 'animales caravaneados'}{' '}
                      elegidos automáticamente. Si importa cuáles, movelos por caravana desde su ficha.
                    </p>
                  )}
                </motion.div>
              )}

              {/* ── Qué hay en el destino (informativo) ── */}
              <motion.div variants={formItem}>
                <span className={formLabel}>En el potrero {destino.potreroNombre}</span>
                {tropasDestinoPotrero.isLoading ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    Viendo qué hay…
                  </p>
                ) : destinoVacio ? (
                  <p className="rounded-xl border border-dashed border-border bg-card px-3 py-2 text-[12.5px] text-muted-foreground">
                    Está vacío — no hay animales todavía.
                  </p>
                ) : (
                  <div className="grid gap-1 rounded-xl bg-secondary/60 px-3 py-2.5">
                    {contenidoDestino.map((t) => (
                      <div
                        key={t.loteId ?? 'sueltos'}
                        className="flex items-baseline justify-between gap-2 text-[12.5px]"
                      >
                        <span className="min-w-0 truncate font-semibold text-ink">
                          {t.nombre ?? 'Sueltos (sin agrupar)'}
                        </span>
                        <span className="tnum shrink-0 text-muted-foreground">
                          {t.cabezas} cab
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* ── Al llegar (agrupamiento) ── */}
              <motion.div variants={formItem}>
                <span className={formLabel}>Al llegar</span>

                {/* La pregunta "juntar / aparte" solo aparece cuando el destino
                    ya tiene una tropa con la que juntarse. */}
                {hayTropaDestino && (
                  <>
                    <div className="flex gap-2">
                      <Opcion
                        activa={agrup === 'juntar'}
                        onClick={() => {
                          setAgrupUser('juntar')
                          setVerMas(false)
                        }}
                      >
                        {tropasDestino.length === 1
                          ? `Se juntan con ${nombreTropa(juntarTropa)}`
                          : 'Se juntan con…'}
                      </Opcion>
                      <Opcion
                        activa={agrup === 'aparte'}
                        disabled={aparteInvalido}
                        onClick={() => {
                          setAgrupUser('aparte')
                          setVerMas(false)
                        }}
                      >
                        {aparteLabel}
                      </Opcion>
                    </div>
                    {agrup === 'juntar' && tropasDestino.length > 1 && (
                      <div className="mt-2">
                        <Dropdown
                          value={juntarId ?? ''}
                          onChange={setJuntarIdUser}
                          options={tropasDestino.map((t) => ({
                            value: t.loteId as string,
                            label: `${t.nombre} · ${t.cabezas} cab`,
                          }))}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Qué implica lo elegido, en criollo. */}
                <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
                  {explicacion}
                </p>

                {aparteInvalido && (
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                    Como movés una parte a otro campo, tienen que sumarse a una
                    tropa de {destino.campoNombre} o formar una nueva (una tropa
                    no puede quedar partida en dos campos).
                  </p>
                )}

                {/* Más opciones: tropa nueva / sumar a otra tropa del campo. */}
                <button
                  type="button"
                  onClick={() => setVerMas((v) => !v)}
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-field-deep transition-colors hover:text-field"
                >
                  <ChevronDown
                    className={cn('size-3.5 transition-transform', verMas && 'rotate-180')}
                  />
                  {verMas ? 'Menos opciones' : 'Más opciones'}
                </button>

                {verMas && (
                  <div className="mt-2 grid gap-2 rounded-xl border border-border bg-card p-3">
                    <button
                      type="button"
                      onClick={() => setAgrupUser('nueva')}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-[12.5px] font-semibold transition-colors',
                        agrup === 'nueva'
                          ? 'border-primary bg-field-soft text-field-deep'
                          : 'border-border text-muted-foreground hover:border-faint',
                      )}
                    >
                      Armar una tropa nueva
                    </button>
                    {agrup === 'nueva' && (
                      <Input
                        value={nuevoNombre}
                        onChange={(e) => setNuevoNombre(e.target.value)}
                        placeholder={`Ej. Tropa ${destino.potreroNombre}`}
                      />
                    )}
                    {otrasTropasCampo.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setAgrupUser('otra')}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-left text-[12.5px] font-semibold transition-colors',
                            agrup === 'otra'
                              ? 'border-primary bg-field-soft text-field-deep'
                              : 'border-border text-muted-foreground hover:border-faint',
                          )}
                        >
                          Sumar a otra tropa de {destino.campoNombre}
                        </button>
                        {agrup === 'otra' && (
                          <Dropdown
                            value={otraId}
                            onChange={setOtraId}
                            options={[
                              { value: '', label: 'Elegí la tropa…' },
                              ...otrasTropasCampo.map((t) => ({
                                value: t.id,
                                label: t.nombre,
                              })),
                            ]}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            </>
          )}
        </>
      )}

      {error && (
        <motion.p
          variants={formItem}
          className="rounded-lg bg-[#fbe9e7] px-2.5 py-2 text-[12.5px] font-semibold text-[#b4232a]"
        >
          {error}
        </motion.p>
      )}
    </FormDialog>
  )
}
