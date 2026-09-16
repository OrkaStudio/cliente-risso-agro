import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuth } from '@/features/auth/auth-context'
import { AuthHeading, AuthLayout, BOTON_PRINCIPAL } from '@/features/auth/auth-layout'
import { PasswordInput } from '@/features/auth/password-input'
import { Reveal } from '@/features/auth/reveal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const nueva = z.object({
  password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
})

/**
 * Destino del link de "olvidé mi contraseña". El link trae la sesión en la
 * URL (`detectSessionInUrl` la levanta), así que acá el usuario YA está
 * logueado y sólo elige la contraseña nueva. Vive adentro de ProtectedRoute
 * pero fuera de RequireEmpresa: sirve igual para quien todavía no armó su
 * empresa. Sin sesión (link vencido) el guard manda a /login.
 */
export function RestablecerPage() {
  const { updatePassword, user } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = nueva.safeParse({ password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setSubmitting(true)
    const { error } = await updatePassword(parsed.data.password)
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    toast.success('Contraseña cambiada. Ya estás adentro.')
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout>
      <AuthHeading
        titulo="Elegí una contraseña nueva"
        subtitulo={`Para ${user?.email ?? 'tu cuenta'}. Después entrás directo.`}
      />

      <form onSubmit={onSubmit} className="mt-6 grid gap-3.5" noValidate>
        <Reveal delay={0.16} className="grid gap-1.5">
          <Label htmlFor="password">Contraseña nueva</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </Reveal>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Reveal delay={0.24} className="mt-2">
          <Button type="submit" disabled={submitting} className={BOTON_PRINCIPAL}>
            {submitting ? 'Guardando…' : 'Guardar y entrar'}
          </Button>
        </Reveal>
      </form>
    </AuthLayout>
  )
}
