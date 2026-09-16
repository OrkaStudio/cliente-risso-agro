import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AtSign, MailCheck } from 'lucide-react'
import { z } from 'zod'
import { useAuth, YA_REGISTRADO } from '@/features/auth/auth-context'
import { AuthHeading, AuthLayout, BOTON_PRINCIPAL, ErrorCampo } from '@/features/auth/auth-layout'
import { CelularInput } from '@/features/auth/celular-input'
import { PasswordInput } from '@/features/auth/password-input'
import { Reveal } from '@/features/auth/reveal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatearCelularAR, normalizarCelularAR } from '@/lib/telefono'

const registro = z
  .object({
    nombre: z.string().trim().min(1, 'Falta el nombre'),
    apellido: z.string().trim().min(1, 'Falta el apellido'),
    celular: z
      .string()
      .transform((v) => normalizarCelularAR(v))
      .refine((v): v is string => v !== null, {
        message: 'Tienen que ser 10 dígitos, sin el 0 ni el 15',
      }),
    email: z.string().trim().toLowerCase().min(1, 'Falta el email').email('Parece que falta algo en el email'),
    password: z.string().min(8, 'Con 8 caracteres o más alcanza'),
    repetir: z.string(),
  })
  .refine((d) => d.password === d.repetir, {
    message: 'Tiene que ser igual a la de arriba',
    path: ['repetir'],
  })

type Campo = 'nombre' | 'apellido' | 'celular' | 'email' | 'password' | 'repetir'
const ORDEN: Campo[] = ['nombre', 'apellido', 'celular', 'email', 'password', 'repetir']

type Datos = z.infer<typeof registro>

