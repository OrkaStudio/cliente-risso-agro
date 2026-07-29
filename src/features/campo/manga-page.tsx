import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CloudOff,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Wifi,
} from 'lucide-react'
import { Dropdown } from '@/components/ui/dropdown'
import {
  categoriaLabel,
  categoriasPorEspecie,
  especieLabel,
  type Especie,
} from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import { useManga, type AsignacionLocal } from './manga/use-manga'
import type { AnimalSinCaravana, CategoriaAnimal } from './manga/api'
import { normalizarRfid } from './manga/rfid'
import { useScanner } from './manga/use-scanner'
import { CChip, CLabel, CSheet, NotaVoz } from './ui'

// Preferencia por lector, no por sesión: una vez que se sabe si el bastón manda
// Enter, la elección vale para siempre. Se guarda local (no es dato de negocio).
const CLAVE_AUTO = 'risso.manga.auto-confirmar'

function useAutoConfirmar(): [boolean, (v: boolean) => void] {
  // Default PRENDIDO a propósito: hasta hoy el Enter siempre asignó, y la manga
  // está en uso real. Apagarlo por defecto le cambiaría el flujo al productor
  // sin avisarle. El toggle existe para APAGARLO si el bastón que se compre
  // resulta mandar Enter de más.
  const [valor, setValor] = useState(
    () => (localStorage.getItem(CLAVE_AUTO) ?? '1') === '1',
  )
  const set = useCallback((v: boolean) => {
    setValor(v)
    localStorage.setItem(CLAVE_AUTO, v ? '1' : '0')
  }, [])
  return [valor, set]
}

// Observaciones rápidas de manga: lo que se VE del animal, un toque con
// guantes. Preñada/Vacía son excluyentes (estado reproductivo).
const OBSERVACIONES = ['Preñada', 'Vacía', 'Renga', 'Lastimada', 'Flaca', 'Apartar'] as const
const EXCLUYENTES: Record<string, string> = { 'Preñada': 'Vacía', 'Vacía': 'Preñada' }

