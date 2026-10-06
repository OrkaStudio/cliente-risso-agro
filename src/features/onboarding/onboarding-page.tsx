import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { setEmpresaTelemetria } from '@/lib/telemetria'
import {
  onboardingCompletado,
  onboardingIniciado,
  pasoCompletado,
  pasoVisto,
  type PasoOnboarding,
} from './medicion'
import { borrarProgreso, guardarProgreso, leerProgreso } from './progreso'
import { Cierre } from './tropero/cierre'
import {
  cerrarCampo,
  crearEmpresa,
  guardarCampo,
  guardarContenido,
  guardarPotreros,
  leerDeLaBase,
  terminarOnboarding,
  type DatosCampo,
  type FilaPotrero,
} from './tropero/guardar'
import {
  despuesDePotrero,
  pasoAnterior,
  pasoDesdeLaBase,
  totales,
  type CampoOnb,
  type Contenido,
  type Paso,
} from './tropero/modelo'
import { PasoCampo, PasoEmpresa, PasoOtro, PasoPotreros, PasoQueHay } from './tropero/pasos'

/**
 * Onboarding de Tropero (spec «Tropero para código», sección 2; pantallas de
 * la página 35): empresa → por cada campo (datos · potreros · qué hay en cada
 * potrero) → ¿otro campo? → cierre. Cada paso guarda al tocar su botón y el
 * progreso queda en este equipo para retomar donde quedó; desde otro equipo
 * se retoma con lo que ya está en la base. Al terminar, la empresa queda con
 * `onboarding_completo_at` y entrar ya lleva a la app.
 */

type Estado = { paso: Paso; empresaId: string | null; campos: CampoOnb[] }

const TELEMETRIA: Record<Exclude<Paso['etapa'], 'cierre'>, PasoOnboarding> = {
  empresa: 'empresa',
  campo: 'campo',
  potreros: 'potreros',
  'que-hay': 'hacienda',
  otro: 'otro',
}

export function OnboardingPage() {
  const { user } = useAuth()
  const { data: membresia, isLoading } = useEmpresa()
  // Cuando ya terminó, se queda en el cierre hasta que elija adónde ir.
  const [enCierre, setEnCierre] = useState(false)

  if (isLoading || !user) return <div className="h-full bg-fondo" aria-busy />
  const terminado = !!membresia?.empresa?.onboarding_completo_at
  if ((membresia && membresia.rol !== 'dueno') || (terminado && !enCierre)) return <Navigate to="/" replace />

  // Desde dónde arranca: el progreso de este equipo, una empresa nueva, o (null)
  // lo que ya está en la base, que se lee al montar.
  const empresaId = membresia?.empresa_id ?? null
  const guardado = leerProgreso<Estado>(user.id)
  const inicial: Estado | null =
    guardado && guardado.empresaId === empresaId
      ? guardado
      : !empresaId
        ? { paso: { etapa: 'empresa' }, empresaId: null, campos: [] }
        : null
  return <Flujo inicial={inicial} empresaId={empresaId} onCierre={() => setEnCierre(true)} />
}

