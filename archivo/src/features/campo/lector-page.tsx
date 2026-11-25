import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  Copy,
  Keyboard,
  ScanLine,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CLabel } from './ui'
import { useScanner, type Lectura } from './manga/use-scanner'
import {
  analizarRfid,
  FORMATO_LABEL,
  FORMATO_OK,
  type AnalisisRfid,
} from './manga/rfid'

/**
 * Probador de lector de caravana.
 *
 * Para qué existe: antes de comprar un bastón hay que saber si habla el idioma
 * de la app. En la veterinaria no se puede debuggear — así que esta pantalla
 * muestra EN CRUDO qué mandó el lector: los caracteres exactos, el largo, si
 * mandó Enter, a qué velocidad, y si dos lecturas de la MISMA caravana dan el
 * mismo número. Con eso se sale sabiendo cuál comprar, no suponiendo.
 *
 * No toca la manga ni la base: es una pantalla de laboratorio, todo en memoria.
 */

type Registro = Lectura & { analisis: AnalisisRfid }

export function LectorPage() {
  const [lecturas, setLecturas] = useState<Registro[]>([])
  const [modelo, setModelo] = useState('')
  const [copiado, setCopiado] = useState(false)
  const reporteRef = useRef<HTMLTextAreaElement>(null)

  useScanner({
    onLectura: (l) => {
      setLecturas((prev) => [{ ...l, analisis: analizarRfid(l.crudo) }, ...prev])
      if ('vibrate' in navigator) navigator.vibrate(40)
    },
  })

  const ultima = lecturas[0] ?? null
  const ficha = useMemo(() => construirFicha(lecturas), [lecturas])
  const reporte = useMemo(
    () => construirReporte(modelo, lecturas, ficha),
    [modelo, lecturas, ficha],
  )

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(reporte)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      // http en la red local = clipboard bloqueado. Seleccionamos el texto para
      // que se copie a mano; nunca dejamos al usuario sin salida.
      reporteRef.current?.select()
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <header className="shrink-0 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-3 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ScanLine className="size-4 text-[var(--c-ok-deep)]" strokeWidth={2.5} />
            <span className="c-display text-[15px] text-[var(--c-ink)]">
              Probador de lector
            </span>
          </span>
          <span className="c-mono text-[13px] font-bold text-[var(--c-ink-soft)]">
            {lecturas.length} {lecturas.length === 1 ? 'lectura' : 'lecturas'}
          </span>
        </div>
        <input
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          placeholder="Marca y modelo del lector…"
          autoComplete="off"
          className="mt-2.5 h-10 w-full rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-bg)] px-3 text-[14px] text-[var(--c-ink)] outline-none focus:border-[var(--c-ok)]"
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        {lecturas.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <Keyboard className="size-10 text-[var(--c-faint)]" />
            <p className="c-display text-[16px] text-[var(--c-ink)]">
              Gatillá el lector
            </p>
            <p className="text-[13.5px] leading-relaxed text-[var(--c-ink-soft)]">
              No hace falta tocar ningún campo: la pantalla escucha igual.
              <br />
              Si no aparece nada, el lector <b>no está en modo teclado</b> — hay
              que cambiarle la configuración.
            </p>
          </div>
        ) : (
          <>
            {/* ===== Última lectura: el héroe ===== */}
            {ultima && <UltimaLectura key={ultima.ts} r={ultima} />}

            {/* ===== Ficha del lector: el veredicto acumulado ===== */}
            <section>
              <CLabel className="mb-1.5">Ficha de este lector</CLabel>
              <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-line)]">
                {ficha.map((f) => (
                  <div
                    key={f.titulo}
                    className="flex items-start gap-2.5 bg-[var(--c-panel)] px-3 py-2.5"
                  >
                    <Icono estado={f.estado} />
                    <div className="min-w-0 flex-1">
                      {/* Valor corto ("Sí", "3 de 5") va al lado del título;
                          uno largo ("Numérico + Hexadecimal + ISO 15 dígitos")
                          se apila abajo — al costado se mete en medio del
                          título y lo parte al medio. */}
                      <div
                        className={cn(
                          'flex gap-2',
                          f.valor.length > 14
                            ? 'flex-col items-start'
                            : 'items-baseline justify-between',
                        )}
                      >
                        <span className="text-[13.5px] font-semibold text-[var(--c-ink)]">
                          {f.titulo}
                        </span>
                        <span
                          className={cn(
                            'c-mono text-[12.5px] font-bold',
                            f.valor.length > 14 ? 'min-w-0 break-words' : 'shrink-0',
                            f.estado === 'ok' && 'text-[var(--c-ok-deep)]',
                            f.estado === 'aviso' && 'text-[var(--c-warn-deep)]',
                            f.estado === 'mal' && 'text-[var(--c-bad)]',
                          )}
                        >
                          {f.valor}
                        </span>
                      </div>
                      {f.detalle && (
                        <p className="mt-0.5 text-[12px] leading-snug text-[var(--c-ink-soft)]">
                          {f.detalle}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ===== Historial crudo ===== */}
            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <CLabel>Todas las lecturas</CLabel>
                <button
                  type="button"
                  onClick={() => setLecturas([])}
                  className="c-label flex items-center gap-1 !text-[10.5px] text-[var(--c-ink-soft)] underline underline-offset-2"
                >
                  <Trash2 className="size-3" />
                  Limpiar
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {lecturas.map((r) => (
                  <div
                    key={r.ts}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--c-line)] bg-[var(--c-panel)] px-3 py-2"
                  >
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        FORMATO_OK[r.analisis.formato]
                          ? 'bg-[var(--c-ok)]'
                          : 'bg-[var(--c-warn)]',
                      )}
                    />
                    <span className="c-mono min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--c-ink)]">
                      {r.analisis.normalizado || '(vacío)'}
                    </span>
                    <span className="c-label shrink-0 !text-[10px]">
                      {r.analisis.largo} car
                    </span>
                    <span className="c-label shrink-0 !text-[10px]">
                      {r.terminador === 'timeout' ? 'sin ⏎' : r.terminador}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* ===== Reporte para llevarse ===== */}
            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <CLabel>Reporte</CLabel>
                <button
                  type="button"
                  onClick={() => void copiar()}
                  className="c-label flex items-center gap-1 !text-[10.5px] text-[var(--c-ok-deep)] underline underline-offset-2"
                >
                  {copiado ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <textarea
                ref={reporteRef}
                readOnly
                value={reporte}
                rows={8}
                className="c-mono w-full resize-y rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-sunk)] p-2.5 text-[11px] leading-relaxed text-[var(--c-ink-soft)] outline-none"
              />
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// --- Última lectura ---------------------------------------------------------

function UltimaLectura({ r }: { r: Registro }) {
  const a = r.analisis
  const ok = FORMATO_OK[a.formato]
  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border-2 p-3.5',
        ok
          ? 'border-[var(--c-ok)]/50 bg-[var(--c-ok-soft)]'
          : 'border-[var(--c-warn)]/60 bg-[var(--c-panel)]',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <CLabel className={cn(ok && '!text-[var(--c-ok-deep)]')}>Última lectura</CLabel>
        <span
          className={cn(
            'c-label rounded-md px-1.5 py-0.5 !text-[10px]',
            ok
              ? 'bg-[var(--c-ok)] !text-white'
              : 'bg-[var(--c-warn)] !text-white',
          )}
        >
          {FORMATO_LABEL[a.formato]}
        </span>
      </div>

      {/* El número, grande. Es lo que la app guardaría. */}
      <p className="c-mono break-all text-[26px] font-bold leading-tight text-[var(--c-ink)]">
        {a.normalizado || '(vacío)'}
      </p>

      {/* Desglose ISO: país + identificador nacional. */}
      {a.pais && (
        <p className="c-mono mt-1 text-[12px] text-[var(--c-ink-soft)]">
          país <b className="text-[var(--c-ink)]">{a.pais}</b> · animal{' '}
          <b className="text-[var(--c-ink)]">{a.nacional}</b>
        </p>
      )}

      {/* Si el lector metió ruido, mostramos el crudo para que se vea. */}
      {a.tuvoRuido && (
        <p className="c-mono mt-1.5 break-all text-[11.5px] text-[var(--c-warn-deep)]">
          crudo: <span className="underline decoration-dotted">{visualizar(a.crudo)}</span>
        </p>
      )}

      <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-[var(--c-line)] pt-2.5">
        <Dato label="largo" valor={`${a.largo}`} />
        <Dato
          label="cierre"
          valor={r.terminador === 'timeout' ? 'nada' : r.terminador === 'enter' ? '⏎' : '⇥'}
        />
        <Dato label="tardó" valor={`${Math.round(r.duracionMs)}ms`} />
        <Dato label="tecla" valor={`${Math.round(r.gapPromedioMs)}ms`} />
      </div>

      {a.avisos.map((av) => (
        <p
          key={av}
          className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-[var(--c-warn-deep)]"
        >
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {av}
        </p>
      ))}
    </motion.section>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="text-center leading-none">
      <span className="c-mono block text-[15px] font-bold text-[var(--c-ink)]">
        {valor}
      </span>
      <CLabel className="mt-1 !text-[9.5px]">{label}</CLabel>
    </div>
  )
}

function Icono({ estado }: { estado: Estado }) {
  if (estado === 'ok')
    return (
      <Check className="mt-0.5 size-4 shrink-0 text-[var(--c-ok-deep)]" strokeWidth={3} />
    )
  if (estado === 'aviso')
    return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--c-warn)]" />
  return <X className="mt-0.5 size-4 shrink-0 text-[var(--c-bad)]" strokeWidth={3} />
}

