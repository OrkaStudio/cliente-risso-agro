import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '@/features/auth/auth-context'
import { AuthHeading, AuthLayout, BOTON_PRINCIPAL } from '@/features/auth/auth-layout'
import { PasswordInput } from '@/features/auth/password-input'
import { Reveal } from '@/features/auth/reveal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const credenciales = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Ingresá la contraseña'),
})

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // A dónde volver tras loguear (si el guard nos mandó acá desde otra ruta).
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = credenciales.safeParse({ email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }

    setSubmitting(true)
    const { error } = await signIn(parsed.data.email, parsed.data.password)
    setSubmitting(false)

    if (error) {
      setError(error)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <AuthLayout>
      <AuthHeading
        titulo="Entrá a tu campo"
        subtitulo="Tus animales, tus potreros y tu plata, donde los dejaste."
      />

      <form onSubmit={onSubmit} className="mt-6 grid gap-3.5" noValidate>
        <Reveal delay={0.16} className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vos@campo.com.ar"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Reveal>
        <Reveal delay={0.24} className="grid gap-1.5">
          <div className="flex h-6 items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            {/* Chip hairline: se lee como acción sin competir con "Ingresar". */}
            <button
              type="button"
              onClick={() => navigate('/recuperar', { state: { email } })}
              className="rounded-full border border-primary/30 px-2.5 py-0.5 text-[11.5px] font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/5"
            >
              ¿La olvidaste?
            </button>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Reveal>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Reveal delay={0.32} className="mt-2">
          <Button type="submit" disabled={submitting} className={BOTON_PRINCIPAL}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </Reveal>
      </form>

      <Reveal delay={0.4} className="mt-5">
        <p className="text-center text-sm text-muted-foreground">
          ¿Primera vez por acá?{' '}
          <Link
            to="/registro"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Creá tu cuenta
          </Link>
        </p>
      </Reveal>
    </AuthLayout>
  )
}
