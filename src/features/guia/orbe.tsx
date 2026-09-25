import * as React from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Orbe del asistente: anillo degradé girando (la identidad "IA"), con el
 *  brote de la marca adentro. Lo usan la burbuja, el panel y los puntitos. */
export function Orbe({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center',
        className,
      )}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, var(--marca-titulo), var(--marca-acento), var(--sky), var(--marca-titulo))',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 5, ease: 'linear', repeat: Infinity }}
      />
      <span className="absolute inset-[2.5px] rounded-full bg-card" />
      <Sparkles className="relative size-4 text-marca-titulo" />
    </span>
  )
}

/** Milisegundos por carácter de la máquina de escribir. */
const MS_POR_CHAR = 14

/** Respuesta del panel que se escribe de a un carácter, con el cursor pegado
 *  a lo último. El texto completo reserva su lugar invisible desde el
 *  arranque, así el bloque no cambia de alto. Con reduced-motion aparece
 *  entero. Sólo para las fichas del panel: la burbuja de las misiones dice
 *  una línea y la dice de una. */
export function TextoStream({
  texto,
  className,
}: {
  texto: string
  className?: string
}) {
  const instantaneo = React.useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [n, setN] = React.useState(0)
  const [prevTexto, setPrevTexto] = React.useState(texto)
  if (prevTexto !== texto) {
    setPrevTexto(texto)
    setN(0)
  }

  React.useEffect(() => {
    if (instantaneo) return
    const iv = setInterval(() => {
      setN((v) => {
        if (v >= texto.length) {
          clearInterval(iv)
          return v
        }
        return v + 1
      })
    }, MS_POR_CHAR)
    return () => clearInterval(iv)
  }, [instantaneo, texto])

  const mostrado = instantaneo ? texto.length : n
  const escribiendo = !instantaneo && mostrado < texto.length

  return (
    <p
      aria-label={texto}
      className={cn('relative text-[13.5px] leading-relaxed', className)}
    >
      <span aria-hidden className="invisible">
        {texto}
      </span>
      <span aria-hidden className="absolute inset-0">
        {texto.slice(0, mostrado)}
        {escribiendo && <span className="opacity-90">▍</span>}
      </span>
    </p>
  )
}
