import { useEffect, useState } from 'react'
import { animate } from 'framer-motion'

/**
 * Número que rueda hasta su valor al montar (las últimas ~24 unidades, para
 * no mostrar cifras falsas mucho tiempo). Compartido por las cards de potrero
 * y las señales de Hacienda — el "tick" vivo del sistema.
 */
export function Contador({ n }: { n: number }) {
  const desde = n === 0 ? 0 : Math.max(0, n - Math.min(n, 24))
  const [v, setV] = useState(desde)
  useEffect(() => {
    const inicio = n === 0 ? 0 : Math.max(0, n - Math.min(n, 24))
    const ctrl = animate(inicio, n, {
      duration: 0.55,
      ease: 'easeOut',
      onUpdate: (x) => setV(Math.round(x)),
    })
    return () => ctrl.stop()
  }, [n])
  return <>{v}</>
}
