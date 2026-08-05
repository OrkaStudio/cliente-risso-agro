import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Crosshair, LoaderCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  categoriaNombre,
  coloresPorCategoria,
  SERIE_COLORS,
} from '@/features/hacienda/labels'
import type { CategoriaAnimal } from './api'
import type { RecPotrero } from './db'
import { diasDesde, haceCuantoTxt } from './api'
import { CLabel, NumeroVivo } from '../ui'

/**
 * Croquis del campo: los potreros con su FORMA REAL (polígonos que Oficina
 * trazó sobre el satélite), pintados por estado y tocables. Es puro SVG desde
 * el cache — anda sin señal y sin tiles.
 *
 * ES LA RECORRIDA, no una ayuda: el productor se ubica mirando el dibujo, así
 * que ocupa toda la pantalla y la navegación pasa por acá. Toca un potrero →
 * carga el parte → vuelve al croquis con el potrero ya pintado.
 *
 * Contexto de uso que manda el diseño: camioneta, sol de frente, una mano,
 * a veces guantes, sin señal. De ahí el alto contraste, los targets grandes y
 * las acciones abajo (zona del pulgar).
 *
 * GPS "¿dónde estoy?": el GPS del teléfono funciona sin datos → un
 * punto-en-polígono ubica al productor y le ofrece abrir el potrero que está
 * pisando. Es la interacción más corta posible: frenar, tocar, cargar.
 */

type LatLng = [number, number]

/** Punto-en-polígono (ray casting). */
function dentroDe(punto: LatLng, poligono: LatLng[]): boolean {
  const [py, px] = punto // lat, lng
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [ay, ax] = poligono[i]
    const [by, bx] = poligono[j]
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
      dentro = !dentro
    }
  }
  return dentro
}

type XY = [number, number]

/**
 * Proyección equirectangular → viewBox con la PROPORCIÓN REAL del campo (no
 * un cuadrado de 100×100). Con el viewBox cuadrado, un campo alargado quedaba
 * flotando en el medio con márgenes muertos; con la proporción real el dibujo
 * llena el ancho disponible. El norte queda arriba, igual que en Oficina: el
 * productor conoce la forma de su campo con esa orientación.
 */
function proyector(potreros: RecPotrero[]) {
  const puntos = potreros.flatMap((p) => p.poligono ?? [])
  if (puntos.length === 0) return null
  const lats = puntos.map((p) => p[0])
  const lngs = puntos.map((p) => p[1])
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180)
  const kx = Math.cos(midLat)
  const w = (maxLng - minLng) * kx || 1e-9
  const h = maxLat - minLat || 1e-9
  // El lado más largo mide 100 unidades; el otro, lo que le toque.
  const escala = 100 / Math.max(w, h)
  const vw = w * escala
  const vh = h * escala
  const aXY = ([lat, lng]: LatLng): XY => [
    (lng - minLng) * kx * escala,
    (maxLat - lat) * escala,
  ]
  return { aXY, vw, vh }
}

/** Distancia con signo de un punto al borde del polígono (+ adentro). */
function distanciaAlBorde(x: number, y: number, pts: XY[]): number {
  let min = Infinity
  let dentro = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[j]
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      dentro = !dentro
    }
    // Distancia al segmento i-j
    const dx = bx - ax
    const dy = by - ay
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0
    const px = ax + t * dx
    const py = ay + t * dy
    min = Math.min(min, Math.hypot(x - px, y - py))
  }
  return dentro ? min : -min
}

/**
 * "Polo de inaccesibilidad": el punto MÁS ADENTRO del polígono, y su holgura.
 * El centroide se cae fuera (o al borde) en potreros en L o muy angostos, y
 * ahí es donde las etiquetas se pisaban entre sí. La holgura además dice
 * cuánta letra entra: un potrero flaco recibe un número más chico en vez de
 * uno que se desborda encima del vecino.
 */
function polo(pts: XY[]): { x: number; y: number; r: number } {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  let mejor = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, r: -Infinity }
  let paso = Math.max(maxX - minX, maxY - minY) / 6
  // Búsqueda en grilla + 4 refinamientos alrededor del mejor candidato.
  for (let nivel = 0; nivel < 5; nivel++) {
    const x0 = nivel === 0 ? minX : mejor.x - paso * 2
    const x1 = nivel === 0 ? maxX : mejor.x + paso * 2
    const y0 = nivel === 0 ? minY : mejor.y - paso * 2
    const y1 = nivel === 0 ? maxY : mejor.y + paso * 2
    for (let x = x0; x <= x1; x += paso) {
      for (let y = y0; y <= y1; y += paso) {
        const d = distanciaAlBorde(x, y, pts)
        if (d > mejor.r) mejor = { x, y, r: d }
      }
    }
    paso /= 2.5
  }
  return mejor
}

