import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Beef,
  Building2,
  Check,
  Droplets,
  Footprints,
  Grid2x2,
  House,
  OctagonAlert,
  TriangleAlert,
  LandPlot,
  Loader2,
  PencilRuler,
  Plus,
  Snowflake,
  Sprout,
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
import { RevealMudo } from '@/features/auth/reveal-mudo'
import { borrarProgreso, guardarProgreso, leerProgreso } from '@/features/onboarding/progreso'
import {
  actualizarActividadCampo,
  actualizarCampo,
  actualizarPotrero,
  actualizarPotreroMapa,
  crearCampo,
  crearPotrero,
  eliminarPotrero,
  type ActividadCampo,
} from '@/features/campos/api'
import { borrarAltaOnboarding, borrarAltaOnboardingSinPotrero } from '@/features/hacienda/api'
import { colorDeCampo, usoToEstadoCiclo, type Uso } from '@/features/campos/use-campo-mapa'
import { useIsMobile } from '@/lib/use-is-mobile'
import { actividadDeUsos, actividadLabel } from '@/features/campos/labels'
import { LocalidadInput } from '@/features/campos/localidad-input'
import { CroquisVivo, MarcaCategoria, MarcaCultivo, type CampoCroquis } from '@/features/onboarding/croquis-vivo'
import { CULTIVOS } from '@/features/onboarding/cultivos-croquis'
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
  categoriaPlural,
  categoriasPorEspecie,
  especieLabel,
  type Especie,
} from '@/features/hacienda/labels'
import { RECEPTIVIDAD, evDeCabezas } from '@/features/hacienda/carga-animal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/supabase/types'
import type { Localidad } from '@/lib/geocoding'
import { cn } from '@/lib/utils'

type TipoCampo = Database['public']['Enums']['tipo_campo']
type Categoria = Database['public']['Enums']['categoria_animal']

/** Un campo ya cargado en este onboarding (para el mapa y el resumen). */
type CampoCargado = {
  id: string
  nombre: string
  /** Sale de lo que hay en sus potreros (ver `actividadDeUsos`); null hasta saberlo. */
  actividad: ActividadCampo | null
  localidad: string
  provincia: string
  lat: number
  lon: number
  hectareas: number
  tipo: TipoCampo
  /** Índice del campo en la empresa (trigger de la DB): letra A/B/C y color. */
  colorIdx: number
  potreros: PotreroCargado[]
  /** Hacienda cargada sin potrero (el campo entero). */
  sueltas?: CabezasPorCategoria
  cabezas: number
}

/** Qué hay hoy en el potrero: hacienda, sembrado (y con qué) o nada. `null`
 *  hasta que el productor lo elige: no se presupone ninguno. */
type UsoPotrero = { uso: Uso | null; cultivo: string | null }
type PotreroCargado = {
  id: string
  nombre: string
  hectareas: number | null
  cabezas: CabezasPorCategoria
} & UsoPotrero
/** Un potrero recién creado no tiene nada elegido: lo dice el productor. */
const USO_INICIAL: UsoPotrero = { uso: null, cultivo: null }

// El campo del onboarding lleva la letra de su orden (A, B, C… la pone la
// DB). El NÚMERO sí lo elige el productor (hay quien ya tiene su numeración).
type FilaPotrero = { id?: string; numero: string; hectareas: string }

type Etapa = 'empresa' | 'campo' | 'potreros' | 'hacienda' | 'otro' | 'fin'

/** Lo que se guarda para retomar tras recargar (ver `progreso`). */
type Progreso = {
  etapa: Etapa
  nombreEmpresa: string
  empresaId: string
  campos: CampoCargado[]
  campoActual: CampoCargado | null
  corrigiendo: boolean
}

/**
 * Lo que se está escribiendo AHORA, antes de guardar: el croquis de la
 * escena lo dibuja en vivo. Cada paso avisa con cada tecla.
 */
type Borrador = {
  campo: { nombre: string; hectareas: number | null }
  /** `id` si el potrero ya existe: el croquis le pone lo que tiene adentro. */
  potreros: { id?: string; nombre: string; hectareas: number | null }[]
  /** Por potrero, cabezas por especie: el croquis las dibuja distinto. */
  cabezas: Record<string, CabezasPorCategoria>
  /** Por potrero, qué hay: el croquis pinta surcos donde está sembrado. */
  usos: Record<string, UsoPotrero>
  /** El potrero que se está cargando: el croquis lo resalta. */
  activo?: string
}
/** Clave del pseudo-potrero "todo el campo" en la hacienda sin potreros. */
const TODO_EL_CAMPO = '__campo__'