function Flujo({
  inicial,
  empresaId: empresaInicial,
  onCierre,
}: {
  inicial: Estado | null
  empresaId: string | null
  onCierre: () => void
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [estado, setEstado] = useState<Estado | null>(inicial)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  // Sin progreso en este equipo: se retoma con lo que ya hay en la base.
  useEffect(() => {
    if (inicial || !empresaInicial) return
    let vivo = true
    leerDeLaBase(empresaInicial, new Date())
      .then((campos) => vivo && setEstado({ paso: pasoDesdeLaBase(campos), empresaId: empresaInicial, campos }))
      .catch((e) => vivo && setErrorCarga(e instanceof Error ? e.message : 'No pudimos leer tu campo.'))
    return () => {
      vivo = false
    }
  }, [inicial, empresaInicial])

  useEffect(() => {
    if (inicial?.paso.etapa === 'empresa') onboardingIniciado()
  }, [inicial])

  // Cada cambio queda guardado en este equipo: recargar vuelve al mismo paso.
  useEffect(() => {
    if (estado && estado.paso.etapa !== 'cierre') guardarProgreso(user?.id, estado)
  }, [estado, user?.id])

  const etapa = estado?.paso.etapa
  useEffect(() => {
    if (etapa && etapa !== 'cierre')
      pasoVisto(TELEMETRIA[etapa], ['empresa', 'campo', 'potreros', 'que-hay', 'otro'].indexOf(etapa) + 1)
  }, [etapa])
  useEffect(() => setEmpresaTelemetria(estado?.empresaId ?? null), [estado?.empresaId])

  if (errorCarga) {
    return (
      <div className="grid h-full place-items-center bg-fondo p-6 text-center text-texto-suave">
        <p>
          {errorCarga}
          <br />
          Revisá la conexión y volvé a abrir la app.
        </p>
      </div>
    )
  }
  if (!estado) return <div className="h-full bg-fondo" aria-busy />

  const { paso, empresaId, campos } = estado
  const ir = (p: Paso) => setEstado((e) => (e ? { ...e, paso: p } : e))
  const reemplazar = (c: CampoOnb) =>
    setEstado((e) =>
      e ? { ...e, campos: e.campos.some((x) => x.id === c.id) ? e.campos.map((x) => (x.id === c.id ? c : x)) : [...e.campos, c] } : e,
    )
  const campoDe = (id: string) => campos.find((c) => c.id === id)!
  const anterior = pasoAnterior(paso, campos)
  const atras = anterior ? { texto: 'Atrás', onClick: () => ir(anterior) } : undefined

  switch (paso.etapa) {
    case 'empresa': {
      const apellido = (user?.user_metadata as { apellido?: string } | undefined)?.apellido
      return (
        <PasoEmpresa
          inicial={apellido ? `${apellido} Agro` : ''}
          onCrear={async (nombre) => {
            const id = await crearEmpresa(nombre)
            pasoCompletado('empresa')
            setEstado({ paso: { etapa: 'campo' }, empresaId: id, campos: [] })
            void qc.invalidateQueries({ queryKey: ['empresa'] })
          }}
        />
      )
    }
    case 'campo': {
      const existente = paso.campoId ? campoDe(paso.campoId) : undefined
      return (
        <PasoCampo
          key={paso.campoId ?? 'nuevo'}
          numero={existente ? campos.indexOf(existente) + 1 : campos.length + 1}
          existente={existente}
          atras={atras}
          onGuardar={async (datos: DatosCampo) => {
            const c = await guardarCampo(empresaId!, datos, existente)
            pasoCompletado('campo', { tipo: datos.tipo, hectareas: datos.hectareas })
            reemplazar(c)
            ir({ etapa: 'potreros', campoId: c.id })
          }}
        />
      )
    }
    case 'potreros': {
      const campo = campoDe(paso.campoId)
      return (
        <PasoPotreros
          key={campo.id}
          campo={campo}
          atras={atras}
          onCorregirHectareas={async (hectareas) => {
            const c = await guardarCampo(
              empresaId!,
              {
                nombre: campo.nombre,
                localidad: { nombre: campo.localidad, provincia: campo.provincia, lat: campo.lat, lon: campo.lon },
                tipo: campo.tipo,
                hectareas,
              },
              campo,
            )
            reemplazar(c)
          }}
          onGuardar={async (filas: FilaPotrero[]) => {
            const potreros = await guardarPotreros(empresaId!, campo, filas)
            pasoCompletado('potreros', { potreros: potreros.length })
            reemplazar({ ...campo, potreros })
            ir({ etapa: 'que-hay', campoId: campo.id, indice: 0 })
          }}
        />
      )
    }
    case 'que-hay': {
      const campo = campoDe(paso.campoId)
      return (
        <PasoQueHay
          key={`${campo.id}-${paso.indice}`}
          campo={campo}
          indice={paso.indice}
          atras={atras}
          onGuardar={async (contenido: Contenido) => {
            const potrero = campo.potreros[paso.indice]!
            await guardarContenido(empresaId!, potrero, contenido)
            const actualizado = {
              ...campo,
              potreros: campo.potreros.map((p, i) => (i === paso.indice ? { ...p, contenido } : p)),
            }
            const siguiente = despuesDePotrero(actualizado, paso.indice)
            if (siguiente.etapa === 'otro') {
              await cerrarCampo(actualizado)
              pasoCompletado('hacienda', { potreros: actualizado.potreros.length })
            }
            reemplazar(actualizado)
            ir(siguiente)
          }}
        />
      )
    }
    case 'otro':
      return (
        <PasoOtro
          campos={campos}
          atras={atras}
          onOtro={() => ir({ etapa: 'campo' })}
          onRevisar={() => ir({ etapa: 'potreros', campoId: campos.at(-1)!.id })}
          onTerminar={async () => {
            await terminarOnboarding()
            const t = totales(campos)
            pasoCompletado('otro', { campos: campos.length })
            onboardingCompletado({
              campos: campos.length,
              potreros: t.potreros,
              cabezas: t.cabezas,
              potreros_sembrados: campos.reduce(
                (s, c) => s + c.potreros.filter((p) => p.contenido?.tipo === 'sembrado').length,
                0,
              ),
              con_alquiler: campos.some((c) => c.tipo === 'alquilado'),
            })
            onCierre()
            ir({ etapa: 'cierre' })
          }}
        />
      )
    case 'cierre':
      return (
        <Cierre
          campos={campos}
          celular={user?.phone ? `+${user.phone}` : null}
          onSalir={async (destino) => {
            borrarProgreso(user?.id)
            await qc.invalidateQueries()
            navigate(destino, { replace: true })
          }}
        />
      )
  }
}