/** Mínimo táctil (px). Debajo de esto, el potrero sale a un pin. */
const TAP_MIN = 44

/** Margen (unidades de viewBox) alrededor del campo: da lugar a los pines de
 *  los potreros chicos en el fondo, sin que se recorten. */
const MARGEN = 10

/** Texto legible (tinta o blanco) sobre un color de relleno, según su brillo.
 *  El amarillo del campo A necesita texto oscuro; el azul, texto blanco. */
function textoSobre(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#131b16' : '#ffffff'
}

/**
 * Ubica el pin de una ASTILLA: prueba direcciones alrededor de su polo y elige
 * la que cae en espacio libre — fuera de todos los polígonos y lejos de las
 * otras etiquetas. Solo se usa para potreros diminutos (que ni con letra
 * mínima ni con el dedo entran); el resto se etiqueta en su lugar.
 */
function ubicarPin(
  origen: { x: number; y: number },
  dist: number,
  radio: number,
  poligonos: XY[][],
  ocupados: { x: number; y: number }[],
  limite: { minX: number; maxX: number; minY: number; maxY: number },
): { x: number; y: number } {
  let mejor = { x: origen.x + dist, y: origen.y, score: -Infinity }
  for (const k of [1, 1.5, 2.1, 2.9]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const x = origen.x + Math.cos(a) * dist * k
      const y = origen.y + Math.sin(a) * dist * k
      let score = -k * 6
      if (
        x < limite.minX + radio || x > limite.maxX - radio ||
        y < limite.minY + radio || y > limite.maxY - radio
      ) {
        score -= 500
      }
      for (const poly of poligonos) {
        if (distanciaAlBorde(x, y, poly) > -radio * 0.5) score -= 260
      }
      for (const o of ocupados) {
        const d = Math.hypot(x - o.x, y - o.y)
        if (d < radio * 2.4) score -= (radio * 2.4 - d) * 25
      }
      if (score > mejor.score) mejor = { x, y, score }
    }
  }
  return {
    x: Math.max(limite.minX + radio, Math.min(limite.maxX - radio, mejor.x)),
    y: Math.max(limite.minY + radio, Math.min(limite.maxY - radio, mejor.y)),
  }
}

/**
 * Panel del potrero seleccionado: cuántos animales hay y su distribución, hace
 * cuánto se recorrió, y el botón para entrar a recorrerlo. Vive en la zona del
 * pulgar (reemplaza "¿Dónde estoy?" mientras hay uno elegido). Todo sale del
 * cache offline (composición de la última sincronización con señal).
 */
