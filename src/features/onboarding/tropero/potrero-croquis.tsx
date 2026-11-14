import { useLayoutEffect, useRef, useState } from 'react'
import { Icono } from '@/components/tropero/icono'
import { cn } from '@/lib/utils'
import type { Especie } from '@/features/hacienda/labels'
import { disponer } from './disposicion'
import { MarcaCultivo } from './marcas'
import { cabezasDe, conMayuscula, diasDesde, especiesDe, ha, ICONO_ESPECIE, type PotreroOnb } from './modelo'

const NOMBRE_ESPECIE: Record<Especie, string> = { bovino: 'Vacunos', ovino: 'Ovinos', equino: 'Equinos' }

/**
 * Lo de adentro de un potrero del croquis, a la medida de su lugar: el nombre
 * y las hectáreas siempre; los íconos y el dato grande (cabezas, cultivo,
 * días de descanso) crecen con el potrero o se acomodan antes que cortarse.
 * Qué entra y dónde lo decide `disponer` (probado con todos los tamaños).
 */
export function ContenidoPotrero({ potrero, className }: { potrero: PotreroOnb; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [{ w, h }, setMedida] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new ResizeObserver(([e]) => setMedida({ w: e.contentRect.width, h: e.contentRect.height }))
    o.observe(el)
    return () => o.disconnect()
  }, [])

  const c = potrero.contenido
  const especies = especiesDe(c)
  const cabezas = cabezasDe(c)
  const dias = c?.tipo === 'descanso' && c.desde ? diasDesde(c.desde, new Date()) : null
  const dato =
    c?.tipo === 'hacienda' && cabezas > 0
      ? String(cabezas)
      : c?.tipo === 'sembrado' && c.cultivo.trim()
        ? conMayuscula(c.cultivo.trim())
        : dias !== null
          ? `${dias} ${dias === 1 ? 'día' : 'días'}`
          : null
  const n = potrero.hectareas
  const formas = n > 0 ? [`${ha(n)} ha`, `${Math.round(n)} ha`, String(Math.round(n))] : ['— ha']
  const iconos = especies.length + (c?.tipo === 'sembrado' || c?.tipo === 'descanso' ? 1 : 0)
  const x = w > 0 ? disponer(w, h, { nombre: potrero.nombre, ha: formas, dato, bajada: dias !== null ? 'descansando' : undefined, iconos }) : null

  const filaIconos = x && (
    <span className="flex shrink-0 items-center gap-1">
      {especies.map((e) => (
        <span key={e} className="grid place-items-center rounded-full bg-black/10" style={{ width: x.icono, height: x.icono }}>
          <span className="grid place-items-center" style={{ width: x.icono * 0.72, height: x.icono * 0.72 }}>
            <Icono nombre={ICONO_ESPECIE[e]} titulo={NOMBRE_ESPECIE[e]} className="size-full" />
          </span>
        </span>
      ))}
      {c?.tipo === 'sembrado' && <MarcaCultivo cultivo={c.cultivo} tamano={x.icono} />}
      {c?.tipo === 'descanso' && (
        <span className="grid place-items-center" style={{ width: x.icono, height: x.icono }}>
          <Icono nombre="Agua" titulo="En descanso" className="size-full" />
        </span>
      )}
    </span>
  )
  const datoEnLinea = x?.dato.donde === 'linea' && !x.dato.aparte ? ` · ${dato}` : ''

  return (
    // Se mide la caja sin relleno; el relleno lo pone `disponer`.
    <div ref={ref} className={cn('size-full min-w-0 overflow-hidden', className)}>
      {x && (
        <div className="flex size-full flex-col" style={{ padding: x.pad }}>
          <div className="flex items-start justify-between gap-2">
            <div className={cn('flex min-w-0', x.haEnLinea ? 'flex-row items-baseline gap-1.5' : 'flex-col')}>
              <p className="font-heading leading-[1.15] font-extrabold whitespace-nowrap" style={{ fontSize: x.nombre }}>
                {potrero.nombre}
              </p>
              <p className="leading-[1.3] font-semibold whitespace-nowrap opacity-80" style={{ fontSize: x.ha }}>
                {x.haTexto}
                {datoEnLinea}
              </p>
            </div>
            {x.iconos === 'arriba' && filaIconos}
          </div>
          {x.iconos === 'abajo' && <div className="mt-1.5">{filaIconos}</div>}
          {x.dato.donde === 'linea' && x.dato.aparte && (
            <p
              className={cn('leading-[1.3] font-bold', x.dato.lineas === 1 && 'whitespace-nowrap')}
              style={{ fontSize: x.dato.tam }}
            >
              {dato}
            </p>
          )}
          {x.dato.donde === 'grande' && (
            <div className="mt-auto">
              <p
                className={cn('titulo-display leading-[1.1]', x.dato.lineas === 1 && 'whitespace-nowrap')}
                style={{ fontSize: x.dato.tam }}
              >
                {dato}
              </p>
              {x.bajada && <p className="text-[13px] font-semibold opacity-80">descansando</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