export function MangaPage() {
  const m = useManga()

  if (m.cargando) {
    return <p className="c-label p-8 text-center !text-[13px]">Cargando manga…</p>
  }

  // Sugerencia de caravana visual: la última numérica + 1 (correlativas).
  const visualSugerido =
    m.ultimo?.visual && /^\d+$/.test(m.ultimo.visual)
      ? String(Number(m.ultimo.visual) + 1)
      : null

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      {/* ===== Barra de instrumento: señal · cola · alcance · contadores ===== */}
      <header className="shrink-0 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-3 pt-2.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-2">
            {m.online ? (
              <Wifi className="size-4 text-[var(--c-ok-deep)]" strokeWidth={2.5} />
            ) : (
              <CloudOff className="size-4 text-[var(--c-warn)]" strokeWidth={2.5} />
            )}
            <CLabel className={cn('!text-[11px]', !m.online && '!text-[var(--c-warn)]')}>
              {m.online ? 'Señal' : 'Sin señal'}
            </CLabel>
          </span>
          <button
            type="button"
            onClick={() => void m.sincronizar()}
            disabled={!m.online || m.sinSincronizar === 0 || m.sincronizando}
            className={cn(
              'c-label rounded-md border px-2 py-1.5 !text-[10.5px]',
              m.sinSincronizar > 0
                ? 'c-hazard'
                : 'border-transparent !text-[var(--c-faint)]',
            )}
          >
            <RefreshCw
              className={cn('mr-1 inline size-3', m.sincronizando && 'animate-spin')}
            />
            {m.sinSincronizar > 0 ? `${m.sinSincronizar} sin subir` : 'Al día'}
          </button>
        </div>

        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Dropdown
              block
              ariaLabel="Alcance"
              value={
                m.scope.kind === 'todos' ? 'todos' : `${m.scope.kind}:${m.scope.id}`
              }
              onChange={(key) => {
                const opt = m.scopeOptions.find((o) => o.key === key)
                if (opt) m.setScope(opt.scope)
              }}
              options={m.scopeOptions.map((o) => ({
                value: o.key,
                label: `${o.label} · ${o.pendientes}`,
              }))}
              className="h-11"
            />
          </div>
          <div className="flex shrink-0 items-end gap-3 pb-0.5">
            <div className="text-right leading-none">
              <span className="c-mono block text-[32px] font-bold text-[var(--c-ink)]">
                {m.quedan}
              </span>
              <CLabel className="mt-0.5">quedan</CLabel>
            </div>
            <div className="text-right leading-none">
              <span className="c-mono block text-[32px] font-bold text-[var(--c-ok-deep)]">
                {m.listo}
              </span>
              <CLabel className="mt-0.5 !text-[var(--c-ok-deep)]">listos</CLabel>
            </div>
          </div>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--c-sunk)]">
          <motion.div
            className="h-full bg-[var(--c-ok)]"
            initial={false}
            animate={{ width: `${Math.round(m.progreso * 100)}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          />
        </div>
      </header>

      {/* Último caravaneo: confirmación + deshacer */}
      {m.ultimo && (
        <div className="shrink-0 px-4 pt-2.5">
          <motion.div
            key={m.ultimo.local_id}
            className="c-stamp flex items-center justify-between gap-2 rounded-lg border border-[var(--c-ok)]/45 bg-[var(--c-ok-soft)] px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Check className="size-4 shrink-0 text-[var(--c-ok-deep)]" strokeWidth={3} />
              <span className="c-mono truncate text-[13.5px] font-bold text-[var(--c-ok-deep)]">
                {m.ultimo.rfid}
              </span>
              {m.ultimo.visual && (
                <span className="c-label shrink-0">V·{m.ultimo.visual}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => void m.deshacer()}
              className="c-label flex shrink-0 items-center gap-1 rounded-md border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-2 py-1 !text-[10.5px]"
            >
              <RotateCcw className="size-3" />
              Deshacer
            </button>
          </motion.div>
        </div>
      )}

      {m.errores.length > 0 && (
        <div className="shrink-0 px-4 pt-2.5">
          <div className="flex flex-col gap-1 rounded-lg border border-[var(--c-bad)]/45 bg-[var(--c-bad-soft)] p-2.5">
            <div className="c-label flex items-center gap-1.5 !text-[11px] !text-[var(--c-bad)]">
              <AlertTriangle className="size-3.5" />
              {m.errores.length} con problema al subir
            </div>
            <ul className="flex flex-col gap-0.5 text-[12px] text-[var(--c-ink-soft)]">
              {m.errores.slice(0, 3).map((e) => (
                <li key={e.local_id}>
                  <span className="c-mono font-semibold">{e.rfid}:</span> {e.error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ===== Cuerpo ===== */}
      {m.actual ? (
        <AnimalForm
          key={m.actual.id}
          animal={m.actual}
          rfidsUsados={m.rfidsUsados}
          visualSugerido={visualSugerido}
          onAsignar={(datos) => {
            // Confirmación háptica al asignar; el sello visual lo da "Último".
            if ('vibrate' in navigator) navigator.vibrate(50)
            void m.asignar(m.actual!.id, datos)
          }}
        />
      ) : m.sinLista && !m.online ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
          <CloudOff className="size-10 text-[var(--c-faint)]" />
          <p className="c-display text-[16px] text-[var(--c-ink)]">
            Sin señal y sin lista descargada
          </p>
          <p className="text-[13.5px] text-[var(--c-ink-soft)]">
            Entrá una vez con señal para bajar los animales sin caravana; de
            ahí en más la manga anda sin conexión.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <div className="c-panel flex size-18 items-center justify-center text-[var(--c-ok-deep)]">
            <Check className="size-9" strokeWidth={2.2} />
          </div>
          <p className="c-display text-[16px] text-[var(--c-ink)]">
            No quedan animales sin caravana acá
          </p>
          <button
            type="button"
            onClick={() => void m.descargar()}
            disabled={!m.online}
            className="c-display text-[14px] uppercase text-[var(--c-ok-deep)] underline underline-offset-4 disabled:opacity-40"
          >
            Volver a cargar la lista
          </button>
        </div>
      )}
    </div>
  )
}

type AnimalFormProps = {
  animal: AnimalSinCaravana
  rfidsUsados: Set<string>
  visualSugerido: string | null
  onAsignar: (datos: AsignacionLocal) => void
}

/**
 * Form de un animal (keyado por id → arranca fresco). El RFID es el héroe (el
 * bastón teclea acá); categoría por hoja de botones grandes, visual con
 * sugerencia +1, notas por chips. El botón Asignar vive en el footer fijo.
 */
function AnimalForm({ animal, rfidsUsados, visualSugerido, onAsignar }: AnimalFormProps) {
  const [rfid, setRfid] = useState('')
  const [visual, setVisual] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAnimal>(animal.categoria)
  const [notas, setNotas] = useState<Set<string>>(new Set())
  const [notaLibre, setNotaLibre] = useState('')
  const [audio, setAudio] = useState<Blob | null>(null)
  const [abrirNota, setAbrirNota] = useState(false)
  const [abrirCategoria, setAbrirCategoria] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [rescatada, setRescatada] = useState(false)
  const [autoConfirmar, setAutoConfirmar] = useAutoConfirmar()
  const inputRef = useRef<HTMLInputElement>(null)

  // Aviso instantáneo (sin esperar al sync): RFID ya usado en la sesión O en
  // cualquier animal del rodeo (cache de vigentes). Se compara NORMALIZADO —
  // el mismo número con o sin separadores es la misma caravana.
  const repetido = rfid.trim() !== '' && rfidsUsados.has(normalizarRfid(rfid))

  const asignar = (rfidOverride?: string) => {
    const valor = rfidOverride ?? rfid
    if (!valor.trim()) {
      setAviso('Escaneá o escribí el RFID')
      return
    }
    if (rfidsUsados.has(normalizarRfid(valor))) {
      setAviso('Ese RFID ya está en uso en otro animal')
      return
    }
    const nota = [...notas, notaLibre.trim()].filter(Boolean).join(' · ')
    onAsignar({
      rfid: valor,
      visual: visual || undefined,
      categoria,
      nota: nota || undefined,
      audio,
    })
  }

  // Red de seguridad del bastón: si una lectura entra con el cursor FUERA del
  // campo (pasa todo el tiempo en la manga — se toca una categoría, se abre una
  // hoja, el teléfono se destraba), el teclado Bluetooth escribe al vacío y la
  // caravana se pierde sin que nadie se entere. Acá la agarramos igual, la
  // ponemos en el campo y avisamos que fue rescatada.
  useScanner({
    onLectura: (l) => {
      if (!l.esEscaneo || l.focoEnObjetivo) return // el input ya la recibió solo
      setRfid(l.crudo)
      setAviso(null)
      setRescatada(true)
      inputRef.current?.focus()
      if ('vibrate' in navigator) navigator.vibrate(50)
      if (autoConfirmar && l.terminador === 'enter') asignar(l.crudo)
    },
  })

  const toggleNota = (n: string) => {
    setNotas((prev) => {
      const next = new Set(prev)
      if (next.has(n)) {
        next.delete(n)
      } else {
        next.add(n)
        const opuesta = EXCLUYENTES[n]
        if (opuesta) next.delete(opuesta) // preñada ⊕ vacía
      }
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        {/* Contexto: qué animal estoy por caravanear */}
        <div className="flex items-center justify-between gap-2">
          <span className="c-display min-w-0 truncate text-[17px] text-[var(--c-ink)]">
            {animal.lote_nombre
              ? `Tropa ${animal.lote_nombre}`
              : (animal.potrero_nombre ?? 'Sin potrero')}
          </span>
          {/* Categoría: un toque abre la hoja de botones grandes */}
          <button
            type="button"
            onClick={() => setAbrirCategoria(true)}
            className="c-display flex shrink-0 items-center gap-1 rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 py-2 text-[14px] text-[var(--c-ink)]"
          >
            {categoriaLabel[categoria]}
            <ChevronDown className="size-4" />
          </button>
        </div>

        {/* RFID: el héroe (el bastón teclea acá) */}
        <div>
          <CLabel className={cn('mb-1.5', (aviso ?? repetido) && '!text-[var(--c-bad)]')}>
            Caravana RFID · escaneá con el bastón
          </CLabel>
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border-2 bg-[var(--c-panel)] px-4 shadow-sm transition-colors',
              aviso
                ? 'border-[var(--c-bad)]/70'
                : repetido
                  ? 'border-[var(--c-warn)]/70'
                  : 'border-[var(--c-line-strong)] focus-within:border-[var(--c-ok)]',
            )}
          >
            <ScanLine
              className={cn(
                'size-6 shrink-0',
                repetido ? 'text-[var(--c-warn)]' : 'text-[var(--c-ok-deep)]',
              )}
            />
            <input
              ref={inputRef}
              // Marca para el capturador: si el foco está acá, la lectura ya
              // entró sola y no hay que rescatarla (evita escribirla dos veces).
              data-scan-target
              value={rfid}
              onChange={(e) => {
                setRfid(e.target.value)
                if (aviso) setAviso(null)
                if (rescatada) setRescatada(false)
              }}
              onKeyDown={(e) => {
                // El Enter del bastón solo confirma si está activado el
                // auto-confirmar. Hay lectores que lo mandan siempre: sin este
                // freno, cada lectura asigna sola antes de tocar la categoría.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (autoConfirmar) asignar()
                }
              }}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="Escaneá…"
              className="c-mono h-16 min-w-0 flex-1 bg-transparent text-[24px] font-bold text-[var(--c-ink)] outline-none placeholder:text-[18px] placeholder:text-[var(--c-faint)]"
            />
          </div>
          {aviso ? (
            <p className="c-label mt-1 flex items-center gap-1 !text-[12px] !text-[var(--c-bad)]">
              <AlertTriangle className="size-3.5" />
              {aviso}
            </p>
          ) : repetido ? (
            <p className="c-label mt-1 flex items-center gap-1 !text-[12px] !text-[var(--c-warn)]">
              <AlertTriangle className="size-3.5" />
              Ese RFID ya está en uso
            </p>
          ) : (
            rescatada && (
              <p className="c-label mt-1 flex items-center gap-1 !text-[12px] !text-[var(--c-ok-deep)]">
                <Check className="size-3.5" />
                Lectura tomada con el cursor afuera — la agarramos igual
              </p>
            )
          )}

          {/* Auto-confirmar: depende del bastón. Hay lectores que mandan Enter
              y otros que no — se prueba en /campo/lector y se deja fijo acá. */}
          <button
            type="button"
            onClick={() => setAutoConfirmar(!autoConfirmar)}
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-[var(--c-line)] bg-[var(--c-panel)] px-2.5 py-2 text-left"
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                autoConfirmar
                  ? 'border-[var(--c-ok)] bg-[var(--c-ok)]'
                  : 'border-[var(--c-line-strong)]',
              )}
            >
              {autoConfirmar && <Check className="size-3.5 text-white" strokeWidth={3.5} />}
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--c-ink-soft)]">
              Confirmar solo al escanear
              <span className="c-label block !text-[10.5px]">
                {autoConfirmar
                  ? 'Escaneás y pasa al siguiente animal'
                  : 'Confirmás con el botón de abajo'}
              </span>
            </span>
          </button>
        </div>

        {/* Visual: con sugerencia correlativa (+1 de la última) */}
        <div>
          <CLabel className="mb-1.5">Caravana visual · opcional</CLabel>
          <div className="flex gap-1.5">
            <input
              value={visual}
              onChange={(e) => setVisual(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="N°"
              className="c-mono h-12 w-28 rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 text-[18px] font-bold text-[var(--c-ink)] outline-none focus:border-[var(--c-ok)]"
            />
            {visualSugerido && visual !== visualSugerido && (
              <CChip
                label={`¿${visualSugerido}?`}
                selected={false}
                onClick={() => setVisual(visualSugerido)}
                className="c-mono"
              />
            )}
          </div>
        </div>

        {/* Observación rápida: grilla SIEMPRE visible (nada de scroll para
            encontrar el botón — "¿está renga? toco Renga y sigo") */}
        <div>
          <CLabel className="mb-1.5">¿Ves algo? · un toque y seguís</CLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {OBSERVACIONES.map((n) => (
              <CChip
                key={n}
                label={n}
                selected={notas.has(n)}
                onClick={() => toggleNota(n)}
                className="h-11 text-center"
              />
            ))}
          </div>
          <NotaVoz audio={audio} onAudio={setAudio} />
          {abrirNota ? (
            <input
              value={notaLibre}
              onChange={(e) => setNotaLibre(e.target.value)}
              autoFocus
              autoComplete="off"
              placeholder="Otra nota…"
              className="mt-1.5 h-10 w-full rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 text-[14px] text-[var(--c-ink)] outline-none focus:border-[var(--c-ok)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAbrirNota(true)}
              className="c-label mt-1.5 !text-[11px] underline underline-offset-2"
            >
              + Otra nota
            </button>
          )}
        </div>
      </div>

      {/* Acción principal: footer fijo */}
      <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-bg)] px-4 pb-3.5 pt-3">
        <button
          type="button"
          onClick={() => asignar()}
          className="c-display c-hard flex h-15 w-full items-center justify-center gap-2.5 rounded-xl border border-transparent bg-[var(--c-ok)] text-[19px] text-white"
        >
          <Check className="size-6" strokeWidth={2.5} />
          Asignar → siguiente
        </button>
      </div>

      {/* Hoja de categorías: botones grandes, nada de dropdown chiquito */}
      <CSheet
        open={abrirCategoria}
        title="Categoría del animal"
        onClose={() => setAbrirCategoria(false)}
      >
        <div className="flex flex-col gap-3">
          {(Object.keys(categoriasPorEspecie) as Especie[]).map((especie) => (
            <div key={especie}>
              <CLabel className="mb-1.5">{especieLabel[especie]}</CLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {categoriasPorEspecie[especie].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setCategoria(value)
                      setAbrirCategoria(false)
                    }}
                    className={cn(
                      'h-12 rounded-xl border text-[14px] font-semibold transition-colors',
                      categoria === value
                        ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
                        : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
                    )}
                  >
                    {categoriaLabel[value]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CSheet>
    </div>
  )
}
