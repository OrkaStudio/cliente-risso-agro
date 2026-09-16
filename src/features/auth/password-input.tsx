import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Input de contraseña con toggle de visibilidad (ojito). El ícono muestra el
 * ESTADO, no la acción: ojo abierto = se está viendo; tachado = está oculta.
 *
 * `sinGestor` (registro): el navegador no ofrece "contraseña segura" ni
 * guarda nada. Chrome y Safari ignoran autocomplete=off en un campo
 * type=password, así que el campo es type=text enmascarado por CSS
 * (`-webkit-text-security`). Para el productor, una contraseña inventada
 * por el navegador es una que no conoce: después no entra desde la PC.
 */
export function PasswordInput({
  sinGestor = false,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & { sinGestor?: boolean }) {
  const [visible, setVisible] = useState(false)

  const enmascarar = !visible
  return (
    <div className="relative">
      <Input
        type={sinGestor ? 'text' : visible ? 'text' : 'password'}
        className={cn('pr-9', sinGestor && enmascarar && 'password-mask', className)}
        {...(sinGestor
          ? {
              autoComplete: 'off',
              autoCapitalize: 'none',
              autoCorrect: 'off',
              spellCheck: false,
              'data-1p-ignore': true,
              'data-lpignore': true,
            }
          : {})}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    </div>
  )
}
