import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Building2,
  Check,
  CheckCircle2,
  LandPlot,
  Grid2x2,
  Plus,
  Trash2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/auth-context'
import {
  AuthHeading,
  AuthLayout,
  BOTON_PRINCIPAL,
  ErrorCampo,
} from '@/features/auth/auth-layout'
import { Reveal } from '@/features/auth/reveal'
import { crearCampo, crearPotrero } from '@/features/campos/api'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/supabase/types'

type TipoCampo = Database['public']['Enums']['tipo_campo']

/** Los tres pasos, en el orden del viaje. El mapa de la escena los lista. */
const PASOS = [
  { clave: 'empresa', titulo: 'Tu empresa', icono: Building2 },
  { clave: 'campo', titulo: 'Tu primer campo', icono: LandPlot },
  { clave: 'potreros', titulo: 'Sus potreros', icono: Grid2x2 },
] as const

// El campo del onboarding es el 1º → letra A (fija, no se cambia). El NÚMERO sí
// lo elige el productor (hay quien ya tiene su numeración). Se pre-llena por
// posición (1, 2, 3…) editable.
type FilaPotrero = { numero: string; hectareas: string }

/**
 * Onboarding post-registro: empresa → primer campo → potreros → listo.
 * Un usuario recién registrado no tiene membresía; el guard RequireEmpresa lo
 * manda acá. El alta de empresa corre en la RPC `crear_empresa_con_dueno`
 * (SECURITY DEFINER — no hay policies de INSERT en empresa/miembro_empresa).
 *
 * Mismo lenguaje que las pantallas de auth: escena + tarjeta. La escena lleva
 * el MAPA del viaje (tres pasos con tilde a medida que se completan) y cada
 * paso arranca reconociendo el anterior. Un paso a la vez, sin pop-ups.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data: membresia, isLoading } = useEmpresa()

  const [paso, setPaso] = useState(0)
  const [ocupado, setOcupado] = useState(false)

  // Paso 1 — empresa. Sugerimos "<Apellido> Agro" desde el registro (editable).
  const [nombreEmpresa, setNombreEmpresa] = useState(() => {
    const apellido = (user?.user_metadata as { apellido?: string } | undefined)
      ?.apellido
    return apellido ? `${apellido} Agro` : ''
  })
  const [errorEmpresa, setErrorEmpresa] = useState<string | null>(null)
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  // Paso 2 — campo
  const [nombreCampo, setNombreCampo] = useState('')
  const [tipoCampo, setTipoCampo] = useState<TipoCampo>('propio')
  const [hectareas, setHectareas] = useState('')
  const [errorCampo, setErrorCampo] = useState<{ nombre?: string; hectareas?: string; general?: string }>({})
  const [campoId, setCampoId] = useState<string | null>(null)
  // Paso 3 — potreros
  const [filas, setFilas] = useState<FilaPotrero[]>([{ numero: '1', hectareas: '' }])
  const [errorPotreros, setErrorPotreros] = useState<string | null>(null)
  const [potrerosCreados, setPotrerosCreados] = useState(0)
  const [terminado, setTerminado] = useState(false)

  // Si ya pertenece a una empresa y no la creó en este wizard, no va acá.
  if (!isLoading && membresia && !empresaId) {
    return <Navigate to="/" replace />
  }

  async function crearEmpresa(e: FormEvent) {
    e.preventDefault()
    setErrorEmpresa(null)
    const nombre = nombreEmpresa.trim()
    if (nombre.length < 2) {
      setErrorEmpresa('Falta el nombre')
      return
    }
    setOcupado(true)
    const { data, error } = await supabase.rpc('crear_empresa_con_dueno', {
      p_nombre: nombre,
    })
    setOcupado(false)
    if (error) {
      setErrorEmpresa(error.message)
      return
    }
    setEmpresaId(data)
    setPaso(1)
  }

  async function crearPrimerCampo(e: FormEvent) {
    e.preventDefault()
    setErrorCampo({})
    if (!empresaId) return
    const nombre = nombreCampo.trim()
    const ha = hectareas.trim() === '' ? null : Number(hectareas)
    const errores: typeof errorCampo = {}
    if (nombre.length < 2) errores.nombre = 'Falta el nombre'
    if (ha !== null && (!Number.isFinite(ha) || ha < 0))
      errores.hectareas = 'Tiene que ser un número'
    if (Object.keys(errores).length) {
      setErrorCampo(errores)
      return
    }
    setOcupado(true)
    try {
      const id = await crearCampo({ empresaId, nombre, tipo: tipoCampo, hectareas: ha })
      setCampoId(id)
      setPaso(2)
    } catch (err) {
      setErrorCampo({
        general: err instanceof Error ? err.message : 'No se pudo crear el campo.',
      })
    } finally {
      setOcupado(false)
    }
  }

  async function crearPotreros(e: FormEvent) {
    e.preventDefault()
    setErrorPotreros(null)
    if (!empresaId || !campoId) return
    for (const f of filas) {
      const ha = f.hectareas.trim()
      const n = ha === '' ? null : Number(ha)
      if (n !== null && (!Number.isFinite(n) || n < 0)) {
        setErrorPotreros(`Las hectáreas del potrero ${f.numero}A tienen que ser un número.`)
        return
      }
      if (!f.numero.trim()) {
        setErrorPotreros('Cada potrero necesita un número.')
        return
      }
    }
    setOcupado(true)
    try {
      // Se manda el número + A; el trigger fuerza la letra A del campo igual.
      for (const f of filas) {
        await crearPotrero({
          empresaId,
          campoId,
          nombre: `${f.numero.trim()}A`,
          estadoCiclo: 'ganadero',
          hectareas: f.hectareas.trim() === '' ? null : Number(f.hectareas),
        })
      }
      setPotrerosCreados(filas.length)
      setTerminado(true)
    } catch (err) {
      setErrorPotreros(
        err instanceof Error ? err.message : 'No se pudieron crear los potreros.',
      )
    } finally {
      setOcupado(false)
    }
  }

  async function entrar(destino: string) {
    // Recién acá refrescamos todo: el guard RequireEmpresa ve la membresía
    // nueva y las secciones arrancan con datos frescos de la empresa creada.
    await qc.invalidateQueries()
    navigate(destino, { replace: true })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  const pasoActual = terminado ? PASOS.length : paso
  const empresa = nombreEmpresa.trim()
  const campo = nombreCampo.trim()

  return (
    <AuthLayout escena={<MapaDelViaje actual={pasoActual} />}>
      <AnimatePresence mode="wait">
        {terminado ? (
          <Paso key="fin">
            <div className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle2 className="size-7" />
              </span>
              <h1 className="mt-5 text-2xl font-bold tracking-tight">
                ¡Listo, {empresa}!
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Tu campo ya está armado. Lo que sigue es cargar tu hacienda:
                entrá a un potrero y usá <strong>Cargar animales</strong> — de a
                lotes, sin caravanear nada todavía.
              </p>
            </div>
            {/* Lo que acaba de construir, con nombre y apellido: es SU obra. */}
            <ul className="mt-6 divide-y divide-border rounded-lg border border-border text-sm">
              <Logro icono={Building2} etiqueta="Empresa" valor={empresa} />
              <Logro
                icono={LandPlot}
                etiqueta="Campo"
                valor={`${campo}${hectareas.trim() ? ` · ${hectareas.trim()} ha` : ''}`}
              />
              <Logro
                icono={Grid2x2}
                etiqueta="Potreros"
                valor={
                  potrerosCreados === 0
                    ? 'Los cargás después'
                    : `${potrerosCreados} en ${campo}`
                }
              />
            </ul>
            <div className="mt-6 grid gap-2">
              <Button className={BOTON_PRINCIPAL} onClick={() => entrar(`/campos/${campoId}`)}>
                Ir a mi campo y cargar hacienda
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => entrar('/')}>
                Ver el inicio
              </Button>
            </div>
          </Paso>
        ) : paso === 0 ? (
          <Paso key="empresa">
            <AuthHeading
              icono={Building2}
              titulo="¿Cómo se llama tu empresa?"
              subtitulo="Te sugerimos tu apellido. Cambialo si usás la razón social o el nombre del establecimiento."
            />
            <form onSubmit={crearEmpresa} className="mt-5 grid gap-3.5" noValidate>
              <Reveal delay={0.14} className="grid gap-1.5">
                <Label htmlFor="empresa">Nombre</Label>
                <Input
                  id="empresa"
                  value={nombreEmpresa}
                  onChange={(e) => {
                    setNombreEmpresa(e.target.value)
                    setErrorEmpresa(null)
                  }}
                  placeholder="Ej: Estancia La Esperanza"
                  maxLength={80}
                  aria-invalid={!!errorEmpresa}
                  autoFocus
                />
                <ErrorCampo mensaje={errorEmpresa} />
              </Reveal>
              <Reveal delay={0.22} className="mt-2">
                <Button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
                  {ocupado ? 'Creando…' : 'Crear mi empresa'}
                </Button>
              </Reveal>
            </form>
          </Paso>
        ) : paso === 1 ? (
          <Paso key="campo">
            <Logrado>{empresa} ya existe</Logrado>
            <AuthHeading
              icono={LandPlot}
              titulo="Tu primer campo"
              subtitulo="Después podés sumar los que hagan falta — propios o alquilados."
            />
            <form onSubmit={crearPrimerCampo} className="mt-5 grid gap-3.5" noValidate>
              <Reveal delay={0.14} className="grid gap-1.5">
                <Label htmlFor="campo">Nombre del campo</Label>
                <Input
                  id="campo"
                  value={nombreCampo}
                  onChange={(e) => {
                    setNombreCampo(e.target.value)
                    setErrorCampo((x) => ({ ...x, nombre: undefined }))
                  }}
                  placeholder="Ej: Don Gilberto"
                  aria-invalid={!!errorCampo.nombre}
                  autoFocus
                />
                <ErrorCampo mensaje={errorCampo.nombre} />
              </Reveal>
              <Reveal delay={0.2} className="grid gap-1.5">
                <Label>Tenencia</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['propio', 'Propio'],
                      ['alquilado', 'Alquilado'],
                    ] as const
                  ).map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setTipoCampo(valor)}
                      className={cn(
                        'h-9 rounded-lg border text-sm font-medium transition-colors',
                        tipoCampo === valor
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-input text-muted-foreground hover:border-ring',
                      )}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </Reveal>
              <Reveal delay={0.26} className="grid gap-1.5">
                <Label htmlFor="hectareas">
                  Hectáreas{' '}
                  <span className="font-normal text-muted-foreground">(si las sabés)</span>
                </Label>
                <Input
                  id="hectareas"
                  inputMode="decimal"
                  value={hectareas}
                  onChange={(e) => {
                    setHectareas(e.target.value)
                    setErrorCampo((x) => ({ ...x, hectareas: undefined }))
                  }}
                  placeholder="Ej: 420"
                  aria-invalid={!!errorCampo.hectareas}
                />
                <ErrorCampo mensaje={errorCampo.hectareas} />
              </Reveal>
              <ErrorCampo mensaje={errorCampo.general} />
              <Reveal delay={0.32} className="mt-2">
                <Button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
                  {ocupado ? 'Guardando…' : 'Guardar el campo'}
                </Button>
              </Reveal>
            </form>
          </Paso>
        ) : (
          <Paso key="potreros">
            <Logrado>{campo} guardado</Logrado>
            <AuthHeading
              icono={Grid2x2}
              titulo={`Los potreros de ${campo}`}
              subtitulo="Cargá los que te acuerdes — se pueden sumar, renombrar y dibujar en el mapa más adelante."
            />
            <form onSubmit={crearPotreros} className="mt-5" noValidate>
              <Reveal delay={0.14} className="grid gap-2.5">
                {filas.map((fila, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {/* Número editable + letra A FIJA (del campo). */}
                    <div className="flex items-stretch">
                      <Input
                        aria-label={`Número del potrero ${i + 1}`}
                        inputMode="numeric"
                        className="w-16 rounded-r-none"
                        value={fila.numero}
                        onChange={(e) =>
                          setFilas((fs) =>
                            fs.map((f, j) =>
                              j === i ? { ...f, numero: e.target.value.replace(/\D/g, '') } : f,
                            ),
                          )
                        }
                      />
                      <span className="flex w-9 items-center justify-center rounded-r-lg bg-secondary text-[15px] font-bold text-ink">
                        A
                      </span>
                    </div>
                    <Input
                      aria-label={`Hectáreas del potrero ${i + 1}`}
                      inputMode="decimal"
                      className="flex-1"
                      value={fila.hectareas}
                      onChange={(e) =>
                        setFilas((fs) =>
                          fs.map((f, j) => (j === i ? { ...f, hectareas: e.target.value } : f)),
                        )
                      }
                      placeholder="Hectáreas (opcional)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar potrero ${i + 1}`}
                      disabled={filas.length === 1}
                      onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </Reveal>
              <Reveal delay={0.2} className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFilas((fs) => {
                      const nums = fs
                        .map((f) => parseInt(f.numero, 10))
                        .filter((n) => Number.isFinite(n))
                      const sig = (nums.length ? Math.max(...nums) : 0) + 1
                      return [...fs, { numero: String(sig), hectareas: '' }]
                    })
                  }
                >
                  <Plus className="size-4" /> Otro potrero
                </Button>
              </Reveal>
              {errorPotreros && (
                <p className="mt-3 text-xs text-destructive" role="alert">
                  {errorPotreros}
                </p>
              )}
              <Reveal delay={0.26} className="mt-5 grid gap-2">
                <Button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
                  {ocupado
                    ? 'Guardando…'
                    : `Guardar ${filas.length === 1 ? 'el potrero' : `los ${filas.length} potreros`}`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  disabled={ocupado}
                  onClick={() => {
                    setPotrerosCreados(0)
                    setTerminado(true)
                  }}
                >
                  Los cargo después
                </Button>
              </Reveal>
            </form>
          </Paso>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}

/** Transición entre pasos: el que se va sale hacia arriba, el nuevo entra desde abajo. */
function Paso({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/**
 * El reconocimiento del paso anterior, arriba del título del nuevo: chico,
 * verde, con tilde. No es un pop-up ni un paso aparte — acompaña.
 */
function Logrado({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1, ease: 'easeOut' }}
      className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
    >
      <Check className="size-3.5" strokeWidth={2.5} />
      {children}
    </motion.p>
  )
}

function Logro({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: typeof Building2
  etiqueta: string
  valor: string
}) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <Icono className="size-4 shrink-0 text-primary/80" strokeWidth={1.75} />
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{etiqueta}</span>
      <span className="min-w-0 truncate font-medium">{valor}</span>
    </li>
  )
}

/**
 * El mapa del viaje, en la escena: los tres pasos con su estado. La tilde
 * verde en cada uno completado es el reconocimiento que acompaña todo el
 * recorrido, sin pop-ups. `actual` = índice del paso en curso (3 = terminado).
 */
function MapaDelViaje({ actual }: { actual: number }) {
  return (
    <div>
      <p className="font-heading text-[26px] font-semibold leading-tight tracking-tight lg:text-[32px]">
        Armemos tu campo.
      </p>
      <p className="mt-1.5 text-sm text-sidebar-foreground/70">
        Tres pasos y estás adentro.
      </p>
      <ol className="mt-6 grid gap-2.5 lg:mt-8 lg:gap-3">
        {PASOS.map((p, i) => {
          const hecho = i < actual
          const enCurso = i === actual
          return (
            <li
              key={p.clave}
              className={cn(
                'flex items-center gap-3 text-[15px] transition-colors',
                hecho && 'text-sidebar-foreground',
                enCurso && 'font-semibold text-sidebar-foreground',
                !hecho && !enCurso && 'text-sidebar-foreground/45',
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs transition-colors',
                  hecho && 'border-primary bg-primary text-white',
                  enCurso && 'border-[#e9b45f] text-[#e9b45f]',
                  !hecho && !enCurso && 'border-sidebar-foreground/25',
                )}
              >
                {hecho ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              {p.titulo}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
