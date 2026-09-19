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
  Droplets,
  Footprints,
  Grid2x2,
  OctagonAlert,
  TriangleAlert,
  LandPlot,
  PencilRuler,
  Plus,
  Snowflake,
  Trash2,
  Wheat,
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
import {
  actualizarCampo,
  actualizarPotrero,
  crearCampo,
  crearPotrero,
  eliminarPotrero,
  type ActividadCampo,
} from '@/features/campos/api'
import { borrarAltaOnboarding, borrarAltaOnboardingSinPotrero } from '@/features/hacienda/api'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { useIsMobile } from '@/lib/use-is-mobile'
import { actividadLabel, estadoInicialPorActividad } from '@/features/campos/labels'
import { LocalidadInput } from '@/features/campos/localidad-input'
import { CroquisVivo, MarcaCategoria, type CampoCroquis } from '@/features/onboarding/croquis-vivo'
import { Confeti, Contador, SelloListo } from '@/features/onboarding/festejo'
import {
  ESTILO_ESPECIE,
  ROL_POR_CATEGORIA,
  totalCabezas,
  type CabezasPorCategoria,
  type RolAnimal,
} from '@/features/onboarding/especies-croquis'
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
  provincia: string
  lat: number
  lon: number
  hectareas: number
  tipo: TipoCampo
  /** Índice del campo en la empresa (trigger de la DB): letra A/B/C y color. */
  colorIdx: number
  potreros: { id: string; nombre: string; hectareas: number | null; cabezas: CabezasPorCategoria }[]
  /** Hacienda cargada sin potrero (el campo entero). */
  sueltas?: CabezasPorCategoria
  cabezas: number
}

// El campo del onboarding lleva la letra de su orden (A, B, C… la pone la
// DB). El NÚMERO sí lo elige el productor (hay quien ya tiene su numeración).
type FilaPotrero = { id?: string; numero: string; hectareas: string }

type Etapa = 'empresa' | 'campo' | 'potreros' | 'hacienda' | 'otro' | 'fin'

/**
 * Lo que se está escribiendo AHORA, antes de guardar: el croquis de la
 * escena lo dibuja en vivo. Cada paso avisa con cada tecla.
 */
type Borrador = {
  campo: { nombre: string; hectareas: number | null; actividad: ActividadCampo | null }
  potreros: { nombre: string; hectareas: number | null }[]
  /** Por potrero, cabezas por especie: el croquis las dibuja distinto. */
  cabezas: Record<string, CabezasPorCategoria>
}
/** Clave del pseudo-potrero "todo el campo" en la hacienda sin potreros. */
const TODO_EL_CAMPO = '__campo__'

