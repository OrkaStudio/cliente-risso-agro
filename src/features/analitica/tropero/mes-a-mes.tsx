import { useLayoutEffect, useRef, useState } from 'react'
import { fmtCompact } from '@/features/analitica/compute'
import { cn } from '@/lib/utils'
import { nombreMes, type Apretado, type Mes } from './plata'

const ALTO = 216
const ARRIBA = 26
const ABAJO = 46

const mayuscula = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase())
const conSigno = (n: number) => `${n >= 0 ? '+' : '−'}${fmtCompact(Math.abs(n))}`

/**
 * La plata mes a mes (rediseño de Plata, 03/11): una barra por mes con lo que
 * quedó (entró menos salió), hacia arriba si quedó a favor y hacia abajo si no.
 * Los meses que vienen van rayados: es lo anotado que vence. Arriba, lo que el
 * gráfico dice (el mes que se viene apretado, o que viene a favor) y tres datos
 * del año; al pasar por un mes, sus números en ese mismo lugar, sin tapar nada.
 */
export function MesAMes({ meses, apretado: aprieta }: { meses: Mes[]; apretado: Apretado | null }) {
  const apretado = aprieta?.mes ?? null
  const caja = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  const [foco, setFoco] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(e!.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const netos = meses.map((m) => m.entro - m.salio)
  // Escala justa a los datos: lo que sube y lo que baja ocupan lo que necesitan.
  const sube = Math.max(...netos, 0)
  const baja = Math.max(...netos.map((n) => -n), 0)
  const total = sube + baja || 1
  const alto = ALTO - ARRIBA - ABAJO
  const cero = ARRIBA + (sube / total) * alto
  const y = (n: number) => (Math.abs(n) / total) * alto
  const banda = ancho / meses.length
  const barra = Math.min(34, banda * 0.62)
  const x = (i: number) => banda * i + banda / 2
  const primerFuturo = meses.findIndex((m) => m.futuro)
  const elegido = foco
  const m = elegido != null ? meses[elegido] : null
  const neto = elegido != null ? netos[elegido]! : 0

  // Lo que dice el año que pasó.
  const pasados = meses.map((mes, i) => ({ mes, n: netos[i]! })).filter((p) => !p.mes.futuro && (p.mes.entro || p.mes.salio))
  const aFavor = pasados.filter((p) => p.n >= 0).length
  const mejor = pasados.reduce<(typeof pasados)[number] | null>((a, p) => (!a || p.n > a.n ? p : a), null)
  const peor = pasados.reduce<(typeof pasados)[number] | null>((a, p) => (!a || p.n < a.n ? p : a), null)
  const vieneAFavor = meses.filter((x) => x.futuro).reduce((s, x) => s + x.entro - x.salio, 0)

  const vuelve = aprieta?.proximoIngreso && aprieta.proximoIngreso.slice(0, 7) > aprieta.mes ? nombreMes(aprieta.proximoIngreso.slice(0, 7)) : null

  return (
    <div>
      {/* Lo que hay que saber, en una línea: el mes que se viene apretado o que lo que viene queda a favor. */}
      {aprieta ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-2 rounded-full bg-estado-problema-suave py-1.5 pr-3.5 pl-3 text-[14.5px] font-bold text-estado-problema-texto">
            <span aria-hidden className="size-2 rounded-full bg-estado-problema" />
            {mayuscula(nombreMes(aprieta.mes))} viene apretado
            <span className="t-cifra">{conSigno(aprieta.entra - aprieta.sale)}</span>
          </span>
          {vuelve && <span className="text-[14px] text-texto-suave">Vuelve a entrar plata en {vuelve}</span>}
        </p>
      ) : vieneAFavor > 0 ? (
        <p>
          <span className="inline-flex items-center gap-2 rounded-full bg-estado-bien-suave py-1.5 pr-3.5 pl-3 text-[14.5px] font-bold text-estado-bien-texto">
            <span aria-hidden className="size-2 rounded-full bg-estado-bien" />
            Lo que viene queda a favor
            <span className="t-cifra">{conSigno(vieneAFavor)}</span>
          </span>
        </p>
      ) : null}

      {/* Tres datos del año o, al pasar por un mes, los suyos: siempre en el mismo lugar. */}
      <div className="flex min-h-[44px] flex-wrap items-center gap-x-6 gap-y-1 pt-3 pb-2" aria-live="polite">
        {!m ? (
          <>
            {pasados.length > 0 && (
              <Dato titulo="Meses a favor" valor={`${aFavor} de ${pasados.length}`} />
            )}
            {mejor && mejor.n > 0 && <Dato titulo="El mejor" valor={`${mayuscula(nombreMes(mejor.mes.mes))}, ${conSigno(mejor.n)}`} tono="bien" />}
            {peor && peor.n < 0 && <Dato titulo="El peor" valor={`${mayuscula(nombreMes(peor.mes.mes))}, ${conSigno(peor.n)}`} tono="mal" />}
          </>
        ) : (
          <>
        <p className="text-[15px] font-bold text-texto">
          {mayuscula(nombreMes(m.mes))} {m.mes.slice(0, 4)}
          {m.futuro && <span className="font-semibold text-texto-suave"> · anotado</span>}
          {m.mes === apretado && <span className="font-semibold text-estado-problema-texto"> · el más apretado</span>}
        </p>
        <p className="flex flex-wrap gap-x-6 text-[13.5px] text-texto-suave">
          <span>
            {m.futuro ? 'Entra' : 'Entró'} <b className="t-cifra text-texto">{fmtCompact(m.entro)}</b>
          </span>
          <span>
            {m.futuro ? 'Sale' : 'Salió'} <b className="t-cifra text-texto">{fmtCompact(m.salio)}</b>
          </span>
          <span>
            {m.futuro ? 'Queda' : 'Quedó'} <b className={cn('t-cifra', neto >= 0 ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>{conSigno(neto)}</b>
          </span>
        </p>
          </>
        )}
      </div>

      <div ref={caja} onMouseLeave={() => setFoco(null)}>
        {ancho > 0 && (
          <svg width={ancho} height={ALTO} role="img" aria-label="Lo que quedó cada mes, y lo anotado para los que vienen">
            <defs>
              {(['entra', 'sale'] as const).map((k) => (
                <pattern key={k} id={`rayado-${k}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" className={k === 'entra' ? 'fill-plata-entra/25' : 'fill-plata-sale/25'} />
                  <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" className={k === 'entra' ? 'stroke-plata-entra' : 'stroke-plata-sale'} />
                </pattern>
              ))}
            </defs>

            {/* Hoy: la raya que separa lo que pasó de lo anotado. */}
            {primerFuturo > 0 && (
              <g>
                <line x1={banda * primerFuturo} x2={banda * primerFuturo} y1={4} y2={ALTO - ABAJO + 4} className="stroke-texto/35" strokeDasharray="3 3" />
                <text x={banda * primerFuturo + 8} y={14} className="fill-texto-suave text-[12px] font-semibold">
                  Lo que viene
                </text>
                <text x={banda * primerFuturo - 8} y={14} textAnchor="end" className="fill-texto-suave text-[12px] font-semibold">
                  Lo que pasó
                </text>
              </g>
            )}

            {meses.map((mes, i) =>
              elegido === i ? <rect key={mes.mes} x={banda * i + 2} y={ARRIBA - 6} width={banda - 4} height={alto + 12} rx={8} className="fill-superficie-hundida" /> : null,
            )}

            <line x1={0} x2={ancho} y1={cero} y2={cero} className="stroke-texto/45" />

            {meses.map((mes, i) => {
              const n = netos[i]!
              const a = Math.max(n === 0 ? 0 : 3, y(n))
              const enero = mes.mes.endsWith('-01')
              const color = n >= 0 ? 'entra' : 'sale'
              return (
                <g key={mes.mes}>
                  {n !== 0 && (
                    <rect
                      x={x(i) - barra / 2}
                      y={n >= 0 ? cero - a : cero}
                      width={barra}
                      height={a}
                      rx={4}
                      fill={mes.futuro ? `url(#rayado-${color})` : undefined}
                      className={cn(!mes.futuro && (n >= 0 ? 'fill-plata-entra' : 'fill-plata-sale'))}
                    />
                  )}
                  {mes.mes === apretado && (
                    <text x={x(i)} y={cero + a + 14} textAnchor="middle" className="t-cifra-mini fill-estado-problema-texto font-bold">
                      {conSigno(n)}
                    </text>
                  )}
                  <text x={x(i)} y={ALTO - 8} textAnchor="middle" className={cn('text-[12px]', elegido === i ? 'fill-texto font-bold' : 'fill-texto-suave', enero && 'font-bold')}>
                    {enero ? mes.mes.slice(0, 4) : nombreMes(mes.mes).slice(0, 3)}
                  </text>
                  {/* Toda la columna responde, no sólo la barra. */}
                  <rect
                    x={banda * i}
                    y={0}
                    width={banda}
                    height={ALTO}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${mayuscula(nombreMes(mes.mes))} ${mes.mes.slice(0, 4)}: ${mes.futuro ? 'queda' : 'quedó'} ${conSigno(n)}`}
                    onMouseEnter={() => setFoco(i)}
                    onFocus={() => setFoco(i)}
                    className="cursor-pointer outline-none"
                  />
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}

function Dato({ titulo, valor, tono }: { titulo: string; valor: string; tono?: 'bien' | 'mal' }) {
  return (
    <p className="flex items-baseline gap-2 text-[13.5px] text-texto-suave">
      {titulo}
      <b className={cn('t-cifra', tono === 'bien' ? 'text-estado-bien-texto' : tono === 'mal' ? 'text-estado-problema-texto' : 'text-texto')}>{valor}</b>
    </p>
  )
}
