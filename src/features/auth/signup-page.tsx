import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { EnlaceMudo } from '@/features/auth/enlace-mudo'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ClipboardCheck, Loader2, Mail, MailCheck, ShieldCheck, Smartphone, Sprout } from 'lucide-react'
import { z } from 'zod'
import { useAuth, YA_REGISTRADO } from '@/features/auth/auth-context'
import { AuthHeading, AuthLayout, BOTON_PRINCIPAL, ErrorCampo } from '@/features/auth/auth-layout'
import { enfocarSuave } from '@/features/auth/enfocar'
import { CelularInput } from '@/features/auth/celular-input'
import { PasswordInput } from '@/features/auth/password-input'
import { Reveal } from '@/features/auth/reveal'
import { precargarOnboarding } from '@/features/onboarding/precarga'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registrar } from '@/lib/telemetria'
import { formatearCelularAR, normalizarCelularAR } from '@/lib/telefono'
import { cn } from '@/lib/utils'

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
    password: z.string().min(8, 'Usá al menos 8 caracteres'),
    repetir: z.string(),
  })
  .refine((d) => d.password === d.repetir, {
    message: 'No es igual a la de arriba, ¿la revisás?',
    path: ['repetir'],
  })

type Campo = 'nombre' | 'apellido' | 'celular' | 'email' | 'password' | 'repetir'
const ORDEN: Campo[] = ['nombre', 'apellido', 'celular', 'email', 'password', 'repetir']

type Datos = z.infer<typeof registro>

/**
 * La pantalla de "¿están bien?" sobrevive a recargar: sin esto volvía al
 * formulario vacío y quedaba la duda de si la cuenta se había creado. Se
 * guarda en sessionStorage (esta pestaña) y SIN la contraseña: al recargar,
 * la misma pantalla la pide de nuevo.
 */
type Revision = Omit<Datos, 'password' | 'repetir'>
const CLAVE_REVISION = 'orka:registro:revision'
function leerRevision(): Revision | null {
  try {
    const c = sessionStorage.getItem(CLAVE_REVISION)
    return c ? (JSON.parse(c) as Revision) : null
  } catch {
    return null
  }
}
function guardarRevision(r: Revision | null) {
  try {
    if (r) sessionStorage.setItem(CLAVE_REVISION, JSON.stringify(r))
    else sessionStorage.removeItem(CLAVE_REVISION)
  } catch {
    // sin almacenamiento: al recargar vuelve al formulario, como antes
  }
}