const BORRADOR_VACIO: Borrador = {
  campo: { nombre: '', hectareas: null, actividad: null },
  potreros: [],
  cabezas: {},
}

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
  const esMovil = useIsMobile()

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
  // Volvió de potreros a corregir el campo (se pasó de hectáreas, etc.).
  const [corrigiendo, setCorrigiendo] = useState(false)

  // Al cambiar de paso, arriba de todo: en el teléfono el croquis está sobre
  // la tarjeta, y ver cómo quedó lo que acaba de cargar es el premio.
  useEffect(() => {
    document.querySelector<HTMLElement>('[data-auth-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [etapa])
  // El campo por el que sigue: el primero que tiene potreros (si ninguno,
  // el primero cargado). Nunca "el primero" como si fuera toda la empresa.
  const primero = campos.find((c) => c.potreros.length > 0) ?? campos[0]

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

  /**
   * "Revisar" el último campo desde ¿Otro campo?: su hacienda ya está
   * guardada, así que se deshace el alta del onboarding (sólo esos
   * animales) y se vuelve a la hacienda con los potreros intactos. Si era
   * agrícola o no tenía potreros, vuelve a los potreros / al campo.
   */
  async function revisarUltimoCampo() {
    const c = campos[campos.length - 1]
    if (!c || !empresaId) return
    setOcupado(true)
    try {
      if (c.cabezas > 0) {
        if (c.potreros.length > 0) await borrarAltaOnboarding(c.potreros.map((p) => p.id))
        else await borrarAltaOnboardingSinPotrero(empresaId)
      }
      setCampos((xs) => xs.slice(0, -1))
      // Lo cargado queda como punto de partida en el formulario; en la DB
      // se deshizo y se vuelve a guardar al confirmar.
      setCampoActual({ ...c, cabezas: 0 })
      setBorrador(BORRADOR_VACIO)
      setEtapa(c.actividad === 'agricola' ? 'potreros' : 'hacienda')
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

  const empresa = nombreEmpresa.trim()

  return (
    <AuthLayout
      escena={
        <EscenaCroquis
          etapa={etapa}
          empresa={empresa}
          campos={campos}
          campoActual={campoActual}
          borrador={borrador}
        />
      }
    >
      {/* Progreso con ventaja: la cuenta ya cuenta como hecha (Nunes & Drèze:
          un avance ya dado duplica las ganas de terminar). */}
      <ProgresoOnboarding etapa={etapa} />
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
          <Paso key={`campo-${campos.length}-${corrigiendo ? 'edit' : 'new'}`}>
            {!corrigiendo && (
              <Logrado>
                {campos.length === 0
                  ? `¡${empresa} ya tiene su lugar!`
                  : `${campos[campos.length - 1]!.nombre} cargado`}
              </Logrado>
            )}
            <PasoCampo
              empresaId={empresaId}
              primero={campos.length === 0}
              existente={corrigiendo ? campoActual : null}
              ocupado={ocupado}
              setOcupado={setOcupado}
              onBorrador={(campo) => setBorrador({ ...BORRADOR_VACIO, campo })}
              onVolver={() => {
                setBorrador(BORRADOR_VACIO)
                setCorrigiendo(false)
                setEtapa(corrigiendo ? 'potreros' : 'otro')
              }}
              onListo={(c) => {
                setBorrador(BORRADOR_VACIO)
                setCorrigiendo(false)
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
              onCorregirCampo={() => {
                setBorrador(BORRADOR_VACIO)
                setCorrigiendo(true)
                setEtapa('campo')
              }}
              onListo={(potreros) => {
                setBorrador(BORRADOR_VACIO)
                const c = { ...campoActual, potreros }
                setCampoActual(c)
                // Sólo el campo agrícola se salta la hacienda. Sin potreros
                // igual se pide: las cabezas son el dato que más vale, y
                // después las ubica desde Hacienda.
                if (c.actividad === 'agricola') {
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
              {campoActual.potreros.length === 0
                ? `${campoActual.nombre} guardado`
                : campoActual.potreros.length === 1
                  ? `1 potrero en ${campoActual.nombre}`
                  : `${campoActual.potreros.length} potreros en ${campoActual.nombre}`}
            </Logrado>
            <PasoHacienda
              empresaId={empresaId}
              campo={campoActual}
              ocupado={ocupado}
              setOcupado={setOcupado}
              onBorrador={(cabezas) => setBorrador({ ...BORRADOR_VACIO, cabezas })}
              onVolver={() => {
                setBorrador(BORRADOR_VACIO)
                if (campoActual.potreros.length === 0) {
                  setCorrigiendo(true)
                  setEtapa('campo')
                } else {
                  setEtapa('potreros')
                }
              }}
              onListo={(cabezas, porPotrero) => {
                setBorrador(BORRADOR_VACIO)
                setCampos((xs) => [
                  ...xs,
                  {
                    ...campoActual,
                    cabezas,
                    potreros: campoActual.potreros.map((p) => ({ ...p, cabezas: porPotrero[p.id] ?? {} })),
                    sueltas: porPotrero[TODO_EL_CAMPO],
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
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                disabled={ocupado}
                onClick={() => void revisarUltimoCampo()}
              >
                <ArrowLeft className="size-4" /> Revisar {campos[campos.length - 1]!.nombre}
              </Button>
            </div>
          </Paso>
        )}

        {etapa === 'fin' && primero && (
          <Paso key="fin">
            <div className="text-center">
              <SelloListo />
              <motion.h1
                className="mt-5 text-2xl font-bold tracking-tight"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                ¡Listo, {empresa}!
              </motion.h1>
              <motion.p
                className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                {campos.length === 1 ? 'Tu cuenta y tu campo, listos.' : `Tu cuenta y tus ${campos.length} campos, listos.`}
              </motion.p>
            </div>

            {/* Lo que armó, en tres números que cuentan. */}
            <motion.div
              className="mt-6 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-primary/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              {[
                { v: campos.reduce((s, c) => s + c.hectareas, 0), l: 'hectáreas' },
                { v: campos.reduce((s, c) => s + c.potreros.length, 0), l: 'potreros' },
                { v: campos.reduce((s, c) => s + c.cabezas, 0), l: 'cabezas' },
              ].map((x) => (
                <div key={x.l} className="px-2 py-3 text-center">
                  <Contador valor={x.v} className="block text-[22px] font-bold leading-none text-primary" />
                  <span className="mt-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{x.l}</span>
                </div>
              ))}
            </motion.div>

            {/* Valor ya, no promesa: cada campo con SU clima de hoy. */}
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {campos.map((c, i) => (
                <CampoAlFinal key={c.id} campo={c} indice={i} />
              ))}
            </ul>

            {/* UN solo siguiente paso, nombrado y con su costo en tiempo. */}
            <div className="mt-5 flex items-start gap-3 rounded-lg bg-primary/5 px-3.5 py-3">
              {esMovil && primero.potreros.length > 0 ? (
                <Footprints className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} />
              ) : (
                <PencilRuler className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} />
              )}
              <div className="text-sm">
                {esMovil && primero.potreros.length > 0 ? (
                  <>
                    <p className="font-medium">Lo que sigue: probá la Recorrida</p>
                    <p className="text-xs text-muted-foreground">
                      Potrero por potrero, pasto y agua, desde el celular y sin señal. Dibujar los
                      potreros sobre el satélite queda para cuando estés en la compu.
                    </p>
                  </>
                ) : esMovil ? (
                  <>
                    <p className="font-medium">Lo que sigue: cargar los potreros, desde la compu</p>
                    <p className="text-xs text-muted-foreground">
                      Número y hectáreas de cada uno. Mientras tanto, el Modo Campo ya está listo en
                      el celular.
                    </p>
                  </>
                ) : primero.potreros.length > 0 ? (
                  <>
                    <p className="font-medium">Lo que sigue: dibujar los potreros sobre el satélite</p>
                    <p className="text-xs text-muted-foreground">
                      Cinco minutos, en la compu. Elegís cada potrero de la lista y lo marcás.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Lo que sigue: cargar los potreros de {primero.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      Número y hectáreas de cada uno, desde Campos.
                      {primero.cabezas > 0
                        ? ` Después ubicás las ${primero.cabezas} cabezas en el suyo desde Hacienda.`
                        : ''}
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <Button
                className={BOTON_PRINCIPAL}
                onClick={() =>
                  entrar(
                    esMovil
                      ? primero.potreros.length > 0
                        ? '/campo/recorrida'
                        : '/campo'
                      : `/campos?campo=${primero.id}`,
                  )
                }
              >
                {esMovil
                  ? primero.potreros.length > 0
                    ? 'Probar la Recorrida'
                    : 'Ir al Modo Campo'
                  : primero.potreros.length > 0
                    ? 'Ir a dibujar mis potreros'
                    : 'Ir a cargar mis potreros'}
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
  existente = null,
}: {
  empresaId: string
  primero: boolean
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onBorrador: (b: Borrador['campo']) => void
  /** Se arrepintió de "otro campo": vuelve a la pregunta. */
  onVolver: () => void
  onListo: (c: CampoCargado) => void
  /** Volvió desde potreros a corregir: el campo ya existe, se actualiza. */
  existente?: CampoCargado | null
}) {
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoCampo>(existente?.tipo ?? 'propio')
  const [actividad, setActividad] = useState<ActividadCampo | null>(existente?.actividad ?? null)
  const [localidad, setLocalidad] = useState<Localidad | null>(
    existente
      ? { nombre: existente.localidad, provincia: existente.provincia, lat: existente.lat, lon: existente.lon }
      : null,
  )
  const [hectareas, setHectareas] = useState(existente ? String(existente.hectareas).replace('.', ',') : '')
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
      const ubicacion = {
        localidad: localidad.nombre,
        provincia: localidad.provincia,
        lat: localidad.lat,
        lon: localidad.lon,
      }
      const { id, colorIdx } = existente
        ? (await actualizarCampo({ id: existente.id, nombre: n, tipo, hectareas: ha, actividad, ubicacion }),
          { id: existente.id, colorIdx: existente.colorIdx })
        : await crearCampo({ empresaId, nombre: n, tipo, hectareas: ha, actividad, ubicacion })
      onListo({
        id,
        nombre: n,
        actividad,
        localidad: localidad.nombre,
        provincia: localidad.provincia,
        lat: localidad.lat,
        lon: localidad.lon,
        hectareas: ha,
        tipo,
        colorIdx,
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
        titulo={existente ? `Corregir ${existente.nombre}` : primero ? 'Tu primer campo' : 'Otro campo'}
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
              onBorrador({ nombre: e.target.value.trim(), hectareas: numeroDe(hectareas), actividad })
              setErrores((x) => ({ ...x, nombre: undefined }))
            }}
            placeholder="Ej: Don Gilberto"
            aria-invalid={!!errores.nombre}
            autoFocus
          />
          <ErrorCampo mensaje={errores.nombre} />
        </Reveal>

        <Reveal delay={0.18} className="grid gap-1.5">
          <Label>¿Qué actividad se hace en este campo?</Label>
          <div className="grid grid-cols-3 gap-2">
            {Constants.public.Enums.actividad_campo.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setActividad(a)
                  onBorrador({ nombre: nombre.trim(), hectareas: numeroDe(hectareas), actividad: a })
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
                  onBorrador({ nombre: nombre.trim(), hectareas: numeroDe(e.target.value), actividad })
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
            {ocupado ? 'Guardando…' : existente ? 'Guardar los cambios' : 'Guardar el campo'}
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
  onCorregirCampo,
  onListo,
}: {
  empresaId: string
  campo: CampoCargado
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onBorrador: (p: Borrador['potreros']) => void
  /** Se pasó de hectáreas: probablemente las del campo estaban mal. */
  onCorregirCampo: () => void
  onListo: (potreros: CampoCargado['potreros']) => void
}) {
  // Volviendo desde hacienda: los potreros ya existen y se editan (diff).
  const [filas, setFilas] = useState<FilaPotrero[]>(() =>
    campo.potreros.length > 0
      ? campo.potreros.map((p) => ({
          id: p.id,
          numero: p.nombre.replace(/\D/g, ''),
          hectareas: p.hectareas !== null ? String(p.hectareas).replace('.', ',') : '',
        }))
      : [{ numero: '1', hectareas: '' }],
  )
  const [error, setError] = useState<string | null>(null)
  // La letra del campo (A, B, C…): la misma que la DB le pone a cada potrero.
  const letra = colorDeCampo(campo.colorIdx).letra

  // Cada cambio de filas avisa al croquis de la escena.
  function cambiarFilas(fn: (fs: FilaPotrero[]) => FilaPotrero[]) {
    const next = fn(filas)
    setFilas(next)
    onBorrador(next.map((f) => ({ nombre: `${f.numero.trim() || '?'}${letra}`, hectareas: haDe(f) })))
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
      const letra = colorDeCampo(campo.colorIdx).letra
      const estadoCiclo = estadoInicialPorActividad(campo.actividad)
      // Los que ya existían y no están más en la lista: se borran (son
      // recién creados en este onboarding, sin historia).
      const vivos = new Set(filas.map((f) => f.id).filter(Boolean))
      for (const p of campo.potreros) if (!vivos.has(p.id)) await eliminarPotrero(p.id)
      for (const f of filas) {
        const hectareas = haDe(f)
        const numero = f.numero.trim()
        if (f.id) {
          // Se manda el número; la letra la fuerza el trigger de la DB.
          await actualizarPotrero({ id: f.id, nombre: numero, estadoCiclo, hectareas })
          creados.push({ id: f.id, nombre: `${numero}${letra}`, hectareas, cabezas: {} })
        } else {
          const { id, nombre } = await crearPotrero({ empresaId, campoId: campo.id, nombre: numero, estadoCiclo, hectareas })
          creados.push({ id, nombre, hectareas, cabezas: {} })
        }
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
            {excede && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                ¿Las hectáreas del campo estaban mal?
                <button
                  type="button"
                  onClick={onCorregirCampo}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-input px-2 font-medium text-foreground hover:border-ring"
                >
                  <ArrowLeft className="size-3" /> Corregir el campo
                </button>
              </p>
            )}
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
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={ocupado}
            onClick={onCorregirCampo}
          >
            <ArrowLeft className="size-4" /> Volver a los datos del campo
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

/**
 * Aviso de carga animal. Bloquea si supera lo que la base acepta por vez
 * (2.000) o si no cierra con las hectáreas (más de 10 por ha); avisa, sin
 * bloquear, entre 4 y 10 por ha.
 */
function avisoCarga(cabezas: number, hectareas: number | null): { texto: string; bloquea: boolean } | null {
  if (cabezas <= 0) return null
  if (cabezas > 2000)
    return {
      texto: `Hasta 2.000 por potrero de una vez. Las que sobren, después desde Hacienda.`,
      bloquea: true,
    }
  if (!hectareas) return null
  const porHa = cabezas / hectareas
  if (porHa > 10)
    return {
      texto: `${Math.round(porHa)} cabezas por hectárea no cierra (lo normal es cerca de 1). Revisá el número.`,
      bloquea: true,
    }
  if (porHa > 4)
    return {
      texto: `${Math.round(porHa)} por hectárea es mucho para ${hectareas.toLocaleString('es-AR')} ha. Si está bien, seguí.`,
      bloquea: false,
    }
  return null
}

function totalDeEspecie(c: Cantidades | undefined, e: Especie): number {
  return categoriasPorEspecie[e].reduce((s, cat) => s + (parseInt(c?.[cat] ?? '', 10) || 0), 0)
}

/** Los grupos de la grilla, en el mismo orden y con la misma marca que el croquis. */
const GRUPOS_ROL: { rol: RolAnimal; nombre: string }[] = [
  { rol: 'hembra', nombre: 'Vientres' },
  { rol: 'cria', nombre: 'Crías' },
  { rol: 'macho', nombre: 'Machos' },
]

function porCategoriaDe(c: Cantidades | undefined): CabezasPorCategoria {
  const out: CabezasPorCategoria = {}
  for (const [cat, v] of Object.entries(c ?? {}) as [Categoria, string][]) {
    const n = parseInt(v, 10) || 0
    if (n > 0) out[cat] = n
  }
  return out
}

function PasoHacienda({
  empresaId,
  campo,
  ocupado,
  setOcupado,
  onBorrador,
  onVolver,
  onListo,
}: {
  empresaId: string
  campo: CampoCargado
  ocupado: boolean
  setOcupado: (v: boolean) => void
  onBorrador: (cabezas: Record<string, CabezasPorCategoria>) => void
  /** Volver a los potreros para corregirlos (nada de hacienda guardada aún). */
  onVolver: () => void
  onListo: (cabezas: number, porPotrero: Record<string, CabezasPorCategoria>) => void
}) {
  // Cabezas por categoría, POR POTRERO: la hacienda vive en un lugar. Se
  // recorre un potrero por vez — fichas arriba, el activo abajo — y se
  // guarda todo junto al final. Sin potreros (los dejó para después), el
  // lugar es el campo entero: se guardan sin potrero, con el campo en el
  // contexto del alta, y las ubica después desde Hacienda.
  const campoEntero = campo.potreros.length === 0
  const potreros: CampoCargado['potreros'] = campoEntero
    ? [{ id: TODO_EL_CAMPO, nombre: campo.nombre, hectareas: campo.hectareas, cabezas: {} }]
    : campo.potreros
  const [porPotrero, setPorPotrero] = useState<Record<string, Cantidades>>(() => {
    // Revisando: arranca con lo que ya había cargado.
    const out: Record<string, Cantidades> = {}
    const aCant = (c: CabezasPorCategoria): Cantidades =>
      Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])) as Cantidades
    for (const p of campo.potreros) if (totalCabezas(p.cabezas) > 0) out[p.id] = aCant(p.cabezas)
    if (campo.sueltas && totalCabezas(campo.sueltas) > 0) out[TODO_EL_CAMPO] = aCant(campo.sueltas)
    return out
  })
  const [especieActiva, setEspecieActiva] = useState<Especie>('bovino')
  const [indice, setIndice] = useState(0)
  const [vistos, setVistos] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const actual = potreros[indice]!
  const cantActual = porPotrero[actual.id] ?? {}
  const totalActual = totalDe(cantActual)
  // Un número que no cierra con las hectáreas se avisa antes de guardar.
  // Referencia: en la pampa húmeda la carga ronda 1 cabeza/ha (INTA); diez
  // veces eso no pasa ni en un feedlot chico. Y la base carga hasta 2.000
  // por potrero por vez: más que eso se hace en dos tandas desde Hacienda.
  const avisoActual = avisoCarga(totalActual, actual.hectareas)
  const total = potreros.reduce((s, p) => s + totalDe(porPotrero[p.id]), 0)
  const esUltimo = indice === potreros.length - 1

  function irA(i: number) {
    setVistos((v) => (v.includes(actual.id) ? v : [...v, actual.id]))
    setIndice(i)
    setEspecieActiva('bovino')
    setError(null)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    // Enter o el botón: en un potrero intermedio pasa al siguiente; en el
    // último guarda todo.
    if (!esUltimo) {
      if (avisoActual?.bloquea) {
        setError(avisoActual.texto)
        return
      }
      irA(indice + 1)
      return
    }
    const bloqueado = potreros.find((p) => avisoCarga(totalDe(porPotrero[p.id]), p.hectareas)?.bloquea)
    if (bloqueado) {
      setError(`Potrero ${bloqueado.nombre}: ${avisoCarga(totalDe(porPotrero[bloqueado.id]), bloqueado.hectareas)!.texto}`)
      return
    }
    const totales = Object.fromEntries(potreros.map((p) => [p.id, porCategoriaDe(porPotrero[p.id])]))
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
        p_potrero_id: p.id === TODO_EL_CAMPO ? undefined : p.id,
        p_items: items,
        p_origen: 'onboarding',
        // Sin potrero, que quede dicho de qué campo son.
        p_contexto: p.id === TODO_EL_CAMPO ? { campo_id: campo.id, campo: campo.nombre } : undefined,
      })
      if (error) {
        setOcupado(false)
        setError(`${p.id === TODO_EL_CAMPO ? campo.nombre : `Potrero ${p.nombre}`}: ${error.message}`)
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
        subtitulo={
          campoEntero
            ? 'Tus animales: cuántas cabezas hay hoy en todo el campo. Cuando cargues los potreros, las ubicás en cada uno.'
            : 'Tus animales: cuántas cabezas hay hoy en cada potrero. Si está vacío, pasás al siguiente.'
        }
      />
      <form onSubmit={guardar} className="mt-5" noValidate>
        {/* Las fichas: dónde estoy, qué hice, cuánto llevo. */}
        <Reveal delay={0.14}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {campoEntero ? 'Todo el campo' : `Potrero ${indice + 1} de ${potreros.length}`}
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
          <div className={cn('mt-2.5 flex flex-wrap gap-1.5', campoEntero && 'hidden')}>
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
                  {campoEntero ? campo.nombre : `Potrero ${actual.nombre}`}
                  {actual.hectareas ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{ha(actual.hectareas)} ha</span>
                  ) : null}
                </p>
                {campoEntero ? (
                  <p className={cn('text-xs tabular-nums', totalActual > 0 ? 'font-medium text-primary' : 'text-muted-foreground')}>
                    {totalActual > 0 ? `${totalActual} ${totalActual === 1 ? 'cabeza' : 'cabezas'}` : 'Todavía vacío'}
                  </p>
                ) : totalActual === 0 ? (
                  <p className="text-xs text-muted-foreground">Todavía vacío</p>
                ) : null}
              </div>
              {/* Una especie por vez: pestañas con el conteo de cada una. Casi
                  todos cargan sólo vacunos; las otras están a un toque. */}
              <div className="mt-3 flex gap-1 rounded-lg bg-secondary p-1" role="tablist" aria-label="Especie">
                {ESPECIES.map((e) => {
                  const t = totalDeEspecie(cantActual, e)
                  const activa = especieActiva === e
                  return (
                    <button
                      key={e}
                      type="button"
                      role="tab"
                      aria-selected={activa}
                      onClick={() => setEspecieActiva(e)}
                      className={cn(
                        'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors',
                        activa ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span
                        className="inline-block size-2 rounded-full"
                        style={{ background: ESTILO_ESPECIE[e].color, opacity: activa || t > 0 ? 1 : 0.35 }}
                      />
                      {especieLabel[e]}s
                      {t > 0 && <span className="tabular-nums text-primary">{t}</span>}
                    </button>
                  )
                })}
              </div>

              {/* Las categorías, agrupadas como en el croquis: vientres · crías · machos. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={especieActiva}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="mt-3 grid gap-3"
                >
                  {GRUPOS_ROL.map(({ rol, nombre }) => {
                    const cats = categoriasPorEspecie[especieActiva].filter((c) => ROL_POR_CATEGORIA[c] === rol)
                    if (cats.length === 0) return null
                    return (
                      <div key={rol} className="grid gap-1.5">
                        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <svg width="16" height="12" viewBox="-11 -8 22 16" aria-hidden>
                            <MarcaCategoria categoria={cats[0]!} />
                          </svg>
                          {nombre}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {cats.map((c, k) => (
                            <label key={c} className="grid gap-1">
                              <span className="truncate text-xs text-muted-foreground">{categoriaLabel[c]}</span>
                              <Input
                                inputMode="numeric"
                                value={cantActual[c] ?? ''}
                                autoFocus={rol === 'hembra' && k === 0}
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
                                    Object.fromEntries(potreros.map((p) => [p.id, porCategoriaDe(next[p.id])])),
                                  )
                                }}
                                placeholder="0"
                                className="px-2.5 tabular-nums"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </Reveal>

        {error ? (
          <Aviso tono="error">{error}</Aviso>
        ) : avisoActual ? (
          <Aviso tono={avisoActual.bloquea ? 'error' : 'atencion'}>{avisoActual.texto}</Aviso>
        ) : null}
        <Reveal delay={0.22} className="mt-5 grid gap-2">
          <Button
            type="submit"
            disabled={ocupado || avisoActual?.bloquea}
            className={cn(BOTON_PRINCIPAL, avisoActual?.bloquea && 'opacity-50')}
          >
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
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={ocupado} onClick={onVolver}>
              <ArrowLeft className="size-4" /> {campoEntero ? 'Volver al campo' : 'Volver a los potreros'}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={ocupado} onClick={() => onListo(0, {})}>
              La completo después
            </Button>
          </div>
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
  empresa,
  campos,
  campoActual,
  borrador,
}: {
  etapa: Etapa
  empresa: string
  campos: CampoCargado[]
  campoActual: CampoCargado | null
  borrador: Borrador
}) {
  const ultimo = campos[campos.length - 1] ?? null
  const enCampo = etapa === 'campo' || etapa === 'potreros' || etapa === 'hacienda'

  // Qué dibuja el croquis según la etapa.
  const croquis: CampoCroquis =
    etapa === 'campo'
      ? {
          nombre: borrador.campo.nombre,
          hectareas: borrador.campo.hectareas,
          actividad: borrador.campo.actividad,
          potreros: [],
          estado: 'campo',
        }
      : etapa === 'potreros' && campoActual
        ? {
            nombre: campoActual.nombre,
            hectareas: campoActual.hectareas,
            actividad: campoActual.actividad,
            color: colorDeCampo(campoActual.colorIdx).hex,
            potreros: borrador.potreros.map((p, i) => ({
              clave: `${i}`,
              nombre: p.nombre,
              hectareas: p.hectareas,
              cabezas: {},
            })),
            estado: 'potreros',
          }
        : etapa === 'hacienda' && campoActual
          ? {
              nombre: campoActual.nombre,
              hectareas: campoActual.hectareas,
              actividad: campoActual.actividad,
              color: colorDeCampo(campoActual.colorIdx).hex,
              potreros: campoActual.potreros.map((p) => ({
                clave: p.id,
                nombre: p.nombre,
                hectareas: p.hectareas,
                cabezas: borrador.cabezas[p.id] ?? {},
              })),
              sueltas: borrador.cabezas[TODO_EL_CAMPO],
              estado: 'hacienda',
            }
          : ultimo
            ? {
                nombre: ultimo.nombre,
                hectareas: ultimo.hectareas,
                actividad: ultimo.actividad,
                color: colorDeCampo(ultimo.colorIdx).hex,
                potreros: ultimo.potreros.map((p) => ({
                  clave: p.id,
                  nombre: p.nombre,
                  hectareas: p.hectareas,
                  cabezas: p.cabezas,
                })),
                sueltas: ultimo.sueltas,
                estado: 'hecho',
              }
            : { nombre: etapa === 'empresa' ? 'Tu primer campo' : '', hectareas: null, actividad: null, potreros: [], estado: 'vacio' }

  const partes: { etapa: Etapa; nombre: string }[] = [
    { etapa: 'campo', nombre: 'Datos' },
    { etapa: 'potreros', nombre: 'Potreros' },
    ...(croquis.actividad === 'agricola' ? [] : [{ etapa: 'hacienda' as Etapa, nombre: 'Hacienda' }]),
  ]
  const indiceParte = partes.findIndex((p) => p.etapa === etapa)
  const cabezasCroquis =
    croquis.potreros.reduce((s, p) => s + totalCabezas(p.cabezas), 0) + totalCabezas(croquis.sueltas ?? {})
  // Leyenda agrupada por especie, con sus categorías en orden canónico.
  const porEspecieCroquis = ESPECIES.map((especie) => {
    const categorias = categoriasPorEspecie[especie]
      .map((c) => {
        const n = croquis.potreros.reduce((s, p) => s + (p.cabezas[c] ?? 0), 0) + (croquis.sueltas?.[c] ?? 0)
        return [c, n] as [Categoria, number]
      })
      .filter(([, n]) => n > 0)
    return { especie, total: categorias.reduce((s, [, n]) => s + n, 0), categorias }
  }).filter((e) => e.total > 0)
  const potrerosConHa = croquis.potreros.filter((p) => p.hectareas).length
  const nPotreros = croquis.estado === 'potreros' ? potrerosConHa : croquis.potreros.length
  const anteriores = campos.filter((c) => (enCampo ? true : c.id !== ultimo?.id))

  if (etapa === 'fin') return <EscenaFinal empresa={empresa} campos={campos} />

  return (
    <div className="w-full max-w-[520px]">
      <p className="font-heading text-[26px] font-semibold leading-tight tracking-tight lg:text-[30px]">
        Armemos tu campo.
      </p>
      <p className="mt-1 text-sm text-sidebar-foreground/60">
        {etapa === 'empresa' ? 'Unos minutos y estás adentro.' : 'Se va dibujando con lo que cargás.'}
      </p>

      {/* La ficha del campo: una sola pieza sobre la escena, nada suelto. */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-sidebar-foreground/10 bg-[#0b1a10]/70 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        {/* Encabezado: qué campo, qué actividad, en qué parte va. */}
        <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-sidebar-foreground/10 px-4 py-2.5">
          {(() => {
            const c = enCampo ? campoActual : ultimo
            return c ? (
              <span
                className="inline-flex size-6 items-center justify-center rounded-md text-[12px] font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                style={{ background: colorDeCampo(c.colorIdx).hex }}
                title={`Campo ${colorDeCampo(c.colorIdx).letra} · ${colorDeCampo(c.colorIdx).nombre}`}
              >
                {colorDeCampo(c.colorIdx).letra}
              </span>
            ) : null
          })()}
          <span className="font-semibold">
            {enCampo
              ? croquis.nombre || (campos.length === 0 ? 'Tu primer campo' : 'Otro campo')
              : ultimo
                ? ultimo.nombre
                : empresa || 'Tu empresa'}
          </span>
          <ChipActividad actividad={croquis.actividad} />
          {enCampo ? (
            <span className="ml-auto flex items-center gap-2.5 text-[13px]">
              {partes.map((p, i) => {
                const hecha = i < indiceParte
                const enCurso = i === indiceParte
                return (
                  <span
                    key={p.etapa}
                    className={cn(
                      'inline-flex items-center gap-1 transition-colors',
                      hecha && 'text-sidebar-foreground/70',
                      enCurso && 'font-semibold text-[#e9b45f]',
                      !hecha && !enCurso && 'text-sidebar-foreground/35',
                    )}
                  >
                    {hecha ? <Check className="size-3 text-primary" strokeWidth={3} /> : null}
                    {p.nombre}
                  </span>
                )
              })}
            </span>
          ) : ultimo ? (
            <span className="ml-auto text-[13px] text-sidebar-foreground/60">{ha(ultimo.hectareas)} ha</span>
          ) : null}
        </div>

        <div className="px-3 pt-3">
          <CroquisVivo campo={croquis} />
        </div>

        {/* Totales y leyenda: cifras grandes, categorías agrupadas por especie. */}
        <div className="px-4 pb-3.5 pt-2">
          <div className="flex items-baseline gap-5">
            <Cifra valor={croquis.hectareas ? ha(croquis.hectareas) : '—'} unidad="ha" />
            <Cifra valor={nPotreros > 0 ? String(nPotreros) : '—'} unidad={nPotreros === 1 ? 'potrero' : 'potreros'} />
            <Cifra
              valor={cabezasCroquis > 0 ? String(cabezasCroquis) : '—'}
              unidad={cabezasCroquis === 1 ? 'cabeza' : 'cabezas'}
              acento={cabezasCroquis > 0}
            />
          </div>
          {/* Una línea: la silueta y el total de cada especie. El detalle por
              categoría vive en la tarjeta, donde lo está cargando. */}
          {porEspecieCroquis.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-sidebar-foreground/10 pt-2.5 text-[13px]">
              {porEspecieCroquis.map(({ especie, total, categorias }) => (
                <li key={especie} className="inline-flex items-center gap-1.5 tabular-nums">
                  <svg width="20" height="14" viewBox="-11 -8 22 16" aria-hidden>
                    <MarcaCategoria categoria={categorias[0]![0]} />
                  </svg>
                  <span className="font-semibold">{total}</span>
                  <span className="text-sidebar-foreground/70">{ESTILO_ESPECIE[especie].nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Los campos ya terminados, cuando no son el que se ve. */}
      {anteriores.length > 0 && (
        <ol className="mt-3 flex flex-wrap gap-1.5">
          {anteriores.map((c) => (
            <li
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-sidebar-foreground/15 bg-[#0b1a10]/70 px-2.5 py-1 text-xs text-sidebar-foreground/85"
            >
              <span
                className="inline-flex size-4 items-center justify-center rounded text-[10px] font-bold text-white"
                style={{ background: colorDeCampo(c.colorIdx).hex }}
              >
                {colorDeCampo(c.colorIdx).letra}
              </span>
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

/** Una cifra de la ficha: número grande, unidad chica. */
function Cifra({ valor, unidad, acento = false }: { valor: string; unidad: string; acento?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <span className={cn('text-[19px] font-semibold leading-none', acento && 'text-[#e9b45f]')}>{valor}</span>
      <span className="text-[12px] text-sidebar-foreground/60">{unidad}</span>
    </span>
  )
}

/**
 * El progreso del onboarding, arriba de la tarjeta: un sendero con un hito
 * por paso y una luz que avanza. Arranca con "Tu cuenta" hecha — el
 * registro ya fue un paso, y verlo tildado es el empujón para seguir
 * (efecto de progreso regalado). Los hitos hechos se tildan; el actual
 * late; los que faltan quedan apagados.
 */
const TRAMOS: { etapa: Etapa | 'cuenta'; nombre: string }[] = [
  { etapa: 'cuenta', nombre: 'Tu cuenta' },
  { etapa: 'empresa', nombre: 'Empresa' },
  { etapa: 'campo', nombre: 'Campo' },
  { etapa: 'potreros', nombre: 'Potreros' },
  { etapa: 'hacienda', nombre: 'Hacienda' },
  { etapa: 'fin', nombre: 'Listo' },
]

function ProgresoOnboarding({ etapa }: { etapa: Etapa }) {
  // 'otro' (¿otro campo?) cuenta como hacienda terminada.
  const actual = etapa === 'otro' ? 'fin' : etapa
  const indice = Math.max(0, TRAMOS.findIndex((t) => t.etapa === actual))
  const terminado = etapa === 'fin'
  const hechos = terminado ? TRAMOS.length : indice
  const n = TRAMOS.length
  // Posición de la luz: sobre el hito actual (o al final).
  const pos = terminado ? 1 : indice / (n - 1)
  return (
    <div className="mb-5" aria-label={`Paso ${indice + 1} de ${n}`}>
      <div className="relative h-7">
        {/* El sendero */}
        <div className="absolute inset-x-[10px] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
        {/* Lo recorrido, con la luz al frente */}
        <motion.div
          className="absolute left-[10px] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary"
          initial={false}
          animate={{ width: `calc((100% - 20px) * ${pos})` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
        <motion.div
          aria-hidden
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_4px_rgba(31,122,71,0.18),0_0_14px_2px_rgba(31,122,71,0.45)]"
          initial={false}
          animate={{ left: `calc(10px + (100% - 20px) * ${pos})` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
        {/* Los hitos */}
        <ol className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
          {TRAMOS.map((t, i) => {
            const hecho = i < hechos
            const enCurso = !terminado && i === indice
            return (
              <li key={t.etapa} className="relative flex size-5 items-center justify-center">
                <motion.span
                  className={cn(
                    'flex items-center justify-center rounded-full transition-colors',
                    hecho
                      ? 'size-4 bg-primary text-white'
                      : enCurso
                        ? 'size-5 border-2 border-primary bg-card'
                        : 'size-2 bg-border',
                  )}
                  initial={false}
                  animate={enCurso ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                  transition={enCurso ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
                >
                  {hecho && <Check className="size-2.5" strokeWidth={3.5} />}
                </motion.span>
              </li>
            )
          })}
        </ol>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {terminado ? (
          <span className="font-medium text-primary">Todo listo</span>
        ) : (
          <>
            <span className="font-medium text-primary">
              {hechos === 1 ? 'Tu cuenta ya está' : `${hechos} de ${n} listos`}
            </span>
            {' · '}
            <span className="font-medium text-foreground">{TRAMOS[indice]!.nombre}</span>
            {indice + 1 < n ? ` · después ${TRAMOS[indice + 1]!.nombre.toLowerCase()}` : ''}
          </>
        )}
      </p>
    </div>
  )
}

/**
 * La escena del final: la EMPRESA, no el último campo. Cada campo con su
 * letra y color, en un mini croquis con su hacienda, entrando en cascada
 * bajo una lluvia de confeti. Es el "mirá todo lo que armaste".
 */
function EscenaFinal({ empresa, campos }: { empresa: string; campos: CampoCargado[] }) {
  const hectareas = campos.reduce((s, c) => s + c.hectareas, 0)
  const potreros = campos.reduce((s, c) => s + c.potreros.length, 0)
  const cabezas = campos.reduce((s, c) => s + c.cabezas, 0)
  return (
    <div className={cn('w-full', campos.length === 1 ? 'max-w-[520px]' : campos.length === 2 ? 'max-w-[640px]' : 'max-w-[760px]')}>
      {/* Cubre toda la escena (el panel es relative + overflow-hidden), no sólo la ficha. */}
      <div className="pointer-events-none absolute inset-0">
        <Confeti />
      </div>
      <motion.p
        className="font-heading text-[26px] font-semibold leading-tight tracking-tight lg:text-[30px]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        ¡{empresa} ya está en marcha!
      </motion.p>
      <p className="mt-1 text-sm text-sidebar-foreground/60">
        {campos.length === 1 ? 'Tu campo, dibujado con lo que cargaste.' : `Tus ${campos.length} campos, dibujados con lo que cargaste.`}
      </p>

      {/* La empresa en cifras, contando hacia arriba. */}
      <div className="mt-5 flex items-baseline gap-6">
        <span className="inline-flex items-baseline gap-1">
          <Contador valor={hectareas} className="text-[28px] font-semibold leading-none" />
          <span className="text-[12px] text-sidebar-foreground/60">ha</span>
        </span>
        <span className="inline-flex items-baseline gap-1">
          <Contador valor={potreros} className="text-[28px] font-semibold leading-none" />
          <span className="text-[12px] text-sidebar-foreground/60">{potreros === 1 ? 'potrero' : 'potreros'}</span>
        </span>
        {cabezas > 0 && (
          <span className="inline-flex items-baseline gap-1">
            <Contador valor={cabezas} className="text-[28px] font-semibold leading-none text-[#e9b45f]" />
            <span className="text-[12px] text-sidebar-foreground/60">{cabezas === 1 ? 'cabeza' : 'cabezas'}</span>
          </span>
        )}
      </div>

      {/* Cada campo, con su letra y color, en cascada. */}
      <ul
        className={cn(
          'mt-5 grid gap-3',
          campos.length === 2 && 'sm:grid-cols-2',
          campos.length >= 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {campos.map((c, i) => {
          const color = colorDeCampo(c.colorIdx)
          return (
            <motion.li
              key={c.id}
              className="overflow-hidden rounded-xl border border-sidebar-foreground/10 bg-[#0b1a10]/70 shadow-[0_12px_30px_rgba(0,0,0,0.3)] backdrop-blur-sm"
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.25 + i * 0.15 }}
            >
              <div className="flex items-center gap-2 border-b border-sidebar-foreground/10 px-3 py-2">
                <span
                  className="inline-flex size-5 items-center justify-center rounded text-[11px] font-bold text-white"
                  style={{ background: color.hex }}
                >
                  {color.letra}
                </span>
                <span className="truncate text-sm font-semibold">{c.nombre}</span>
                <span className="ml-auto shrink-0 text-[11px] text-sidebar-foreground/60">{ha(c.hectareas)} ha</span>
              </div>
              <div className="px-2 pt-2">
                <CroquisVivo
                  campo={{
                    nombre: c.nombre,
                    hectareas: c.hectareas,
                    actividad: c.actividad,
                    color: color.hex,
                    potreros: c.potreros.map((p) => ({ clave: p.id, nombre: p.nombre, hectareas: p.hectareas, cabezas: p.cabezas })),
                    sueltas: c.sueltas,
                    estado: 'hecho',
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1.5">
                <p className="text-[11px] text-sidebar-foreground/60">
                  {c.potreros.length > 0 ? `${c.potreros.length} ${c.potreros.length === 1 ? 'potrero' : 'potreros'}` : 'sin potreros todavía'}
                  {c.cabezas > 0 ? ` · ${c.cabezas} cabezas` : ''}
                </p>
                <ChipActividad actividad={c.actividad} />
              </div>
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Una fila del cierre: el campo, lo que cargó y el clima de hoy en SU
 * localidad — cada campo consulta el suyo, porque el clima es por campo.
 */
function CampoAlFinal({ campo, indice }: { campo: CampoCargado; indice: number }) {
  const clima = useClima({ nombre: campo.nombre, lat: campo.lat, lon: campo.lon })
  const color = colorDeCampo(campo.colorIdx)
  return (
    <motion.li
      className="flex items-center gap-3 px-3.5 py-2.5"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.65 + indice * 0.12 }}
    >
      <span
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
        style={{ background: color.hex }}
      >
        {color.letra}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {campo.nombre} <span className="font-normal text-muted-foreground">· {campo.localidad}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {ha(campo.hectareas)} ha
          {campo.potreros.length > 0
            ? ` · ${campo.potreros.length} ${campo.potreros.length === 1 ? 'potrero' : 'potreros'}`
            : ' · sin potreros todavía'}
          {campo.cabezas > 0 ? ` · ${campo.cabezas} cabezas` : ''}
        </p>
      </div>
      {clima.data ? (
        <div className="flex shrink-0 items-center gap-2" title={clima.data.descripcion}>
          {clima.data.helada ? (
            <Snowflake className="size-4 text-sky" />
          ) : clima.data.lluviaProb >= 30 ? (
            <Droplets className="size-4 text-sky" />
          ) : (
            <WmoIcon code={clima.data.code} className="size-6 text-accent" />
          )}
          <p className="text-right leading-tight">
            <span className="text-[15px] font-semibold tabular-nums">{clima.data.temp}°</span>
            <span className="block text-[11px] tabular-nums text-muted-foreground">
              {clima.data.max}° / {clima.data.min}°
            </span>
          </p>
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground">{clima.isLoading ? 'clima…' : ''}</span>
      )}
    </motion.li>
  )
}

/**
 * Un aviso con forma: ícono, fondo suave y borde del tono. Reemplaza al
 * texto rojo suelto — un número que no cierra merece una tarjeta que se
 * lea, no una línea que asuste.
 */
function Aviso({ tono, children }: { tono: 'error' | 'atencion'; children: ReactNode }) {
  const Icono = tono === 'error' ? OctagonAlert : TriangleAlert
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      role={tono === 'error' ? 'alert' : 'status'}
      className={cn(
        'mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-snug',
        tono === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-amber-300/70 bg-amber-50 text-amber-800',
      )}
    >
      <Icono className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <span>{children}</span>
    </motion.div>
  )
}

/** Qué se hace en el campo, con su ícono: aparece apenas lo elige y queda. */
function ChipActividad({ actividad }: { actividad: ActividadCampo | null }) {
  if (!actividad) return null
  return (
    <motion.span
      key={actividad}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className="inline-flex items-center gap-1 self-center rounded-full border border-[#e9b45f]/40 bg-[#e9b45f]/10 px-2 py-0.5 text-[11px] font-semibold text-[#e9b45f]"
    >
      {actividad !== 'agricola' && <Beef className="size-3" strokeWidth={2} />}
      {actividad !== 'ganadera' && <Wheat className="size-3" strokeWidth={2} />}
      Actividad {actividadLabel[actividad].toLowerCase()}
    </motion.span>
  )
}
