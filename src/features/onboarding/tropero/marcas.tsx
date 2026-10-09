import { estiloDeCultivo } from '@/features/onboarding/cultivos-croquis'

/**
 * La marca de un cultivo (espiga, vaina, girasol…), dibujada a mano en
 * cultivos-croquis. Se escala a cualquier tamaño: el potrero la muestra aunque
 * sea angosto.
 */
export function MarcaCultivo({ cultivo, tamano }: { cultivo: string; tamano: number }) {
  const e = estiloDeCultivo(cultivo)
  return (
    <svg viewBox="-13 -12 26 21" width={tamano} height={tamano * (21 / 26)} role="img" aria-label={cultivo} className="shrink-0">
      <path d={e.d} fill={e.color} stroke="#5a3a17" strokeWidth={1.1} strokeLinejoin="round" />
      {e.centro && <path d={e.centro.d} fill={e.centro.color} />}
    </svg>
  )
}
