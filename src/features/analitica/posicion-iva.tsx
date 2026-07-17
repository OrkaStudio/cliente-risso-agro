import { useState } from 'react'
import { Info, Scale } from 'lucide-react'
import type { MovimientoConDetalle } from '@/features/analitica/api'
import { fmtCompact, formatARS, resumenIva } from '@/features/analitica/compute'
import { Panel } from '@/components/panel'

const mesCorto = (yyyymm: string) => {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const [, m] = yyyymm.split('-')
  return meses[Number(m) - 1] ?? yyyymm
}

/**
 * Posición de IVA (Responsable Inscripto): débito de las ventas − crédito de
 * las compras − saldo a favor arrastrado = estimado a pagar (o saldo a favor,
 * el caso crónico del agro). Débito y crédito salen de `iva_total` de cada
 * movimiento (cargado a mano o por el OCR del comprobante).
 *
 * Es un ESTIMADO según lo cargado — no reemplaza al contador. El saldo inicial
 * (dato del contador) se carga a mano; v1 lo guarda por empresa en el
 * dispositivo (localStorage) hasta mover a una tabla de config fiscal.
 */
export function PosicionIva({
  movimientos,
  empresaId,
}: {
  movimientos: MovimientoConDetalle[]
  empresaId: string
}) {
  const { debito, credito, posicion, meses } = resumenIva(movimientos)
  const key = `iva-saldo-inicial-${empresaId}`
  const [saldoInicial, setSaldoInicial] = useState<number>(() => {
    const v = Number(localStorage.getItem(key) ?? '0')
    return Number.isFinite(v) ? v : 0
  })

  // Nada cargado todavía: no mostramos el panel (evita "$0 a pagar" vacío).
  if (meses.length === 0) return null

  // estimado = (débito − crédito) − saldo a favor arrastrado.
  const estimado = posicion - saldoInicial
  const aPagar = estimado > 0
  const magnitud = Math.abs(estimado)
  const maxBarra = Math.max(1, ...meses.map((m) => Math.max(m.debito, m.credito)))

  const guardarSaldo = (n: number) => {
    setSaldoInicial(n)
    localStorage.setItem(key, String(n))
  }

  return (
    <Panel title="Posición de IVA" sub="estimado según lo cargado" guia="analitica-iva">
      {/* Titular: a pagar o saldo a favor */}
      <div className="flex items-end justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-faint">
            <Scale className="size-3.5" />
            {aPagar ? 'Estimado a pagar' : 'Saldo a favor'}
          </span>
          <span
            className="tnum mt-0.5 block text-[26px] font-bold leading-none"
            style={{ color: aPagar ? 'var(--sol-deep)' : 'var(--field-deep)' }}
          >
            {formatARS(magnitud)}
          </span>
        </div>
        <div className="shrink-0 text-right text-[12px] text-faint">
          <div>
            Débito <span className="tnum font-semibold text-ink">{fmtCompact(debito)}</span>
          </div>
          <div>
            Crédito <span className="tnum font-semibold text-ink">{fmtCompact(credito)}</span>
          </div>
        </div>
      </div>

      {/* Gráfico: débito (ventas) vs crédito (compras) por mes */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-4 text-[11px] font-semibold text-faint">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: 'var(--sol-deep)' }} />
            Débito (ventas)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: 'var(--field)' }} />
            Crédito (compras)
          </span>
        </div>
        <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: 140 }}>
          {meses.map((m) => (
            <div key={m.mes} className="flex min-w-[44px] flex-1 flex-col items-center gap-1">
              <div className="flex h-[104px] w-full items-end justify-center gap-1">
                <div
                  className="w-1/2 max-w-[18px] rounded-t"
                  style={{
                    height: `${(m.debito / maxBarra) * 100}%`,
                    background: 'var(--sol-deep)',
                  }}
                  title={`Débito ${formatARS(m.debito)}`}
                />
                <div
                  className="w-1/2 max-w-[18px] rounded-t"
                  style={{
                    height: `${(m.credito / maxBarra) * 100}%`,
                    background: 'var(--field)',
                  }}
                  title={`Crédito ${formatARS(m.credito)}`}
                />
              </div>
              <span className="text-[10.5px] font-medium text-faint">{mesCorto(m.mes)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Saldo a favor inicial (dato del contador) */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2.5">
        <label htmlFor="saldo-iva" className="text-[12.5px] font-medium text-ink-soft">
          Saldo a favor arrastrado
          <span className="block text-[11px] text-faint">dato del contador</span>
        </label>
        <div className="flex items-center gap-1">
          <span className="text-[13px] font-semibold text-faint">$</span>
          <input
            id="saldo-iva"
            value={saldoInicial || ''}
            onChange={(e) => guardarSaldo(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
            inputMode="numeric"
            placeholder="0"
            className="tnum w-28 rounded-lg border border-line bg-card px-2.5 py-1.5 text-right text-[14px] font-semibold text-ink outline-none focus:border-field"
          />
        </div>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-faint">
        <Info className="mt-px size-3.5 shrink-0" />
        Estimado según lo que cargaste. No reemplaza la liquidación de tu contador.
      </p>
    </Panel>
  )
}
