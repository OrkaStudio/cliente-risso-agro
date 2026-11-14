import boton from '@/assets/tropero/caravana/boton.svg'
import forma from '@/assets/tropero/caravana/caravana.svg'
import { cn } from '@/lib/utils'

// La caravana como está en la oreja (Figma «Caravana · imprenta de sello»,
// nodo 359:36): plástico amarillo con botón, el país arriba, el número grande,
// el campo y el chip abajo. Medidas del diseño (260 × 395) escaladas.

const TINTA = 'text-[#2a1d12]/[.92]'

export function CaravanaDibujo({ visual, rfid, campo, ancho = 230, className }: { visual: string | null; rfid: string | null; campo: string | null; ancho?: number; className?: string }) {
  const numero = visual ?? rfid?.slice(-4) ?? ''
  const chip = rfid ? rfid.replace(/\s/g, '').replace(/^(\d{3})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4') : null
  const grande = numero.length <= 4 ? 118 : Math.max(56, Math.round((118 * 4) / numero.length))
  const k = ancho / 260
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: ancho, height: 395 * k }} role="img" aria-label={`Caravana ${visual ?? rfid}${visual && rfid ? `, chip ${rfid}` : ''}`}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: 260, height: 395, transform: `scale(${k}) rotate(-5deg)` }}>
        <div className="absolute top-0 left-[-36.29px] h-[376.32px] w-[301.056px]">
          <div className="absolute inset-[2%_15.83%]">
            <div className="absolute inset-[-2.98%_-13.07%_-10.42%_-10.45%]">
              <img alt="" src={forma} className="block size-full max-w-none" />
            </div>
          </div>
        </div>
        <div className="absolute top-[36.29px] left-[92.74px] size-[43.008px]">
          <div className="absolute inset-[-3.12%_-12.5%_-15.63%_-6.25%]">
            <img alt="" src={boton} className="block size-full max-w-none" />
          </div>
        </div>
        <p className={cn('absolute top-[168px] left-[114.24px] w-[201.6px] -translate-x-1/2 text-center font-cifra text-[18.8px] font-semibold tracking-[3.36px]', TINTA)}>ARG</p>
        <p className={cn('absolute top-[180px] left-[115.45px] flex h-[122px] w-[204px] -translate-x-1/2 -rotate-[1.2deg] items-center justify-center text-center font-cifra font-bold tracking-[1.3px] whitespace-nowrap', TINTA)} style={{ fontSize: grande, lineHeight: `${grande}px` }}>
          {numero}
        </p>
        {campo && <p className={cn('absolute top-[302px] left-[114.24px] w-[201.6px] -translate-x-1/2 truncate text-center font-cifra text-[14px] font-semibold tracking-[2.5px] uppercase', TINTA)}>{campo}</p>}
        <p className={cn('absolute top-[326px] left-[114.24px] w-[201.6px] -translate-x-1/2 text-center font-cifra text-[16.8px] font-semibold tracking-[1.08px]', TINTA)}>{chip ?? 'sin chip'}</p>
      </div>
    </div>
  )
}

/** El lugar de la caravana cuando todavía no tiene: la forma apagada y el botón para ponérsela. */
export function SinCaravanaDibujo({ ancho = 230, onPoner }: { ancho?: number; onPoner?: () => void }) {
  const k = ancho / 260
  return (
    <div className="relative shrink-0" style={{ width: ancho, height: 395 * k }}>
      <div className="absolute inset-0 opacity-30 grayscale">
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: 260, height: 395, transform: `scale(${k}) rotate(-5deg)` }}>
          <div className="absolute top-0 left-[-36.29px] h-[376.32px] w-[301.056px]">
            <div className="absolute inset-[2%_15.83%]">
              <div className="absolute inset-[-2.98%_-13.07%_-10.42%_-10.45%]">
                <img alt="" src={forma} className="block size-full max-w-none" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 top-[42%] flex flex-col items-center gap-3 text-center">
        <b className="text-[16px] text-superficie">Sin caravana</b>
        {onPoner && (
          <button type="button" onClick={onPoner} className="inline-flex h-10 items-center rounded-full bg-acento px-4 text-[14.5px] font-bold whitespace-nowrap text-acento-texto hover:brightness-95">
            Ponerle caravana
          </button>
        )}
      </div>
    </div>
  )
}