/** Hace visibles los caracteres que no se ven (espacios, tabs, invisibles). */
function visualizar(s: string): string {
  return s
    .replace(/ /g, '␣')
    .replace(/\t/g, '⇥')
    // Matchear caracteres de control ES el objetivo: son basura que mete
    // el lector y hay que sacarla antes de guardar el numero.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '\u00bf?')
}

// --- Ficha acumulada --------------------------------------------------------

type Estado = 'ok' | 'aviso' | 'mal'
type Item = { titulo: string; valor: string; detalle?: string; estado: Estado }

/**
 * El veredicto sobre el lector, acumulado sobre TODAS las lecturas de la
 * sesión. Cada fila responde una pregunta de compra concreta.
 */
function construirFicha(ls: Registro[]): Item[] {
  if (ls.length === 0) return []
  const items: Item[] = []

  // 1. ¿Es un teclado? Si llegó algo, sí — es la prueba de que funciona.
  const escaneos = ls.filter((l) => l.esEscaneo)
  items.push({
    titulo: 'Modo teclado (HID)',
    valor: escaneos.length > 0 ? 'Sí' : 'Dudoso',
    estado: escaneos.length > 0 ? 'ok' : 'aviso',
    detalle:
      escaneos.length > 0
        ? 'Llegan ráfagas rápidas: el lector teclea solo. Es el modo que la app necesita.'
        : 'Llegó texto pero lento — puede ser tipeo a mano, no el lector. Probá gatillando de nuevo sin tocar el teclado.',
  })

  // 2. ¿Manda Enter? Define si se puede auto-confirmar en la manga.
  const conEnter = ls.filter((l) => l.terminador === 'enter').length
  const todos = conEnter === ls.length
  const ninguno = conEnter === 0
  items.push({
    titulo: 'Manda Enter al final',
    valor: todos ? 'Siempre' : ninguno ? 'Nunca' : `${conEnter} de ${ls.length}`,
    estado: todos || ninguno ? 'ok' : 'aviso',
    detalle: todos
      ? 'Se puede activar "confirmar solo al escanear" en la manga: escaneás y pasa al siguiente animal.'
      : ninguno
        ? 'Hay que confirmar a mano con el botón. Fijate si el lector tiene opción de agregar Enter (suele llamarse "suffix" o "terminator").'
        : 'INCONSISTENTE: a veces manda Enter y a veces no. No actives el auto-confirmar con este lector.',
  })

  // 3. Formato: la pregunta que decide si sirve o no.
  const formatos = new Set(ls.map((l) => l.analisis.formato))
  const todosIso = formatos.size === 1 && formatos.has('iso-decimal')
  items.push({
    titulo: 'Formato del número',
    valor: [...formatos].map((f) => FORMATO_LABEL[f]).join(' + '),
    estado: todosIso ? 'ok' : formatos.size > 1 ? 'mal' : 'aviso',
    detalle: todosIso
      ? '15 dígitos decimales, la norma ISO. Es lo que queremos.'
      : formatos.size > 1
        ? 'El MISMO lector devuelve formatos distintos según la lectura. Descartalo: vas a terminar con el mismo animal cargado dos veces.'
        : 'No es el formato ISO de 15 dígitos. Buscá en el menú del lector la salida decimal/ISO antes de descartarlo.',
  })

  // 4. Consistencia: la prueba de fuego. Misma caravana leída N veces.
  const porCodigo = new Map<string, number>()
  for (const l of ls) {
    const k = l.analisis.normalizado
    if (k) porCodigo.set(k, (porCodigo.get(k) ?? 0) + 1)
  }
  const repetidos = [...porCodigo.values()].filter((n) => n > 1).length
  items.push({
    titulo: 'Repite igual la misma caravana',
    valor: `${ls.length} lectura${ls.length === 1 ? '' : 's'} → ${porCodigo.size} código${porCodigo.size === 1 ? '' : 's'}`,
    estado: repetidos > 0 ? 'ok' : 'aviso',
    detalle:
      repetidos > 0
        ? `${repetidos} caravana(s) leída(s) más de una vez dieron SIEMPRE el mismo número. Es la prueba que importa.`
        : 'Todavía no repetiste ninguna caravana. Leé LA MISMA 3 veces seguidas: si da distinto, el lector no sirve.',
  })

  // 5. Ruido: separadores/invisibles que mete el lector.
  const conRuido = ls.filter((l) => l.analisis.tuvoRuido).length
  if (conRuido > 0) {
    items.push({
      titulo: 'Mete separadores',
      valor: `${conRuido} de ${ls.length}`,
      estado: 'aviso',
      detalle:
        'La app los limpia sola, así que no bloquea la compra. Pero si otro sistema lee estas caravanas, ojo.',
    })
  }

  // 6. Velocidad: el número que decide si el rescate automático de la manga se
  //    va a disparar con ESTE lector (necesita ráfaga rápida para no confundir
  //    un escaneo con alguien tipeando).
  const lentas = ls.filter((l) => !l.esEscaneo).length
  if (lentas > 0) {
    items.push({
      titulo: 'Lecturas demasiado lentas',
      valor: `${lentas} de ${ls.length}`,
      estado: 'aviso',
      detalle:
        'Llegaron tan despacio que no se distinguen de alguien tecleando. La app las toma igual si el cursor está en el campo, pero NO las rescata si el cursor se fue. Anotalo: este lector necesita que el cursor esté puesto.',
    })
  }

  return items
}

function construirReporte(modelo: string, ls: Registro[], ficha: Item[]): string {
  if (ls.length === 0) return ''
  const l = [
    `LECTOR: ${modelo || '(sin nombre)'}`,
    `Fecha: ${new Date().toLocaleString('es-AR')}`,
    `Lecturas: ${ls.length}`,
    '',
    ...ficha.map((f) => `[${f.estado.toUpperCase()}] ${f.titulo}: ${f.valor}`),
    '',
    'CRUDO (más nueva primero):',
    ...ls.map(
      (r) =>
        `  ${visualizar(r.crudo)} → ${r.analisis.normalizado} · ${r.analisis.largo}car · ${r.terminador} · ${Math.round(r.gapPromedioMs)}ms/tecla`,
    ),
  ]
  return l.join('\n')
}
