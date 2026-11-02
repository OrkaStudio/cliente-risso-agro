import { Icono } from '@/components/tropero/icono'
import { primerPendiente } from '@/features/mapa/bloqueo'
import { dibujadoEn, type CampoMapa } from '@/features/mapa/reglas'
import { cn } from '@/lib/utils'

/**
 * Primero el mapa (Lau, 30/10): arriba de Campos, cuánto falta y qué falta del
 * campo que se está armando. El resto de la app se abre cuando no falte nada.
 */
export function ProgresoMapa({ campos, actual }: { campos: CampoMapa[]; actual: CampoMapa }) {
  const faltan = campos.filter((c) => primerPendiente([c]) !== null).length
  const conBorde = !!actual.contorno
  const dibujados = actual.potreros.filter((p) => dibujadoEn(p, actual.contorno)).length
  const total = actual.potreros.length
  const paso = (hecho: boolean, texto: string) => (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13.5px] font-bold', hecho ? 'bg-principal-suave text-principal' : 'bg-superficie text-texto ring-1 ring-borde')}>
      {hecho ? <Icono nombre="Guardar" tamano={16} /> : <span aria-hidden className="size-2 rounded-full bg-principal" />}
      {texto}
    </span>
  )
  return (
    <section aria-label="Falta terminar el mapa" className="flex min-w-0 flex-1 items-center gap-x-4 gap-y-2 rounded-full border border-principal/25 bg-principal-suave/40 py-1.5 pr-1.5 pl-5">
      <p className="min-w-0 flex-1 truncate text-[14.5px] text-texto">
        <b>Falta terminar {actual.nombre}</b>
        <span className="text-texto-suave">
          {' '}
          · {faltan === 1 ? 'es el último' : `${faltan} campos sin terminar`}
        </span>
      </p>
      <span className="flex shrink-0 gap-2">
        {paso(conBorde, 'Borde')}
        {paso(conBorde && total > 0 && dibujados === total, total ? `Potreros ${conBorde ? dibujados : 0} de ${total}` : 'Potreros')}
      </span>
    </section>
  )
}
