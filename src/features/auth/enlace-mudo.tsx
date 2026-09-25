import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Enlace entre pantallas de ingreso que navega sin `href`: un `<a href>` hace que
 * el navegador muestre la URL abajo a la izquierda al pasar el mouse, sobre la escena.
 */
export function EnlaceMudo({
  to,
  state,
  className,
  children,
}: {
  to: string
  state?: unknown
  className?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(to, { state })}
      className={cn('cursor-pointer', className)}
    >
      {children}
    </button>
  )
}
