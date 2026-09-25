import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { EnlaceMudo } from '@/features/auth/enlace-mudo'
import { motion } from 'framer-motion'
import {MailCheck, KeyRound} from 'lucide-react'
import { z } from 'zod'
import { useAuth } from '@/features/auth/auth-context'
import { AuthHeading, AuthLayout, BOTON_PRINCIPAL, ErrorCampo } from '@/features/auth/auth-layout'
import { Reveal } from '@/features/auth/reveal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const pedido = z.object({
  email: z.string().trim().min(1, 'Falta el email').email('Parece que falta algo en el email'),
})

/**
 * "Olvidé mi contraseña": pide el email y manda el link a `/restablecer`.
 * Supabase responde ok exista o no la cuenta (no revelamos quién está
 * registrado), así que la pantalla de éxito es la misma en ambos casos.
 */
export function RecuperarPage() {
  const { resetPassword } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // Si vino del login con el email ya tipeado, no se lo hacemos escribir de nuevo.
  const [email, setEmail] = useState(
    (location.state as { email?: string } | null)?.email ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [enviadoA, setEnviadoA] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = pedido.safeParse({ email })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setSubmitting(true)
    const { error } = await resetPassword(parsed.data.email)
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setEnviadoA(parsed.data.email)
  }

  if (enviadoA) {
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
          <h1 className="mt-5 text-2xl font-bold tracking-tight">Listo, revisá tu correo</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Te mandamos un link a{' '}
            <span className="font-medium text-foreground">{enviadoA}</span>.
            Abrilo y elegí tu contraseña nueva.
          </p>
          <p className="mt-5 text-xs text-muted-foreground">
            ¿No llega? Mirá en correo no deseado, o probá con el email con el
            que te registraste.
          </p>
          <Button
            variant="outline"
            className="mt-6 w-full"
            onClick={() => navigate('/login')}
          >
            Volver a ingresar
          </Button>
        </motion.div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthHeading
        icono={KeyRound}
        titulo="Recuperá tu acceso"
        subtitulo="Te mandamos un link al email para elegir una contraseña nueva."
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
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
            aria-invalid={!!error}
            autoFocus
            required
          />
          <ErrorCampo mensaje={error} />
        </Reveal>

        <Reveal delay={0.24} className="mt-2">
          <Button type="submit" disabled={submitting} className={BOTON_PRINCIPAL}>
            {submitting ? 'Enviando…' : 'Enviar link'}
          </Button>
        </Reveal>
      </form>

      <Reveal delay={0.32} className="mt-5">
        <p className="text-center text-sm text-muted-foreground">
          <EnlaceMudo
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Volver a ingresar
          </EnlaceMudo>
        </p>
      </Reveal>
    </AuthLayout>
  )
}
