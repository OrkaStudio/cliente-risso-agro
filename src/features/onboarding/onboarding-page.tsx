import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Beef,
  Building2,
  Check,
  CheckCircle2,
  Droplets,
  Grid2x2,
  LandPlot,
  PencilRuler,
  Plus,
  Snowflake,
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
import { crearCampo, crearPotrero, type ActividadCampo } from '@/features/campos/api'
import { actividadLabel, estadoInicialPorActividad } from '@/features/campos/labels'
import { LocalidadInput } from '@/features/campos/localidad-input'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useClima } from '@/features/cotizaciones/hooks'
import { WmoIcon } from '@/features/cotizaciones/wmo-icon'
import {
  categoriaLabel,
  categoriasPorEspecie,
  especieLabel,
  type Especie,
} from '@/features/hacienda/labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Constants, type Database } from '@/lib/supabase/types'
import type { Localidad } from '@/lib/geocoding'
import { cn } from '@/lib/utils'

type TipoCampo = Database['public']['Enums']['tipo_campo']
type Categoria = Database['public']['Enums']['categoria_animal']

/** Un campo ya cargado en este onboarding (para el mapa y el resumen). */
type CampoCargado = {
  id: string
  nombre: string
  actividad: ActividadCampo
  localidad: string
  lat: number
  lon: number
  hectareas: number | null
  potreros: { id: string; nombre: string; hectareas: number | null }[]
  cabezas: number
}

// El campo del onboarding lleva la letra de su orden (A, B, C… la pone la
// DB). El NÚMERO sí lo elige el productor (hay quien ya tiene su numeración).
type FilaPotrero = { numero: string; hectareas: string }

type Etapa = 'empresa' | 'campo' | 'potreros' | 'hacienda' | 'otro' | 'fin'

