import { useState } from 'react'
import { Check, Crosshair, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RecPotrero } from './db'
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

type EstadoGPS =
  | { k: 'idle' }
  | { k: 'buscando' }
  | { k: 'ok'; pos: LatLng; potreroId: string | null }
  | { k: 'error'; msg: string }

export function Croquis({
  potreros,
  onAbrir,
}: {
  potreros: RecPotrero[]
  /** Abrir el parte de un potrero (la hoja la monta la página). */
  onAbrir: (potreroId: string) => void
}) {
  const [gps, setGps] = useState<EstadoGPS>({ k: 'idle' })

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ===== El dibujo: se come todo el alto disponible. Es lo que mira. ===== */}
      {/* Fondo de TIERRA, no del color de las tarjetas: antes el potrero
          (#ffffff) y la superficie (#f2f4ef) diferían un 3% y el croquis se
          leía como una maraña de líneas sin figura contra fondo. */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#cbd3c4] p-1.5">
        {aXY && proy ? (
          <svg
            viewBox={`-3 -3 ${proy.vw + 6} ${proy.vh + 6}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
            role="img"
            aria-label="Croquis del campo — tocá un potrero para cargarlo"
          >
            {conPoligono.map((p) => {
              const hecho = p.hecho === 1
              const acaEstoy = pisando?.id === p.id
              const pts = p.poligono!.map(aXY)
              const d =
                pts.map((q, j) => `${j === 0 ? 'M' : 'L'}${q[0]},${q[1]}`).join(' ') + ' Z'
              // Etiqueta en el punto más adentro, con el cuerpo que entre ahí.
              const { x: cx, y: cy, r } = polo(pts)
              const largo = Math.max(2, p.nombre.length)
              // Piso de legibilidad: en un potrero astilla el número entra
              // "mal" a propósito y se sale un poco del contorno — leerlo vale
              // más que respetar el borde, y el halo lo despega del vecino.
              const fs = Math.max(2.9, Math.min(r * 1.15, (r * 3.1) / largo, 9))
              const conTilde = hecho && fs >= 3.4
              return (
                <g
                  key={p.id}
                  onClick={() => onAbrir(p.id)}
                  className="cursor-pointer"
                  role="button"
                  aria-label={`${p.nombre}${hecho ? ' — ya cargado' : ''}`}
                >
                  <path
                    d={d}
                    // Alto contraste para el sol: el hecho se LLENA de verde,
                    // el pendiente queda blanco. Se lee de reojo, sin enfocar.
                    fill={hecho ? 'var(--c-ok)' : '#ffffff'}
                    stroke={acaEstoy ? 'var(--c-warn)' : '#5a6659'}
                    strokeWidth={acaEstoy ? 1.6 : 0.7}
                    strokeLinejoin="round"
                  />
                  {fs >= 1.6 && (
                    <text
                      x={cx}
                      y={conTilde ? cy - fs * 0.3 : cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="c-mono"
                      fontSize={fs}
                      fontWeight={800}
                      fill={hecho ? '#fff' : 'var(--c-ink)'}
                      // Halo: si dos potreros chicos quedan juntos, el número
                      // sigue legible sobre cualquier vecino.
                      stroke={hecho ? 'var(--c-ok)' : '#fff'}
                      strokeWidth={fs * 0.16}
                      paintOrder="stroke"
                      style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
                    >
                      {p.nombre}
                    </text>
                  )}
                  {conTilde && (
                    <path
                      d={`M${cx - fs * 0.34},${cy + fs * 0.5} l${fs * 0.26},${fs * 0.26} l${fs * 0.5},${-fs * 0.52}`}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={fs * 0.16}
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
                  onClick={() => onAbrir(p.id)}
                  className={cn(
                    'c-display flex h-11 items-center gap-1.5 rounded-lg border px-3 text-[15px]',
                    p.hecho === 1
                      ? 'border-transparent bg-[var(--c-ok)] text-white'
                      : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)]',
                  )}
                >
                  {p.hecho === 1 && <Check className="size-4" strokeWidth={3} />}
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== Zona del pulgar: ubicarse y el atajo del potrero que pisa ===== */}
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
    </div>
  )
}
