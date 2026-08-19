import { ArrowRight, Bell, CheckCircle2 } from 'lucide-react'
import { contarHoy, useParaAtender } from '@/features/inicio/para-atender-api'

/** Ancla del panel completo, más abajo en el Inicio. */
const DESTINO = 'para-atender'

/**
 * Aviso de lo urgente, al lado del título de la página.
 *
 * Es SÓLO una notificación: un número y un enlace. El detalle —qué potrero, qué
 * señal, hace cuánto, los filtros— vive en el panel "Para atender en el campo"
 * más abajo, y esto lleva ahí. Antes acá se listaban las primeras filas y
 * competía con el propio panel: dos lugares mostrando lo mismo.
 */
export function HoyCabecera() {
  const { data, isLoading } = useParaAtender()
  const n = contarHoy(data)

  if (isLoading || !data) return null

  if (n === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
        <CheckCircle2 className="size-3.5 shrink-0 text-field" />
        Estás al día
      </span>
    )
  }

  return (
    <a
      href={`#${DESTINO}`}
      onClick={(e) => {
        // Suave y sin ensuciar la URL con el hash.
        const destino = document.getElementById(DESTINO)
        if (!destino) return
        e.preventDefault()
        destino.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      className="group inline-flex items-center gap-2 rounded-full border border-destructive/25 bg-destructive/[0.07] py-1.5 pl-3 pr-2.5 text-[12.5px] font-semibold text-destructive transition-colors hover:bg-destructive/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
    >
      <Bell className="size-3.5 shrink-0" />
      Hoy tenés {n} {n === 1 ? 'cosa' : 'cosas'}
      <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </a>
  )
}