export function SignupPage() {
  const { signUp, resendConfirmation, session } = useAuth()
  const navigate = useNavigate()
  const [guardada] = useState(leerRevision)
  const [nombre, setNombre] = useState(guardada?.nombre ?? '')
  const [apellido, setApellido] = useState(guardada?.apellido ?? '')
  const [celular, setCelular] = useState(guardada?.celular ?? '')
  const [email, setEmail] = useState(guardada?.email ?? '')
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
  const [revisando, setRevisando] = useState<Datos | null>(
    guardada ? { ...guardada, password: '', repetir: '' } : null,
  )
  // Recargó en la revisión: la contraseña no se guardó, se pide ahí mismo.
  const [pedirClave, setPedirClave] = useState(!!guardada)
  // Al confirmar, la tarjeta sale antes de pasar al onboarding (sin corte).
  const [saliendo, setSaliendo] = useState(false)
  const qc = useQueryClient()

  // Mientras revisa sus datos, el onboarding se baja de fondo: al confirmar
  // no hay pantalla en blanco esperando el código.
  useEffect(() => {
    if (revisando) void precargarOnboarding()
  }, [revisando])
  // true después de pasar por la revisión: la vuelta al form sí se desliza.
  const [yaRevisado, setYaRevisado] = useState(false)
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
      if (primero) enfocarSuave(primero)
      return
    }
    setErrores({})
    setYaRevisado(true)
    setRevisando(parsed.data)
    setPedirClave(false)
    guardarRevision({ nombre: parsed.data.nombre, apellido: parsed.data.apellido, celular: parsed.data.celular, email: parsed.data.email })
  }

  async function crearCuenta(claveNueva?: string) {
    if (!revisando) return
    setError(null)
    const datos = claveNueva ? { ...revisando, password: claveNueva, repetir: claveNueva } : revisando
    setSubmitting(true)
    const { error, needsConfirmation } = await signUp(datos)
    setSubmitting(false)

    if (error) {
      // Volvemos al form con el mensaje (p. ej. "ya existe una cuenta").
      setRevisando(null)
      guardarRevision(null)
      if (error === YA_REGISTRADO) setErrores({ email: error })
      else setError(error)
      return
    }
    if (needsConfirmation) {
      setConfirmarEn(revisando.email)
      return
    }
    // Ya hay sesión → al onboarding, sin cortes. Una cuenta recién creada no
    // tiene empresa: se sabe sin preguntar, y así el onboarding no pasa por
    // "Cargando…". La tarjeta sale primero; la escena queda y sólo cambia
    // su mensaje (el onboarding entra con `continua`).
    qc.setQueryData(['empresa'], null)
    registrar('registro_completado', { via: 'email' })
    guardarRevision(null)
    setSaliendo(true)
    window.setTimeout(() => navigate('/onboarding', { replace: true, state: { desdeRegistro: true } }), 380)
  }

  // Ya tiene sesión (recargó justo después de crear la cuenta): la cuenta
  // existe, así que va al onboarding, no a un formulario vacío.
  if (session && !saliendo && !submitting) return <Navigate to="/onboarding" replace />

  if (confirmarEn) {
    return (
      <AuthLayout entrada="tractor">
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
    // Recargó en la revisión: la tarjeta entra suave, sin volver a traer el tractor.
    <AuthLayout entrada={guardada ? 'suave' : 'tractor'} saliendo={saliendo}>
      <AnimatePresence mode="wait">
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
              ocupado={submitting || saliendo}
              pedirClave={pedirClave}
              onConfirmar={crearCuenta}
              onCorregir={() => {
                setRevisando(null)
                guardarRevision(null)
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="form"
            // Al montar la página el formulario no se desliza (el Reveal de
            // cada campo hace la entrada, como en las demás pantallas); sólo
            // al VOLVER desde la revisión. `initial={false}` en AnimatePresence
            // haría lo mismo pero se propaga y apaga el Reveal de los hijos.
            initial={yaRevisado ? { opacity: 0, x: -24 } : { opacity: 1, x: 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <AuthHeading
              icono={Sprout}
              titulo="Creá tu cuenta"
              subtitulo="Tu hacienda, tus potreros y tu plata, en la palma de la mano. Arrancás en un minuto."
              subtituloSoloEscritorio
            />

            <form onSubmit={onSubmit} className="mt-4 grid gap-2.5 sm:mt-5 sm:gap-3.5" noValidate>
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
                  <IconoCampo icono={Mail} />
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
                    <EnlaceMudo to="/login" className="font-medium underline underline-offset-4">
                      Ingresá
                    </EnlaceMudo>{' '}
                    o{' '}
                    <EnlaceMudo
                      to="/recuperar"
                      state={{ email }}
                      className="font-medium underline underline-offset-4"
                    >
                      recuperá la contraseña
                    </EnlaceMudo>
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
                <EnlaceMudo
                  to="/login"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Iniciá sesión
                </EnlaceMudo>
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
  pedirClave,
  onConfirmar,
  onCorregir,
}: {
  datos: Datos
  ocupado: boolean
  /** Recargó en esta pantalla: la contraseña no se guarda, se pide acá. */
  pedirClave: boolean
  onConfirmar: (clave?: string) => void
  onCorregir: () => void
}) {
  const [local, dominio] = datos.email.split('@')
  const [clave, setClave] = useState('')
  const [claveOtraVez, setClaveOtraVez] = useState('')
  const [errorClave, setErrorClave] = useState<string | null>(null)
  const [errorOtraVez, setErrorOtraVez] = useState<string | null>(null)
  // Se escribe dos veces, como en el formulario: un error de tipeo no puede
  // colarse justo en la contraseña con la que va a entrar.
  function confirmar() {
    if (!pedirClave) return onConfirmar()
    if (clave.length < 8) return setErrorClave('Usá al menos 8 caracteres')
    if (clave !== claveOtraVez) return setErrorOtraVez('No es igual a la de arriba, ¿la revisás?')
    onConfirmar(clave)
  }
  return (
    <div>
      <AuthHeading
        icono={ClipboardCheck}
        titulo={`¡Ya casi, ${datos.nombre}!`}
        subtitulo="Revisá que estén bien antes de seguir."
      />

      {/* Cada dato con su ícono y un tilde que aparece: se revisa de un
          vistazo, y la pantalla deja de ser una tabla gris. */}
      <dl className="mt-6 overflow-hidden rounded-xl border border-border bg-gradient-to-b from-primary/[0.04] to-transparent">
        {[
          {
            Icono: Smartphone,
            etiqueta: 'Celular',
            valor: <span className="tabular-nums">{formatearCelularAR(datos.celular)}</span>,
          },
          {
            Icono: Mail,
            etiqueta: 'Email',
            valor: (
              <TextoQueEntra>
                {/* Si ni achicado entra, corta en la @: el dominio queda entero. */}
                <span className="break-all">{local}</span>
                <span className="whitespace-nowrap">@{dominio}</span>
              </TextoQueEntra>
            ),
          },
        ].map(({ Icono, etiqueta, valor }, i) => (
          <motion.div
            key={etiqueta}
            className={cn('flex min-w-0 items-center gap-3 px-3.5 py-3', i > 0 && 'border-t border-border')}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.12 + i * 0.1, ease: 'easeOut' }}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icono className="size-[17px]" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
              <dd className="text-[15px] font-semibold tracking-tight">{valor}</dd>
            </div>
            <motion.span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-white"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.3 + i * 0.12 }}
            >
              <Check className="size-3" strokeWidth={3.5} />
            </motion.span>
          </motion.div>
        ))}
      </dl>
      <motion.p
        className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
      >
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" strokeWidth={2.25} />
        Con estos datos vas a poder recuperar tu cuenta si alguna vez lo necesitás.
      </motion.p>

      {pedirClave && (
        <div className="mt-4 grid gap-1.5">
          <Label htmlFor="clave-de-nuevo">Tu contraseña</Label>
          <PasswordInput
            id="clave-de-nuevo"
            value={clave}
            onChange={(e) => {
              setClave(e.target.value)
              setErrorClave(null)
            }}
            placeholder="La misma que elegiste antes"
            autoFocus
          />
          <ErrorCampo mensaje={errorClave} />
          <Label htmlFor="clave-otra-vez" className="mt-1.5">
            Repetila
          </Label>
          <PasswordInput
            id="clave-otra-vez"
            value={claveOtraVez}
            onChange={(e) => {
              setClaveOtraVez(e.target.value)
              setErrorOtraVez(null)
            }}
          />
          <ErrorCampo mensaje={errorOtraVez} />
          <p className="text-xs text-muted-foreground">
            Por seguridad no la guardamos. ¿Nos la escribís de nuevo?
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-2">
        {/* Mientras crea la cuenta el botón queda entero y con un giro: a
            media opacidad y quieto se leía como que la pantalla se trabó. */}
        <Button disabled={ocupado} onClick={confirmar} className={cn(BOTON_PRINCIPAL, 'disabled:opacity-100')}>
          {ocupado ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" strokeWidth={2.5} />
              Creando tu cuenta
            </span>
          ) : (
            'Sí, están bien'
          )}
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
function IconoCampo({ icono: Icono }: { icono: typeof Mail }) {
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
        Si no te llega, fijate en el correo no deseado.
      </p>
    </motion.div>
  )
}

/**
 * Un dato que tiene que leerse en UNA línea (el mail): si no entra, la letra
 * se achica lo justo, hasta un 72 %. Recién si ni así entra, se parte donde
 * el contenido lo permite (en la @). Se mide una copia INVISIBLE a tamaño
 * normal contra el ancho disponible: medir el texto visible (ya achicado)
 * daba un número que cambiaba con cada medida y la tarjeta no paraba quieta.
 */
const ESCALA_MINIMA = 0.72
function TextoQueEntra({ children }: { children: ReactNode }) {
  const caja = useRef<HTMLSpanElement>(null)
  const medida = useRef<HTMLSpanElement>(null)
  const [escala, setEscala] = useState(1)
  useLayoutEffect(() => {
    const medir = () => {
      const disponible = caja.current?.clientWidth ?? 0
      const natural = medida.current?.scrollWidth ?? 0
      if (!disponible || !natural) return
      setEscala(Math.min(1, disponible / natural))
    }
    medir()
    void document.fonts?.ready.then(medir)
    const ro = new ResizeObserver(medir)
    if (caja.current) ro.observe(caja.current)
    return () => ro.disconnect()
  }, [])
  const partir = escala < ESCALA_MINIMA
  return (
    <span ref={caja} className="relative block min-w-0">
      <span ref={medida} aria-hidden className="invisible absolute top-0 left-0 whitespace-nowrap">
        {children}
      </span>
      <span
        className={partir ? undefined : 'whitespace-nowrap'}
        style={{ fontSize: `${Math.max(escala, ESCALA_MINIMA)}em` }}
      >
        {children}
      </span>
    </span>
  )
}