function PanelPotrero({
  potrero,
  campoNombre,
  colorHex,
  nacidos,
  nacidosPorCategoria,
  onAnotar,
  onMover,
  onAbrir,
  onCerrar,
}: {
  potrero: RecPotrero
  campoNombre: string
  colorHex: string
  /** Nacimientos anotados y todavía sin subir (feedback local). */
  nacidos: number
  /** Esos mismos nacimientos, abiertos por categoría. */
  nacidosPorCategoria?: Map<CategoriaAnimal, number>
  /** Anotar un nacimiento en este potrero. Ausente = feature apagada. */
  onAnotar?: (id: string) => void
  /** Arrancar un movimiento desde este potrero. Ausente = feature apagada. */
  onMover?: (id: string) => void
  onAbrir: (id: string) => void
  onCerrar: () => void
}) {
  // Composición DERIVADA: la del server más lo anotado y todavía sin subir.
  // Si el total de arriba suma los pendientes, el desglose tiene que sumarlos
  // también — un potrero que dice 69 arriba y 66 abajo no le sirve a nadie.
  const compos = useMemo(() => {
    const base = potrero.composicion ?? []
    const pend = nacidosPorCategoria
    if (!pend || pend.size === 0) return base
    // El delta viene CON SIGNO (un movimiento resta en el origen): se pisa en 0
    // si el cache quedó viejo, y una categoría que se vació desaparece de la
    // lista en vez de quedar en cero.
    const salida = base
      .map((c) => ({
        ...c,
        cabezas: Math.max(0, c.cabezas + (pend.get(c.categoria) ?? 0)),
      }))
      .filter((c) => c.cabezas > 0)
    // Categorías que el potrero todavía no tenía y aparecen por lo anotado.
    for (const [categoria, cabezas] of pend) {
      if (cabezas > 0 && !base.some((c) => c.categoria === categoria)) {
        salida.push({ categoria, cabezas })
      }
    }
    return salida
  }, [potrero.composicion, nacidosPorCategoria])
  // Los colores salen de la composición DEL SERVER, no de la derivada: como
  // `coloresPorCategoria` asigna por posición y ternero/ternera caen en el medio
  // del orden canónico, calcularlos sobre la derivada hacía que Toros y Terneras
  // cambiaran de color justo al confirmar. Una categoría nueva toma el primer
  // color libre y las que ya estaban no se mueven.
  const col = useMemo(() => {
    const base = potrero.composicion ?? []
    const mapa = coloresPorCategoria(base.map((c) => c.categoria))
    const usados = new Set(base.map((c) => mapa[c.categoria]))
    let i = 0
    for (const c of compos) {
      if (mapa[c.categoria]) continue
      const libres = SERIE_COLORS.filter((x) => !usados.has(x))
      const elegido =
        libres.length > 0 ? libres[0] : SERIE_COLORS[i % SERIE_COLORS.length]
      mapa[c.categoria] = elegido
      usados.add(elegido)
      i++
    }
    return mapa
  }, [potrero.composicion, compos])
  const yaHecho = potrero.hecho === 1
  const diasRec = yaHecho ? 0 : diasDesde(potrero.ultima?.fecha)
  const antiguedad = yaHecho
    ? 'recorrido hoy'
    : potrero.ultima?.fecha
      ? haceCuantoTxt(diasRec)
      : 'sin recorrer'
  // Color del pill: verde (recorrido hoy) · ámbar (sin recorrer o hace >7 días,
  // pide atención) · neutro (reciente).
  const tonoAntig = yaHecho
    ? 'bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
    : diasRec == null || diasRec > 7
      ? 'bg-[var(--c-warn-soft)] text-[var(--c-warn-deep)]'
      : 'bg-[var(--c-sunk)] text-[var(--c-ink-soft)]'
  return (
    <div className="max-h-[52vh] shrink-0 overflow-y-auto border-t border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-3 pt-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full" style={{ background: colorHex }} />
          <div className="min-w-0 leading-tight">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="c-display truncate text-[18px] text-[var(--c-ink)]">
                Potrero {potrero.nombre}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                  tonoAntig,
                )}
              >
                {antiguedad}
              </span>
            </div>
            <CLabel className="!text-[11px]">{campoNombre}</CLabel>
          </div>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--c-faint)]"
        >
          <X className="size-5" />
        </button>
      </div>

      {potrero.cabezas > 0 ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <NumeroVivo
              valor={potrero.cabezas}
              className="c-mono text-[26px] font-extrabold leading-none text-[var(--c-ink)]"
            />
            <CLabel className="!text-[12px]">cabezas</CLabel>
            {nacidos > 0 && (
              <span className="ml-auto shrink-0 rounded-full bg-[var(--c-ok-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--c-ok-deep)]">
                +{nacidos} recién anotado{nacidos > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {compos.length > 0 && (
            <div className="mt-2 grid max-h-[26vh] gap-1.5 overflow-y-auto rounded-xl bg-[var(--c-sunk)] px-3 py-2">
              {compos.map((c) => (
                <div key={c.categoria} className="flex items-center gap-2 text-[13.5px]">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: col[c.categoria] }} />
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
        </>
      ) : (
        <CLabel className="mt-2 block !text-[12.5px]">
          Sin animales cargados en este potrero.
        </CLabel>
      )}

      <button
        type="button"
        onClick={() => onAbrir(potrero.id)}
        className="c-display c-hard mt-2.5 flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--c-ok)] text-[16px] text-white"
      >
        {yaHecho ? 'Ver / editar este potrero' : 'Recorrer este potrero'}
        <ArrowRight className="size-5" strokeWidth={2.5} />
      </button>

      {/* Anotar lo que cambió en este potrero. Fase 1: solo nacimientos; en
          Fase 2/3 este botón abre los 3 verbos (Nació · Se murió · Mover). */}
      {onAnotar && (
        <button
          type="button"
          onClick={() => onAnotar(potrero.id)}
          className="c-display mt-2 flex h-12 w-full items-center justify-center rounded-xl border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[15px] text-[var(--c-ink)] active:scale-[0.99]"
        >
          Nació un animal
        </button>
      )}

      {/* Mover sólo tiene sentido si hay algo que mover — y si sabemos EN QUÉ
          TROPA está. Con un cache anterior a la feature de tropas (`undefined`,
          distinto de `[]` = sueltos de verdad) el movimiento apuntaría a los
          animales sin tropa y movería cero, fallando recién al sincronizar,
          lejos del teléfono. Mejor no ofrecerlo y decir por qué.

          A diferencia del nacimiento, que con cache viejo igual se anota (queda
          sin tropa y se asigna después): una cría no registrada se pierde, un
          movimiento mal declarado ensucia el rodeo. */}
      {onMover &&
        potrero.cabezas > 0 &&
        (potrero.tropas === undefined ? (
          <p className="mt-2 rounded-xl border-2 border-dashed border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3.5 py-3 text-center text-[13.5px] text-[var(--c-ink-soft)]">
            Para mover animales, entrá una vez con señal — falta bajar las tropas
            de este campo.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => onMover(potrero.id)}
            className="c-display mt-2 flex h-12 w-full items-center justify-center rounded-xl border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[15px] text-[var(--c-ink)] active:scale-[0.99]"
          >
            Mover animales
          </button>
        ))}
    </div>
  )
}

type EstadoGPS =
  | { k: 'idle' }
  | { k: 'buscando' }
  | { k: 'ok'; pos: LatLng; potreroId: string | null }
  | { k: 'error'; msg: string }

export function Croquis({
  potreros,
  colorHex,
  campoNombre,
  seleccionadoId,
  nacidosPendientesDe,
  categoriasPendientesDe,
  onSeleccionar,
  onAnotarNacimiento,
  onMoverAnimales,
  moviendoDesde,
  onElegirDestino,
  onCancelarMovimiento,
  onAbrir,
  panel,
}: {
  potreros: RecPotrero[]
  /** Color IDENTIDAD del campo: el potrero recorrido se pinta de ESTE color
   *  (no verde), así cada campo tiene su croquis distinto y no todo homogéneo. */
  colorHex: string
  campoNombre: string
  /** Potrero seleccionado (muestra su panel abajo). null = ninguno. */
  seleccionadoId: string | null
  /** Nacimientos anotados sin subir, por potrero (feedback local en el panel). */
  nacidosPendientesDe?: (potreroId: string) => number
  /** Esos nacimientos abiertos por categoría (desglose derivado del panel). */
  categoriasPendientesDe?: (potreroId: string) => Map<CategoriaAnimal, number>
  /** Tocar un potrero en el mapa lo SELECCIONA (abre el panel), no el parte. */
  onSeleccionar: (potreroId: string | null) => void
  /** Anotar un nacimiento en el potrero del panel. Ausente = feature apagada. */
  onAnotarNacimiento?: (potreroId: string) => void
  /** Arrancar un movimiento desde un potrero (abre el modo destino). */
  onMoverAnimales?: (potreroId: string) => void
  /** Potrero origen mientras se elige destino. null = modo normal. */
  moviendoDesde?: string | null
  onElegirDestino?: (potreroId: string) => void
  onCancelarMovimiento?: () => void
  /** Abrir el parte de un potrero (desde el panel o el atajo del GPS).
   *  Ausente = el croquis no es la Recorrida (p. ej. la Manga): no se ofrece
   *  "cargar el parte" ni el atajo del GPS que lleva ahí. */
  onAbrir?: (potreroId: string) => void
  /**
   * Panel propio para la zona del pulgar cuando hay un potrero seleccionado.
   * Ausente = el panel de la Recorrida (estado, antigüedad, Recorrer…).
   *
   * Existe para que la Manga use EL MISMO dibujo — polígonos reales, foco,
   * astillas con pin, GPS, todo offline — con sus propias acciones abajo, sin
   * duplicar 300 líneas de SVG que después se desincronizan.
   */
  panel?: (potrero: RecPotrero) => ReactNode
}) {
  const textoHecho = textoSobre(colorHex)
  const eligiendoDestino = moviendoDesde != null
  // En modo destino el toque significa otra cosa: elige a dónde van, no abre el
  // panel. El origen no es tocable (mover al mismo potrero no existe).
  const tocarPotrero = (id: string) => {
    if (!eligiendoDestino) return onSeleccionar(id)
    if (id === moviendoDesde) return
    onElegirDestino?.(id)
  }
  const seleccionado = seleccionadoId
    ? (potreros.find((p) => p.id === seleccionadoId) ?? null)
    : null
  const [gps, setGps] = useState<EstadoGPS>({ k: 'idle' })
  // Medimos el dibujo REAL en píxeles: sin eso no se puede saber si un potrero
  // llega al mínimo táctil (el viewBox es relativo al tamaño del campo).
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setBox({ w: e.contentRect.width, h: e.contentRect.height }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const conPoligono = potreros.filter((p) => p.poligono && p.poligono.length >= 3)
  const sinPoligono = potreros.filter((p) => !p.poligono || p.poligono.length < 3)
  const proy = proyector(conPoligono)

  const buscarGPS = () => {
    if (!('geolocation' in navigator)) {
      setGps({ k: 'error', msg: 'Este teléfono no tiene GPS' })
      return
    }
    setGps({ k: 'buscando' })
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos: LatLng = [p.coords.latitude, p.coords.longitude]
        const pisado = conPoligono.find((pt) => dentroDe(pos, pt.poligono!))
        setGps({ k: 'ok', pos, potreroId: pisado?.id ?? null })
      },
      () =>
        setGps({ k: 'error', msg: 'No pude ubicarte (¿GPS apagado o sin permiso?)' }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  }

  const aXY = proy?.aXY
  const gpsXY = gps.k === 'ok' && aXY ? aXY(gps.pos) : null
  const gpsDentro =
    gpsXY && gpsXY[0] >= 0 && gpsXY[0] <= 100 && gpsXY[1] >= 0 && gpsXY[1] <= 100
  const pisando =
    gps.k === 'ok' && gps.potreroId
      ? potreros.find((p) => p.id === gps.potreroId)
      : null

  // ---- Etiquetas en el lugar, con pin SOLO para las astillas ----------------
  // El número va SOBRE cada potrero (en su centro-más-adentro). Nada de pines
  // flotantes en masa: con muchos potreros chicos (La Porteña) eso era una nube
  // de globos imposible de asociar a su forma. Los chicos muestran su número en
  // el lugar (tamaño mínimo legible) + zona de tap agrandada. SOLO las ASTILLAS
  // —tan diminutas que ni con letra mínima ni con el dedo entran— van a un pin
  // con línea guía: son una o dos por campo, así que no arman nube.
  const escalaPx =
    proy && box.w > 0
      ? Math.min(box.w / (proy.vw + MARGEN * 2), box.h / (proy.vh + MARGEN * 2))
      : 0
  // Alto mínimo del número EN PANTALLA (px) → unidades de viewBox.
  const MIN_LABEL_PX = 13
  const minLabelVB = escalaPx > 0 ? MIN_LABEL_PX / escalaPx : 0
  // Radio de la zona de tap invisible de un potrero chico (target cómodo).
  const hitR = escalaPx > 0 ? TAP_MIN / 2 / escalaPx : 0
  // Astilla: por debajo de esto (px en pantalla) va a pin. Umbral BAJO → casi
  // todo se etiqueta en el lugar; solo las diminutas de verdad usan el pin.
  const ASTILLA_PX = 24
  const pinR = escalaPx > 0 ? TAP_MIN / 2 / escalaPx : 0
  const limite = proy
    ? { minX: -MARGEN, maxX: proy.vw + MARGEN, minY: -MARGEN, maxY: proy.vh + MARGEN }
    : { minX: 0, maxX: 0, minY: 0, maxY: 0 }

  type Capa = {
    p: RecPotrero
    pts: XY[]
    x: number
    y: number
    r: number
    chico: boolean
    astilla: boolean
    pin: { x: number; y: number } | null
  }
  const capas: Capa[] = []
  if (aXY) {
    const polys = conPoligono.map((p) => p.poligono!.map(aXY))
    const ocupados: { x: number; y: number }[] = []
    conPoligono.forEach((p, i) => {
      const { x, y, r } = polo(polys[i])
      const dim = r * 2 * escalaPx
      const chico = escalaPx > 0 && dim < TAP_MIN
      const astilla = escalaPx > 0 && dim < ASTILLA_PX
      capas.push({ p, pts: polys[i], x, y, r, chico, astilla, pin: null })
      if (!astilla) ocupados.push({ x, y })
    })
    for (const c of capas) {
      if (!c.astilla) continue
      c.pin = ubicarPin({ x: c.x, y: c.y }, c.r + pinR * 1.6, pinR, polys, ocupados, limite)
      ocupados.push(c.pin)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ===== El dibujo: se come todo el alto disponible. Es lo que mira. ===== */}
      {/* Fondo de TIERRA, no del color de las tarjetas: antes el potrero
          (#ffffff) y la superficie (#f2f4ef) diferían un 3% y el croquis se
          leía como una maraña de líneas sin figura contra fondo. */}
      {/* PISO del dibujo. Sin él, un panel alto (composición + acciones) dejaba
          el mapa en ~160px: con el campo entero metido ahí, cada potrero medía
          menos que el mínimo táctil, TODOS pasaban a pin y los pines se
          amontonaban unos sobre otros — el croquis dejaba de ser un croquis.
          El mapa ES la Recorrida: si algo tiene que ceder, es el panel, que
          scrollea. */}
      <div
        ref={boxRef}
        className="relative min-h-[38vh] flex-1 overflow-hidden bg-[#cbd3c4] p-1.5"
      >
        {aXY && proy ? (
          <svg
            viewBox={`${-MARGEN} ${-MARGEN} ${proy.vw + MARGEN * 2} ${proy.vh + MARGEN * 2}`}
            preserveAspectRatio="xMidYMid meet"
            // Absoluta: el contenedor es `relative`. Así la SVG NO aporta altura
            // intrínseca (del aspect del viewBox) — si no, le pone un piso al
            // dibujo y el flex no lo puede encoger para dejar lugar al panel.
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Croquis del campo — tocá un potrero para cargarlo"
          >
            {/* 1) Los polígonos. Dos estados y nada más: pendiente (blanco) y
                   hecho de hoy (verde + tilde). La antigüedad ya NO vive acá —
                   satura el mapa, que se mira de reojo; vive en su panel. */}
            {capas.map(({ p, pts, x, y, r, chico, astilla }) => {
              const hecho = p.hecho === 1
              const acaEstoy = pisando?.id === p.id
              const sel = seleccionadoId === p.id
              // Con un potrero elegido, los demás se atenúan → el seleccionado resalta.
              const atenuado = seleccionadoId !== null && !sel
              // Eligiendo destino: el ORIGEN se marca y se apaga. Sin esto los
              // dos potreros se ven igual y tocar el origen no hace nada sin
              // explicar por qué.
              const esOrigen = eligiendoDestino && moviendoDesde === p.id
              const d =
                pts.map((q, j) => `${j === 0 ? 'M' : 'L'}${q[0]},${q[1]}`).join(' ') + ' Z'
              const largo = Math.max(2, p.nombre.length)
              const fsFit = Math.min(r * 1.15, (r * 3.1) / largo, 9)
              // Chico: piso de tamaño legible (aunque el número desborde su forma).
              const fs = chico ? Math.max(fsFit, minLabelVB) : fsFit
              const conTilde = hecho && fs >= 3.4
              return (
                <g
                  key={p.id}
                  onClick={() => tocarPotrero(p.id)}
                  className={esOrigen ? 'cursor-default' : 'cursor-pointer'}
                  role="button"
                  aria-label={
                    esOrigen
                      ? `${p.nombre} — salen de acá`
                      : eligiendoDestino
                        ? `Mover a ${p.nombre}`
                        : `${p.nombre}${hecho ? ' — ya cargado' : ''}`
                  }
                  style={{
                    opacity: esOrigen ? 0.5 : atenuado ? 0.38 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <path
                    d={d}
                    // Recorrido = LLENO del color del campo (identidad); pendiente
                    // = blanco. Cada campo tiene su croquis con su color, no todo
                    // verde homogéneo.
                    fill={hecho ? colorHex : '#ffffff'}
                    stroke={acaEstoy ? 'var(--c-warn)' : '#5a6659'}
                    strokeWidth={acaEstoy ? 1.6 : 0.7}
                    strokeLinejoin="round"
                  />
                  {/* Origen del movimiento: borde punteado — "de acá salen". */}
                  {esOrigen && (
                    <path
                      d={d}
                      fill="none"
                      stroke="var(--c-ok-deep)"
                      strokeWidth={1.4}
                      strokeDasharray="3 2"
                      strokeLinejoin="round"
                    />
                  )}
                  {/* Candidatos a destino: casing verde, "tocame". */}
                  {eligiendoDestino && !esOrigen && (
                    <path
                      d={d}
                      fill="var(--c-ok)"
                      fillOpacity={0.14}
                      stroke="var(--c-ok)"
                      strokeWidth={1.4}
                      strokeLinejoin="round"
                    />
                  )}
                  {/* Seleccionado: relleno lima translúcido + casing oscuro +
                      anillo lima grueso → resalta sobre cualquier fondo (blanco
                      o color del campo) y contrasta con el resto atenuado. */}
                  {sel && (
                    <>
                      <path d={d} fill="var(--c-mid)" fillOpacity={0.22} stroke="none" style={{ pointerEvents: 'none' }} />
                      <path d={d} fill="none" stroke="#0c1c14" strokeOpacity={0.85} strokeWidth={4} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                      <path d={d} fill="none" stroke="var(--c-mid)" strokeWidth={2.2} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                    </>
                  )}
                  {/* Astilla → el número va en su pin (abajo); acá, nada. El
                      resto se etiqueta en el lugar. */}
                  {!astilla && (
                    <>
                      {/* Zona de tap invisible sobre el número: agranda el target
                          de los chicos (guante/sol), centrada en su potrero. */}
                      {chico && (
                        <circle cx={x} cy={y} r={Math.min(hitR, fs * 1.6)} fill="transparent" />
                      )}
                      <text
                        x={x}
                        y={conTilde ? y - fs * 0.3 : y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="c-mono"
                        fontSize={fs}
                        fontWeight={800}
                        fill={hecho ? textoHecho : 'var(--c-ink)'}
                        stroke={hecho ? colorHex : '#fff'}
                        strokeWidth={fs * 0.16}
                        paintOrder="stroke"
                        style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
                      >
                        {p.nombre}
                      </text>
                      {conTilde && (
                        <path
                          d={`M${x - fs * 0.34},${y + fs * 0.5} l${fs * 0.26},${fs * 0.26} l${fs * 0.5},${-fs * 0.52}`}
                          fill="none"
                          stroke={textoHecho}
                          strokeWidth={fs * 0.16}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ pointerEvents: 'none' }}
                        />
                      )}
                    </>
                  )}
                </g>
              )
            })}

            {/* Pines de las ASTILLAS: ENCIMA de todo. Cada uno mide 44px real y
                lleva su línea guía al potrero. Son pocas (1-2 por campo). */}
            {capas.map(({ p, x, y, pin }) => {
              if (!pin) return null
              const hecho = p.hecho === 1
              const sel = seleccionadoId === p.id
              const atenuado = seleccionadoId !== null && !sel
              const fs = Math.min((pinR * 2.6) / Math.max(2, p.nombre.length), pinR * 0.95)
              return (
                <g
                  key={`pin-${p.id}`}
                  onClick={() => tocarPotrero(p.id)}
                  className="cursor-pointer"
                  role="button"
                  aria-label={`${p.nombre}${hecho ? ' — ya cargado' : ''}`}
                  style={{ opacity: atenuado ? 0.42 : 1, transition: 'opacity 0.15s' }}
                >
                  <line
                    x1={x}
                    y1={y}
                    x2={pin.x}
                    y2={pin.y}
                    stroke="#3c463b"
                    strokeWidth={pinR * 0.09}
                    strokeDasharray={`${pinR * 0.18} ${pinR * 0.14}`}
                  />
                  <circle cx={x} cy={y} r={pinR * 0.13} fill="#3c463b" />
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r={pinR}
                    fill={hecho ? colorHex : '#ffffff'}
                    stroke={pisando?.id === p.id ? 'var(--c-warn)' : '#3c463b'}
                    strokeWidth={pinR * 0.11}
                  />
                  {sel && (
                    <>
                      <circle cx={pin.x} cy={pin.y} r={pinR * 1.28} fill="none" stroke="#0c1c14" strokeOpacity={0.85} strokeWidth={pinR * 0.34} style={{ pointerEvents: 'none' }} />
                      <circle cx={pin.x} cy={pin.y} r={pinR * 1.28} fill="none" stroke="var(--c-mid)" strokeWidth={pinR * 0.18} style={{ pointerEvents: 'none' }} />
                    </>
                  )}
                  <text
                    x={pin.x}
                    y={hecho ? pin.y - pinR * 0.22 : pin.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="c-mono"
                    fontSize={fs}
                    fontWeight={800}
                    fill={hecho ? textoHecho : 'var(--c-ink)'}
                    style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
                  >
                    {p.nombre}
                  </text>
                  {hecho && (
                    <path
                      d={`M${pin.x - pinR * 0.3},${pin.y + pinR * 0.42} l${pinR * 0.22},${pinR * 0.22} l${pinR * 0.44},${-pinR * 0.46}`}
                      fill="none"
                      stroke={textoHecho}
                      strokeWidth={pinR * 0.13}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                </g>
              )
            })}
            {/* ESTÁS ACÁ: punto GPS pulsante */}
            {gpsXY && gpsDentro && (
              <g style={{ pointerEvents: 'none' }}>
                <circle cx={gpsXY[0]} cy={gpsXY[1]} r={3.2} fill="var(--c-warn)" opacity={0.35}>
                  <animate attributeName="r" values="2.4;5;2.4" dur="1.6s" repeatCount="indefinite" />
                </circle>
                <circle
                  cx={gpsXY[0]}
                  cy={gpsXY[1]}
                  r={1.8}
                  fill="var(--c-warn)"
                  stroke="#fff"
                  strokeWidth={0.6}
                />
              </g>
            )}
          </svg>
        ) : null}

        {/* Potreros sin dibujo: no desaparecen del mapa — se listan encima. */}
        {sinPoligono.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 bg-[var(--c-bg)]/92 px-3 py-2.5 backdrop-blur-sm">
            <CLabel className="mb-1.5 !text-[10.5px]">Sin dibujo en el mapa</CLabel>
            <div className="flex flex-wrap gap-1.5">
              {sinPoligono.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => tocarPotrero(p.id)}
                  className={cn(
                    'c-display flex h-11 items-center gap-1.5 rounded-lg border px-3 text-[15px]',
                    p.hecho !== 1 &&
                      'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)]',
                  )}
                  style={
                    p.hecho === 1
                      ? { background: colorHex, color: textoHecho, borderColor: 'transparent' }
                      : undefined
                  }
                >
                  {p.hecho === 1 && <Check className="size-4" strokeWidth={3} />}
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== Zona del pulgar: guía de destino, panel, o ubicarse ===== */}
      {eligiendoDestino ? (
        <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2.5">
          <div className="c-hard-sm flex items-center gap-3 rounded-xl border-2 border-[var(--c-ok)] bg-[var(--c-ok-soft)] px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <span className="c-display block truncate text-[16px] leading-tight text-[var(--c-ink)]">
                ¿A qué potrero van?
              </span>
              <span className="block truncate text-[12.5px] text-[var(--c-ink-soft)]">
                Tocalo en el croquis · salen del{' '}
                {potreros.find((x) => x.id === moviendoDesde)?.nombre ?? ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onCancelarMovimiento?.()}
              className="c-display shrink-0 rounded-lg border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 py-2 text-[14px] text-[var(--c-ink)] active:scale-95"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : seleccionado ? (
        panel ? (
          panel(seleccionado)
        ) : (
          <PanelPotrero
            potrero={seleccionado}
            campoNombre={campoNombre}
            colorHex={colorHex}
            nacidos={nacidosPendientesDe?.(seleccionado.id) ?? 0}
            nacidosPorCategoria={categoriasPendientesDe?.(seleccionado.id)}
            onAnotar={onAnotarNacimiento}
            onMover={onMoverAnimales}
            onAbrir={onAbrir ?? (() => {})}
            onCerrar={() => onSeleccionar(null)}
          />
        )
      ) : (
      <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2.5">
        {pisando && onAbrir ? (
          // El camino más corto posible: frenó, está adentro, un toque y carga.
          <button
            type="button"
            onClick={() => onAbrir(pisando.id)}
            className="c-display c-hard flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--c-warn)] text-[17px] text-[#1c1400]"
          >
            <Crosshair className="size-5" strokeWidth={2.5} />
            Estás en {pisando.nombre} · cargar
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={buscarGPS}
              disabled={gps.k === 'buscando'}
              className="c-display c-hard-sm flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[16px] text-[var(--c-ink)] disabled:opacity-60"
            >
              {gps.k === 'buscando' ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <Crosshair className="size-5" />
              )}
              ¿Dónde estoy?
            </button>
          </div>
        )}
        {gps.k === 'ok' && !pisando && (
          <CLabel className="mt-1.5 block text-center !text-[11px]">
            {gpsDentro
              ? 'Estás entre potreros — tocá el que quieras en el mapa'
              : 'Estás fuera de los potreros dibujados'}
          </CLabel>
        )}
        {gps.k === 'error' && (
          <CLabel className="mt-1.5 block text-center !text-[11px] !text-[var(--c-warn)]">
            {gps.msg}
          </CLabel>
        )}
      </div>
      )}
    </div>
  )
}
