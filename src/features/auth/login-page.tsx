import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '@/features/auth/auth-context'
import { AuthLayout } from '@/features/auth/auth-layout'
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
      <Reveal>
        <h1 className="text-3xl font-bold tracking-tight">Entrá a tu campo</h1>
      </Reveal>
      <Reveal delay={0.08} className="mt-2">
        <p className="text-sm text-muted-foreground">
          Tus animales, tus potreros y tu plata te esperan donde los dejaste.
        </p>
      </Reveal>

      <form onSubmit={onSubmit} className="mt-8 grid gap-4" noValidate>
        <Reveal delay={0.16} className="grid gap-2">
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
        <Reveal delay={0.24} className="grid gap-2">
          <Label htmlFor="password">Contraseña</Label>
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

        <Reveal delay={0.32} className="mt-1">
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </Reveal>
      </form>

      <Reveal delay={0.4} className="mt-6">
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
