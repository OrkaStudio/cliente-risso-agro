import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
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
import { CroquisVivo, type CampoCroquis } from '@/features/onboarding/croquis-vivo'
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
  hectareas: number
  potreros: { id: string; nombre: string; hectareas: number | null; cabezas: number }[]
  cabezas: number
}

// El campo del onboarding lleva la letra de su orden (A, B, C… la pone la
// DB). El NÚMERO sí lo elige el productor (hay quien ya tiene su numeración).
type FilaPotrero = { numero: string; hectareas: string }

type Etapa = 'empresa' | 'campo' | 'potreros' | 'hacienda' | 'otro' | 'fin'

/**
 * Lo que se está escribiendo AHORA, antes de guardar: el croquis de la
 * escena lo dibuja en vivo. Cada paso avisa con cada tecla.
 */
type Borrador = {
  campo: { nombre: string; hectareas: number | null }
  potreros: { nombre: string; hectareas: number | null }[]
  cabezas: Record<string, number>
}
const BORRADOR_VACIO: Borrador = { campo: { nombre: '', hectareas: null }, potreros: [], cabezas: {} }

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
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO)

  // Al cambiar de paso, arriba de todo: en el teléfono el croquis está sobre
  // la tarjeta, y ver cómo quedó lo que acaba de cargar es el premio.
  useEffect(() => {
    document.querySelector<HTMLElement>('[data-auth-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [etapa])
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
        <EscenaCroquis
          etapa={etapa}
          campos={campos}
          campoActual={campoActual}
          borrador={borrador}
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
              onBorrador={(campo) => setBorrador({ ...BORRADOR_VACIO, campo })}
              onVolver={() => {
                setBorrador(BORRADOR_VACIO)
                setEtapa('otro')
              }}
              onListo={(c) => {
                setBorrador(BORRADOR_VACIO)
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
              onBorrador={(potreros) => setBorrador({ ...BORRADOR_VACIO, potreros })}
              onListo={(potreros) => {
                setBorrador(BORRADOR_VACIO)
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
              onBorrador={(cabezas) => setBorrador({ ...BORRADOR_VACIO, cabezas })}
              onListo={(cabezas, porPotrero) => {
                setBorrador(BORRADOR_VACIO)
                setCampos((xs) => [
                  ...xs,
                  {
                    ...campoActual,
                    cabezas,
                    potreros: campoActual.potreros.map((p) => ({ ...p, cabezas: porPotrero[p.id] ?? 0 })),
                  },
                ])
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
                  <li key={c.id} className="flex items-center gap-2.5 px-3.5 py-2">
                    <LandPlot className="size-4 shrink-0 text-primary/80" strokeWidth={1.75} />
                    <div className="min-w-0">
                      <p className="font-medium">{c.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {ha(c.hectareas)} ha
                        {c.potreros.length > 0
                          ? ` · ${c.potreros.length} ${c.potreros.length === 1 ? 'potrero' : 'potreros'}`
                          : ' · sin potreros todavía'}
                        {c.cabezas > 0 ? ` · ${c.cabezas} cabezas` : ''}
                      </p>
                    </div>
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
  onBorrador,
  onVolver,
  onListo,
}: {
  empresaId: string
  primero: boolean
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onBorrador: (b: Borrador['campo']) => void
  /** Se arrepintió de "otro campo": vuelve a la pregunta. */
  onVolver: () => void
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
    // Obligatorias: de acá sale la cuenta de los potreros.
    const ha = numeroDe(hectareas)
    if (ha === null) errs.hectareas = 'Necesitamos las hectáreas'
    else if (!Number.isFinite(ha) || ha <= 0) errs.hectareas = 'Un número mayor que cero'
    setErrores(errs)
    if (Object.keys(errs).length || !actividad || !localidad || ha === null) return

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
        subtitulo="Cómo se llama, qué se hace, dónde está y cuántas hectáreas tiene."
      />
      <form onSubmit={guardar} className="mt-5 grid gap-3.5" noValidate>
        <Reveal delay={0.14} className="grid gap-1.5">
          <Label htmlFor="campo">Nombre del campo</Label>
          <Input
            id="campo"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value)
              onBorrador({ nombre: e.target.value.trim(), hectareas: numeroDe(hectareas) })
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
            onEscribir={() => setErrores((x) => ({ ...x, localidad: undefined }))}
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
            <div className="grid content-start gap-1.5">
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
            <div className="grid content-start gap-1.5">
              <Label htmlFor="hectareas">Hectáreas</Label>
              <Input
                id="hectareas"
                inputMode="decimal"
                value={hectareas}
                onChange={(e) => {
                  setHectareas(e.target.value)
                  onBorrador({ nombre: nombre.trim(), hectareas: numeroDe(e.target.value) })
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
        <Reveal delay={0.32} className="mt-2 grid gap-2">
          <Button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
            {ocupado ? 'Guardando…' : 'Guardar el campo'}
          </Button>
          {!primero && (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              disabled={ocupado}
              onClick={onVolver}
            >
              <ArrowLeft className="size-4" /> Volver
            </Button>
          )}
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
  onBorrador,
  onListo,
}: {
  empresaId: string
  campo: CampoCargado
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onBorrador: (p: Borrador['potreros']) => void
  onListo: (potreros: CampoCargado['potreros']) => void
}) {
  const [filas, setFilas] = useState<FilaPotrero[]>([{ numero: '1', hectareas: '' }])
  const [error, setError] = useState<string | null>(null)

  // Cada cambio de filas avisa al croquis de la escena.
  function cambiarFilas(fn: (fs: FilaPotrero[]) => FilaPotrero[]) {
    const next = fn(filas)
    setFilas(next)
    onBorrador(next.map((f) => ({ nombre: `${f.numero.trim() || '?'}A`, hectareas: haDe(f) })))
  }

  // La regla es una sola: los potreros suman EXACTAMENTE las hectáreas del
  // campo. Ni "más o menos" ni potreros sin hectáreas — es su negocio. Quien
  // no tiene el dato a mano salta el paso entero con "después", nunca a
  // medias.
  const totalCampo = campo.hectareas
  const filasValidas = filas.every((f) => {
    const ha = haDe(f)
    return f.numero.trim() !== '' && ha !== null && Number.isFinite(ha) && ha > 0
  })
  const sumaHa = redondear1(
    filas.reduce((s, f) => {
      const ha = haDe(f)
      return s + (ha !== null && Number.isFinite(ha) && ha > 0 ? ha : 0)
    }, 0),
  )
  const diferencia = redondear1(totalCampo - sumaHa)
  const excede = diferencia < -0.05
  const completo = filasValidas && Math.abs(diferencia) < 0.05
  const numeros = filas.map((f) => f.numero.trim())
  const repetido = numeros.find((n, i) => n !== '' && numeros.indexOf(n) !== i)
  const listo = completo && !repetido

  // Qué falta, dicho en una línea al lado de la barra.
  const estado = repetido
    ? `El potrero ${repetido} está dos veces`
    : completo
      ? '¡Completo!'
      : excede
        ? `Se pasan ${ha(redondear1(-diferencia))} ha`
        : sumaHa === 0
          ? 'Las hectáreas de cada potrero'
          : filasValidas
            ? `Faltan ${ha(diferencia)} ha`
            : `Faltan ${ha(diferencia)} ha · hay potreros sin hectáreas`

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!listo) return
    setError(null)
    setOcupado(true)
    try {
      const creados: CampoCargado['potreros'] = []
      // Se manda sólo el número; la DB le pone la letra del campo.
      for (const f of filas) {
        const hectareas = haDe(f)
        const nombre = `${f.numero.trim()}A`
        const id = await crearPotrero({
          empresaId,
          campoId: campo.id,
          nombre,
          estadoCiclo: estadoInicialPorActividad(campo.actividad),
          hectareas,
        })
        creados.push({ id, nombre, hectareas, cabezas: 0 })
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
        subtitulo={`Número y hectáreas de cada uno. Entre todos tienen que sumar las ${ha(totalCampo)} ha del campo.`}
      />
      <form onSubmit={guardar} className="mt-5" noValidate>
        <Reveal delay={0.14} className="grid gap-2.5">
          {filas.map((fila, i) => {
            const ha = haDe(fila)
            const filaOk = ha !== null && Number.isFinite(ha) && ha > 0
            return (
              <div key={i} className="flex items-center gap-2">
                {/* Número editable; la letra la pone el campo. */}
                <Input
                  aria-label={`Número del potrero ${i + 1}`}
                  inputMode="numeric"
                  className="w-16 text-center tabular-nums"
                  value={fila.numero}
                  onChange={(e) => {
                    setError(null)
                    cambiarFilas((fs) =>
                      fs.map((f, j) =>
                        j === i ? { ...f, numero: e.target.value.replace(/\D/g, '') } : f,
                      ),
                    )
                  }}
                />
                <div className="relative flex-1">
                  <Input
                    aria-label={`Hectáreas del potrero ${i + 1}`}
                    inputMode="decimal"
                    className="pr-16 tabular-nums"
                    value={fila.hectareas}
                    // Sólo la fila nueva monta con foco: la primera al entrar,
                    // y cada "Otro potrero" después.
                    autoFocus
                    onChange={(e) => {
                      setError(null)
                      cambiarFilas((fs) =>
                        fs.map((f, j) => (j === i ? { ...f, hectareas: e.target.value } : f)),
                      )
                    }}
                    placeholder="Hectáreas"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1 text-xs',
                      filaOk ? 'text-primary' : 'text-muted-foreground/55',
                    )}
                  >
                    ha
                    {filaOk && <Check className="size-3.5" strokeWidth={2.5} />}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar potrero ${i + 1}`}
                  disabled={filas.length === 1}
                  onClick={() => cambiarFilas((fs) => fs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })}
        </Reveal>

        <Reveal delay={0.18} className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              cambiarFilas((fs) => {
                const nums = fs.map((f) => parseInt(f.numero, 10)).filter((n) => Number.isFinite(n))
                const sig = (nums.length ? Math.max(...nums) : 0) + 1
                return [...fs, { numero: String(sig), hectareas: '' }]
              })
            }
          >
            <Plus className="size-4" /> Otro potrero
          </Button>
        </Reveal>

        {/* La cuenta, en vivo: la barra se completa y el botón se enciende. */}
        <Reveal delay={0.22} className="mt-4">
          <div
            className={cn(
              'rounded-lg border px-3.5 py-3 transition-colors',
              completo && !repetido
                ? 'border-primary/50 bg-primary/5'
                : excede || repetido
                  ? 'border-destructive/40 bg-destructive/5'
                  : 'border-border',
            )}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold tabular-nums">
                {ha(sumaHa)} <span className="font-normal text-muted-foreground">de {ha(totalCampo)} ha</span>
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 font-medium tabular-nums',
                  completo && !repetido
                    ? 'text-primary'
                    : excede || repetido
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                )}
              >
                {completo && !repetido && <Check className="size-3.5" strokeWidth={3} />}
                {estado}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
              <motion.div
                className={cn('h-full rounded-full', excede || repetido ? 'bg-destructive' : 'bg-primary')}
                initial={false}
                animate={{ width: `${Math.min(100, (sumaHa / totalCampo) * 100)}%` }}
                transition={{ type: 'spring', stiffness: 220, damping: 28 }}
              />
            </div>
          </div>
        </Reveal>

        {error && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <Reveal delay={0.26} className="mt-5 grid gap-2">
          <Button type="submit" disabled={ocupado || !listo} className={BOTON_PRINCIPAL}>
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

/** "100,5" también vale: acá se escribe con coma. */
function numeroDe(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  return t === '' ? null : Number(t)
}

function haDe(f: FilaPotrero): number | null {
  return numeroDe(f.hectareas)
}

function redondear1(n: number): number {
  return Math.round(n * 10) / 10
}

/** 420,5 — con coma, como se escribe acá. */
function ha(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

// ---------------------------------------------------------------------
// Paso: su hacienda, un potrero por vez
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
  onBorrador,
  onListo,
}: {
  empresaId: string
  campo: CampoCargado
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onBorrador: (cabezas: Record<string, number>) => void
  onListo: (cabezas: number, porPotrero: Record<string, number>) => void
}) {
  const potreros = campo.potreros
  // Cabezas por categoría, POR POTRERO: la hacienda vive en un lugar. Se
  // recorre un potrero por vez — fichas arriba, el activo abajo — y se
  // guarda todo junto al final.
  const [porPotrero, setPorPotrero] = useState<Record<string, Cantidades>>({})
  const [especies, setEspecies] = useState<Record<string, Especie[]>>({})
  const [indice, setIndice] = useState(0)
  const [vistos, setVistos] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const actual = potreros[indice]!
  const cantActual = porPotrero[actual.id] ?? {}
  const totalActual = totalDe(cantActual)
  const total = potreros.reduce((s, p) => s + totalDe(porPotrero[p.id]), 0)
  const esUltimo = indice === potreros.length - 1
  const especiesActual = especies[actual.id] ?? ['bovino']

  function irA(i: number) {
    setVistos((v) => (v.includes(actual.id) ? v : [...v, actual.id]))
    setIndice(i)
    setError(null)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    // Enter o el botón: en un potrero intermedio pasa al siguiente; en el
    // último guarda todo.
    if (!esUltimo) {
      irA(indice + 1)
      return
    }
    const totales = Object.fromEntries(potreros.map((p) => [p.id, totalDe(porPotrero[p.id])]))
    if (total === 0) {
      onListo(0, totales)
      return
    }
    setError(null)
    setOcupado(true)
    for (const p of potreros) {
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
    onListo(total, totales)
  }

  return (
    <>
      <AuthHeading
        icono={Beef}
        titulo={`La hacienda de ${campo.nombre}`}
        subtitulo="Un potrero por vez: cuántas cabezas hay hoy en cada uno. Si está vacío, pasás al siguiente."
      />
      <form onSubmit={guardar} className="mt-5" noValidate>
        {/* Las fichas: dónde estoy, qué hice, cuánto llevo. */}
        <Reveal delay={0.14}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Potrero {indice + 1} de {potreros.length}
            </p>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={total}
                initial={{ scale: 1.25, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-primary"
              >
                <Beef className="size-3.5" strokeWidth={2} />
                {total} {total === 1 ? 'cabeza' : 'cabezas'}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {potreros.map((p, i) => {
              const t = totalDe(porPotrero[p.id])
              const visto = vistos.includes(p.id)
              const activo = i === indice
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => irA(i)}
                  aria-current={activo ? 'step' : undefined}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                    activo
                      ? 'border-primary bg-primary text-white'
                      : visto
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-ring',
                  )}
                >
                  {visto && !activo && <Check className="size-3" strokeWidth={3} />}
                  {p.nombre}
                  {t > 0 && (
                    <span className={cn('font-medium tabular-nums', activo ? 'text-white/80' : 'text-primary/80')}>
                      · {t}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Reveal>

        {/* El potrero activo. Entra desde la derecha, como pasar una hoja. */}
        <Reveal delay={0.18} className="mt-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={actual.id}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="rounded-lg border border-border px-3.5 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold">
                  Potrero {actual.nombre}
                  {actual.hectareas ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{ha(actual.hectareas)} ha</span>
                  ) : null}
                </p>
                <p className={cn('text-xs tabular-nums', totalActual > 0 ? 'font-medium text-primary' : 'text-muted-foreground')}>
                  {totalActual > 0 ? `${totalActual} ${totalActual === 1 ? 'cabeza' : 'cabezas'} acá` : 'Todavía vacío'}
                </p>
              </div>
              <div className="mt-3 grid gap-3">
                {ESPECIES.filter((e) => especiesActual.includes(e)).map((e) => (
                  <div key={e}>
                    {e !== 'bovino' && (
                      <p className="mb-1.5 text-xs font-semibold text-foreground">{especieLabel[e]}s</p>
                    )}
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {categoriasPorEspecie[e].map((c, k) => (
                        <label key={c} className="grid gap-1">
                          <span className="truncate text-xs text-muted-foreground">{categoriaLabel[c]}</span>
                          <Input
                            inputMode="numeric"
                            value={cantActual[c] ?? ''}
                            autoFocus={e === 'bovino' && k === 0}
                            onChange={(ev) => {
                              setError(null)
                              const next = {
                                ...porPotrero,
                                [actual.id]: {
                                  ...(porPotrero[actual.id] ?? {}),
                                  [c]: ev.target.value.replace(/\D/g, ''),
                                },
                              }
                              setPorPotrero(next)
                              onBorrador(
                                Object.fromEntries(potreros.map((p) => [p.id, totalDe(next[p.id])])),
                              )
                            }}
                            placeholder="0"
                            className="px-2.5 tabular-nums"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {/* Otras especies: se suman (o se quitan) con un toque. */}
                <div className="flex flex-wrap gap-1.5">
                  {ESPECIES.filter((e) => e !== 'bovino').map((e) => {
                    const on = especiesActual.includes(e)
                    return (
                      <button
                        key={e}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setEspecies((x) => ({
                            ...x,
                            [actual.id]: on
                              ? especiesActual.filter((y) => y !== e)
                              : [...especiesActual, e],
                          }))
                        }
                        className={cn(
                          'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors',
                          on
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-ring',
                        )}
                      >
                        {on ? <Check className="size-3" strokeWidth={3} /> : <Plus className="size-3" strokeWidth={2.5} />}
                        {especieLabel[e]}s
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </Reveal>

        {error && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <Reveal delay={0.22} className="mt-5 grid gap-2">
          <Button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
            {ocupado ? (
              'Guardando…'
            ) : !esUltimo ? (
              <>
                {totalActual > 0 ? 'Listo, siguiente potrero' : 'Está vacío, siguiente'}
                <ArrowRight className="size-4" />
              </>
            ) : total > 0 ? (
              `Guardar ${total} ${total === 1 ? 'cabeza' : 'cabezas'}`
            ) : (
              'Terminar sin hacienda'
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={ocupado}
            onClick={() => onListo(0, {})}
          >
            La completo después
          </Button>
        </Reveal>
      </form>
    </>
  )
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
 * La escena del onboarding: el croquis que se dibuja solo mientras carga,
 * con una línea arriba que dice dónde está (Datos · Potreros · Hacienda) y,
 * abajo, los campos ya terminados. Está al lado del formulario, a la altura
 * de los ojos: es el reconocimiento de cada tecla, no una lista lejana.
 */
function EscenaCroquis({
  etapa,
  campos,
  campoActual,
  borrador,
}: {
  etapa: Etapa
  campos: CampoCargado[]
  campoActual: CampoCargado | null
  borrador: Borrador
}) {
  const ultimo = campos[campos.length - 1] ?? null
  const enCampo = etapa === 'campo' || etapa === 'potreros' || etapa === 'hacienda'

  // Qué dibuja el croquis según la etapa.
  const croquis: CampoCroquis =
    etapa === 'campo'
      ? { nombre: borrador.campo.nombre, hectareas: borrador.campo.hectareas, potreros: [], estado: 'campo' }
      : etapa === 'potreros' && campoActual
        ? {
            nombre: campoActual.nombre,
            hectareas: campoActual.hectareas,
            potreros: borrador.potreros.map((p, i) => ({
              clave: `${i}`,
              nombre: p.nombre,
              hectareas: p.hectareas,
              cabezas: 0,
            })),
            estado: 'potreros',
          }
        : etapa === 'hacienda' && campoActual
          ? {
              nombre: campoActual.nombre,
              hectareas: campoActual.hectareas,
              potreros: campoActual.potreros.map((p) => ({
                clave: p.id,
                nombre: p.nombre,
                hectareas: p.hectareas,
                cabezas: borrador.cabezas[p.id] ?? 0,
              })),
              estado: 'hacienda',
            }
          : ultimo
            ? {
                nombre: ultimo.nombre,
                hectareas: ultimo.hectareas,
                potreros: ultimo.potreros.map((p) => ({
                  clave: p.id,
                  nombre: p.nombre,
                  hectareas: p.hectareas,
                  cabezas: p.cabezas,
                })),
                estado: 'hecho',
              }
            : { nombre: '', hectareas: null, potreros: [], estado: 'vacio' }

  const partes: { etapa: Etapa; nombre: string }[] = [
    { etapa: 'campo', nombre: 'Datos' },
    { etapa: 'potreros', nombre: 'Potreros' },
    ...(campoActual?.actividad === 'agricola' ? [] : [{ etapa: 'hacienda' as Etapa, nombre: 'Hacienda' }]),
  ]
  const indiceParte = partes.findIndex((p) => p.etapa === etapa)
  const cabezasCroquis = croquis.potreros.reduce((s, p) => s + p.cabezas, 0)
  const potrerosConHa = croquis.potreros.filter((p) => p.hectareas).length
  const nPotreros = croquis.estado === 'potreros' ? potrerosConHa : croquis.potreros.length
  const anteriores = campos.filter((c) => (enCampo ? true : c.id !== ultimo?.id))

  return (
    <div className="w-full max-w-[380px]">
      <p className="font-heading text-[26px] font-semibold leading-tight tracking-tight lg:text-[30px]">
        {etapa === 'fin' ? '¡Tu campo está armado!' : 'Armemos tu campo.'}
      </p>

      {/* Dónde está: el nombre del campo y sus tres partes. */}
      <div className="mt-4 flex min-h-6 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm lg:mt-5">
        {enCampo ? (
          <>
            <span className="font-semibold">
              {croquis.nombre || (campos.length === 0 ? 'Tu primer campo' : 'Otro campo')}
            </span>
            <span className="flex items-center gap-2.5 text-[13px]">
              {partes.map((p, i) => {
                const hecha = i < indiceParte
                const enCurso = i === indiceParte
                return (
                  <span
                    key={p.etapa}
                    className={cn(
                      'inline-flex items-center gap-1 transition-colors',
                      hecha && 'text-sidebar-foreground/80',
                      enCurso && 'font-semibold text-[#e9b45f]',
                      !hecha && !enCurso && 'text-sidebar-foreground/40',
                    )}
                  >
                    {hecha ? <Check className="size-3 text-primary" strokeWidth={3} /> : null}
                    {p.nombre}
                  </span>
                )
              })}
            </span>
          </>
        ) : etapa === 'empresa' ? (
          <span className="text-sidebar-foreground/70">Unos minutos y estás adentro.</span>
        ) : ultimo ? (
          <>
            <span className="font-semibold">{ultimo.nombre}</span>
            <span className="text-[13px] text-sidebar-foreground/70">
              {ha(ultimo.hectareas)} ha
              {ultimo.potreros.length > 0
                ? ` · ${ultimo.potreros.length} ${ultimo.potreros.length === 1 ? 'potrero' : 'potreros'}`
                : ''}
            </span>
          </>
        ) : null}
      </div>

      <div className="mt-3">
        <CroquisVivo campo={croquis} />
      </div>

      {/* Lo que lleva cargado, en una línea bajo el croquis. */}
      <p className="mt-2 min-h-5 text-[13px] text-sidebar-foreground/70">
        {nPotreros > 0 ? `${nPotreros} ${nPotreros === 1 ? 'potrero' : 'potreros'}` : ''}
        {cabezasCroquis > 0 && (
          <>
            {nPotreros > 0 ? ' · ' : ''}
            <span className="font-semibold tabular-nums text-[#e9b45f]">{cabezasCroquis} cabezas</span>
          </>
        )}
      </p>

      {/* Los campos ya terminados, cuando no son el que se ve. */}
      {anteriores.length > 0 && (
        <ol className="mt-4 flex flex-wrap gap-1.5">
          {anteriores.map((c) => (
            <li
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-sidebar-foreground/15 bg-sidebar px-2.5 py-1 text-xs text-sidebar-foreground/85 shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
            >
              <Check className="size-3 text-primary" strokeWidth={3} />
              {c.nombre}
              <span className="text-sidebar-foreground/50">
                · {ha(c.hectareas)} ha{c.cabezas > 0 ? ` · ${c.cabezas} cab.` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

