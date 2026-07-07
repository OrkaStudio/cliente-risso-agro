import { useState } from 'react'
import { Crosshair, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RecPotrero } from './db'
import { CChip, CLabel } from '../ui'

/**
 * Croquis del campo: los potreros dibujados con su FORMA REAL (polígonos que
 * Oficina trazó sobre el satélite), pintados por estado y tocables para
 * saltar. Es puro SVG desde el cache — anda sin señal y sin tiles.
 *
 * GPS "¿dónde estoy?": el GPS del teléfono funciona sin datos → un
 * punto-en-polígono ubica al productor y le marca "ESTÁS ACÁ" en el dibujo.
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
  // Relación de aspecto real del campo para dimensionar el <svg>.
  const aspecto = (w * escala + offX * 2) / (h * escala + offY * 2)
  return { aXY, aspecto }
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
  paso,
  onSaltar,
}: {
  potreros: RecPotrero[]
  paso: number
  onSaltar: (i: number) => void
}) {
  const [gps, setGps] = useState<EstadoGPS>({ k: 'idle' })

  const conPoligono = potreros.filter((p) => p.poligono && p.poligono.length >= 3)
  const sinPoligono = potreros.filter((p) => !p.poligono || p.poligono.length < 3)
  const proy = proyector(conPoligono)

  const buscarGPS = () => {
    if (!('geolocation' in navigator)) {
      setGps({ k: 'error', msg: 'Este teléfono no tiene GPS disponible' })
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
        setGps({
          k: 'error',
          msg: 'No pude ubicarte (¿GPS apagado o sin permiso?)',
        }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  }

  if (!proy) return null
  const { aXY, aspecto } = proy

  const gpsXY = gps.k === 'ok' ? aXY(gps.pos) : null
  const gpsDentro =
    gpsXY && gpsXY[0] >= 0 && gpsXY[0] <= 100 && gpsXY[1] >= 0 && gpsXY[1] <= 100
  const potreroPisado =
    gps.k === 'ok' && gps.potreroId
      ? potreros.findIndex((p) => p.id === gps.potreroId)
      : -1

  return (
    <div className="flex flex-col gap-2.5">
      {/* Dibujo del campo */}
      <div className="c-panel overflow-hidden p-1.5">
        <svg
          viewBox="0 0 100 100"
          className="w-full"
          style={{ aspectRatio: Math.max(0.7, Math.min(1.6, aspecto)) }}
          role="img"
          aria-label="Croquis del campo"
        >
          {conPoligono.map((p) => {
            const i = potreros.findIndex((x) => x.id === p.id)
            const actual = i === paso
            const hecho = p.hecho === 1
            const d =
              p.poligono!
                .map((pt, j) => `${j === 0 ? 'M' : 'L'}${aXY(pt)[0]},${aXY(pt)[1]}`)
                .join(' ') + ' Z'
            const [cx, cy] = centroide(p.poligono!, aXY)
            // Nombre real del potrero (10A, 3M, ...) — tamaño según largo.
            const fs = p.nombre.length <= 3 ? 5 : p.nombre.length <= 6 ? 3.6 : 2.8
            return (
              <g key={p.id} onClick={() => onSaltar(i)} className="cursor-pointer">
                <path
                  d={d}
                  fill={
                    actual
                      ? 'var(--c-ok)'
                      : hecho
                        ? 'var(--c-ok-soft)'
                        : 'var(--c-sunk)'
                  }
                  stroke={actual ? 'var(--c-ok-deep)' : 'var(--c-ink-soft)'}
                  strokeOpacity={actual ? 1 : 0.45}
                  strokeWidth={actual ? 0.9 : 0.45}
                  strokeLinejoin="round"
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="c-mono"
                  fontSize={fs}
                  fontWeight={700}
                  fill={actual ? '#fff' : hecho ? 'var(--c-ok-deep)' : 'var(--c-ink-soft)'}
                  style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
                >
                  {p.nombre}
                </text>
              </g>
            )
          })}
          {/* ESTÁS ACÁ: punto GPS pulsante */}
          {gpsXY && gpsDentro && (
            <g style={{ pointerEvents: 'none' }}>
              <circle cx={gpsXY[0]} cy={gpsXY[1]} r={3.2} fill="var(--c-warn)" opacity={0.3}>
                <animate attributeName="r" values="2.4;4.6;2.4" dur="1.6s" repeatCount="indefinite" />
              </circle>
              <circle
                cx={gpsXY[0]}
                cy={gpsXY[1]}
                r={1.7}
                fill="var(--c-warn)"
                stroke="#fff"
                strokeWidth={0.5}
              />
            </g>
          )}
        </svg>
      </div>

      {/* GPS: dónde estoy */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={buscarGPS}
          disabled={gps.k === 'buscando'}
          className="c-display c-hard-sm flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 text-[14px] text-[var(--c-ink)] disabled:opacity-60"
        >
          {gps.k === 'buscando' ? (
            <LoaderCircle className="size-4.5 animate-spin" />
          ) : (
            <Crosshair className="size-4.5" />
          )}
          ¿Dónde estoy?
        </button>
        <div className="min-w-0 flex-1">
          {gps.k === 'ok' && potreroPisado >= 0 && (
            <button
              type="button"
              onClick={() => onSaltar(potreroPisado)}
              className="c-hazard w-full truncate rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-semibold"
            >
              Estás en {potreros[potreroPisado].nombre} → ir
            </button>
          )}
          {gps.k === 'ok' && potreroPisado < 0 && (
            <CLabel className="!text-[11px]">
              {gpsDentro
                ? 'Estás entre potreros (sin dibujo acá)'
                : 'Estás fuera de los potreros dibujados'}
            </CLabel>
          )}
          {gps.k === 'error' && (
            <CLabel className="!text-[11px] !text-[var(--c-warn)]">{gps.msg}</CLabel>
          )}
        </div>
      </div>

      {/* Potreros sin dibujo: siguen accesibles como chips */}
      {sinPoligono.length > 0 && (
        <div>
          <CLabel className="mb-1.5">Sin dibujo en el mapa</CLabel>
          <div className="flex flex-wrap gap-1.5">
            {sinPoligono.map((p) => {
              const i = potreros.findIndex((x) => x.id === p.id)
              return (
                <CChip
                  key={p.id}
                  label={p.nombre}
                  selected={i === paso}
                  onClick={() => onSaltar(i)}
                  className={cn(p.hecho === 1 && 'opacity-70')}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
