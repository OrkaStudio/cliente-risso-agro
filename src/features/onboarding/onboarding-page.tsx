import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, MapPin, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/auth-context'
import { crearCampo, crearPotrero } from '@/features/campos/api'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/supabase/types'

type TipoCampo = Database['public']['Enums']['tipo_campo']

const PASOS = ['Tu empresa', 'Tu campo', 'Tus potreros'] as const

type FilaPotrero = { nombre: string; hectareas: string }

/**
 * Onboarding post-registro: empresa → primer campo → potreros → listo.
 * Un usuario recién confirmado no tiene membresía; el guard RequireEmpresa
 * lo manda acá. El alta de empresa corre en la RPC `crear_empresa_con_dueno`
 * (SECURITY DEFINER — no hay policies de INSERT en empresa/miembro_empresa).
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data: membresia, isLoading } = useEmpresa()

  const [paso, setPaso] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // Paso 1 — empresa. Sugerimos "<Apellido> Agro" desde el registro (editable).
  const [nombreEmpresa, setNombreEmpresa] = useState(() => {
    const apellido = (user?.user_metadata as { apellido?: string } | undefined)
      ?.apellido
    return apellido ? `${apellido} Agro` : ''
  })
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  // Paso 2 — campo
  const [nombreCampo, setNombreCampo] = useState('')
  const [tipoCampo, setTipoCampo] = useState<TipoCampo>('propio')
  const [hectareas, setHectareas] = useState('')
  const [campoId, setCampoId] = useState<string | null>(null)
  // Paso 3 — potreros
  const [filas, setFilas] = useState<FilaPotrero[]>([
    { nombre: '', hectareas: '' },
  ])
  const [terminado, setTerminado] = useState(false)

  // Si ya pertenece a una empresa y no la creó en este wizard, no va acá.
  if (!isLoading && membresia && !empresaId) {
    return <Navigate to="/" replace />
  }

  async function crearEmpresa(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const nombre = nombreEmpresa.trim()
    if (nombre.length < 2) {
      setError('Contanos el nombre de tu empresa o establecimiento.')
      return
    }
    setOcupado(true)
    const { data, error } = await supabase.rpc('crear_empresa_con_dueno', {
      p_nombre: nombre,
    })
    setOcupado(false)
    if (error) {
      setError(error.message)
      return
    }
    setEmpresaId(data)
    setPaso(1)
  }

  async function crearPrimerCampo(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!empresaId) return
    const nombre = nombreCampo.trim()
    if (nombre.length < 2) {
      setError('Poné un nombre al campo — como lo nombran ustedes.')
      return
    }
    const ha = hectareas.trim() === '' ? null : Number(hectareas)
    if (ha !== null && (!Number.isFinite(ha) || ha < 0)) {
      setError('Las hectáreas tienen que ser un número.')
      return
    }
    setOcupado(true)
    try {
      const id = await crearCampo({
        empresaId,
        nombre,
        tipo: tipoCampo,
        hectareas: ha,
      })
      setCampoId(id)
      setPaso(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el campo.')
    } finally {
      setOcupado(false)
    }
  }

  async function crearPotreros(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!empresaId || !campoId) return
    const validas = filas
      .map((f) => ({ nombre: f.nombre.trim(), hectareas: f.hectareas.trim() }))
      .filter((f) => f.nombre.length > 0)
    for (const f of validas) {
      const ha = f.hectareas === '' ? null : Number(f.hectareas)
      if (ha !== null && (!Number.isFinite(ha) || ha < 0)) {
        setError(`Las hectáreas de "${f.nombre}" tienen que ser un número.`)
        return
      }
    }
    setOcupado(true)
    try {
      for (const f of validas) {
        await crearPotrero({
          empresaId,
          campoId,
          nombre: f.nombre,
          estadoCiclo: 'ganadero',
          hectareas: f.hectareas === '' ? null : Number(f.hectareas),
        })
      }
      setTerminado(true)
    } catch (err) {
      setError(
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

  return (
    <div className="auth-forms flex h-full flex-col overflow-y-auto">
      {/* Franja amanecer: guiño a la escena del registro */}
      <div
        className="h-1.5 shrink-0"
        style={{
          background:
            'linear-gradient(90deg, #178a55 0%, #3d8b66 55%, #d98a18 100%)',
        }}
      />
      <div className="flex flex-1 items-start justify-center p-6 sm:items-center sm:p-10">
        <div className="w-full max-w-lg">
          {!terminado && (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Paso {paso + 1} de {PASOS.length}
              </p>
              <div className="mt-2 flex gap-1.5">
                {PASOS.map((p, i) => (
                  <span
                    key={p}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      i <= paso ? 'bg-primary' : 'bg-border',
                    )}
                  />
                ))}
              </div>
            </>
          )}

          <AnimatePresence mode="wait">
            {terminado ? (
              <motion.div
                key="fin"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="mt-8 text-center"
              >
                <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="size-7" />
                </span>
                <h1 className="mt-5 text-3xl font-bold tracking-tight">
                  ¡Listo, {nombreEmpresa.trim()}!
                </h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Tu campo ya está armado. Lo que sigue es cargar tu hacienda:
                  entrá a un potrero y usá <strong>Cargar animales</strong> —
                  podés cargar de a lotes, sin caravanear nada todavía.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Button onClick={() => entrar(`/campos/${campoId}`)}>
                    Ir a mi campo y cargar hacienda
                  </Button>
                  <Button variant="outline" onClick={() => entrar('/')}>
                    Ver el inicio
                  </Button>
                </div>
              </motion.div>
            ) : paso === 0 ? (
              <motion.form
                key="empresa"
                onSubmit={crearEmpresa}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="mt-8"
              >
                <h1 className="text-3xl font-bold tracking-tight">
                  ¿Cómo se llama tu empresa?
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Te sugerimos uno con tu apellido — cambialo si usás la razón
                  social o el nombre del establecimiento.
                </p>
                <div className="mt-6 grid gap-2">
                  <Label htmlFor="empresa">Nombre</Label>
                  <Input
                    id="empresa"
                    value={nombreEmpresa}
                    onChange={(e) => setNombreEmpresa(e.target.value)}
                    placeholder="Ej: Estancia La Esperanza"
                    maxLength={80}
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="mt-3 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={ocupado} className="mt-6 w-full">
                  {ocupado ? 'Creando…' : 'Continuar'}
                </Button>
              </motion.form>
            ) : paso === 1 ? (
              <motion.form
                key="campo"
                onSubmit={crearPrimerCampo}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="mt-8"
              >
                <h1 className="text-3xl font-bold tracking-tight">
                  Tu primer campo
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Después podés sumar los que hagan falta — propios o
                  alquilados.
                </p>
                <div className="mt-6 grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="campo">Nombre del campo</Label>
                    <Input
                      id="campo"
                      value={nombreCampo}
                      onChange={(e) => setNombreCampo(e.target.value)}
                      placeholder="Ej: Don Gilberto"
                      autoFocus
                    />
                  </div>
                  <div className="grid gap-2">
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
                            'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                            tipoCampo === valor
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-input text-muted-foreground hover:border-ring',
                          )}
                        >
                          {etiqueta}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="hectareas">
                      Hectáreas{' '}
                      <span className="font-normal text-muted-foreground">
                        (si las sabés)
                      </span>
                    </Label>
                    <Input
                      id="hectareas"
                      inputMode="decimal"
                      value={hectareas}
                      onChange={(e) => setHectareas(e.target.value)}
                      placeholder="Ej: 420"
                    />
                  </div>
                </div>
                {error && (
                  <p className="mt-3 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={ocupado} className="mt-6 w-full">
                  {ocupado ? 'Creando…' : 'Continuar'}
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="potreros"
                onSubmit={crearPotreros}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="mt-8"
              >
                <h1 className="text-3xl font-bold tracking-tight">
                  Los potreros de {nombreCampo.trim() || 'tu campo'}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cargá los que te acuerdes — se pueden sumar, renombrar y
                  dibujar en el mapa más adelante.
                </p>
                <div className="mt-6 grid gap-2.5">
                  {filas.map((fila, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <MapPin className="size-4 shrink-0 text-muted-foreground" />
                      <Input
                        aria-label={`Nombre del potrero ${i + 1}`}
                        value={fila.nombre}
                        onChange={(e) =>
                          setFilas((fs) =>
                            fs.map((f, j) =>
                              j === i ? { ...f, nombre: e.target.value } : f,
                            ),
                          )
                        }
                        placeholder={`Ej: ${i + 1}A`}
                      />
                      <Input
                        aria-label={`Hectáreas del potrero ${i + 1}`}
                        inputMode="decimal"
                        className="w-24"
                        value={fila.hectareas}
                        onChange={(e) =>
                          setFilas((fs) =>
                            fs.map((f, j) =>
                              j === i ? { ...f, hectareas: e.target.value } : f,
                            ),
                          )
                        }
                        placeholder="ha"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar potrero ${i + 1}`}
                        disabled={filas.length === 1}
                        onClick={() =>
                          setFilas((fs) => fs.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    setFilas((fs) => [...fs, { nombre: '', hectareas: '' }])
                  }
                >
                  <Plus className="size-4" /> Otro potrero
                </Button>
                {error && (
                  <p className="mt-3 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <div className="mt-6 grid gap-2.5">
                  <Button type="submit" disabled={ocupado} className="w-full">
                    {ocupado ? 'Creando…' : 'Terminar'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    disabled={ocupado}
                    onClick={() => setTerminado(true)}
                  >
                    Los cargo después
                  </Button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