const BORRADOR_VACIO: Borrador = {
  campo: { nombre: '', hectareas: null },
  potreros: [],
  cabezas: {},
  usos: {},
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
  // Llegó recién del registro: la escena ya estaba en pantalla, así que no
  // vuelve a entrar y la tarjeta sube suave — sin un segundo tractor a
  // segundos del primero.
  const desdeRegistro = !!(useLocation().state as { desdeRegistro?: boolean } | null)?.desdeRegistro

  // Recargó a mitad del onboarding: retoma donde estaba (ver `progreso`).
  const [guardado] = useState(() => leerProgreso<Progreso>(user?.id))
  const [etapa, setEtapa] = useState<Etapa>(guardado?.etapa ?? 'empresa')
  // Hacia dónde va el cambio de paso: adelante entra desde la derecha,
  // atrás desde la izquierda. Da orientación sin decir nada.
  const [direccion, setDireccion] = useState<1 | -1>(1)
  function ir(sig: Etapa) {
    setDireccion(direccionEntre(etapa, sig))
    setEtapa(sig)
  }
  const [ocupado, setOcupado] = useState(false)
  // Se va a la app: la pantalla se funde antes del cambio (ver `entrar`).
  const [yendo, setYendo] = useState(false)

  // Empresa
  const [nombreEmpresa, setNombreEmpresa] = useState(() => {
    if (guardado) return guardado.nombreEmpresa
    const apellido = (user?.user_metadata as { apellido?: string } | undefined)
      ?.apellido
    return apellido ? `${apellido} Agro` : ''
  })
  const [errorEmpresa, setErrorEmpresa] = useState<string | null>(null)
  const [empresaId, setEmpresaId] = useState<string | null>(guardado?.empresaId ?? null)

  // Campos ya cargados + el que se está cargando
  const [campos, setCampos] = useState<CampoCargado[]>(guardado?.campos ?? [])
  const [campoActual, setCampoActual] = useState<CampoCargado | null>(guardado?.campoActual ?? null)
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO)
  // Volvió de potreros a corregir el campo (se pasó de hectáreas, etc.).
  const [corrigiendo, setCorrigiendo] = useState(guardado?.corrigiendo ?? false)

  // Cada cambio de paso queda guardado: recargar vuelve acá, no a la app.
  useEffect(() => {
    if (!empresaId) return
    guardarProgreso(user?.id, { etapa, nombreEmpresa, empresaId, campos, campoActual, corrigiendo } satisfies Progreso)
  }, [user?.id, etapa, nombreEmpresa, empresaId, campos, campoActual, corrigiendo])

  // Al cambiar de paso, arriba de todo. En el INSTANTE en que el paso viejo
  // ya salió y el nuevo todavía no se ve (0,19 s): así no se ve saltar. En el
  // teléfono, suave: el croquis está sobre la tarjeta y ver cómo quedó lo
  // que acaba de cargar es el premio.
  useEffect(() => {
    const t = window.setTimeout(() => {
      document
        .querySelector<HTMLElement>('[data-auth-scroll]')
        // 'instant', no 'auto': el contenedor tiene scroll-smooth en el CSS y
        // 'auto' lo respeta — la vuelta arriba se veía deslizarse sobre el
        // paso nuevo.
        ?.scrollTo({ top: 0, behavior: esMovil ? 'smooth' : 'instant' })
    }, 190)
    return () => window.clearTimeout(t)
  }, [etapa, esMovil])
  // El campo por el que sigue: el primero que tiene potreros (si ninguno,
  // el primero cargado). Nunca "el primero" como si fuera toda la empresa.
  const primero = campos.find((c) => c.potreros.length > 0) ?? campos[0]

  // Si ya pertenece a una empresa y no la creó en este wizard (ni tiene un
  // onboarding a medias de esa misma empresa), no va acá.
  if (!isLoading && membresia && (!empresaId || membresia.empresa_id !== empresaId)) {
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
    ir('campo')
  }

  /**
   * "Revisar" el último campo desde ¿Otro campo?: su hacienda ya está
   * guardada, así que se deshace el alta del onboarding (sólo esos
   * animales) y se vuelve a qué hay en cada potrero, con los potreros y lo
   * sembrado intactos (se reescriben al volver a guardar).
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
      ir('hacienda')
    } finally {
      setOcupado(false)
    }
  }

  async function entrar(destino: string) {
    if (yendo) return
    // Terminó: ya no hay onboarding que retomar.
    borrarProgreso(user?.id)
    // La pantalla se desvanece MIENTRAS se refrescan los datos (el guard
    // RequireEmpresa ve la membresía nueva y las secciones arrancan con la
    // empresa creada), y la app entra con un fundido. Antes el cambio era un
    // corte seco: el onboarding desaparecía y la app estaba ahí de golpe.
    setYendo(true)
    await Promise.all([qc.invalidateQueries(), new Promise((r) => window.setTimeout(r, 450))])
    navigate(destino, { replace: true, state: { bienvenida: true } })
  }

  if (isLoading) {
    // Dentro del mismo marco, no un "Cargando…" suelto en una pantalla vacía.
    return (
      <AuthLayout continua={desdeRegistro}>
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      </AuthLayout>
    )
  }

  const empresa = nombreEmpresa.trim()

  return (
    <AuthLayout
      // El tractor remolca la tarjeta sólo al abrir y al cerrar; los pasos
      // del medio entran callados. `ciclo` vuelve a montarla para que el
      // remolque se repita en el festejo.
      entrada={(etapa === 'empresa' && !desdeRegistro) || etapa === 'fin' ? 'tractor' : 'suave'}
      continua={desdeRegistro}
      desvanecer={yendo}
      // La tarjeta se monta una vez para todo el armado; sólo el festejo la
      // vuelve a montar (y el tractor la trae de nuevo).
      ciclo={etapa === 'fin' ? 'fin' : 'armado'}
      // La pista de scroll donde la tarjeta puede ser más alta que la pantalla.
      pistaDeScroll={etapa === 'fin' || etapa === 'hacienda'}
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
      <ProgresoOnboarding
        etapa={etapa}
        // Al terminar, la salida secundaria va ARRIBA, a la vista: al pie de
        // la tarjeta quedaba abajo del pliegue y nadie sabía que existía.
        accion={
          etapa === 'fin' ? (
            <button
              type="button"
              onClick={() => void entrar('/')}
              // Un botón de verdad (borde, ícono, letra oscura): como texto
              // gris no se veía.
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <House className="size-3.5" strokeWidth={2.25} />
              Ver el inicio
            </button>
          ) : null
        }
      />
      <AnimatePresence mode="wait" custom={direccion} initial={false}>
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
                <Button type="submit" disabled={ocupado} className={cn(BOTON_PRINCIPAL, ocupado && OCUPADO)}>
                  {ocupado ? <Guardando>Creando</Guardando> : 'Crear mi empresa'}
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
                ir(corrigiendo ? 'potreros' : 'otro')
              }}
              onListo={(c) => {
                setBorrador(BORRADOR_VACIO)
                setCorrigiendo(false)
                setCampoActual(c)
                ir('potreros')
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
                ir('campo')
              }}
              onListo={(potreros) => {
                setBorrador(BORRADOR_VACIO)
                setCampoActual({ ...campoActual, potreros })
                // Siempre sigue a qué hay en cada potrero: ahí se dice si
                // tiene hacienda o está sembrado. Sin potreros igual se pide
                // la hacienda: las cabezas son el dato que más vale, y
                // después las ubica desde Hacienda.
                ir('hacienda')
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
              onBorrador={(cabezas, usos, activo) => setBorrador({ ...BORRADOR_VACIO, cabezas, usos, activo })}
              onVolver={(porPotrero, usos) => {
                setBorrador(BORRADOR_VACIO)
                // Lo tipeado sin guardar viaja con el campo: al volver a
                // entrar está todo como lo dejó.
                setCampoActual({
                  ...campoActual,
                  potreros: campoActual.potreros.map((p) => ({
                    ...p,
                    ...(usos[p.id] ?? {}),
                    cabezas: porPotrero[p.id] ?? {},
                  })),
                  sueltas: porPotrero[TODO_EL_CAMPO],
                })
                if (campoActual.potreros.length === 0) {
                  setCorrigiendo(true)
                  ir('campo')
                } else {
                  ir('potreros')
                }
              }}
              onListo={(cabezas, porPotrero, usos, actividad) => {
                setBorrador(BORRADOR_VACIO)
                setCampos((xs) => [
                  ...xs,
                  {
                    ...campoActual,
                    actividad,
                    cabezas,
                    potreros: campoActual.potreros.map((p) => ({
                      ...p,
                      // Lo que no se tocó ("La completo después") queda como estaba.
                      ...(usos[p.id] ?? {}),
                      cabezas: porPotrero[p.id] ?? {},
                    })),
                    sueltas: porPotrero[TODO_EL_CAMPO],
                  },
                ])
                setCampoActual(null)
                ir('otro')
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
              <Button className={BOTON_PRINCIPAL} onClick={() => ir('campo')}>
                Sí, cargar otro campo
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full text-[15px] font-semibold"
                onClick={() => ir('fin')}
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
            {/* Encabezado en una fila: el sello al lado del título. Apilado
                ocupaba 150 px y empujaba "Lo que sigue" abajo del pliegue. */}
            <div className="mt-1 flex items-center gap-3.5">
              <SelloListo chico />
              <div className="min-w-0">
                <motion.h1
                  className="text-[22px] leading-tight font-bold tracking-tight"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  ¡Listo, {empresa}!
                </motion.h1>
                <motion.p
                  className="mt-0.5 text-sm text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45 }}
                >
                  {campos.length === 1 ? 'Tu cuenta y tu campo, listos.' : `Tu cuenta y tus ${campos.length} campos, listos.`}
                </motion.p>
              </div>
            </div>

            {/* Lo que cargó, campo por campo con su clima: ver su campo armado
                también es activación. Los totales (ha · potreros · cabezas) ya
                están grandes en la escena de al lado: repetirlos sólo hacía
                que la tarjeta no entrara en la pantalla. */}
            {/* Valor ya, no promesa: cada campo con SU clima de hoy. */}
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
              {campos.map((c, i) => (
                <CampoAlFinal key={c.id} campo={c} indice={i} />
              ))}
            </ul>
            {/* LO QUE SIGUE, con su dibujo, después de lo que cargó. Si queda
                abajo del pliegue, la pista de scroll lo anuncia. */}
            <SiguientePaso
              variante={esMovil && primero.potreros.length > 0 ? 'recorrer' : 'dibujar'}
              color={colorDeCampo(primero.colorIdx).hex}
              letra={colorDeCampo(primero.colorIdx).letra}
              // Con varios campos se habla de todos: nombrar sólo el primero
              // parecía que los demás no contaban.
              titulo={
                esMovil && primero.potreros.length > 0
                  ? campos.length > 1
                    ? 'Salí a recorrer tus campos'
                    : `Salí a recorrer ${primero.nombre}`
                  : primero.potreros.length > 0
                    ? campos.length > 1
                      ? `Tus ${campos.length} campos, potrero por potrero, sobre el satélite`
                      : `${primero.nombre}, potrero por potrero, sobre el satélite`
                    : `Los potreros de ${primero.nombre}`
              }
              texto={
                esMovil && primero.potreros.length > 0
                  ? 'Pasto y agua de cada potrero, desde el celular y sin señal.'
                  : esMovil
                    ? 'Número y hectáreas de cada uno, desde la compu. El Modo Campo ya está listo en el celular.'
                    : primero.potreros.length > 0
                      ? campos.length > 1
                        ? `Elegís cada potrero y marcás sus esquinas. Arrancás por ${primero.nombre} y pasás de un campo al otro desde la lista.`
                        : 'Elegís cada potrero de la lista y marcás sus esquinas.'
                      : `Número y hectáreas de cada uno, desde Campos.${
                          primero.cabezas > 0 ? ` Después las ${primero.cabezas} cabezas van cada una a su potrero.` : ''
                        }`
              }
              etiqueta={esMovil && primero.potreros.length > 0 ? 'Sin señal' : esMovil ? 'En la compu' : '5 minutos'}
            >
              <BotonCierre
                icono={esMovil && primero.potreros.length > 0 ? Footprints : PencilRuler}
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
              </BotonCierre>
            </SiguientePaso>

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
  const [localidad, setLocalidad] = useState<Localidad | null>(
    existente
      ? { nombre: existente.localidad, provincia: existente.provincia, lat: existente.lat, lon: existente.lon }
      : null,
  )
  const [hectareas, setHectareas] = useState(existente ? String(existente.hectareas).replace('.', ',') : '')
  const [errores, setErrores] = useState<{
    nombre?: string
    localidad?: string
    hectareas?: string
    general?: string
  }>({})

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errores = {}
    const n = nombre.trim()
    if (n.length < 2) errs.nombre = 'Falta el nombre'
    if (!localidad) errs.localidad = 'Elegí la localidad de la lista'
    // Obligatorias: de acá sale la cuenta de los potreros.
    const ha = numeroDe(hectareas)
    if (ha === null) errs.hectareas = 'Necesitamos las hectáreas'
    else if (!Number.isFinite(ha) || ha <= 0) errs.hectareas = 'Un número mayor que cero'
    setErrores(errs)
    if (Object.keys(errs).length || !localidad || ha === null) return

    setOcupado(true)
    try {
      const ubicacion = {
        localidad: localidad.nombre,
        provincia: localidad.provincia,
        lat: localidad.lat,
        lon: localidad.lon,
      }
      // La actividad no se pregunta: sale de los potreros. Corrigiendo, se
      // conserva la que ya tenía (actualizarCampo la reescribe).
      const actividad = existente?.actividad ?? null
      const { id, colorIdx } = existente
        ? (await actualizarCampo({ id: existente.id, nombre: n, tipo, hectareas: ha, actividad, ubicacion }),
          { id: existente.id, colorIdx: existente.colorIdx })
        : await crearCampo({ empresaId, nombre: n, tipo, hectareas: ha, ubicacion })
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
        // Corrigiendo, los potreros ya guardados siguen siendo suyos: si se
        // perdían acá, el paso siguiente los volvía a crear (duplicados).
        potreros: existente?.potreros ?? [],
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
      {!primero && (
        <VolverArriba onClick={onVolver} disabled={ocupado}>
          Volver
        </VolverArriba>
      )}
      <AuthHeading
        icono={LandPlot}
        titulo={existente ? `Corregir ${existente.nombre}` : primero ? 'Tu primer campo' : 'Otro campo'}
        subtitulo="Cómo se llama, dónde está y cuántas hectáreas tiene."
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
            ayuda="El pueblo más cercano al campo, no tu domicilio."
          />
          <ErrorCampo mensaje={errores.localidad} />
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
                  const v = soloDecimal(e.target.value)
                  setHectareas(v)
                  onBorrador({ nombre: nombre.trim(), hectareas: numeroDe(v) })
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
          <Button type="submit" disabled={ocupado} className={cn(BOTON_PRINCIPAL, ocupado && OCUPADO)}>
            {ocupado ? <Guardando /> : existente ? 'Guardar los cambios' : 'Guardar el campo'}
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
  function avisarCroquis(fs: FilaPotrero[]) {
    onBorrador(fs.map((f) => ({ id: f.id, nombre: `${f.numero.trim() || '?'}${letra}`, hectareas: haDe(f) })))
  }
  function cambiarFilas(fn: (fs: FilaPotrero[]) => FilaPotrero[]) {
    const next = fn(filas)
    setFilas(next)
    avisarCroquis(next)
  }
  // Volviendo con potreros ya cargados, el croquis los muestra desde que
  // entra — no recién cuando toca una fila (antes quedaba vacío).
  useEffect(() => {
    if (campo.potreros.length > 0) avisarCroquis(filas)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al entrar
  }, [])

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

  // Qué falta, en DOS piezas. El titular va al lado de la barra y tiene que
  // ser corto: cuando decía "Faltan 57 ha · hay potreros sin hectáreas" en un
  // renglón, el número de la izquierda se partía en dos líneas y la fila
  // quedaba desalineada. La aclaración baja abajo, que es su lugar.
  const estado = repetido
    ? `El potrero ${repetido} está dos veces`
    : completo
      ? '¡Completo!'
      : excede
        ? `Se pasan ${ha(redondear1(-diferencia))} ha`
        : sumaHa === 0
          ? 'Las hectáreas de cada potrero'
          : `Faltan ${ha(diferencia)} ha`
  const nota = !repetido && !completo && sumaHa > 0 && !filasValidas ? 'Hay potreros sin hectáreas' : null

  // Lo que le falta al formulario para poder guardar, dicho en el botón. Un
  // botón gris sin explicación se lee como que la app se trabó; diciendo qué
  // falta, el gris es una consecuencia y no un misterio.
  const faltaParaGuardar = repetido
    ? `El potrero ${repetido} está dos veces`
    : excede
      ? `Se pasan ${ha(redondear1(-diferencia))} ha`
      : !filasValidas
        ? 'Completá las hectáreas'
        : `Faltan ${ha(diferencia)} ha`

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!listo) return
    setError(null)
    setOcupado(true)
    try {
      const creados: CampoCargado['potreros'] = []
      const letra = colorDeCampo(campo.colorIdx).letra
      // Los que ya existían y no están más en la lista: se borran (son
      // recién creados en este onboarding, sin historia).
      const vivos = new Set(filas.map((f) => f.id).filter(Boolean))
      for (const p of campo.potreros) if (!vivos.has(p.id)) await eliminarPotrero(p.id)
      for (const f of filas) {
        const hectareas = haDe(f)
        const numero = f.numero.trim()
        if (f.id) {
          // Lo que ya se dijo que hay (hacienda, sembrado) se conserva: acá
          // sólo se corrigen número y hectáreas.
          const prev = campo.potreros.find((p) => p.id === f.id)
          const uso: UsoPotrero = prev ? { uso: prev.uso, cultivo: prev.cultivo } : USO_INICIAL
          // Se manda el número; la letra la fuerza el trigger de la DB.
          await actualizarPotrero({
            id: f.id,
            nombre: numero,
            estadoCiclo: usoToEstadoCiclo(uso.uso ?? 'ganadero', 'ganadero'),
            hectareas,
          })
          // Las cabezas tipeadas también: sin esto, volver a los potreros y
          // guardar de nuevo dejaba la hacienda en blanco.
          creados.push({ id: f.id, nombre: `${numero}${letra}`, hectareas, cabezas: prev?.cabezas ?? {}, ...uso })
        } else {
          const { id, nombre } = await crearPotrero({
            empresaId,
            campoId: campo.id,
            nombre: numero,
            estadoCiclo: 'ganadero',
            hectareas,
          })
          creados.push({ id, nombre, hectareas, cabezas: {}, ...USO_INICIAL })
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
      <VolverArriba onClick={onCorregirCampo} disabled={ocupado}>
        Los datos de {campo.nombre}
      </VolverArriba>
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
                        fs.map((f, j) =>
                          j === i ? { ...f, hectareas: soloDecimal(e.target.value) } : f,
                        ),
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
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
              <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
                {ha(sumaHa)} <span className="font-normal text-muted-foreground">de {ha(totalCampo)} ha</span>
              </span>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 text-right font-medium whitespace-nowrap tabular-nums',
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
            {nota && <p className="mt-1.5 text-[11px] text-muted-foreground">{nota}</p>}
          </div>
        </Reveal>

        {error && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <Reveal delay={0.26} className="mt-5 grid gap-2">
          <Button type="submit" disabled={ocupado || !listo} className={cn(BOTON_PRINCIPAL, ocupado && OCUPADO)}>
            {ocupado
              ? <Guardando />
              : listo
                ? `Guardar ${filas.length === 1 ? 'el potrero' : `los ${filas.length} potreros`}`
                : faltaParaGuardar}
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

/**
 * Lo que se deja tipear en hectáreas: dígitos y UNA coma decimal. El punto se
 * acepta y se convierte —el teclado numérico del teléfono da punto, no coma—
 * y los ceros a la izquierda se caen solos, para que no exista "020 ha".
 * Se filtra al tipear y no al validar: un campo que no acepta la letra no
 * necesita después explicar por qué la rechaza.
 */
function soloDecimal(texto: string): string {
  const limpio = texto.replace(/[^\d,.]/g, '').replace(/\./g, ',')
  const [ent = '', ...resto] = limpio.split(',')
  const entero = ent.replace(/^0+(?=\d)/, '')
  return resto.length > 0 ? `${entero},${resto.join('').slice(0, 2)}` : entero
}

/** Lo que se deja tipear en un conteo de cabezas: dígitos, sin "09". */
function soloEntero(texto: string): string {
  return texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
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
 * (2.000) o si la carga es imposible; avisa, sin bloquear, cuando pasa lo que
 * rinde un campo natural. La cuenta va en EQUIVALENTE VACA y no en cabezas:
 * una oveja come la sexta parte que una vaca y un caballo un 20 % más, así
 * que "3 por hectárea" no quiere decir nada sin saber de qué animal se habla.
 * La tabla y las fuentes están en `@/features/hacienda/carga-animal`. El EV
 * queda del lado del código: en pantalla se dice en vacas, porque el que
 * recién empieza no tiene por qué saber qué es un equivalente vaca.
 */
function avisoCarga(
  cant: Cantidades | undefined,
  hectareas: number | null,
): { texto: string; bloquea: boolean } | null {
  const cabezas = totalDe(cant)
  if (cabezas <= 0) return null
  // Tope de la carga masiva, no del campo: es cuántas filas escribe la RPC
  // de una vez, y por eso se mide en cabezas y no en EV.
  if (cabezas > 2000)
    return {
      texto: `Hasta 2.000 por potrero de una vez. Las que sobren, después desde Hacienda.`,
      bloquea: true,
    }
  if (!hectareas) return null
  const ev = evDeCabezas(porCategoriaDe(cant))
  const evHa = ev / hectareas
  if (evHa > RECEPTIVIDAD.pasturaImplantada * 2)
    return { texto: `Para ${ha(hectareas)} ha parecen demasiados. ¿Lo revisás?`, bloquea: true }
  if (evHa > RECEPTIVIDAD.campoNatural.max)
    return { texto: `Para ${ha(hectareas)} ha son bastantes. Fijate si está bien.`, bloquea: false }
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

const OPCIONES_USO: { uso: Uso; nombre: string; Icono: typeof Beef }[] = [
  { uso: 'ganadero', nombre: 'Hacienda', Icono: Beef },
  { uso: 'agricola', nombre: 'Sembrado', Icono: Sprout },
  { uso: 'vacio', nombre: 'Vacío', Icono: Grid2x2 },
]

function faltaCultivo(u: UsoPotrero | undefined): boolean {
  return u?.uso === 'agricola' && !u.cultivo?.trim()
}

/** Lo que le falta a un potrero para poder seguir: qué hay, o con qué está sembrado. */
function faltaEn(u: UsoPotrero | undefined): 'uso' | 'cultivo' | null {
  if (!u?.uso) return 'uso'
  return faltaCultivo(u) ? 'cultivo' : null
}

/**
 * Qué hay hoy en cada potrero. La actividad NO se pregunta por campo: en un
 * campo mixto ningún potrero es mixto — en cada momento tiene hacienda o está
 * sembrado —, así que se dice potrero por potrero y la del campo sale sola
 * (`actividadDeUsos`). Reunión con Fran del 22/09.
 */
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
  onBorrador: (
    cabezas: Record<string, CabezasPorCategoria>,
    usos: Record<string, UsoPotrero>,
    activo: string | undefined,
  ) => void
  /** Volver a los potreros (nada guardado aún): devuelve lo tipeado. */
  onVolver: (porPotrero: Record<string, CabezasPorCategoria>, usos: Record<string, UsoPotrero>) => void
  onListo: (
    cabezas: number,
    porPotrero: Record<string, CabezasPorCategoria>,
    usos: Record<string, UsoPotrero>,
    actividad: ActividadCampo | null,
  ) => void
}) {
  // Cabezas por categoría, POR POTRERO: la hacienda vive en un lugar. Se
  // recorre un potrero por vez — fichas arriba, el activo abajo — y se
  // guarda todo junto al final. Sin potreros (los dejó para después), el
  // lugar es el campo entero: sólo hacienda (lo sembrado necesita un potrero
  // donde estar), se guarda sin potrero y la ubica después desde Hacienda.
  const campoEntero = campo.potreros.length === 0
  const potreros: CampoCargado['potreros'] = campoEntero
    ? [{ id: TODO_EL_CAMPO, nombre: campo.nombre, hectareas: campo.hectareas, cabezas: {}, uso: 'ganadero', cultivo: null }]
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
  const [usos, setUsos] = useState<Record<string, UsoPotrero>>(() =>
    Object.fromEntries(potreros.map((p) => [p.id, { uso: p.uso, cultivo: p.cultivo }])),
  )
  // "Otro" abierto: el cultivo se escribe. Revisando, abre solo si lo que
  // tenía no es de la lista.
  const [otro, setOtro] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      potreros
        .filter((p) => p.cultivo && !(CULTIVOS as readonly string[]).includes(p.cultivo))
        .map((p) => [p.id, true]),
    ),
  )
  const [especieActiva, setEspecieActiva] = useState<Especie>('bovino')
  const [indice, setIndice] = useState(0)
  const tarjeta = useRef<HTMLDivElement>(null)
  const acciones = useRef<HTMLDivElement>(null)
  const quieto = useReducedMotion()
  const [vistos, setVistos] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const actual = potreros[indice]!
  const usoActual = usos[actual.id] ?? USO_INICIAL
  const conHacienda = (id: string) => (usos[id] ?? USO_INICIAL).uso === 'ganadero'
  const cantActual = porPotrero[actual.id] ?? {}
  const totalActual = totalDe(cantActual)
  // Un número que no cierra con las hectáreas se avisa antes de guardar, en
  // EV: la referencia es la receptividad del campo, no un conteo de cabezas.
  // Sólo donde hay hacienda: lo tipeado en un potrero que después se marcó
  // sembrado queda guardado en el formulario pero no cuenta.
  const avisoActual = usoActual.uso === 'ganadero' ? avisoCarga(cantActual, actual.hectareas) : null
  const total = potreros.reduce((s, p) => s + (conHacienda(p.id) ? totalDe(porPotrero[p.id]) : 0), 0)
  const esUltimo = indice === potreros.length - 1

  // El croquis dibuja sólo lo que cuenta: cabezas donde hay hacienda, surcos
  // donde está sembrado.
  // Y resalta el potrero que se está cargando, para ubicarse de un vistazo.
  function avisarCroquis(por: Record<string, Cantidades>, us: Record<string, UsoPotrero>, i = indice) {
    onBorrador(
      Object.fromEntries(
        potreros.map((p) => [p.id, (us[p.id] ?? USO_INICIAL).uso === 'ganadero' ? porCategoriaDe(por[p.id]) : {}]),
      ),
      us,
      campoEntero ? undefined : potreros[i]?.id,
    )
  }
  // Al entrar (o volver a entrar) el croquis ya muestra lo que había.
  useEffect(() => {
    avisarCroquis(porPotrero, usos)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al entrar
  }, [])

  // Scroll que acompaña: al cambiar de potrero o de qué hay, si el botón de
  // seguir quedó abajo del borde, la tarjeta sube LO JUSTO para mostrarlo —
  // nunca tanto que se pierda de vista de qué potrero se trata. Si ni así
  // entra (pantalla baja), queda la pista "Bajá para continuar".
  useEffect(() => {
    const t = window.setTimeout(() => {
      const contenedor = document.querySelector<HTMLElement>('[data-auth-scroll]')
      if (!contenedor || !acciones.current || !tarjeta.current) return
      const c = contenedor.getBoundingClientRect()
      // Los DOS botones enteros: uno asomando cortado abajo se ve descuidado.
      const falta = acciones.current.getBoundingClientRect().bottom - (c.bottom - 16)
      if (falta <= 0) return
      const hastaLaTarjeta = tarjeta.current.getBoundingClientRect().top - (c.top + 12)
      const cuanto = Math.min(falta, Math.max(0, hastaLaTarjeta))
      if (cuanto > 0) contenedor.scrollBy({ top: cuanto, behavior: quieto ? 'auto' : 'smooth' })
    }, 450)
    return () => window.clearTimeout(t)
  }, [indice, usoActual.uso, quieto])

  function cambiarUso(u: UsoPotrero) {
    const next = { ...usos, [actual.id]: u }
    setUsos(next)
    setError(null)
    avisarCroquis(porPotrero, next)
  }

  function irA(i: number) {
    setVistos((v) => (v.includes(actual.id) ? v : [...v, actual.id]))
    setIndice(i)
    setEspecieActiva('bovino')
    setError(null)
    avisarCroquis(porPotrero, usos, i)
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
      if (faltaEn(usoActual)) return
      irA(indice + 1)
      return
    }
    const bloqueado = potreros.find((p) => conHacienda(p.id) && avisoCarga(porPotrero[p.id], p.hectareas)?.bloquea)
    if (bloqueado) {
      setError(`Potrero ${bloqueado.nombre}: ${avisoCarga(porPotrero[bloqueado.id], bloqueado.hectareas)!.texto}`)
      return
    }
    const incompleto = potreros.findIndex((p) => faltaEn(usos[p.id]))
    if (incompleto >= 0) {
      const p = potreros[incompleto]!
      irA(incompleto)
      setError(
        faltaEn(usos[p.id]) === 'uso'
          ? `Falta elegir qué hay en el potrero ${p.nombre}`
          : `Potrero ${p.nombre}: falta qué está sembrado`,
      )
      return
    }
    const totales = Object.fromEntries(
      potreros.map((p) => [p.id, conHacienda(p.id) ? porCategoriaDe(porPotrero[p.id]) : {}]),
    )
    if (campoEntero && total === 0) {
      onListo(0, totales, {}, campo.actividad)
      return
    }
    setError(null)
    setOcupado(true)
    try {
      if (!campoEntero) {
        // Qué hay en cada uno, a la base: el estado del ciclo y el cultivo.
        // Idempotente — revisar y volver a guardar lo reescribe igual.
        for (const p of potreros) {
          const u = usos[p.id] ?? USO_INICIAL
          await actualizarPotreroMapa({
            id: p.id,
            estadoCiclo: usoToEstadoCiclo(u.uso ?? 'ganadero', 'ganadero'),
            hectareas: p.hectareas,
            cultivo: u.uso === 'agricola' ? u.cultivo!.trim() : null,
          })
        }
      }
      for (const p of potreros) {
        if (!conHacienda(p.id)) continue
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
        if (error) throw new Error(`${p.id === TODO_EL_CAMPO ? campo.nombre : `Potrero ${p.nombre}`}: ${error.message}`)
      }
      const actividad = campoEntero
        ? 'ganadera'
        : actividadDeUsos(potreros.flatMap((p) => usos[p.id]?.uso ?? []))
      await actualizarActividadCampo(campo.id, actividad)
      onListo(total, totales, campoEntero ? {} : usos, actividad)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setOcupado(false)
    }
  }

  const falta = faltaEn(usoActual)
  const bloqueaActual = avisoActual?.bloquea || !!falta

  return (
    <>
      <VolverArriba
        onClick={() =>
          onVolver(Object.fromEntries(potreros.map((p) => [p.id, porCategoriaDe(porPotrero[p.id])])), usos)
        }
        disabled={ocupado}
      >
        {campoEntero ? `Los datos de ${campo.nombre}` : `Los potreros de ${campo.nombre}`}
      </VolverArriba>
      <AuthHeading
        icono={campoEntero ? Beef : Sprout}
        titulo={campoEntero ? `La hacienda de ${campo.nombre}` : `Qué hay en cada potrero`}
        subtitulo={
          campoEntero
            ? 'Tus animales: cuántas cabezas hay hoy en todo el campo. Cuando cargues los potreros, las ubicás en cada uno.'
            : 'Potrero por potrero: hacienda o sembrado.'
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
              const u = usos[p.id] ?? USO_INICIAL
              const t = u.uso === 'ganadero' ? totalDe(porPotrero[p.id]) : 0
              const resumen =
                u.uso === 'agricola'
                  ? u.cultivo?.trim() || null
                  : u.uso === 'vacio'
                    ? 'vacío'
                    : t > 0
                      ? String(t)
                      : null
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
                  {u.uso === 'agricola' && <Sprout className="size-3" strokeWidth={2.25} />}
                  {p.nombre}
                  {resumen && (
                    <span className={cn('font-medium tabular-nums', activo ? 'text-white/80' : 'text-primary/80')}>
                      · {resumen}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Reveal>

        {/* El potrero activo. Entra desde la derecha, como pasar una hoja. */}
        <Reveal delay={0.18} className="mt-3">
          <div ref={tarjeta}>
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
                  {usoActual.uso === 'ganadero' && (
                    <p className={cn('text-xs tabular-nums', totalActual > 0 ? 'font-medium text-primary' : 'text-muted-foreground')}>
                      {totalActual > 0 ? `${totalActual} ${totalActual === 1 ? 'cabeza' : 'cabezas'}` : 'Sin cabezas todavía'}
                    </p>
                  )}
                </div>

                {/* Qué hay hoy: un toque. Hacienda de entrada, que es lo más común. */}
                {!campoEntero && (
                  <div className="mt-3 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Qué hay en el potrero">
                    {OPCIONES_USO.map(({ uso, nombre, Icono }) => {
                      const activo = usoActual.uso === uso
                      return (
                        <button
                          key={uso}
                          type="button"
                          role="radio"
                          aria-checked={activo}
                          onClick={() => cambiarUso({ uso, cultivo: uso === 'agricola' ? usoActual.cultivo : null })}
                          className={cn(
                            // En el teléfono los tres tienen ~90 px: letra y aire justos para que entren.
                            'flex h-9 min-w-0 items-center justify-center gap-1 rounded-lg border px-1 text-[13px] font-medium transition-colors sm:gap-1.5 sm:text-sm',
                            activo
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-input text-muted-foreground hover:border-ring',
                          )}
                        >
                          <Icono className="hidden size-3.5 shrink-0 min-[400px]:block" strokeWidth={2} />
                          {nombre}
                        </button>
                      )
                    })}
                  </div>
                )}

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={usoActual.uso}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                  >
                    {usoActual.uso === 'ganadero' ? (
                      <>
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
                                  'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold transition-colors',
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

                        {/* Una FILA por grupo —vientres · crías · machos—: el nombre del
                            grupo a la izquierda y sus casilleros al lado, todos sobre
                            la misma grilla. En columnas, las especies con un solo
                            vientre o un solo macho (ovinos, equinos) dejaban huecos. */}
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div
                            key={especieActiva}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15 }}
                            className="mt-3 grid gap-2.5"
                          >
                            {GRUPOS_ROL.map(({ rol, nombre }) => {
                              const cats = categoriasPorEspecie[especieActiva].filter((c) => ROL_POR_CATEGORIA[c] === rol)
                              if (cats.length === 0) return null
                              return (
                                <div key={rol} className="grid grid-cols-2 items-end gap-x-2.5 gap-y-1 sm:grid-cols-[6.25rem_1fr_1fr] sm:gap-y-2">
                                  {/* Letra generosa: la usa gente grande, muchas veces sin anteojos. */}
                                  {/* En el teléfono el grupo va ARRIBA de sus casilleros: al costado
                                      no entraba "Vaquillonas" a este tamaño de letra. */}
                                  <p className="col-span-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-1 sm:h-10">
                                    <svg width="20" height="16" viewBox="-13 -12 26 21" aria-hidden className="shrink-0">
                                      <MarcaCategoria categoria={cats[0]!} />
                                    </svg>
                                    {nombre}
                                  </p>
                                    {cats.map((c, k) => (
                                      <label key={c} className="grid min-w-0 gap-1">
                                        <span className="truncate text-sm text-foreground/80">{categoriaPlural[c]}</span>
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
                                                [c]: soloEntero(ev.target.value),
                                              },
                                            }
                                            setPorPotrero(next)
                                            avisarCroquis(next, usos)
                                          }}
                                          placeholder="0"
                                          className="h-10 px-3 text-base tabular-nums md:text-base"
                                        />
                                      </label>
                                    ))}
                                </div>
                              )
                            })}
                          </motion.div>
                        </AnimatePresence>
                      </>
                    ) : usoActual.uso === 'agricola' ? (
                      <div className="mt-3 grid gap-1.5">
                        <p className="text-sm text-foreground/80">¿Qué está sembrado?</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {CULTIVOS.map((c) => {
                            const activo = !otro[actual.id] && usoActual.cultivo === c
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => {
                                  setOtro((o) => ({ ...o, [actual.id]: false }))
                                  cambiarUso({ uso: 'agricola', cultivo: c })
                                }}
                                className={cn(
                                  'flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg border text-[13px] font-medium transition-colors',
                                  activo
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-input text-muted-foreground hover:border-ring',
                                )}
                              >
                                <svg
                                  width="18"
                                  height="15"
                                  viewBox="-13 -12 26 21"
                                  aria-hidden
                                  className="hidden shrink-0 min-[400px]:block"
                                >
                                  <MarcaCultivo cultivo={c} />
                                </svg>
                                {c}
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              setOtro((o) => ({ ...o, [actual.id]: true }))
                              cambiarUso({ uso: 'agricola', cultivo: '' })
                            }}
                            className={cn(
                              'col-span-2 h-10 rounded-lg border text-[13px] font-medium transition-colors',
                              otro[actual.id]
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-input text-muted-foreground hover:border-ring',
                            )}
                          >
                            Otro
                          </button>
                        </div>
                        {otro[actual.id] && (
                          <Input
                            aria-label="Cultivo"
                            value={usoActual.cultivo ?? ''}
                            autoFocus
                            maxLength={40}
                            // Primera letra en mayúscula, como los de la lista: "Sorgo".
                            onChange={(e) =>
                              cambiarUso({
                                uso: 'agricola',
                                cultivo: e.target.value.charAt(0).toLocaleUpperCase('es-AR') + e.target.value.slice(1),
                              })
                            }
                            placeholder="Ej: Cebada, sorgo, avena…"
                          />
                        )}
                      </div>
                    ) : usoActual.uso === 'vacio' ? (
                      // Corto y con la misma muestra gris del croquis: se ve,
                      // no hay que leerlo.
                      <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-secondary px-3 py-2.5">
                        <span aria-hidden className="size-5 shrink-0 rounded border border-border bg-muted-foreground/15" />
                        <p className="text-xs leading-snug">
                          <span className="font-medium">En descanso.</span>{' '}
                          <span className="text-muted-foreground">Se cambia en el mapa cuando entre hacienda o se siembre.</span>
                        </p>
                      </div>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>

        {error ? (
          <Aviso tono="error">{error}</Aviso>
        ) : avisoActual ? (
          <Aviso tono={avisoActual.bloquea ? 'error' : 'atencion'}>{avisoActual.texto}</Aviso>
        ) : null}
        {/* El botón de seguir tiene que estar a la vista: la tarjeta entra
            en la pantalla, y si igual queda abajo (pantalla baja) se acomoda
            el scroll solo y aparece la pista "Bajá para continuar". */}
        <div ref={acciones} className="mt-5">
          <Reveal delay={0.22} className="grid gap-2">
            <Button
              data-cta-principal
              type="submit"
              disabled={ocupado || bloqueaActual}
              className={cn(BOTON_PRINCIPAL, bloqueaActual && !ocupado && 'opacity-50', ocupado && OCUPADO)}
            >
              {ocupado ? (
                <Guardando />
              ) : falta === 'uso' ? (
                `Elegí qué hay en ${actual.nombre}`
              ) : falta === 'cultivo' ? (
                'Elegí qué está sembrado'
              ) : !esUltimo ? (
                <>
                  {usoActual.uso === 'ganadero' && totalActual === 0 ? 'Siguiente potrero' : 'Listo, siguiente potrero'}
                  <ArrowRight className="size-4" />
                </>
              ) : campoEntero && total === 0 ? (
                'Terminar sin hacienda'
              ) : (
                // General a propósito: "Guardar 23 cabezas" en un campo con
                // siembra se leía como si lo sembrado no se guardara.
                `Terminar ${campo.nombre}`
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full text-[14px] font-medium"
              disabled={ocupado}
              onClick={() => onListo(0, {}, {}, campo.actividad)}
            >
              La completo después
            </Button>
          </Reveal>
        </div>
      </form>
    </>
  )
}

// ---------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------

/**
 * Volver al paso anterior. Va ARRIBA Y A LA IZQUIERDA del panel, antes del
 * título, y no abajo junto a las acciones: volver no es una opción que
 * compita con seguir — es la salida, y la salida se busca en la esquina.
 * Discreto a propósito (texto chico, sin borde): sólo lo mira el que lo
 * necesita.
 */
function VolverArriba({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Reveal>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="-ml-1.5 mb-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} />
        {children}
      </button>
    </Reveal>
  )
}

/**
 * Transición entre pasos del onboarding: el paso nuevo aparece donde está y
 * el anterior se desvanece hacia arriba. Corto y mudo — el gesto con
 * personalidad de cada pantalla lo hace el tractor (ver `Sembradora`), que se
 * monta de nuevo con cada paso.
 *
 * Sin `filter`, por lo mismo que `Reveal`: framer deja el `blur(0px)` escrito
 * y eso crea contexto de apilado, que fue lo que encerró la lista de
 * localidades debajo de los campos siguientes.
 */
/**
 * Guardando, sin apagar el botón: el botón a media opacidad se leía como
 * "algo se cargó" y después el paso volvía a cargar — la doble carga.
 * Queda entero, con un giro chico y la palabra.
 */
const OCUPADO = 'disabled:opacity-100'
function Guardando({ children = 'Guardando' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Loader2 className="size-4 animate-spin" strokeWidth={2.5} />
      {children}
    </span>
  )
}

const ORDEN_ETAPAS: Etapa[] = ['empresa', 'campo', 'potreros', 'hacienda', 'otro', 'fin']

/**
 * Adelante o atrás, según el recorrido: "otro campo" vuelve a Campo pero es
 * AVANZAR (un campo nuevo), y arrepentirse de cargar otro campo vuelve a
 * "¿Tenés otro campo?" pero es RETROCEDER.
 */
function direccionEntre(desde: Etapa, hacia: Etapa): 1 | -1 {
  if (desde === 'otro' && hacia === 'campo') return 1
  if (desde === 'campo' && hacia === 'otro') return -1
  return ORDEN_ETAPAS.indexOf(hacia) >= ORDEN_ETAPAS.indexOf(desde) ? 1 : -1
}

/**
 * Un paso entrando y saliendo. El que se va sale RÁPIDO y corto hacia el lado
 * contrario; el que llega se desliza desde el lado del avance con un resorte
 * sin rebote. Adentro, cada bloque (`Reveal`) sigue escalonado: la tarjeta se
 * arma, no aparece entera de golpe.
 */
const PASO_VARIANTES = {
  entrar: (dir: 1 | -1) => ({ opacity: 0, x: 28 * dir }),
  quieto: { opacity: 1, x: 0 },
  salir: (dir: 1 | -1) => ({ opacity: 0, x: -20 * dir, transition: { duration: 0.18, ease: 'easeIn' as const } }),
}

function Paso({ children }: { children: ReactNode }) {
  const quieto = useReducedMotion()
  if (quieto) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
        <RevealMudo.Provider value>{children}</RevealMudo.Provider>
      </motion.div>
    )
  }
  return (
    <motion.div
      variants={PASO_VARIANTES}
      initial="entrar"
      animate="quieto"
      exit="salir"
      transition={{
        x: { type: 'spring', stiffness: 260, damping: 32, mass: 0.9 },
        opacity: { duration: 0.3, ease: 'easeOut' },
      }}
    >
      <RevealMudo.Provider value>{children}</RevealMudo.Provider>
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
          actividad: null,
          potreros: [],
          estado: 'campo',
        }
      : etapa === 'potreros' && campoActual
        ? {
            nombre: campoActual.nombre,
            hectareas: campoActual.hectareas,
            actividad: campoActual.actividad,
            color: colorDeCampo(campoActual.colorIdx).hex,
            potreros: borrador.potreros.map((p, i) => {
              // Volviendo: el potrero ya existe y se dibuja con lo que tiene.
              const ya = p.id ? campoActual.potreros.find((x) => x.id === p.id) : undefined
              return {
                clave: `${i}`,
                nombre: p.nombre,
                hectareas: p.hectareas,
                cabezas: ya?.uso === 'ganadero' ? ya.cabezas : {},
                // Sin elegir todavía: gris, como vacío (no verde de ganadero).
                uso: ya?.uso ?? null,
                cultivo: ya?.cultivo,
              }
            }),
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
                uso: (borrador.usos[p.id] ?? p).uso ?? null,
                cultivo: (borrador.usos[p.id] ?? p).cultivo,
              })),
              sueltas: borrador.cabezas[TODO_EL_CAMPO],
              estado: 'hacienda',
              activo: borrador.activo,
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
                  uso: p.uso ?? null,
                  cultivo: p.cultivo,
                })),
                sueltas: ultimo.sueltas,
                estado: 'hecho',
              }
            : { nombre: etapa === 'empresa' ? 'Tu primer campo' : '', hectareas: null, actividad: null, potreros: [], estado: 'vacio' }

  const partes: { etapa: Etapa; nombre: string }[] = [
    { etapa: 'campo', nombre: 'Datos' },
    { etapa: 'potreros', nombre: 'Potreros' },
    { etapa: 'hacienda', nombre: 'Qué hay' },
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
  // Lo sembrado, por cultivo, con sus hectáreas: la leyenda de la siembra.
  const porCultivoCroquis = Object.values(
    croquis.potreros.reduce<Record<string, { cultivo: string; ha: number }>>((acc, p) => {
      const c = p.uso === 'agricola' ? p.cultivo?.trim() : null
      if (!c) return acc
      const k = c.toLowerCase()
      acc[k] = { cultivo: acc[k]?.cultivo ?? c, ha: (acc[k]?.ha ?? 0) + (p.hectareas ?? 0) }
      return acc
    }, {}),
  )
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
          {porEspecieCroquis.length + porCultivoCroquis.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-sidebar-foreground/10 pt-2.5 text-[13px]">
              {porEspecieCroquis.map(({ especie, total, categorias }) => (
                <li key={especie} className="inline-flex items-center gap-1.5 tabular-nums">
                  <svg width="22" height="18" viewBox="-13 -12 26 21" aria-hidden>
                    <MarcaCategoria categoria={categorias[0]![0]} />
                  </svg>
                  <span className="font-semibold">{total}</span>
                  <span className="text-sidebar-foreground/70">{ESTILO_ESPECIE[especie].nombre}</span>
                </li>
              ))}
              {porCultivoCroquis.map(({ cultivo, ha: hectareas }) => (
                <li key={`cultivo-${cultivo}`} className="inline-flex items-center gap-1.5 tabular-nums">
                  <svg width="22" height="18" viewBox="-13 -12 26 21" aria-hidden>
                    <MarcaCultivo cultivo={cultivo} />
                  </svg>
                  <span className="font-semibold">{cultivo}</span>
                  {hectareas > 0 && <span className="text-sidebar-foreground/70">{ha(hectareas)} ha</span>}
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
  { etapa: 'hacienda', nombre: 'Qué hay' },
  { etapa: 'fin', nombre: 'Listo' },
]

function ProgresoOnboarding({ etapa, accion }: { etapa: Etapa; accion?: ReactNode }) {
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
      <div className="mt-1 flex items-center justify-between gap-2">
      <p className="text-[11px] text-muted-foreground">
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
      {accion}
      </div>
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
  // Cuántas columnas y qué densidad, según cuántos campos hay. La tabla
  // entera, para que se vea TODO lo que cargó:
  //
  //   1        → una ficha grande
  //   2        → dos columnas
  //   3 a 4    → dos columnas, fichas compactas (sin pie): con pie, en una
  //              notebook la segunda fila y el título quedaban cortados
  //   5 a 9    → tres columnas, compactas
  //   10 o más → cuatro columnas, compactas
  //
  // Tres columnas con tres campos NO: el panel mide ~690 px y el croquis a
  // un tercio no se lee. Si igual no entra, la escena scrollea con los
  // bordes desvanecidos (auth-scene), nunca cortados en seco.
  const n = campos.length
  const columnas = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4
  const compacta = n >= 3
  return (
    <div className={cn('w-full', n === 1 ? 'max-w-[680px]' : 'max-w-[1160px]')}>
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
        {campos.length === 1
          ? 'Así quedó tu campo con lo que cargaste.'
          : `Así quedaron tus ${campos.length} campos con lo que cargaste.`}
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
      {/* Flex con wrap y centrado, no grilla: cuando la última fila queda
          incompleta (cinco campos en tres columnas), sus fichas se centran
          bajo las de arriba. Una grilla las deja pegadas a la izquierda y se
          lee como un error. El ancho de cada ficha sale de las columnas. */}
      <ul className="mt-5 flex flex-wrap justify-center gap-4">
        {campos.map((c, i) => {
          const color = colorDeCampo(c.colorIdx)
          return (
            <motion.li
              key={c.id}
              className={cn(
                'w-full overflow-hidden rounded-xl border border-sidebar-foreground/10 bg-[#0b1a10]/70 shadow-[0_12px_30px_rgba(0,0,0,0.3)] backdrop-blur-sm',
                columnas === 2 && 'sm:w-[calc(50%-0.5rem)]',
                columnas === 3 && 'sm:w-[calc(33.333%-0.667rem)]',
                columnas === 4 && 'sm:w-[calc(25%-0.75rem)]',
              )}
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.25 + i * 0.15 }}
            >
              <div
                className={cn(
                  'flex items-center gap-2.5 border-b border-sidebar-foreground/10',
                  compacta ? 'px-3 py-2' : 'px-4 py-3',
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-md font-bold text-white',
                    compacta ? 'size-5 text-[11px]' : 'size-6 text-[12px]',
                  )}
                  style={{ background: color.hex }}
                >
                  {color.letra}
                </span>
                <span className={cn('truncate font-semibold', compacta ? 'text-[13px]' : 'text-[15px]')}>{c.nombre}</span>
                <span className="ml-auto shrink-0 text-xs text-sidebar-foreground/60">{ha(c.hectareas)} ha</span>
              </div>
              <div className={compacta ? 'px-2 pt-2 pb-2' : 'px-3 pt-3'}>
<CroquisAlAparecer demora={0.35 + i * 0.15}>
                <CroquisVivo
                  campo={{
                    nombre: c.nombre,
                    hectareas: c.hectareas,
                    actividad: c.actividad,
                    color: color.hex,
                    potreros: c.potreros.map((p) => ({
                      clave: p.id,
                      nombre: p.nombre,
                      hectareas: p.hectareas,
                      cabezas: p.cabezas,
                      uso: p.uso ?? null,
                      cultivo: p.cultivo,
                    })),
                    sueltas: c.sueltas,
                    estado: 'hecho',
                  }}
                />
                </CroquisAlAparecer>
              </div>
              {!compacta && (
              <div className="flex items-center justify-between gap-2 px-4 pb-3.5 pt-2.5">
                <p className="text-xs text-sidebar-foreground/60">
                  {c.potreros.length > 0 ? `${c.potreros.length} ${c.potreros.length === 1 ? 'potrero' : 'potreros'}` : 'sin potreros todavía'}
                  {c.cabezas > 0 ? ` · ${c.cabezas} cabezas` : ''}
                </p>
                <ChipActividad actividad={c.actividad} />
              </div>
              )}
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
 * El croquis de una ficha del final se DIBUJA cuando la ficha aparece, no
 * antes: la ficha entra con retraso, y si el croquis se montaba con ella los
 * potreros terminaban de crecer mientras todavía era invisible — se veía un
 * dibujo estático. El lugar queda reservado (misma proporción que el SVG),
 * así la ficha no cambia de alto cuando el dibujo llega.
 */
function CroquisAlAparecer({ demora, children }: { demora: number; children: ReactNode }) {
  const quieto = useReducedMotion()
  const [listo, setListo] = useState(quieto)
  useEffect(() => {
    if (quieto) return
    const t = window.setTimeout(() => setListo(true), demora * 1000)
    return () => window.clearTimeout(t)
  }, [demora, quieto])
  return <div className="aspect-[420/200] w-full">{listo ? children : null}</div>
}

/**
 * La tarjeta de LO QUE SIGUE al cerrar el onboarding: un dibujo que muestra
 * lo que va a hacer (no lo describe), el nombre de su campo en el título, lo
 * que cuesta en una etiqueta, y el botón. Va arriba de las cifras: es la
 * salida, y la salida no se busca scrolleando.
 */
function SiguientePaso({
  variante,
  color,
  letra,
  titulo,
  texto,
  etiqueta,
  children,
}: {
  variante: 'dibujar' | 'recorrer'
  color: string
  letra: string
  titulo: string
  texto: string
  etiqueta: string
  children: ReactNode
}) {
  return (
    <motion.div
      className="mt-3 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/[0.07] to-transparent p-3"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.9 }}
    >
      <IlustracionSiguiente variante={variante} color={color} letra={letra} />
      <div className="px-1 pt-2.5 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Lo que sigue</p>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{etiqueta}</span>
        </div>
        <p className="mt-1 text-[15px] leading-snug font-semibold">{titulo}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{texto}</p>
      </div>
      {children}
    </motion.div>
  )
}

/**
 * El dibujo de lo que sigue, en loop. `dibujar`: sobre un fondo de satélite,
 * un lápiz marca las esquinas de un potrero con el color del campo, el
 * potrero se pinta y aparece su nombre. `recorrer`: una vuelta punteada pasa
 * por los potreros y los va tildando.
 *
 * Animado con SVG nativo (`<animate>`, `<animateMotion>`), como el molino de
 * la escena, y NO con framer: los keyframes en loop de framer quedaban
 * congelados en el build de producción (el lápiz en la primera esquina, el
 * potrero ya pintado). Con movimiento reducido, el cuadro final quieto.
 */
const CICLO = '5s'

function IlustracionSiguiente({
  variante,
  color,
  letra,
}: {
  variante: 'dibujar' | 'recorrer'
  color: string
  letra: string
}) {
  const quieto = useReducedMotion()
  const esquinas = [
    [58, 30],
    [168, 20],
    [196, 84],
    [80, 96],
  ] as const
  const trazo = `M${esquinas.map(([x, y]) => `${x} ${y}`).join(' L')} Z`
  // Fracciones del ciclo: el lápiz recorre las esquinas hasta 0,47; el
  // potrero se pinta y se nombra; queda a la vista hasta 0,88 y se apaga.
  const llegada = [0, 0.12, 0.24, 0.36]
  const loop = (valores: string, tiempos: string, atributo: string) =>
    quieto ? null : (
      <animate
        attributeName={atributo}
        values={valores}
        keyTimes={tiempos}
        dur={CICLO}
        repeatCount="indefinite"
        calcMode="linear"
      />
    )

  return (
    // Recortado a lo ancho (slice) y más bajo: el dibujo acompaña, no tiene
    // que empujar el botón abajo del pliegue.
    <svg
      viewBox="0 0 320 116"
      preserveAspectRatio="xMidYMid slice"
      className="block h-[78px] w-full overflow-hidden rounded-xl [@media(max-height:700px)]:hidden"
      aria-hidden
    >
      {/* El satélite: parches de verde, un camino y un arroyo. */}
      <rect width="320" height="116" fill="#16281b" />
      <path d="M0 70 C60 58 110 88 170 74 S270 50 320 62 V116 H0 Z" fill="#1d3322" />
      <path d="M210 0 L320 0 L320 40 C290 46 250 30 214 36 Z" fill="#223a26" />
      <path d="M0 0 H70 C58 14 30 22 0 20 Z" fill="#203625" />
      <path d="M0 104 C90 96 170 112 320 100" stroke="#3a4c35" strokeWidth="3" fill="none" />
      <path d="M232 0 C226 30 246 60 236 116" stroke="#2c4a5a" strokeWidth="2.5" fill="none" opacity="0.8" />

      {variante === 'dibujar' ? (
        <>
          {/* Los que faltan, esperando. */}
          <rect x="214" y="44" width="58" height="42" rx="3" fill="none" stroke="#9fb3a3" strokeOpacity="0.45" strokeDasharray="4 4" />
          <rect x="254" y="10" width="46" height="26" rx="3" fill="none" stroke="#9fb3a3" strokeOpacity="0.35" strokeDasharray="4 4" />
          {/* El que se dibuja: el trazo avanza con el lápiz y después se pinta. */}
          <path
            d={trazo}
            pathLength={1}
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeDasharray="1"
            strokeDashoffset={quieto ? 0 : 1}
            fill={color}
            fillOpacity={quieto ? 0.25 : 0}
          >
            {loop('1;0;0;0;1', '0;0.47;0.88;0.97;1', 'stroke-dashoffset')}
            {loop('0;0;0.25;0.25;0;0', '0;0.47;0.58;0.88;0.97;1', 'fill-opacity')}
          </path>
          {esquinas.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={quieto ? 3.5 : 0} fill="#fff" stroke={color} strokeWidth="2">
              {loop(
                '0;0;3.5;3.5;0;0',
                `0;${llegada[i]};${(llegada[i]! + 0.03).toFixed(2)};0.88;0.95;1`,
                'r',
              )}
            </circle>
          ))}
          <text x="127" y="64" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" opacity={quieto ? 1 : 0}>
            1{letra}
            {loop('0;0;1;1;0;0', '0;0.52;0.6;0.88;0.95;1', 'opacity')}
          </text>
          {/* El lápiz: va de esquina en esquina y vuelve a la primera. */}
          {!quieto && (
            <g>
              <animateMotion
                dur={CICLO}
                repeatCount="indefinite"
                path={`M0 0 ${esquinas.map(([x, y]) => `L${x - 58} ${y - 30}`).join(' ')} L0 0`}
                keyPoints="0;0;1;1"
                keyTimes="0;0.02;0.47;1"
                calcMode="linear"
              />
              <g transform="translate(58 30)">
                <path d="M0 0 L12 -12 L16 -8 L4 4 Z" fill="#f5f1e6" stroke="#0a140d" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M0 0 L4 4 L-1.5 5.5 Z" fill="#0a140d" />
              </g>
            </g>
          )}
        </>
      ) : (
        <>
          {/* Tres potreros y la vuelta que pasa por todos. */}
          {[
            [24, 18, 84, 50],
            [124, 30, 84, 56],
            [224, 14, 76, 52],
          ].map(([x, y, w, h], i) => (
            <g key={i}>
              <rect x={x} y={y} width={w} height={h} rx="4" fill={color} fillOpacity="0.14" stroke={color} strokeOpacity="0.8" strokeWidth="1.5" />
              <g opacity={quieto ? 1 : 0}>
                {loop('0;0;1;1;0;0', `0;${(0.22 + i * 0.22).toFixed(2)};${(0.26 + i * 0.22).toFixed(2)};0.88;0.95;1`, 'opacity')}
                <circle cx={x! + w! / 2} cy={y! + h! / 2} r="9" fill="#fff" />
                <path
                  d={`M${x! + w! / 2 - 4} ${y! + h! / 2} l3 3 l5 -6`}
                  stroke={color}
                  strokeWidth="2.2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            </g>
          ))}
          <path
            d="M10 100 C40 90 50 50 66 44 S150 70 166 58 S240 30 262 40 S300 90 312 96"
            stroke="#f5f1e6"
            strokeOpacity="0.55"
            strokeWidth="2"
            strokeDasharray="2 5"
            strokeLinecap="round"
            fill="none"
          />
          {!quieto && (
            <circle r="5" fill="#f5f1e6" stroke="#0a140d" strokeWidth="1.5">
              <animateMotion
                dur={CICLO}
                repeatCount="indefinite"
                path="M10 100 C40 90 50 50 66 44 S150 70 166 58 S240 30 262 40 S300 90 312 96"
                keyPoints="0;1;1"
                keyTimes="0;0.88;1"
                calcMode="linear"
              />
            </circle>
          )}
        </>
      )}
    </svg>
  )
}

/**
 * El botón que cierra el onboarding: es la puerta a la app, no un botón más.
 * Entra con un rebote cuando terminó el festejo, tiene su ícono, la flecha
 * empuja para adelante y un brillo lo cruza cada tanto — llama sin gritar.
 * Con movimiento reducido queda quieto. `data-cta-principal` hace que la
 * pista de scroll no le pase por encima.
 */
function BotonCierre({
  icono: Icono,
  onClick,
  children,
}: {
  icono: typeof PencilRuler
  onClick: () => void
  children: ReactNode
}) {
  const quieto = useReducedMotion()
  return (
    <motion.div
      initial={quieto ? false : { opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 1.2 }}
    >
      <motion.button
        type="button"
        data-cta-principal
        onClick={onClick}
        whileHover={quieto ? undefined : { y: -2 }}
        whileTap={{ scale: 0.98 }}
        className="group relative flex h-13 w-full items-center gap-3 overflow-hidden rounded-xl bg-primary pr-4 pl-2 text-[15px] font-semibold text-primary-foreground shadow-[0_12px_28px_-10px_rgba(23,138,85,0.75)] transition-shadow hover:shadow-[0_16px_34px_-10px_rgba(23,138,85,0.85)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {/* El brillo que lo cruza. */}
        {!quieto && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            initial={{ left: '-40%' }}
            animate={{ left: ['-40%', '140%'] }}
            transition={{ duration: 1.1, ease: 'easeInOut', delay: 1.6, repeat: Infinity, repeatDelay: 2.8 }}
          />
        )}
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <Icono className="size-[18px]" strokeWidth={2} />
        </span>
        <span className="flex-1 text-left">{children}</span>
        <motion.span
          aria-hidden
          className="inline-flex"
          animate={quieto ? undefined : { x: [0, 4, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
        >
          <ArrowRight className="size-[18px]" strokeWidth={2.25} />
        </motion.span>
      </motion.button>
    </motion.div>
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
