import { ExternalLink, Newspaper } from 'lucide-react'
import { useNoticias } from '@/features/noticias/hooks'
import { Panel } from '@/components/panel'

/** "hace 2 h" / "hace 3 d" / fecha corta. */
function hace(fecha: string): string {
  const t = new Date(fecha).getTime()
  if (Number.isNaN(t)) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 60) return `hace ${Math.max(1, min)} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/** Titulares del agro (Infocampo, Valor Carne, Bichos de Campo) vía la
 *  edge function. Si la fuente falla, no muestra nada. */
export function NoticiasPanel() {
  const noticias = useNoticias()
  if (!noticias.data || noticias.data.length === 0) return null

  return (
    <Panel
      title="Noticias del agro"
      action={
        <span className="flex items-center gap-1.5 text-[13px] text-faint">
          <Newspaper className="size-4" />
          últimas
        </span>
      }
    >
      <ul className="flex flex-col">
        {noticias.data.slice(0, 6).map((n) => (
          <li key={n.link} className="border-b border-border/60 last:border-0">
            <a
              href={n.link}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start justify-between gap-3 py-3 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink group-hover:text-field-deep">
                  {n.titulo}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                  <span className="font-semibold text-muted-foreground">
                    {n.fuente}
                  </span>
                  {hace(n.fecha) && <span>· {hace(n.fecha)}</span>}
                </div>
              </div>
              <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
