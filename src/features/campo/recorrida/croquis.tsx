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

/** Proyección equirectangular simple → coordenadas de viewBox 0..100. */
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
  const escala = 92 / Math.max(w, h) // 92 = 100 - márgenes
  const offX = (100 - w * escala) / 2
  const offY = (100 - h * escala) / 2
  const aXY = ([lat, lng]: LatLng): XY => [
    offX + (lng - minLng) * kx * escala,
    offY + (maxLat - lat) * escala,
  ]
  return { aXY }
}

function centroide(poligono: LatLng[], aXY: (p: LatLng) => XY): XY {
  const pts = poligono.map(aXY)
  const x = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const y = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return [x, y]
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
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--c-sunk)]">
        {aXY ? (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
            role="img"
            aria-label="Croquis del campo — tocá un potrero para cargarlo"
          >
            {conPoligono.map((p) => {
              const hecho = p.hecho === 1
              const acaEstoy = pisando?.id === p.id
              const d =
                p.poligono!
                  .map((pt, j) => `${j === 0 ? 'M' : 'L'}${aXY(pt)[0]},${aXY(pt)[1]}`)
                  .join(' ') + ' Z'
              const [cx, cy] = centroide(p.poligono!, aXY)
              const fs = p.nombre.length <= 3 ? 5.5 : p.nombre.length <= 6 ? 4 : 3
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
                    // el pendiente queda claro. La diferencia se lee de reojo.
                    fill={hecho ? 'var(--c-ok)' : 'var(--c-panel)'}
                    fillOpacity={hecho ? 0.9 : 1}
                    stroke={acaEstoy ? 'var(--c-warn)' : 'var(--c-ink)'}
                    strokeOpacity={acaEstoy ? 1 : 0.55}
                    strokeWidth={acaEstoy ? 1.4 : 0.6}
                    strokeLinejoin="round"
                  />
                  <text
                    x={cx}
                    y={hecho ? cy - 1.2 : cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="c-mono"
                    fontSize={fs}
                    fontWeight={800}
                    fill={hecho ? '#fff' : 'var(--c-ink)'}
                    style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
                  >
                    {p.nombre}
                  </text>
                  {hecho && (
                    <path
                      d={`M${cx - 1.6},${cy + 2.6} l1.3,1.3 l2.4,-2.6`}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={0.9}
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