export function SignupPage() {
  const { signUp, resendConfirmation } = useAuth()
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [celular, setCelular] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repetir, setRepetir] = useState('')
  // Un error por campo, al lado del campo. El de servidor (p. ej. "ya existe
  // una cuenta") cae bajo el email cuando habla del email; si no, al pie.
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Datos validados esperando el "sí, están bien" del productor. Email y
  // celular son por donde lo vamos a contactar: se muestran grandes antes de
  // crear la cuenta, como hace WhatsApp con el número.
  const [revisando, setRevisando] = useState<Datos | null>(null)
  // Email al que se mandó el link de confirmación (cambia la pantalla).
  // Sólo pasa si Supabase tiene "Confirm email" prendido.
  const [confirmarEn, setConfirmarEn] = useState<string | null>(null)

  /** Al escribir en un campo con error, el error se va (ya está corrigiendo). */
  function limpiar(campo: Campo) {
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = registro.safeParse({
      nombre,
      apellido,
      celular,
      email,
      password,
      repetir,
    })
    if (!parsed.success) {
      const porCampo: Partial<Record<Campo, string>> = {}
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0] as Campo
        porCampo[campo] ??= issue.message
      }
      setErrores(porCampo)
      // Foco al primero que falta, en el orden del formulario.
      const primero = ORDEN.find((c) => porCampo[c])
      if (primero) document.getElementById(primero)?.focus()
      return
    }
    setErrores({})
    setRevisando(parsed.data)
  }

  async function crearCuenta() {
    if (!revisando) return
    setError(null)
    setSubmitting(true)
    const { error, needsConfirmation } = await signUp(revisando)
    setSubmitting(false)

    if (error) {
      // Volvemos al form con el mensaje (p. ej. "ya existe una cuenta").
      setRevisando(null)
      if (error === YA_REGISTRADO) setErrores({ email: error })
      else setError(error)
      return
    }
    if (needsConfirmation) {
      setConfirmarEn(revisando.email)
      return
    }
    // Ya hay sesión → directo al onboarding.
    navigate('/onboarding', { replace: true })
  }

  if (confirmarEn) {
    return (
      <AuthLayout>
        <ConfirmarCorreo
          email={confirmarEn}
          onReenviar={() => resendConfirmation(confirmarEn)}
          onCorregir={() => {
            setConfirmarEn(null)
            setRevisando(null)
          }}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        {revisando ? (
          <motion.div
            key="revisar"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <RevisarContacto
              datos={revisando}
              ocupado={submitting}
              onConfirmar={crearCuenta}
              onCorregir={() => setRevisando(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <AuthHeading
              titulo="Creá tu cuenta"
              subtitulo="Te lleva un minuto. Con tu celular y tu email vas a poder recuperar el acceso cuando haga falta."
            />

            <form onSubmit={onSubmit} className="mt-6 grid gap-3.5" noValidate>
              <Reveal delay={0.14}>
                <div className="grid grid-cols-2 items-start gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="nombre">Nombre</Label>
                    <Input
                      id="nombre"
                      autoComplete="given-name"
                      value={nombre}
                      onChange={(e) => {
                        setNombre(e.target.value)
                        limpiar('nombre')
                      }}
                      aria-invalid={!!errores.nombre}
                      required
                    />
                    <ErrorCampo mensaje={errores.nombre} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="apellido">Apellido</Label>
                    <Input
                      id="apellido"
                      autoComplete="family-name"
                      value={apellido}
                      onChange={(e) => {
                        setApellido(e.target.value)
                        limpiar('apellido')
                      }}
                      aria-invalid={!!errores.apellido}
                      required
                    />
                    <ErrorCampo mensaje={errores.apellido} />
                  </div>
                </div>
              </Reveal>

              {/* Celular y email son por donde lo encontramos después: un
                  ícono suave al frente del input los distingue sin
                  descuadrar el label ni el texto de ayuda. */}
              <Reveal delay={0.2} className="grid gap-1.5">
                <Label htmlFor="celular">Celular</Label>
                <CelularInput
                  id="celular"
                  value={celular}
                  onValueChange={(v) => {
                    setCelular(v)
                    limpiar('celular')
                  }}
                  invalido={!!errores.celular}
                  required
                />
                {errores.celular ? (
                  <ErrorCampo mensaje={errores.celular} />
                ) : (
                  <p className="text-xs text-muted-foreground/80">
                    Sin el 0 ni el 15, como figura en WhatsApp.
                  </p>
                )}
              </Reveal>
              <Reveal delay={0.24} className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <IconoCampo icono={AtSign} />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="pl-9"
                    placeholder="vos@campo.com.ar"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      limpiar('email')
                    }}
                    aria-invalid={!!errores.email}
                    required
                  />
                </div>
                {errores.email === YA_REGISTRADO ? (
                  <p className="text-xs text-destructive" role="alert">
                    {YA_REGISTRADO}{' '}
                    <Link to="/login" className="font-medium underline underline-offset-4">
                      Ingresá
                    </Link>{' '}
                    o{' '}
                    <Link
                      to="/recuperar"
                      state={{ email }}
                      className="font-medium underline underline-offset-4"
                    >
                      recuperá la contraseña
                    </Link>
                    .
                  </p>
                ) : (
                  <ErrorCampo mensaje={errores.email} />
                )}
              </Reveal>

              <Reveal delay={0.28} className="grid gap-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <PasswordInput
                  id="password"
                  sinGestor
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    limpiar('password')
                  }}
                  aria-invalid={!!errores.password}
                  required
                />
                <ErrorCampo mensaje={errores.password} />
              </Reveal>
              <Reveal delay={0.32} className="grid gap-1.5">
                <Label htmlFor="repetir">Repetir contraseña</Label>
                <PasswordInput
                  id="repetir"
                  sinGestor
                  value={repetir}
                  onChange={(e) => {
                    setRepetir(e.target.value)
                    limpiar('repetir')
                  }}
                  aria-invalid={!!errores.repetir}
                  required
                />
                <ErrorCampo mensaje={errores.repetir} />
              </Reveal>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Reveal delay={0.38} className="mt-2">
                <Button type="submit" className={BOTON_PRINCIPAL}>
                  Continuar
                </Button>
              </Reveal>
            </form>

            <Reveal delay={0.44} className="mt-5">
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
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}

/**
 * Última mirada antes de crear la cuenta: el celular y el email, solos.
 * Un dígito mal en el celular y el productor queda sin WhatsApp; una letra
 * mal en el email y queda sin recuperar la contraseña. Acá se ve, se corrige
 * o se confirma — y recién ahí se crea la cuenta.
 */
function RevisarContacto({
  datos,
  ocupado,
  onConfirmar,
  onCorregir,
}: {
  datos: Datos
  ocupado: boolean
  onConfirmar: () => void
  onCorregir: () => void
}) {
  const [local, dominio] = datos.email.split('@')
  return (
    <div>
      <AuthHeading
        titulo={`Ya casi, ${datos.nombre}`}
        subtitulo="Confirmá que estén bien y listo."
      />

      <dl className="mt-6 divide-y divide-border rounded-lg border border-border">
        <div className="flex min-w-0 items-center gap-3 px-3.5 py-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Celular</dt>
            <dd className="text-[15px] font-semibold tabular-nums tracking-tight">
              {formatearCelularAR(datos.celular)}
            </dd>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3 px-3.5 py-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="text-[15px] font-semibold tracking-tight">
              {/* Si no entra, corta en la @: el dominio queda entero. */}
              <span className="break-all">{local}</span>
              <span className="whitespace-nowrap">@{dominio}</span>
            </dd>
          </div>
        </div>
      </dl>

      <div className="mt-6 grid gap-2">
        <Button disabled={ocupado} onClick={onConfirmar} className={BOTON_PRINCIPAL}>
          {ocupado ? 'Creando tu cuenta…' : 'Sí, están bien'}
        </Button>
        <Button
          variant="ghost"
          disabled={ocupado}
          onClick={onCorregir}
          className="w-full text-muted-foreground"
        >
          Cambiar algo
        </Button>
      </div>
    </div>
  )
}

/** Ícono decorativo a la izquierda del input, en el peso del ojito. */
function IconoCampo({ icono: Icono }: { icono: typeof AtSign }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted-foreground/55"
    >
      <Icono className="size-4" strokeWidth={1.5} />
    </span>
  )
}

