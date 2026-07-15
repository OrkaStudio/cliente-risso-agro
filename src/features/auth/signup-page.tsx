import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MailCheck } from 'lucide-react'
import { z } from 'zod'
import { useAuth } from '@/features/auth/auth-context'
import { AuthLayout } from '@/features/auth/auth-layout'
import { PasswordInput } from '@/features/auth/password-input'
import { Reveal } from '@/features/auth/reveal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const registro = z
  .object({
    nombre: z.string().trim().min(2, 'Contanos tu nombre'),
    apellido: z.string().trim().min(2, 'Contanos tu apellido'),
    email: z.string().email('Email inválido'),
    password: z
      .string()
      .min(8, 'La contraseña necesita al menos 8 caracteres'),
    repetir: z.string(),
  })
  .refine((d) => d.password === d.repetir, {
    message: 'Las contraseñas no coinciden',
    path: ['repetir'],
  })

export function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Email al que se mandó el link de confirmación (cambia la pantalla).
  const [confirmarEn, setConfirmarEn] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = registro.safeParse({ nombre, apellido, email, password, repetir })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }

    setSubmitting(true)
    const { error, needsConfirmation } = await signUp(parsed.data)
    setSubmitting(false)

    if (error) {
      setError(error)
      return
    }
    if (needsConfirmation) {
      setConfirmarEn(parsed.data.email)
      return
    }
    // Sin confirmación de email exigida: ya hay sesión → directo al onboarding.
    navigate('/onboarding', { replace: true })
  }

  if (confirmarEn) {
    return (
      <AuthLayout>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="text-center"
        >
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-7" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">
            Revisá tu correo
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Te mandamos un link de confirmación a{' '}
            <span className="font-medium text-foreground">{confirmarEn}</span>.
            Tocalo y seguimos armando tu campo.
          </p>
          <p className="mt-6 text-xs text-muted-foreground">
            ¿No llegó? Mirá en correo no deseado, o{' '}
            <button
              type="button"
              onClick={() => setConfirmarEn(null)}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              volvé a intentar
            </button>
            .
          </p>
        </motion.div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Reveal>
        <h1 className="text-3xl font-bold tracking-tight">Sumá tu campo</h1>
      </Reveal>
      <Reveal delay={0.08} className="mt-2">
        <p className="text-sm text-muted-foreground">
          Creá tu cuenta y en unos minutos tenés tu campo, tus potreros y tu
          hacienda cargados.
        </p>
      </Reveal>

      <form onSubmit={onSubmit} className="mt-8 grid gap-4" noValidate>
        <Reveal delay={0.14}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                autoComplete="given-name"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="apellido">Apellido</Label>
              <Input
                id="apellido"
                autoComplete="family-name"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                required
              />
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.2} className="grid gap-2">
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
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Reveal>
        <Reveal delay={0.32} className="grid gap-2">
          <Label htmlFor="repetir">Repetir contraseña</Label>
          <PasswordInput
            id="repetir"
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            required
          />
        </Reveal>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Reveal delay={0.4} className="mt-1">
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Creando tu cuenta…' : 'Crear cuenta'}
          </Button>
        </Reveal>
      </form>

      <Reveal delay={0.48} className="mt-6">
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{' '}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Iniciá sesión
          </Link>
        </p>
      </Reveal>
    </AuthLayout>
  )
}
