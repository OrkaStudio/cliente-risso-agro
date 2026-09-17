import { useEffect, useId, useRef, useState } from 'react'
import { Check, MapPin } from 'lucide-react'
import { buscarLocalidades, etiquetaLocalidad, type Localidad } from '@/lib/geocoding'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * "¿Dónde está el campo?" — un solo campo de texto con autocompletado:
 * escribe "Pehuajó", elige "Pehuajó, Buenos Aires" y de ahí salen la
 * provincia y el centro para el clima. Nada de listas de provincias.
 *
 * `value` es la localidad ELEGIDA (con coordenadas) o null. Escribir después
 * de elegir vuelve a null hasta que elija otra: nunca guardamos texto suelto
 * como si fuera una ubicación.
 */
export function LocalidadInput({
  id,
  value,
  onChange,
  onEscribir,
  invalido = false,
  autoFocus,
}: {
  id?: string
  value: Localidad | null
  onChange: (l: Localidad | null) => void
  /** Se escribió algo: el formulario limpia su error aunque todavía no haya elección. */
  onEscribir?: () => void
  invalido?: boolean
  autoFocus?: boolean
}) {
  const [texto, setTexto] = useState(value ? etiquetaLocalidad(value) : '')
  const [sugerencias, setSugerencias] = useState<Localidad[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const listaId = useId()
  const ultimaBusqueda = useRef(0)

  // Buscar con un respiro (300 ms) y descartar respuestas viejas. Todo el
  // estado se toca dentro del timeout, nunca en el cuerpo del efecto.
  useEffect(() => {
    if (value) return // ya eligió: no volver a buscar su propio texto
    const q = texto.trim()
    const n = ++ultimaBusqueda.current
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setSugerencias([])
        return
      }
      setBuscando(true)
      try {
        const res = await buscarLocalidades(q)
        if (n === ultimaBusqueda.current) {
          setSugerencias(res)
          setActiva(0)
          setAbierto(true)
        }
      } catch {
        if (n === ultimaBusqueda.current) setSugerencias([])
      } finally {
        if (n === ultimaBusqueda.current) setBuscando(false)
      }
    }, q.length < 2 ? 0 : 300)
    return () => clearTimeout(t)
  }, [texto, value])

  function elegir(l: Localidad) {
    onChange(l)
    setTexto(etiquetaLocalidad(l))
    setSugerencias([])
    setAbierto(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5',
            value ? 'text-primary' : 'text-muted-foreground/55',
          )}
        >
          {value ? (
            <Check className="size-4" strokeWidth={2} />
          ) : (
            <MapPin className="size-4" strokeWidth={1.5} />
          )}
        </span>
        <Input
          id={id}
          className="pl-9"
          value={texto}
          placeholder="Localidad más cercana"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={invalido}
          role="combobox"
          aria-expanded={abierto && sugerencias.length > 0}
          aria-controls={listaId}
          aria-autocomplete="list"
          onChange={(e) => {
            setTexto(e.target.value)
            onEscribir?.()
            if (value) onChange(null)
          }}
          onFocus={() => sugerencias.length > 0 && setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 120)}
          onKeyDown={(e) => {
            if (!abierto || sugerencias.length === 0) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiva((i) => Math.min(i + 1, sugerencias.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiva((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const l = sugerencias[activa]
              if (l) elegir(l)
            } else if (e.key === 'Escape') {
              setAbierto(false)
            }
          }}
        />
      </div>
      {abierto && sugerencias.length > 0 && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card py-1 shadow-[0_12px_32px_rgba(16,30,20,0.14)]"
        >
          {sugerencias.map((l, i) => (
            <li
              key={`${l.nombre}|${l.provincia}`}
              role="option"
              aria-selected={i === activa}
              onMouseDown={(e) => {
                e.preventDefault() // que el blur no cierre antes del click
                elegir(l)
              }}
              onMouseEnter={() => setActiva(i)}
              className={cn(
                'flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm',
                i === activa ? 'bg-primary/10 text-primary' : 'text-foreground',
              )}
            >
              <span className="font-medium">{l.nombre}</span>
              <span className="text-xs text-muted-foreground">{l.provincia}</span>
            </li>
          ))}
        </ul>
      )}
      {!value && texto.trim().length >= 2 && !buscando && sugerencias.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          No encontramos esa localidad. Probá con el pueblo o la ciudad más cercana.
        </p>
      )}
    </div>
  )
}