const ESPERA_REENVIO_S = 30

/**
 * "Revisá tu correo": sólo se ve si el proyecto exige confirmar el email.
 * Reenvía de verdad (antes el botón sólo limpiaba el form) y ofrece volver
 * por si el mail quedó mal escrito.
 */
function ConfirmarCorreo({
  email,
  onReenviar,
  onCorregir,
}: {
  email: string
  onReenviar: () => Promise<{ error: string | null }>
  onCorregir: () => void
}) {
  const [estado, setEstado] = useState<'listo' | 'enviando' | 'enviado' | 'error'>(
    'listo',
  )
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [espera, setEspera] = useState(0)

  async function reenviar() {
    setEstado('enviando')
    const { error } = await onReenviar()
    if (error) {
      setEstado('error')
      setMensaje(error)
      return
    }
    setEstado('enviado')
    setMensaje(null)
    // Cooldown visible: el productor toca una vez y espera, no diez veces.
    setEspera(ESPERA_REENVIO_S)
    const t = setInterval(() => {
      setEspera((s) => {
        if (s <= 1) {
          clearInterval(t)
          setEstado('listo')
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="text-center"
    >
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MailCheck className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight">Revisá tu correo</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Te mandamos un link de confirmación a{' '}
        <span className="font-medium text-foreground">{email}</span>. Tocalo y
        seguimos armando tu campo.
      </p>

      <div className="mt-6 grid gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={estado === 'enviando' || espera > 0}
          onClick={reenviar}
          className="w-full"
        >
          {estado === 'enviando'
            ? 'Reenviando…'
            : espera > 0
              ? `Reenviado · podés pedir otro en ${espera}s`
              : 'No me llegó, reenviar'}
        </Button>
        <button
          type="button"
          onClick={onCorregir}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          Escribí mal el mail, corregirlo
        </button>
      </div>

      {mensaje && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {mensaje}
        </p>
      )}
      <p className="mt-5 text-xs text-muted-foreground">
        Si no aparece, mirá en correo no deseado.
      </p>
    </motion.div>
  )
}
