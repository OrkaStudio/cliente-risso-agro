import { useEffect, useId, useRef, useState } from 'react'
import { Icono } from '@/components/tropero/icono'
import { buscarLocalidades, etiquetaLocalidad, type Localidad } from '@/lib/geocoding'
import { cn } from '@/lib/utils'

/**
 * «Dónde está» con el estilo de Tropero: se escribe el pueblo y se elige de la
 * lista (sólo localidades argentinas; de ahí salen la provincia y el clima).
 * Escribir después de elegir vuelve a «sin elegir»: nunca se guarda texto suelto.
 */
export function LocalidadCampo({
  valor,
  onCambio,
  error,
}: {
  valor: Localidad | null
  onCambio: (l: Localidad | null) => void
  error?: string
}) {
  const id = useId()
  const [texto, setTexto] = useState(valor ? etiquetaLocalidad(valor) : '')
  const [sugerencias, setSugerencias] = useState<Localidad[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(0)
  const [sinResultados, setSinResultados] = useState(false)
  const pedido = useRef(0)

  useEffect(() => {
    if (valor && texto === etiquetaLocalidad(valor)) return
    const q = texto.trim()
    if (q.length < 2) return
    const n = ++pedido.current
    const t = window.setTimeout(() => {
      buscarLocalidades(q)
        .then((r) => {
          if (n !== pedido.current) return
          setSugerencias(r)
          setActiva(0)
          setSinResultados(r.length === 0)
          setAbierto(true)
        })
        .catch(() => n === pedido.current && setSinResultados(true))
    }, 250)
    return () => window.clearTimeout(t)
  }, [texto, valor])

  // Con menos de 2 letras no se busca: lo viejo no se muestra.
  const corto = texto.trim().length < 2
  const lista = corto ? [] : sugerencias
  const nada = !corto && sinResultados

  function elegir(l: Localidad) {
    onCambio(l)
    setTexto(etiquetaLocalidad(l))
    setAbierto(false)
  }

  const mensaje = error ?? (nada ? 'No la encontramos. Probá con el pueblo más cercano.' : 'El pueblo más cercano')
  return (
    <div className="flex flex-col gap-[7px] md:gap-2">
      <label htmlFor={id} className="text-[14px] font-semibold text-texto md:text-[14.5px]">
        Dónde está
      </label>
      <div className="relative">
        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl border-[1.5px] bg-superficie px-[18px] focus-within:border-principal',
            error ? 'border-estado-problema' : 'border-borde',
          )}
        >
          <Icono nombre={valor ? 'Guardar' : 'Ubicación'} tamano={16} className={valor ? 'text-estado-bien' : 'text-texto-suave'} />
          <input
            id={id}
            role="combobox"
            aria-expanded={abierto && lista.length > 0}
            aria-controls={`${id}-lista`}
            aria-autocomplete="list"
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            placeholder="Chascomús"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              if (valor) onCambio(null)
            }}
            onFocus={() => lista.length > 0 && setAbierto(true)}
            onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
            onKeyDown={(e) => {
              if (!abierto || lista.length === 0) return
              if (e.key === 'ArrowDown') setActiva((a) => Math.min(a + 1, lista.length - 1))
              else if (e.key === 'ArrowUp') setActiva((a) => Math.max(a - 1, 0))
              else if (e.key === 'Enter') elegir(lista[activa]!)
              else return
              e.preventDefault()
            }}
            className="min-w-0 flex-1 bg-transparent py-4 text-[16px] text-texto outline-none placeholder:text-texto-suave/60 md:py-[17px]"
          />
        </div>
        {abierto && lista.length > 0 && (
          <ul
            id={`${id}-lista`}
            role="listbox"
            className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-borde bg-superficie py-1.5 shadow-[0_12px_32px_rgba(19,27,22,0.14)]"
          >
            {lista.map((l, i) => (
              <li
                key={`${l.nombre}-${l.lat}`}
                role="option"
                aria-selected={i === activa}
                onMouseDown={(e) => {
                  e.preventDefault()
                  elegir(l)
                }}
                className={cn(
                  'flex cursor-pointer items-baseline gap-2 px-[18px] py-2.5 text-[15px]',
                  i === activa && 'bg-principal-suave',
                )}
              >
                <span className="font-semibold text-texto">{l.nombre}</span>
                <span className="text-[13px] text-texto-suave">{l.provincia}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={cn('text-[12.5px]', error ? 'text-estado-problema-texto' : 'text-texto-suave')}>{mensaje}</p>
    </div>
  )
}