/**
 * Onboarding post-registro: empresa → por cada campo (datos · potreros ·
 * hacienda) → ¿otro campo? → listo. El guard RequireEmpresa manda acá a
 * quien no tiene membresía. El alta de empresa corre en la RPC
 * `crear_empresa_con_dueno` (SECURITY DEFINER: no hay policies de INSERT).
 *
 * Diseño en [[clientes/risso-agro/tareas/TASK-060-2026-09-16]]: cada dato
 * que carga es una fila real que después recibe el contorno y el dibujo —
 * nada se vuelve a escribir. El catastro NO se pide acá (nadie tiene la
 * boleta a mano al registrarse): es el primer ítem de la puesta a punto.
 * Mismo lenguaje que auth: escena con el mapa del viaje + tarjeta, cada paso
 * arranca reconociendo el anterior, y "después" nunca es fracaso.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data: membresia, isLoading } = useEmpresa()

  const [etapa, setEtapa] = useState<Etapa>('empresa')
  const [ocupado, setOcupado] = useState(false)

  // Empresa
  const [nombreEmpresa, setNombreEmpresa] = useState(() => {
    const apellido = (user?.user_metadata as { apellido?: string } | undefined)
      ?.apellido
    return apellido ? `${apellido} Agro` : ''
  })
  const [errorEmpresa, setErrorEmpresa] = useState<string | null>(null)
  const [empresaId, setEmpresaId] = useState<string | null>(null)

  // Campos ya cargados + el que se está cargando
  const [campos, setCampos] = useState<CampoCargado[]>([])
  const [campoActual, setCampoActual] = useState<CampoCargado | null>(null)
  // El aha del día 0: al terminar, la app ya sabe el clima de SU campo.
  const primero = campos[0]
  const clima = useClima(
    etapa === 'fin' && primero
      ? { nombre: primero.nombre, lat: primero.lat, lon: primero.lon }
      : null,
  )

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
    setEtapa('campo')
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

  const empresa = nombreEmpresa.trim()

  return (
    <AuthLayout
      escena={
        <MapaDelViaje
          etapa={etapa}
          empresa={empresa}
          campos={campos}
          campoActual={campoActual}
        />
      }
    >
      <AnimatePresence mode="wait">
        {etapa === 'empresa' && (
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
        )}

        {etapa === 'campo' && empresaId && (
          <Paso key={`campo-${campos.length}`}>
            <Logrado>
              {campos.length === 0
                ? `${empresa} ya existe`
                : `${campos[campos.length - 1]!.nombre} cargado`}
            </Logrado>
            <PasoCampo
              empresaId={empresaId}
              primero={campos.length === 0}
              ocupado={ocupado}
              setOcupado={setOcupado}
              onListo={(c) => {
                setCampoActual(c)
                setEtapa('potreros')
              }}
            />
          </Paso>
        )}

        {etapa === 'potreros' && empresaId && campoActual && (
          <Paso key={`potreros-${campoActual.id}`}>
            <Logrado>{campoActual.nombre} guardado</Logrado>
            <PasoPotreros
              empresaId={empresaId}
              campo={campoActual}
              ocupado={ocupado}
              setOcupado={setOcupado}
              onListo={(potreros) => {
                const c = { ...campoActual, potreros }
                setCampoActual(c)
                // Sin hacienda que cargar (agrícola o sin potreros) → ¿otro campo?
                if (c.actividad === 'agricola' || potreros.length === 0) {
                  setCampos((xs) => [...xs, c])
                  setCampoActual(null)
                  setEtapa('otro')
                } else {
                  setEtapa('hacienda')
                }
              }}
            />
          </Paso>
        )}

        {etapa === 'hacienda' && empresaId && campoActual && (
          <Paso key={`hacienda-${campoActual.id}`}>
            <Logrado>
              {campoActual.potreros.length === 1
                ? '1 potrero'
                : `${campoActual.potreros.length} potreros`}{' '}
              en {campoActual.nombre}
            </Logrado>
            <PasoHacienda
              empresaId={empresaId}
              campo={campoActual}
              ocupado={ocupado}
              setOcupado={setOcupado}
              onListo={(cabezas) => {
                setCampos((xs) => [...xs, { ...campoActual, cabezas }])
                setCampoActual(null)
                setEtapa('otro')
              }}
            />
          </Paso>
        )}

        {etapa === 'otro' && (
          <Paso key={`otro-${campos.length}`}>
            <Logrado>
              {campos[campos.length - 1]!.nombre}
              {campos[campos.length - 1]!.cabezas > 0
                ? ` · ${campos[campos.length - 1]!.cabezas} cabezas`
                : ''}
            </Logrado>
            <AuthHeading
              icono={LandPlot}
              titulo="¿Tenés otro campo?"
              subtitulo="Cada campo lleva su ubicación, sus potreros y su hacienda. Podés sumarlo ahora o después desde Campos."
            />
            <div className="mt-6 grid gap-2">
              <Button className={BOTON_PRINCIPAL} onClick={() => setEtapa('campo')}>
                Sí, cargar otro campo
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full text-[15px] font-semibold"
                onClick={() => setEtapa('fin')}
              >
                No, terminar
              </Button>
            </div>
          </Paso>
        )}

        {etapa === 'fin' && primero && (
          <Paso key="fin">
            <div className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle2 className="size-7" />
              </span>
              <h1 className="mt-5 text-2xl font-bold tracking-tight">¡Listo, {empresa}!</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                La app ya sabe de tu campo.
              </p>
            </div>

            {/* Valor ya, no promesa: el clima de SU campo hoy, y lo que cargó. */}
            <div className="mt-6 rounded-lg border border-border">
              <div className="flex items-center gap-3 px-3.5 py-3">
                {clima.data ? (
                  <>
                    <WmoIcon code={clima.data.code} className="size-8 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        Hoy en {primero.nombre} · {primero.localidad}
                      </p>
                      <p className="text-[15px] font-semibold">
                        {clima.data.temp}°{' '}
                        <span className="font-normal text-muted-foreground">
                          {clima.data.max}° / {clima.data.min}° · {clima.data.descripcion}
                        </span>
                      </p>
                    </div>
                    {clima.data.helada ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky">
                        <Snowflake className="size-3" /> Helada
                      </span>
                    ) : clima.data.lluviaProb >= 30 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky">
                        <Droplets className="size-3.5" /> {clima.data.lluviaProb}%
                      </span>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {clima.isLoading ? 'Buscando el clima de tu campo…' : `Tu campo en ${primero.localidad}.`}
                  </p>
                )}
              </div>
              <ul className="divide-y divide-border border-t border-border text-sm">
                {campos.map((c) => (
                  <li key={c.id} className="flex items-baseline gap-2 px-3.5 py-2">
                    <LandPlot className="size-4 shrink-0 self-center text-primary/80" strokeWidth={1.75} />
                    <span className="font-medium">{c.nombre}</span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {c.potreros.length > 0
                        ? `${c.potreros.length} ${c.potreros.length === 1 ? 'potrero' : 'potreros'}`
                        : 'sin potreros todavía'}
                      {c.cabezas > 0 ? ` · ${c.cabezas} cabezas` : ''}
                      {c.hectareas ? ` · ${c.hectareas} ha` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* UN solo siguiente paso, nombrado y con su costo en tiempo. */}
            <div className="mt-5 flex items-start gap-3 rounded-lg bg-primary/5 px-3.5 py-3">
              <PencilRuler className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} />
              <div className="text-sm">
                <p className="font-medium">Lo que sigue: dibujar los potreros sobre el satélite</p>
                <p className="text-xs text-muted-foreground">
                  Cinco minutos, en la compu. Elegís cada potrero de la lista y lo marcás.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <Button className={BOTON_PRINCIPAL} onClick={() => entrar(`/campos/${primero.id}`)}>
                Ir a dibujar mis potreros
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => entrar('/')}>
                Ver el inicio
              </Button>
            </div>
          </Paso>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}

