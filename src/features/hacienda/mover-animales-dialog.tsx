import { useMemo, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowRight, ArrowRightLeft, TriangleAlert } from 'lucide-react'
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

/**
 * Confirmación del movimiento elegido EN EL MAPA (origen y destino ya vienen
 * fijos): qué tropa, cuánto se mueve (toda / cantidades por categoría) y a qué
 * tropa llega. La transacción la hace la RPC `mover_animales`; las reglas
 * duras (tropa en un solo campo, cantidades disponibles) viven en Postgres y
 * acá solo se anticipan para no ofrecer opciones inválidas.
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
  const tropasDestino = useTropasCampo(destino.campoId)
  const mover = useMoverAnimales()

  const crossCampo = origen.campoId !== destino.campoId

  // 'sueltos' agrupa a los animales sin tropa (loteId null en la API).
  const [tropaSel, setTropaSel] = useState<string | null>(null)
  const [modo, setModo] = useState<'todo' | 'cantidades'>('todo')
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [destinoTropa, setDestinoTropa] = useState<
    'conservar' | 'existente' | 'nueva'
  >('conservar')
  const [destinoLoteId, setDestinoLoteId] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
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
  const parcial = modo === 'cantidades'

  // Cruzar de campo con una PARTE de la tropa exige tropa destino explícita
  // (una tropa vive en un solo campo — invariante de la RPC). Si 'conservar'
  // quedó inválido, cae a la mejor alternativa (derivado, sin efecto).
  const conservarInvalido = crossCampo && parcial && !esSueltos
  const destinoSel =
    conservarInvalido && destinoTropa === 'conservar'
      ? (tropasDestino.data ?? []).length > 0
        ? 'existente'
        : 'nueva'
      : destinoTropa

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

  const conservarLabel = esSueltos
    ? 'Quedan sueltos'
    : crossCampo
      ? `Mudar "${tropa?.nombre ?? ''}" a ${destino.campoNombre}`
      : `Sigue siendo "${tropa?.nombre ?? ''}"`

  const sinTropasDestino = (tropasDestino.data ?? []).length === 0

  // Una línea que explica QUÉ va a pasar con la opción elegida — el productor
  // no tiene por qué saber qué implica cada botón.
  const destinoExplicacion =
    destinoSel === 'existente'
      ? 'Los animales movidos pasan a formar parte de la tropa que elijas.'
      : destinoSel === 'nueva'
        ? `Se arma una tropa nueva en ${destino.campoNombre} con los animales movidos.`
        : esSueltos
          ? 'Llegan sin tropa asignada. Los podés agrupar en una tropa cuando quieras.'
          : crossCampo
            ? `La tropa entera se muda de campo: pasa a ser de ${destino.campoNombre}.`
            : parcial
              ? `Siguen siendo de la misma tropa: "${tropa?.nombre ?? ''}" queda repartida entre los dos potreros.`
              : `La tropa entera pasa al potrero ${destino.potreroNombre}.`

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!tropa) {
      setError('Elegí qué tropa se mueve')
      return
    }
    if (parcial && totalAMover === 0) {
      setError('Ingresá cuántos animales se mueven')
      return
    }
    if (excedido) {
      setError(excedido)
      return
    }
    if (destinoSel === 'existente' && !destinoLoteId) {
      setError('Elegí la tropa destino')
      return
    }
    if (destinoSel === 'nueva' && !nuevoNombre.trim()) {
      setError('Poné el nombre de la tropa nueva')
      return
    }
    mover.mutate(
      {
        empresaId,
        potreroOrigenId: origen.potreroId,
        potreroDestinoId: destino.potreroId,
        loteId: tropa.loteId,
        seleccion: parcial ? { items } : { todo: true },
        destino:
          destinoSel === 'existente'
            ? { loteId: destinoLoteId }
            : destinoSel === 'nueva'
              ? { nuevoNombre }
              : undefined,
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

  return (
    <FormDialog
      open
      onOpenChange={onOpenChange}
      icon={ArrowRightLeft}
      title="Mover animales"
      subtitle="Elegí cuántos se mueven y a qué tropa llegan. Todo queda en el historial de cada animal."
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

      {/* Qué tropa (solo si hay más de una en el potrero) */}
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
          {lista.length > 1 && (
            <motion.div variants={formItem}>
              <span className={formLabel}>Qué tropa se mueve</span>
              <div className="grid gap-2">
                {lista.map((t) => {
                  const key = t.loteId ?? 'sueltos'
                  const activa = tropaKey === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setTropaSel(key)
                        setCantidades({})
                      }}
                      className={cn(
                        'flex items-baseline justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                        activa
                          ? 'border-primary bg-field-soft'
                          : 'border-border bg-card hover:border-faint',
                      )}
                    >
                      <span className="text-[13.5px] font-bold text-ink">
                        {t.nombre ?? 'Sueltos (sin tropa)'}
                      </span>
                      <span className="tnum shrink-0 text-[13px] font-semibold text-muted-foreground">
                        {t.cabezas} cab
                      </span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}

          {tropa && (
            <>
              {/* Cuánto se mueve */}
              <motion.div variants={formItem}>
                <span className={formLabel}>Cuánto se mueve</span>
                <div className="flex gap-2">
                  <Opcion activa={!parcial} onClick={() => setModo('todo')}>
                    {esSueltos ? 'Todos' : 'Toda la tropa'} · {tropa.cabezas}
                  </Opcion>
                  <Opcion activa={parcial} onClick={() => setModo('cantidades')}>
                    Elegir cantidades
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

              {/* A qué tropa llegan */}
              <motion.div variants={formItem}>
                <span className={formLabel}>
                  Al llegar a {destino.potreroNombre}
                </span>
                <div className="flex gap-2">
                  <Opcion
                    activa={destinoSel === 'conservar'}
                    disabled={conservarInvalido}
                    onClick={() => setDestinoTropa('conservar')}
                  >
                    {conservarLabel}
                  </Opcion>
                  <Opcion
                    activa={destinoSel === 'existente'}
                    disabled={sinTropasDestino}
                    onClick={() => setDestinoTropa('existente')}
                  >
                    Sumar a otra tropa
                  </Opcion>
                  <Opcion
                    activa={destinoSel === 'nueva'}
                    onClick={() => setDestinoTropa('nueva')}
                  >
                    Tropa nueva
                  </Opcion>
                </div>
                {/* Qué implica la opción elegida, en criollo. */}
                <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
                  {destinoExplicacion}
                </p>
                {sinTropasDestino && (
                  <p className="mt-1 text-[12px] leading-snug text-faint">
                    “Sumar a otra tropa” está apagado porque{' '}
                    {destino.campoNombre} todavía no tiene tropas armadas.
                  </p>
                )}
                {conservarInvalido && (
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                    Como movés una parte de la tropa a otro campo, tienen que
                    sumarse a una tropa de {destino.campoNombre} o formar una
                    nueva (una tropa no puede quedar partida en dos campos).
                  </p>
                )}
              </motion.div>

              {destinoSel === 'existente' && (
                <motion.div variants={formItem}>
                  <span className={formLabel}>Tropa de {destino.campoNombre}</span>
                  <Dropdown
                    value={destinoLoteId}
                    onChange={setDestinoLoteId}
                    options={[
                      { value: '', label: 'Elegí la tropa…' },
                      ...(tropasDestino.data ?? [])
                        .filter((t) => t.id !== tropa.loteId)
                        .map((t) => ({ value: t.id, label: t.nombre })),
                    ]}
                  />
                </motion.div>
              )}

              {destinoSel === 'nueva' && (
                <motion.div variants={formItem}>
                  <span className={formLabel}>Nombre de la tropa nueva</span>
                  <Input
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    placeholder={`Ej. Tropa ${destino.potreroNombre}`}
                  />
                </motion.div>
              )}
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
