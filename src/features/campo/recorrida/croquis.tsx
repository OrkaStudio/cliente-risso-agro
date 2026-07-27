import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Crosshair, LoaderCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categoriaNombre, coloresPorCategoria } from '@/features/hacienda/labels'
import type { RecPotrero } from './db'
import { diasDesde, haceCuantoTxt } from './api'
import { CLabel } from '../ui'

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
 * Ubica el pin de un potrero chico: prueba 12 direcciones alrededor de su polo
 * y elige la que cae en espacio libre — fuera de todos los polígonos y lejos
 * de las otras etiquetas. Así el target grande no se come al vecino, que es
 * exactamente lo que había que evitar.
 */
function ubicarPin(
  origen: { x: number; y: number },
  dist: number,
  radio: number,
  poligonos: XY[][],
  ocupados: { x: number; y: number }[],
  /** Límites del viewBox visible: el pin (círculo de `radio`) no puede salirse
   *  o queda RECORTADO en el borde de la pantalla. */
  limite: { minX: number; maxX: number; minY: number; maxY: number },
): { x: number; y: number } {
  let mejor = { x: origen.x + dist, y: origen.y, score: -Infinity }
  // Varias distancias: con una sola, si el potrero está rodeado, el pin cae
  // igual encima de un vecino. Estirando el brazo llega al fondo libre.
  for (const k of [1, 1.5, 2.1, 2.9]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const x = origen.x + Math.cos(a) * dist * k
      const y = origen.y + Math.sin(a) * dist * k
      let score = -k * 6 // a igualdad de condiciones, el pin cerca del potrero
      // Salirse de la pantalla es lo peor: el pin queda cortado.
      if (
        x < limite.minX + radio || x > limite.maxX - radio ||
        y < limite.minY + radio || y > limite.maxY - radio
      ) {
        score -= 500
      }
      // Tapar otro potrero: le esconde el número al vecino.
      for (const poly of poligonos) {
        if (distanciaAlBorde(x, y, poly) > -radio * 0.5) score -= 260
      }
      // Y penaliza acercarse a etiquetas/pines ya colocados.
      for (const o of ocupados) {
        const d = Math.hypot(x - o.x, y - o.y)
        if (d < radio * 2.4) score -= (radio * 2.4 - d) * 25
      }
      if (score > mejor.score) mejor = { x, y, score }
    }
  }
  // Red de seguridad: aunque el mejor haya quedado al borde, se clampa para que
  // el pin entero entre en el viewBox — nunca recortado.
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
  onAbrir,
  onCerrar,
}: {
  potrero: RecPotrero
  campoNombre: string
  colorHex: string
  onAbrir: (id: string) => void
  onCerrar: () => void
}) {
  const compos = potrero.composicion ?? []
  const col = coloresPorCategoria(compos.map((c) => c.categoria))
  const yaHecho = potrero.hecho === 1
  const antiguedad = yaHecho
    ? 'Recorrido hoy'
    : potrero.ultima?.fecha
      ? `Recorrido ${haceCuantoTxt(diasDesde(potrero.ultima.fecha))}`
      : 'Sin recorrer'
  return (
    <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-3 pt-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full" style={{ background: colorHex }} />
          <div className="min-w-0 leading-tight">
            <div className="c-display truncate text-[18px] text-[var(--c-ink)]">
              Potrero {potrero.nombre}
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
            <span className="c-mono text-[26px] font-extrabold leading-none text-[var(--c-ink)]">
              {potrero.cabezas}
            </span>
            <CLabel className="!text-[12px]">cabezas</CLabel>
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

      <CLabel className="mt-2 block !text-[11.5px]">{antiguedad}</CLabel>

      <button
        type="button"
        onClick={() => onAbrir(potrero.id)}
        className="c-display c-hard mt-2.5 flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--c-ok)] text-[16px] text-white"
      >
        {yaHecho ? 'Ver / editar este potrero' : 'Recorrer este potrero'}
        <ArrowRight className="size-5" strokeWidth={2.5} />
      </button>
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
  onSeleccionar,
  onAbrir,
}: {
  potreros: RecPotrero[]
  /** Color IDENTIDAD del campo: el potrero recorrido se pinta de ESTE color
   *  (no verde), así cada campo tiene su croquis distinto y no todo homogéneo. */
  colorHex: string
  campoNombre: string
  /** Potrero seleccionado (muestra su panel abajo). null = ninguno. */
  seleccionadoId: string | null
  /** Tocar un potrero en el mapa lo SELECCIONA (abre el panel), no el parte. */
  onSeleccionar: (potreroId: string | null) => void
  /** Abrir el parte de un potrero (desde el panel o el atajo del GPS). */
  onAbrir: (potreroId: string) => void
}) {
  const textoHecho = textoSobre(colorHex)
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

  // ---- Reparto etiqueta interna vs pin -------------------------------------
  // Un potrero astilla (12A en La Porteña) no tiene ni superficie para el
  // número ni superficie para el dedo. En vez de seguir achicando la letra, se
  // lo saca a un PIN de 44px anclado con línea guía, ubicado en espacio libre.
  // El polígono sigue siendo tocable; el pin es el target confiable.
  const escalaPx =
    proy && box.w > 0
      ? Math.min(box.w / (proy.vw + MARGEN * 2), box.h / (proy.vh + MARGEN * 2))
      : 0
  const pinR = escalaPx > 0 ? TAP_MIN / 2 / escalaPx : 0
  // Límites del viewBox visible (para que ningún pin se recorte).
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
    pin: { x: number; y: number } | null
  }
  const capas: Capa[] = []
  if (aXY) {
    const polys = conPoligono.map((p) => p.poligono!.map(aXY))
    const ocupados: { x: number; y: number }[] = []
    conPoligono.forEach((p, i) => {
      const { x, y, r } = polo(polys[i])
      const chico = escalaPx > 0 && r * 2 * escalaPx < TAP_MIN
      capas.push({ p, pts: polys[i], x, y, r, chico, pin: null })
      if (!chico) ocupados.push({ x, y })
    })
    // Los pines se colocan después, esquivando las etiquetas ya asentadas.
    for (const c of capas) {
      if (!c.chico) continue
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
      <div
        ref={boxRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-[#cbd3c4] p-1.5"
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
            {capas.map(({ p, pts, x, y, r, chico }) => {
              const hecho = p.hecho === 1
              const acaEstoy = pisando?.id === p.id
              const sel = seleccionadoId === p.id
              const d =
                pts.map((q, j) => `${j === 0 ? 'M' : 'L'}${q[0]},${q[1]}`).join(' ') + ' Z'
              const largo = Math.max(2, p.nombre.length)
              const fs = Math.min(r * 1.15, (r * 3.1) / largo, 9)
              const conTilde = hecho && fs >= 3.4
              return (
                <g
                  key={p.id}
                  onClick={() => onSeleccionar(p.id)}
                  className="cursor-pointer"
                  role="button"
                  aria-label={`${p.nombre}${hecho ? ' — ya cargado' : ''}`}
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
                  {/* Seleccionado: casing oscuro + anillo blanco → se ve sobre
                      cualquier relleno (blanco o color del campo). */}
                  {sel && (
                    <>
                      <path d={d} fill="none" stroke="#0c1c14" strokeOpacity={0.9} strokeWidth={2.6} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                      <path d={d} fill="none" stroke="#ffffff" strokeWidth={1.3} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                    </>
                  )}
                  {/* El número va adentro solo si el potrero le da lugar; si
                      no, se dibuja en el pin (abajo) y acá no va nada. */}
                  {!chico && (
                    <>
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

            {/* 2) Los pines de los potreros chicos, ENCIMA de todo para que
                   ningún vecino los tape. Cada uno mide 44px de verdad. */}
            {capas.map(({ p, x, y, pin }) => {
              if (!pin) return null
              const hecho = p.hecho === 1
              const sel = seleccionadoId === p.id
              const fs = Math.min((pinR * 2.6) / Math.max(2, p.nombre.length), pinR * 0.95)
              return (
                <g
                  key={`pin-${p.id}`}
                  onClick={() => onSeleccionar(p.id)}
                  className="cursor-pointer"
                  role="button"
                  aria-label={`${p.nombre}${hecho ? ' — ya cargado' : ''}`}
                >
                  {/* Línea guía: dice a qué potrero pertenece el pin. */}
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
                      <circle cx={pin.x} cy={pin.y} r={pinR} fill="none" stroke="#0c1c14" strokeOpacity={0.9} strokeWidth={pinR * 0.24} style={{ pointerEvents: 'none' }} />
                      <circle cx={pin.x} cy={pin.y} r={pinR} fill="none" stroke="#ffffff" strokeWidth={pinR * 0.12} style={{ pointerEvents: 'none' }} />
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
                  onClick={() => onSeleccionar(p.id)}
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

      {/* ===== Zona del pulgar: panel del potrero elegido, o ubicarse ===== */}
      {seleccionado ? (
        <PanelPotrero
          potrero={seleccionado}
          campoNombre={campoNombre}
          colorHex={colorHex}
          onAbrir={onAbrir}
          onCerrar={() => onSeleccionar(null)}
        />
      ) : (
      <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2.5">
        {pisando ? (
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