// ---------------------------------------------------------------------
// Paso: este campo
// ---------------------------------------------------------------------

function PasoCampo({
  empresaId,
  primero,
  ocupado,
  setOcupado,
  onListo,
}: {
  empresaId: string
  primero: boolean
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onListo: (c: CampoCargado) => void
}) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCampo>('propio')
  const [actividad, setActividad] = useState<ActividadCampo | null>(null)
  const [localidad, setLocalidad] = useState<Localidad | null>(null)
  const [hectareas, setHectareas] = useState('')
  const [errores, setErrores] = useState<{
    nombre?: string
    actividad?: string
    localidad?: string
    hectareas?: string
    general?: string
  }>({})

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errores = {}
    const n = nombre.trim()
    if (n.length < 2) errs.nombre = 'Falta el nombre'
    if (!actividad) errs.actividad = 'Elegí qué se hace en este campo'
    if (!localidad) errs.localidad = 'Elegí la localidad de la lista'
    const ha = hectareas.trim() === '' ? null : Number(hectareas)
    if (ha !== null && (!Number.isFinite(ha) || ha < 0))
      errs.hectareas = 'Tiene que ser un número'
    setErrores(errs)
    if (Object.keys(errs).length || !actividad || !localidad) return

    setOcupado(true)
    try {
      const id = await crearCampo({
        empresaId,
        nombre: n,
        tipo,
        hectareas: ha,
        actividad,
        ubicacion: {
          localidad: localidad.nombre,
          provincia: localidad.provincia,
          lat: localidad.lat,
          lon: localidad.lon,
        },
      })
      onListo({
        id,
        nombre: n,
        actividad,
        localidad: localidad.nombre,
        lat: localidad.lat,
        lon: localidad.lon,
        hectareas: ha,
        potreros: [],
        cabezas: 0,
      })
    } catch (err) {
      setErrores({ general: err instanceof Error ? err.message : 'No se pudo crear el campo.' })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <AuthHeading
        icono={LandPlot}
        titulo={primero ? 'Tu primer campo' : 'Otro campo'}
        subtitulo="Cómo se llama, qué se hace y dónde está. Los datos que no tengas a mano, los completás después."
      />
      <form onSubmit={guardar} className="mt-5 grid gap-3.5" noValidate>
        <Reveal delay={0.14} className="grid gap-1.5">
          <Label htmlFor="campo">Nombre del campo</Label>
          <Input
            id="campo"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value)
              setErrores((x) => ({ ...x, nombre: undefined }))
            }}
            placeholder="Ej: Don Gilberto"
            aria-invalid={!!errores.nombre}
            autoFocus
          />
          <ErrorCampo mensaje={errores.nombre} />
        </Reveal>

        <Reveal delay={0.18} className="grid gap-1.5">
          <Label>¿Qué se hace en este campo?</Label>
          <div className="grid grid-cols-3 gap-2">
            {Constants.public.Enums.actividad_campo.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setActividad(a)
                  setErrores((x) => ({ ...x, actividad: undefined }))
                }}
                className={cn(
                  'h-9 rounded-lg border text-sm font-medium transition-colors',
                  actividad === a
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:border-ring',
                  errores.actividad && !actividad && 'border-destructive',
                )}
              >
                {actividadLabel[a]}
              </button>
            ))}
          </div>
          <ErrorCampo mensaje={errores.actividad} />
        </Reveal>

        <Reveal delay={0.22} className="grid gap-1.5">
          <Label htmlFor="localidad">¿Dónde está el campo?</Label>
          <LocalidadInput
            id="localidad"
            value={localidad}
            onChange={(l) => {
              setLocalidad(l)
              setErrores((x) => ({ ...x, localidad: undefined }))
            }}
            invalido={!!errores.localidad}
          />
          {errores.localidad ? (
            <ErrorCampo mensaje={errores.localidad} />
          ) : (
            <p className="text-xs text-muted-foreground">
              La localidad más cercana al campo, no tu domicilio. De acá sale el
              clima de este campo.
            </p>
          )}
        </Reveal>

        <Reveal delay={0.26}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Tenencia</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ['propio', 'Propio'],
                    ['alquilado', 'Alquilado'],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setTipo(valor)}
                    className={cn(
                      'h-8 rounded-lg border text-sm font-medium transition-colors',
                      tipo === valor
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input text-muted-foreground hover:border-ring',
                    )}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hectareas">Hectáreas</Label>
              <Input
                id="hectareas"
                inputMode="decimal"
                value={hectareas}
                onChange={(e) => {
                  setHectareas(e.target.value)
                  setErrores((x) => ({ ...x, hectareas: undefined }))
                }}
                placeholder="Según el título"
                aria-invalid={!!errores.hectareas}
              />
              <ErrorCampo mensaje={errores.hectareas} />
            </div>
          </div>
        </Reveal>

        <ErrorCampo mensaje={errores.general} />
        <Reveal delay={0.32} className="mt-2">
          <Button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
            {ocupado ? 'Guardando…' : 'Guardar el campo'}
          </Button>
        </Reveal>
      </form>
    </>
  )
}

// ---------------------------------------------------------------------
// Paso: sus potreros
// ---------------------------------------------------------------------

function PasoPotreros({
  empresaId,
  campo,
  ocupado,
  setOcupado,
  onListo,
}: {
  empresaId: string
  campo: CampoCargado
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onListo: (potreros: CampoCargado['potreros']) => void
}) {
  const [filas, setFilas] = useState<FilaPotrero[]>([{ numero: '1', hectareas: '' }])
  const [error, setError] = useState<string | null>(null)
  // Sólo se avisa una vez que faltan hectáreas; la segunda vez, sigue.
  const [avisadoFaltan, setAvisadoFaltan] = useState(false)

  const haDe = (f: FilaPotrero) => (f.hectareas.trim() === '' ? null : Number(f.hectareas))
  const conHa = filas.filter((f) => haDe(f) !== null && Number.isFinite(haDe(f)!))
  const sumaHa = conHa.reduce((s, f) => s + (haDe(f) ?? 0), 0)
  const sinHa = filas.length - conHa.length
  const totalCampo = campo.hectareas
  // Control contra las hectáreas del campo: acompaña, y frena sólo si se pasa.
  const excede = totalCampo != null && sumaHa > totalCampo * 1.02
  const faltan = totalCampo != null ? Math.max(0, Math.round((totalCampo - sumaHa) * 10) / 10) : null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const numeros = new Set<string>()
    for (const f of filas) {
      const n = f.numero.trim()
      if (!n) {
        setError('Cada potrero necesita su número.')
        return
      }
      if (numeros.has(n)) {
        setError(`El potrero ${n} está dos veces.`)
        return
      }
      numeros.add(n)
      const ha = haDe(f)
      if (ha !== null && (!Number.isFinite(ha) || ha <= 0)) {
        setError(`Las hectáreas del potrero ${n} tienen que ser un número mayor que cero.`)
        return
      }
    }
    if (excede) {
      setError(
        `Los potreros suman ${sumaHa} ha y el campo tiene ${totalCampo}. Revisá las hectáreas antes de seguir.`,
      )
      return
    }
    // Faltan hectáreas para llegar al campo y todas las filas tienen dato:
    // probablemente hay potreros sin cargar. Se avisa una vez.
    if (faltan !== null && faltan > 0 && sinHa === 0 && !avisadoFaltan) {
      setAvisadoFaltan(true)
      setError(
        `Los potreros suman ${sumaHa} ha; al campo le faltan ${faltan}. Si hay más potreros, agregalos. Si está bien así, tocá Guardar de nuevo.`,
      )
      return
    }
    setOcupado(true)
    try {
      const creados: CampoCargado['potreros'] = []
      // Se manda sólo el número; la DB le pone la letra del campo.
      for (const f of filas) {
        const hectareas = haDe(f)
        const id = await crearPotrero({
          empresaId,
          campoId: campo.id,
          nombre: `${f.numero.trim()}A`,
          estadoCiclo: estadoInicialPorActividad(campo.actividad),
          hectareas,
        })
        creados.push({ id, nombre: `${f.numero.trim()}A`, hectareas })
      }
      onListo(creados)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron crear los potreros.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <AuthHeading
        icono={Grid2x2}
        titulo={`Los potreros de ${campo.nombre}`}
        subtitulo={
          totalCampo
            ? `Número y hectáreas de cada uno. Entre todos tienen que sumar las ${totalCampo} ha del campo.`
            : 'Número y hectáreas de cada uno, como figuran en el plano o en el alambrado.'
        }
      />
      <form onSubmit={guardar} className="mt-5" noValidate>
        <Reveal delay={0.14} className="grid gap-2.5">
          {filas.map((fila, i) => (
            <div key={i} className="flex items-center gap-2">
              {/* Número editable; la letra la pone el campo. */}
              <Input
                aria-label={`Número del potrero ${i + 1}`}
                inputMode="numeric"
                className="w-16"
                value={fila.numero}
                onChange={(e) => {
                  setError(null)
                  setFilas((fs) =>
                    fs.map((f, j) =>
                      j === i ? { ...f, numero: e.target.value.replace(/\D/g, '') } : f,
                    ),
                  )
                }}
              />
              <Input
                aria-label={`Hectáreas del potrero ${i + 1}`}
                inputMode="decimal"
                className="flex-1"
                value={fila.hectareas}
                onChange={(e) => {
                  setError(null)
                  setFilas((fs) =>
                    fs.map((f, j) => (j === i ? { ...f, hectareas: e.target.value } : f)),
                  )
                }}
                placeholder="Hectáreas"
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

        {/* Suma en vivo contra el campo: el acompañamiento, no el látigo. */}
        <Reveal delay={0.18} className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            {totalCampo ? (
              <p
                className={cn(
                  'text-xs tabular-nums',
                  excede ? 'font-medium text-destructive' : 'text-muted-foreground',
                )}
              >
                {sumaHa} de {totalCampo} ha
                {excede
                  ? ' · se pasan'
                  : faltan && faltan > 0
                    ? ` · faltan ${faltan}`
                    : sumaHa > 0
                      ? ' · completo'
                      : ''}
              </p>
            ) : sumaHa > 0 ? (
              <p className="text-xs tabular-nums text-muted-foreground">{sumaHa} ha en total</p>
            ) : null}
          </div>
          {totalCampo ? (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className={cn('h-full rounded-full transition-all', excede ? 'bg-destructive' : 'bg-primary')}
                style={{ width: `${Math.min(100, (sumaHa / totalCampo) * 100)}%` }}
              />
            </div>
          ) : null}
          {sinHa > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {sinHa === 1 ? 'Un potrero sin hectáreas' : `${sinHa} potreros sin hectáreas`}: quedan
              como "completar después" y los cargás desde Campos.
            </p>
          )}
        </Reveal>

        {error && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <Reveal delay={0.24} className="mt-5 grid gap-2">
          <Button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
            {ocupado
              ? 'Guardando…'
              : `Guardar ${filas.length === 1 ? 'el potrero' : `los ${filas.length} potreros`}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full text-[15px] font-medium"
            disabled={ocupado}
            onClick={() => onListo([])}
          >
            Los completo después
          </Button>
        </Reveal>
      </form>
    </>
  )
}

// ---------------------------------------------------------------------
// Paso: su hacienda, potrero por potrero
// ---------------------------------------------------------------------

const ESPECIES: Especie[] = ['bovino', 'ovino', 'equino']
type Cantidades = Partial<Record<Categoria, string>>

function totalDe(c: Cantidades | undefined): number {
  return Object.values(c ?? {}).reduce((s, v) => s + (parseInt(v ?? '', 10) || 0), 0)
}

function PasoHacienda({
  empresaId,
  campo,
  ocupado,
  setOcupado,
  onListo,
}: {
  empresaId: string
  campo: CampoCargado
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onListo: (cabezas: number) => void
}) {
  // Cabezas por categoría, POR POTRERO: la hacienda vive en un lugar.
  const [porPotrero, setPorPotrero] = useState<Record<string, Cantidades>>({})
  const [abierto, setAbierto] = useState<string | null>(campo.potreros[0]?.id ?? null)
  const [especies, setEspecies] = useState<Record<string, Especie[]>>({})
  const [error, setError] = useState<string | null>(null)

  const total = campo.potreros.reduce((s, p) => s + totalDe(porPotrero[p.id]), 0)
  const potrerosConHacienda = campo.potreros.filter((p) => totalDe(porPotrero[p.id]) > 0).length

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (total === 0) {
      setError('Cargá las cabezas de al menos un potrero, o tocá "La completo después".')
      return
    }
    setOcupado(true)
    for (const p of campo.potreros) {
      const items = (Object.entries(porPotrero[p.id] ?? {}) as [Categoria, string][])
        .map(([categoria, v]) => ({ categoria, cantidad: parseInt(v, 10) || 0 }))
        .filter((x) => x.cantidad > 0)
      if (items.length === 0) continue
      const { error } = await supabase.rpc('crear_animales_masivo', {
        p_empresa_id: empresaId,
        p_potrero_id: p.id,
        p_items: items,
        p_origen: 'onboarding',
      })
      if (error) {
        setOcupado(false)
        setError(`Potrero ${p.nombre}: ${error.message}`)
        return
      }
    }
    setOcupado(false)
    onListo(total)
  }

  return (
    <>
      <AuthHeading
        icono={Beef}
        titulo={`La hacienda de ${campo.nombre}`}
        subtitulo="Cabezas por categoría, en el potrero donde están hoy. Lo que no tengas a mano, lo completás después desde Hacienda."
      />
      <form onSubmit={guardar} className="mt-5" noValidate>
        <Reveal delay={0.14} className="divide-y divide-border rounded-lg border border-border">
          {campo.potreros.map((p) => {
            const cant = porPotrero[p.id] ?? {}
            const t = totalDe(cant)
            const esAbierto = abierto === p.id
            const esp = especies[p.id] ?? ['bovino']
            return (
              <div key={p.id}>
                {/* Cabecera del potrero: nombre · ha · cabezas cargadas. Tocar abre. */}
                <button
                  type="button"
                  onClick={() => setAbierto(esAbierto ? null : p.id)}
                  aria-expanded={esAbierto}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                      t > 0 ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground',
                    )}
                  >
                    {t > 0 ? <Check className="size-3.5" strokeWidth={3} /> : p.nombre.replace(/[A-Z]$/, '')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">Potrero {p.nombre}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {p.hectareas ? `${p.hectareas} ha` : ''}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t > 0 ? `${t} ${t === 1 ? 'cabeza' : 'cabezas'}` : esAbierto ? '' : 'sin cargar'}
                  </span>
                </button>
                {esAbierto && (
                  <div className="px-3.5 pb-3.5">
                    {ESPECIES.map((e) => {
                      const on = esp.includes(e)
                      return (
                        <div key={e} className={cn(e !== 'bovino' && 'mt-2')}>
                          {e !== 'bovino' && (
                            <button
                              type="button"
                              onClick={() =>
                                setEspecies((x) => ({
                                  ...x,
                                  [p.id]: on ? esp.filter((y) => y !== e) : [...esp, e],
                                }))
                              }
                              className="mb-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {on ? `Sin ${especieLabel[e].toLowerCase()}s` : `+ ${especieLabel[e]}s`}
                            </button>
                          )}
                          {on && (
                            <div className="grid grid-cols-3 gap-2">
                              {categoriasPorEspecie[e].map((c) => (
                                <label key={c} className="grid gap-1">
                                  <span className="text-xs text-muted-foreground">{categoriaLabel[c]}</span>
                                  <Input
                                    inputMode="numeric"
                                    value={cant[c] ?? ''}
                                    onChange={(ev) => {
                                      setError(null)
                                      setPorPotrero((x) => ({
                                        ...x,
                                        [p.id]: { ...(x[p.id] ?? {}), [c]: ev.target.value.replace(/\D/g, '') },
                                      }))
                                    }}
                                    placeholder="0"
                                    className="tabular-nums"
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </Reveal>

        {/* Total del campo, dicho con todas las letras. */}
        <Reveal delay={0.2} className="mt-3">
          <p className="text-xs tabular-nums text-muted-foreground">
            {total > 0
              ? `${total} ${total === 1 ? 'cabeza' : 'cabezas'} en ${campo.nombre}, en ${potrerosConHacienda} ${potrerosConHacienda === 1 ? 'potrero' : 'potreros'}. Después las movés desde el mapa o la manga.`
              : `Todavía no cargaste hacienda en ${campo.nombre}.`}
          </p>
        </Reveal>

        {error && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <Reveal delay={0.24} className="mt-5 grid gap-2">
          <Button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
            {ocupado
              ? 'Guardando…'
              : total > 0
                ? `Guardar ${total} ${categoriaNombreGenerico(total)}`
                : 'Guardar la hacienda'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full text-[15px] font-medium"
            disabled={ocupado}
            onClick={() => onListo(0)}
          >
            La completo después
          </Button>
        </Reveal>
      </form>
    </>
  )
}

function categoriaNombreGenerico(n: number): string {
  return n === 1 ? 'cabeza' : 'cabezas'
}

// ---------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------

/** Transición entre pasos: el que se va sale hacia arriba, el nuevo entra desde abajo. */
function Paso({ children }: { children: ReactNode }) {
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
function Logrado({ children }: { children: ReactNode }) {
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

/**
 * El mapa del viaje, en la escena: la empresa y cada campo con sus tres
 * partes (datos · potreros · hacienda). La tilde verde en cada cosa hecha es
 * el reconocimiento que acompaña todo el recorrido, sin pop-ups.
 */
function MapaDelViaje({
  etapa,
  empresa,
  campos,
  campoActual,
}: {
  etapa: Etapa
  empresa: string
  campos: CampoCargado[]
  campoActual: CampoCargado | null
}) {
  const empresaHecha = etapa !== 'empresa'
  const enCampo = etapa === 'campo' || etapa === 'potreros' || etapa === 'hacienda'
  const subEtiqueta =
    etapa === 'campo' ? 'Datos' : etapa === 'potreros' ? 'Potreros' : etapa === 'hacienda' ? 'Hacienda' : ''

  return (
    <div>
      <p className="font-heading text-[26px] font-semibold leading-tight tracking-tight lg:text-[32px]">
        Armemos tu campo.
      </p>
      <p className="mt-1.5 text-sm text-sidebar-foreground/70">
        Unos minutos y estás adentro.
      </p>
      <ol className="mt-6 grid gap-2.5 lg:mt-8 lg:gap-3">
        <Hito hecho={empresaHecha} enCurso={!empresaHecha}>
          {empresaHecha && empresa ? empresa : 'Tu empresa'}
        </Hito>
        {campos.map((c) => (
          <Hito key={c.id} hecho>
            {c.nombre}
            <span className="ml-1.5 text-[13px] font-normal text-sidebar-foreground/60">
              {c.potreros.length > 0 ? `· ${c.potreros.length} potreros` : ''}
              {c.cabezas > 0 ? ` · ${c.cabezas} cabezas` : ''}
            </span>
          </Hito>
        ))}
        {enCampo && (
          <Hito enCurso>
            {campoActual?.nombre ?? (campos.length === 0 ? 'Tu primer campo' : 'Otro campo')}
            <span className="ml-1.5 text-[13px] font-normal text-[#e9b45f]/80">· {subEtiqueta}</span>
          </Hito>
        )}
        {etapa === 'otro' && <Hito enCurso>¿Otro campo?</Hito>}
        {etapa === 'fin' && <Hito hecho>Listo</Hito>}
      </ol>
    </div>
  )
}

function Hito({
  hecho = false,
  enCurso = false,
  children,
}: {
  hecho?: boolean
  enCurso?: boolean
  children: ReactNode
}) {
  return (
    <li
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
        {hecho ? <Check className="size-3.5" strokeWidth={3} /> : enCurso ? '•' : ''}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </li>
  )
}
