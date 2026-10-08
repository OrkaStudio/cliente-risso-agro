import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Aviso } from '@/components/tropero/aviso'
import { Boton, BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Segmentos } from '@/components/tropero/segmentos'
import { useAuth } from '@/features/auth/auth-context'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { buscarParcelaRural } from '@/features/lotes/catastro'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'
import ejemplo from '@/assets/tropero/campo-armado-ejemplo.webp'
import {
  asignarDibujo,
  buscarLugar,
  campoDeUnSoloPotrero,
  crearPotreroDibujado,
  guardarBorde,
  terminarMapa,
  useMapa,
  type Lugar,
} from './api'
import { Demo } from './demo'
import { LayoutMapa, PasoDe, Pista } from './layout'
import { abrirSoporte } from './soporte'
import { MapaTutorial, type MapaTutorialApi, type ModoMapa } from './mapa-tutorial'
import {
  campoPendiente,
  candidatos,
  compararBorde,
  estadoDe,
  fueraDelBorde,
  haRedondo,
  hectareasDe,
  nadaUbicado,
  pisaA,
  preseleccion,
  totalesDelMapa,
  type CampoMapa,
  type LatLng,
} from './reglas'

/**
 * Módulo 3 · Mapa del campo (página 35, «Tutorial después del onboarding»):
 * por cada campo, encontrarlo en el satélite, marcar el borde (con la boleta
 * de ARBA o a mano) y dibujar cada potrero, eligiendo cuál de los cargados en
 * el alta es. Cuando todos están en el mapa, se abre la app (terminar_mapa).
 * Todo se guarda al confirmar cada paso: cortar y volver retoma donde quedó.
 */

type Paso =
  | { e: 'celu' }
  | { e: 'bienvenida' }
  | { e: 'encontrar'; buscando: boolean }
  | { e: 'como-borde' }
  | { e: 'boleta' }
  | { e: 'marcar' }
  | { e: 'borde-listo'; borde: LatLng[]; ajustando: boolean }
  | { e: 'sin-potreros' }
  | { e: 'dibujar'; aviso?: string }
  | { e: 'cual'; dibujo: LatLng[] }
  | { e: 'nuevo'; dibujo: LatLng[] }
  | { e: 'potrero-listo'; id: string }
  | { e: 'campo-listo' }
  | { e: 'todos-listos' }

const ZOOM_PUEBLO = 14
const PORTENA: [number, number] = [-35.57, -58.0]

function pasoDeEntrada(campo: CampoMapa | null, todos: CampoMapa[], movil: boolean): Paso {
  if (!campo) return { e: 'todos-listos' }
  if (movil && nadaUbicado(todos)) return { e: 'celu' }
  if (nadaUbicado(todos)) return { e: 'bienvenida' }
  const est = estadoDe(campo)
  if (est.tipo === 'sin-borde') return { e: 'encontrar', buscando: false }
  if (est.tipo === 'sin-potreros') return { e: 'sin-potreros' }
  return { e: 'dibujar' }
}

export function TutorialMapaPage() {
  const { data: membresia } = useEmpresa()
  const empresaId = membresia?.empresa_id
  const { data: campos, isLoading, error } = useMapa(empresaId)
  if (membresia && membresia.rol !== 'dueno') return <Navigate to="/" replace />
  if (error)
    return (
      <div className="grid h-full place-items-center bg-fondo p-6 text-center text-texto-suave">
        No pudimos abrir el mapa. Revisá la conexión y probá de nuevo.
      </div>
    )
  if (isLoading || !campos || !empresaId) return <div className="h-full bg-fondo" aria-busy />
  return <Tutorial empresaId={empresaId} campos={campos} />
}

function Tutorial({ empresaId, campos }: { empresaId: string; campos: CampoMapa[] }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const movil = useIsMobile()
  const { user } = useAuth()
  const { campoId } = useParams()
  const mapa = useRef<MapaTutorialApi>(null)

  // El campo en curso: el de la URL si todavía falta, si no el primero pendiente.
  const [actualId, setActualId] = useState(() => {
    const pedido = campos.find((c) => c.id === campoId && estadoDe(c).tipo !== 'listo')
    return (pedido ?? campoPendiente(campos))?.id ?? campos.at(-1)?.id ?? ''
  })
  const campo = campos.find((c) => c.id === actualId) ?? null
  const [paso, setPaso] = useState<Paso>(() => pasoDeEntrada(campoPendiente(campos) ? campo : null, campos, movil))
  const [puntos, setPuntos] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recargar = () => qc.invalidateQueries({ queryKey: ['mapa', empresaId] })
  const salir = () => navigate('/', { replace: true })
  async function correr(fn: () => Promise<void>) {
    setError(null)
    setOcupado(true)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    } finally {
      setOcupado(false)
    }
  }
  function ir(p: Paso) {
    setError(null)
    setPuntos(0)
    setPaso(p)
  }

  // Cada vez que cambia el campo, el mapa va a su borde o a su pueblo.
  useEffect(() => {
    if (!campo) return
    if (campo.contorno) mapa.current?.encuadrar(campo.contorno)
    else if (campo.lat !== null && campo.lon !== null) mapa.current?.irA(campo.lat, campo.lon, ZOOM_PUEBLO)
  }, [campo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const faltan = useMemo(() => (campo ? campo.potreros.filter((p) => !p.poligono) : []), [campo])
  const ubicados = campo ? campo.potreros.filter((p) => p.poligono) : []
  const siguienteCampo = campos.find((c) => c.id !== campo?.id && estadoDe(c).tipo !== 'listo')
  const ayuda = `Hola, estoy ubicando ${campo?.nombre ?? 'mi campo'} en el mapa de Tropero y tengo una duda.`

  // ===== El mapa, según el paso =====
  const modo: ModoMapa =
    paso.e === 'marcar'
      ? 'borde'
      : paso.e === 'borde-listo' && paso.ajustando
        ? 'ajustar'
        : paso.e === 'dibujar'
          ? 'potrero'
          : 'mirar'
  const contornoVisible = paso.e === 'borde-listo' ? paso.borde : (campo?.contorno ?? null)
  const borrador = paso.e === 'cual' || paso.e === 'nuevo' ? paso.dibujo : null
  const listo = paso.e === 'potrero-listo' ? campo?.potreros.find((p) => p.id === paso.id) : undefined

  function alDibujar(p: LatLng[]) {
    if (paso.e === 'marcar') {
      ir({ e: 'borde-listo', borde: p, ajustando: false })
      return
    }
    if (paso.e !== 'dibujar' || !campo) return
    // Un dibujo rechazado no termina el paso: se avisa y el dibujo arranca de nuevo.
    const rechazar = (aviso: string) => {
      setPaso({ e: 'dibujar', aviso })
      // Después de que Geoman termine de cerrar el dibujo rechazado.
      window.setTimeout(() => mapa.current?.reiniciar(), 0)
    }
    if (campo.contorno && fueraDelBorde(p, campo.contorno) > 0.3) {
      rechazar('Ese dibujo se sale del borde del campo. Dibujalo adentro.')
      return
    }
    const pisado = pisaA(p, ubicados)
    if (pisado) {
      rechazar(`Se pisa con el ${pisado.nombre}. Dibujalo al lado.`)
      return
    }
    ir(faltan.length ? { e: 'cual', dibujo: p } : { e: 'nuevo', dibujo: p })
  }

  const mapaEl =
    paso.e === 'bienvenida' || paso.e === 'celu' ? (
      <div className="relative size-full">
        <img src={ejemplo} alt="Ejemplo de un campo armado: el borde, los potreros y lo que hay en cada uno" className="size-full object-cover" />
        <span className="absolute bottom-6 left-6 rounded-full bg-acento px-3.5 py-1.5 text-[13px] font-bold text-acento-texto max-md:hidden">
          Ejemplo: así queda un campo armado
        </span>
      </div>
    ) : (
      <MapaTutorial
        ref={mapa}
        className="size-full"
        centro={{
          lat: campo?.lat ?? PORTENA[0],
          lon: campo?.lon ?? PORTENA[1],
          zoom: ZOOM_PUEBLO,
        }}
        contorno={contornoVisible}
        potreros={campo?.potreros ?? []}
        borrador={borrador ?? listo?.poligono ?? null}
        borradorNombre={paso.e === 'potrero-listo' ? listo?.nombre : undefined}
        modo={modo}
        onDibujo={alDibujar}
        onPuntos={setPuntos}
        onAjuste={(b) => paso.e === 'borde-listo' && setPaso({ ...paso, borde: b })}
      />
    )

  // ===== Celular: primero, en la compu =====
  if (paso.e === 'celu') {
    return (
      <PrimeroEnLaCompu
        campo={campo}
        celular={user?.phone ?? null}
        onCelular={() => ir({ e: 'bienvenida' })}
        onSaltear={salir}
      />
    )
  }

  const comun = { mapa: mapaEl, onSalir: salir, ayuda }

  switch (paso.e) {
    case 'bienvenida':
      return (
        <LayoutMapa {...comun} titulo={`Armemos ${campo?.nombre ?? 'tu campo'} en el mapa`}>
          <p className="text-[15.5px] text-texto-suave">
            Así queda un campo armado: el borde, los potreros y la hacienda adentro. Son 3 pasos y unos 10 minutos.
          </p>
          <BotonPrincipal icono="Siguiente" onClick={() => ir({ e: 'encontrar', buscando: false })}>
            Empezar
          </BotonPrincipal>
          <BotonChico type="button" className="self-start" onClick={salir}>
            Después: te espera en el Inicio, donde quedaste
          </BotonChico>
          <p className="text-[13px] text-texto-suave">
            Es lo primero: con tu campo en el mapa se abre toda la app. Si cortás, seguís donde quedaste.
          </p>
        </LayoutMapa>
      )

    case 'encontrar':
      return (
        <LayoutMapa
          {...comun}
          encima={<PasoDe n={1} texto="encontrar el campo" />}
          titulo={paso.buscando ? '¿Te ayudamos a encontrarlo?' : 'Encontrá tu campo'}
          sobreMapa={
            <Buscador
              abierto={paso.buscando}
              cerca={campo?.lat != null && campo?.lon != null ? { lat: campo.lat, lon: campo.lon } : undefined}
              onElegir={(l) => mapa.current?.irA(l.lat, l.lon, 15)}
            />
          }
        >
          <p className="text-[15.5px] text-texto-suave">
            {paso.buscando
              ? 'Escribí un camino o un paraje que conozcas, y el mapa va ahí.'
              : `El mapa arranca en ${campo?.lat != null ? 'el pueblo de tu campo' : 'Chascomús'}. Arrastralo y acercate hasta ver tus alambrados.`}
          </p>
          {!paso.buscando && <Demo tipo="arrastrar" />}
          <BotonPrincipal
            icono="Siguiente"
            onClick={() => ir(campo?.provincia.includes('Buenos Aires') ? { e: 'como-borde' } : { e: 'marcar' })}
          >
            Ya lo veo
          </BotonPrincipal>
          {paso.buscando ? (
            <BotonChico type="button" className="self-start" onClick={() => ir({ e: 'marcar' })}>
              Seguir sin encontrarlo
            </BotonChico>
          ) : (
            <BotonChico type="button" icono="Buscar" className="self-start" onClick={() => setPaso({ e: 'encontrar', buscando: true })}>
              ¿No lo encontrás? Buscá un camino
            </BotonChico>
          )}
          {!paso.buscando && <Pista>Arrastrá el mapa hasta ver tu campo</Pista>}
        </LayoutMapa>
      )

    case 'como-borde':
      return (
        <LayoutMapa {...comun} encima={<PasoDe n={2} texto="marcar el borde" />} titulo="¿Cómo marcamos el borde?">
          <p className="text-[15.5px] text-texto-suave">
            El borde va por donde está el alambrado. Sirve para medir el campo y ubicar los potreros.
          </p>
          <BotonPrincipal icono="Comprobante" onClick={() => ir({ e: 'boleta' })}>
            Tengo la boleta de ARBA
          </BotonPrincipal>
          <Boton tipo="secundario" tamano="grande" className="w-full rounded-full" onClick={() => ir({ e: 'marcar' })}>
            No la tengo: lo marco en el mapa
          </Boton>
          <Pista>El borde va por el alambrado</Pista>
        </LayoutMapa>
      )

    case 'boleta':
      return (
        <LayoutMapa {...comun} encima={<PasoDe n={2} texto="marcar el borde" />} titulo="Copiá los números de la boleta">
          <Boleta
            ocupado={ocupado}
            error={error}
            onTraer={(datos) =>
              correr(async () => {
                const res = await buscarParcelaRural(datos)
                if (!res.length) throw new Error('No encontramos esa parcela. Revisá los números o marcala en el mapa.')
                const borde = res[0]!.anillo as LatLng[]
                mapa.current?.encuadrar(borde)
                ir({ e: 'borde-listo', borde, ajustando: false })
              })
            }
            onAMano={() => ir({ e: 'marcar' })}
          />
        </LayoutMapa>
      )

    case 'marcar':
      return (
        <LayoutMapa
          {...comun}
          encima={<PasoDe n={2} texto="marcar el borde" />}
          titulo={movil ? 'Tocá cada esquina' : 'Clic en cada esquina'}
        >
          <p className="text-[15.5px] text-texto-suave">
            Seguí el alambrado. Para cerrar, {movil ? 'tocá' : 'hacé clic en'} el primer punto. Los puntos se pueden arrastrar.
          </p>
          <Demo tipo="esquinas" />
          <div className="flex flex-wrap gap-2">
            <BotonChico type="button" icono="Atrás" disabled={puntos === 0} onClick={() => mapa.current?.deshacer()}>
              Deshacer
            </BotonChico>
            <BotonChico type="button" icono="Reintentar" disabled={puntos === 0} onClick={() => mapa.current?.reiniciar()}>
              Empezar de nuevo
            </BotonChico>
          </div>
          <Pista>
            {puntos === 0
              ? `${movil ? 'Tocá' : 'Clic en'} la primera esquina`
              : `${movil ? 'Tocá' : 'Clic en'} la próxima esquina, ${puntos} ${puntos === 1 ? 'punto' : 'puntos'}`}
          </Pista>
        </LayoutMapa>
      )

    case 'borde-listo': {
      const ha = haRedondo(hectareasDe(paso.borde))
      const alta = campo?.hectareas ?? null
      const comp = compararBorde(ha, alta)
      return (
        <LayoutMapa
          {...comun}
          encima={<PasoDe n={2} texto="marcar el borde" />}
          titulo={`${campo?.nombre} mide unas ${ha} ha`}
        >
          <p className="text-[15.5px] text-texto-suave">
            {paso.ajustando
              ? 'Arrastrá los puntos hasta que el borde siga el alambrado.'
              : {
                  'sin-alta': 'Así quedó el borde del campo.',
                  coincide: `Coincide con lo que pusiste en el alta (${alta} ha).`,
                  adentro: `En el alta pusiste ${alta}. Es común que el borde quede un poco adentro del alambrado.`,
                  afuera: `En el alta pusiste ${alta}. Fijate que el borde no se pase del alambrado.`,
                  'muy-distinto': `En el alta pusiste ${alta}: es bastante distinto. Revisá que el borde vaya por tu alambrado, o ajustalo.`,
                }[comp]}
          </p>
          {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
          {paso.ajustando ? (
            <BotonPrincipal icono="Guardar" onClick={() => setPaso({ ...paso, ajustando: false })}>
              Listo, así queda
            </BotonPrincipal>
          ) : (
            <>
              <BotonPrincipal
                icono="Siguiente"
                cargando={ocupado}
                disabled={ocupado}
                onClick={() =>
                  correr(async () => {
                    await guardarBorde(campo!.id, paso.borde)
                    await recargar()
                    ir(campo!.potreros.length ? { e: 'dibujar' } : { e: 'sin-potreros' })
                  })
                }
              >
                {ocupado ? 'Guardando…' : 'Seguir con los potreros'}
              </BotonPrincipal>
              <div className="flex flex-wrap gap-2">
                <BotonChico type="button" icono="Editar" onClick={() => setPaso({ ...paso, ajustando: true })}>
                  Ajustar el borde
                </BotonChico>
                <BotonChico type="button" onClick={() => ir({ e: 'marcar' })}>
                  Marcarlo de nuevo
                </BotonChico>
              </div>
            </>
          )}
        </LayoutMapa>
      )
    }

    case 'sin-potreros': {
      const ha = campo?.contorno ? haRedondo(hectareasDe(campo.contorno)) : 0
      return (
        <LayoutMapa {...comun} encima={<PasoDe n={3} texto="dibujar los potreros" />} titulo="¿Está dividido en potreros?">
          <p className="text-[15.5px] text-texto-suave">{ha} ha, todavía sin potreros.</p>
          {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
          <BotonPrincipal icono="Siguiente" onClick={() => ir({ e: 'dibujar' })}>
            Sí, los dibujo ahora
          </BotonPrincipal>
          <Boton
            tipo="secundario"
            tamano="grande"
            className="w-full rounded-full"
            disabled={ocupado}
            onClick={() =>
              correr(async () => {
                await campoDeUnSoloPotrero(empresaId, campo!, ha)
                await recargar()
                ir({ e: 'campo-listo' })
              })
            }
          >
            No, es un solo potrero
          </Boton>
          <BotonChico type="button" className="self-start" onClick={() => abrirSoporte(`Hola, no sé bien dónde están los potreros de ${campo?.nombre}.`)}>
            No sé bien dónde están
          </BotonChico>
        </LayoutMapa>
      )
    }

    case 'dibujar':
      return (
        <LayoutMapa
          {...comun}
          encima={<PasoDe n={3} texto={ubicados.length ? `${ubicados.length} de ${campo?.potreros.length} potreros` : 'dibujar los potreros'} />}
          titulo={ubicados.length ? 'Dibujá el siguiente' : 'Dibujá un potrero'}
        >
          <p className="text-[15.5px] text-texto-suave">
            El que quieras{ubicados.length ? '' : ' primero'}. Después te preguntamos cuál es de los que cargaste.
          </p>
          {paso.aviso && <Aviso tipo="atencion" icono="Ayuda" titulo={paso.aviso} />}
          {!ubicados.length && <Demo tipo="potrero" />}
          {faltan.length > 0 && (
            <ListaPotreros titulo={ubicados.length ? 'Faltan' : 'Los que cargaste en el alta'} potreros={faltan} />
          )}
          {puntos > 0 && (
            <div className="flex flex-wrap gap-2">
              <BotonChico type="button" icono="Atrás" onClick={() => mapa.current?.deshacer()}>
                Deshacer
              </BotonChico>
              <BotonChico type="button" icono="Reintentar" onClick={() => mapa.current?.reiniciar()}>
                Empezar de nuevo
              </BotonChico>
            </div>
          )}
          <Pista>{movil ? 'Tocá las esquinas de cualquier potrero' : 'Clic en las esquinas de cualquier potrero'}</Pista>
        </LayoutMapa>
      )

    case 'cual':
      return (
        <Cual
          comun={comun}
          dibujo={paso.dibujo}
          faltan={faltan}
          ocupado={ocupado}
          error={error}
          onEs={(id) =>
            correr(async () => {
              await asignarDibujo(id, paso.dibujo)
              await recargar()
              ir({ e: 'potrero-listo', id })
            })
          }
          onNuevo={() => ir({ e: 'nuevo', dibujo: paso.dibujo })}
          onRedibujar={() => ir({ e: 'dibujar' })}
        />
      )

    case 'nuevo':
      return (
        <Nuevo
          comun={comun}
          dibujo={paso.dibujo}
          campo={campo!}
          ocupado={ocupado}
          error={error}
          onGuardar={(numero, uso) =>
            correr(async () => {
              await crearPotreroDibujado({
                empresaId,
                campoId: campo!.id,
                numero,
                uso,
                poligono: paso.dibujo,
                hectareas: hectareasDe(paso.dibujo),
              })
              await recargar()
              ir(faltan.length ? { e: 'dibujar' } : { e: 'campo-listo' })
            })
          }
          onRedibujar={() => ir({ e: 'dibujar' })}
        />
      )

    case 'potrero-listo': {
      const p = listo
      return (
        <LayoutMapa
          {...comun}
          encima={<PasoDe n={3} texto={`${ubicados.length} de ${campo?.potreros.length} potreros`} />}
          titulo={`El ${p?.nombre} ya está`}
        >
          <p className="text-[15.5px] text-texto-suave">
            {p?.hectareas ? `${p.hectareas} ha` : 'Sus hectáreas'}
            {p && p.cabezas > 0 ? ` y sus ${p.cabezas} cabezas entraron solas` : ' quedaron'}, como lo cargaste en el alta.
          </p>
          {faltan.length > 0 ? (
            <>
              <ListaPotreros titulo="Faltan" potreros={faltan} />
              <BotonPrincipal icono="Siguiente" onClick={() => ir({ e: 'dibujar' })}>
                Dibujar otro
              </BotonPrincipal>
              <BotonChico
                type="button"
                className="self-start"
                onClick={() => abrirSoporte(`Hola, no encuentro uno de los potreros de ${campo?.nombre} en el mapa.`)}
              >
                No encuentro uno: pedir ayuda
              </BotonChico>
            </>
          ) : (
            <BotonPrincipal icono="Siguiente" onClick={() => ir({ e: 'campo-listo' })}>
              Listo, {campo?.nombre}
            </BotonPrincipal>
          )}
        </LayoutMapa>
      )
    }

    case 'campo-listo': {
      const t = campo ? totalesDelMapa([campo]) : { hectareas: 0, potreros: 0, cabezas: 0 }
      if (!siguienteCampo) {
        // Era el último: directo al cierre.
        return <TodosListos comun={comun} campos={campos} />
      }
      return (
        <LayoutMapa {...comun} titulo={`${campo?.nombre} ya está`}>
          <Totales t={t} />
          <p className="text-[15.5px] text-texto-suave">
            Falta {siguienteCampo.nombre}: {siguienteCampo.potreros.length}{' '}
            {siguienteCampo.potreros.length === 1 ? 'potrero' : 'potreros'}, unos {Math.max(3, siguienteCampo.potreros.length * 2)}{' '}
            minutos. Con eso se abre toda la app.
          </p>
          <BotonPrincipal
            icono="Siguiente"
            onClick={() => {
              setActualId(siguienteCampo.id)
              navigate(`/mapa/${siguienteCampo.id}`, { replace: true })
              ir(pasoDeEntrada(siguienteCampo, campos, false))
            }}
          >
            Seguir con {siguienteCampo.nombre}
          </BotonPrincipal>
          <BotonChico type="button" className="self-start" onClick={salir}>
            Después: queda en el Inicio
          </BotonChico>
        </LayoutMapa>
      )
    }

    case 'todos-listos':
      return <TodosListos comun={comun} campos={campos} />
  }
}

// ===== Piezas de cada paso =====

type Comun = { mapa: React.ReactNode; onSalir: () => void; ayuda: string }

function ListaPotreros({ titulo, potreros }: { titulo: string; potreros: CampoMapa['potreros'] }) {
  const vista = [...potreros].sort((a, b) => (b.hectareas ?? 0) - (a.hectareas ?? 0)).slice(0, 4)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13.5px] font-semibold text-texto-suave">{titulo}</p>
      {vista.map((p) => (
        <div key={p.id} className="flex items-baseline gap-3 rounded-[14px] border border-borde bg-superficie px-4 py-2.5">
          <span className="font-heading text-[17px] font-extrabold text-texto">{p.nombre}</span>
          <span className="text-[13.5px] text-texto-suave">
            {p.hectareas ? `${p.hectareas} ha, ` : ''}
            {p.que}
          </span>
        </div>
      ))}
      {potreros.length > vista.length && (
        <p className="text-[13.5px] text-texto-suave">y {potreros.length - vista.length} más</p>
      )}
    </div>
  )
}

function Totales({ t }: { t: { hectareas: number; potreros: number; cabezas: number } }) {
  return (
    <div className="flex gap-8">
      {[
        [t.hectareas, 'hectáreas'],
        [t.potreros, 'potreros'],
        [t.cabezas, 'cabezas'],
      ].map(([v, n]) => (
        <div key={n} className="flex flex-col">
          <span className="titulo-display text-[40px] leading-none text-texto">{v}</span>
          <span className="mt-1 text-[13.5px] text-texto-suave">{n}</span>
        </div>
      ))}
    </div>
  )
}

function Buscador({
  abierto,
  cerca,
  onElegir,
}: {
  abierto: boolean
  cerca?: { lat: number; lon: number }
  onElegir: (l: Lugar) => void
}) {
  const [texto, setTexto] = useState('')
  const [lugares, setLugares] = useState<Lugar[]>([])
  const [nada, setNada] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (abierto) input.current?.focus()
  }, [abierto])
  useEffect(() => {
    if (texto.trim().length < 3) return
    let vivo = true
    const t = window.setTimeout(() => {
      buscarLugar(texto, cerca)
        .then((r) => {
          if (!vivo) return
          setLugares(r)
          setNada(r.length === 0)
        })
        .catch(() => vivo && setNada(true))
    }, 350)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [texto, cerca])
  const lista = texto.trim().length < 3 ? [] : lugares
  return (
    <div className="pointer-events-auto relative w-full max-w-[420px] max-md:hidden">
      <label className="flex items-center gap-2 rounded-[14px] bg-superficie px-4 shadow-md">
        <Icono nombre="Buscar" tamano={16} className="text-texto-suave" />
        <input
          ref={input}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscá un camino, paraje o estancia"
          aria-label="Buscá un camino, paraje o estancia"
          className="w-full bg-transparent py-3 text-[15px] text-texto outline-none placeholder:text-texto-suave/70"
        />
      </label>
      {(lista.length > 0 || (nada && texto.trim().length >= 3)) && (
        <ul className="mt-2 overflow-hidden rounded-[14px] bg-superficie py-1.5 shadow-lg">
          {lista.map((l) => (
            <li key={`${l.lat},${l.lon}`}>
              <button
                type="button"
                onClick={() => {
                  onElegir(l)
                  setLugares([])
                  setTexto(l.nombre)
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14.5px] font-semibold text-texto hover:bg-principal-suave"
              >
                <Icono nombre="Ubicación" tamano={16} className="shrink-0 text-principal" />
                <span className="truncate">{l.nombre}</span>
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="px-4 py-2.5 text-[14px] text-texto-suave">No lo encontramos. Probá con otro nombre.</li>}
        </ul>
      )}
    </div>
  )
}

function Boleta({
  ocupado,
  error,
  onTraer,
  onAMano,
}: {
  ocupado: boolean
  error: string | null
  onTraer: (d: { partido: string; circ: string; parcela: string }) => void
  onAMano: () => void
}) {
  const [partido, setPartido] = useState('')
  const [circ, setCirc] = useState('')
  const [parcela, setParcela] = useState('')
  const listo = partido.trim() && parcela.trim()
  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault()
        if (listo) onTraer({ partido, circ, parcela })
      }}
    >
      <div className="flex flex-col gap-1 rounded-[14px] bg-estado-atencion-suave px-4 py-3">
        <p className="text-[12.5px] font-semibold text-estado-atencion-texto">Impuesto inmobiliario rural, arriba a la izquierda</p>
        <p className="cifra text-[18px] font-bold text-estado-atencion-texto">Partido 027, Circ. II, Parcela 1758A</p>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <CampoTexto etiqueta="Partido" inputMode="numeric" value={partido} placeholder="027" onChange={(e) => setPartido(e.target.value)} />
        <CampoTexto etiqueta="Circunscripción" value={circ} placeholder="II" onChange={(e) => setCirc(e.target.value)} />
        <CampoTexto etiqueta="Parcela" value={parcela} placeholder="1758A" onChange={(e) => setParcela(e.target.value)} />
      </div>
      {error && <Aviso tipo="problema" titulo="No salió el borde">{error}</Aviso>}
      <BotonPrincipal type="submit" icono="Siguiente" cargando={ocupado} disabled={!listo || ocupado}>
        {ocupado ? 'Buscando en el catastro…' : 'Traer el borde'}
      </BotonPrincipal>
      <BotonChico type="button" className="self-start" onClick={onAMano}>
        No encuentro el número: lo marco en el mapa
      </BotonChico>
    </form>
  )
}

function Cual({
  comun,
  dibujo,
  faltan,
  ocupado,
  error,
  onEs,
  onNuevo,
  onRedibujar,
}: {
  comun: Comun
  dibujo: LatLng[]
  faltan: CampoMapa['potreros']
  ocupado: boolean
  error: string | null
  onEs: (id: string) => void
  onNuevo: () => void
  onRedibujar: () => void
}) {
  const ha = haRedondo(hectareasDe(dibujo))
  const cs = candidatos(faltan, ha)
  const [elegido, setElegido] = useState<string | null>(preseleccion(cs))
  const dos = cs.filter((c) => c.parecido).length > 1
  const sel = cs.find((c) => c.id === elegido)
  return (
    <LayoutMapa {...comun} encima={<PasoDe n={3} texto="dibujar los potreros" />} titulo={`Mide unas ${ha} ha. ¿Cuál es?`}>
      {dos && <p className="text-[15.5px] text-texto-suave">Hay dos de tamaño parecido. Mirá qué tiene cada uno.</p>}
      <div role="radiogroup" aria-label="Qué potrero es" className="flex flex-col gap-2">
        {cs.slice(0, 6).map((c) => {
          const activo = c.id === elegido
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setElegido(c.id)}
              className={cn(
                'flex items-center gap-3 rounded-[14px] border-[1.5px] bg-superficie px-4 py-2.5 text-left transition-colors',
                activo ? 'border-principal' : 'border-borde hover:border-texto-suave/50',
              )}
            >
              <span className={cn('font-heading text-[17px] font-extrabold', activo ? 'text-principal' : 'text-texto')}>{c.nombre}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-texto-suave">
                {c.hectareas ? `${c.hectareas} ha, ` : ''}
                {c.que}
              </span>
              {c.parecido && (
                <span className="shrink-0 rounded-full bg-estado-atencion-suave px-2 py-0.5 text-[12px] font-semibold text-estado-atencion-texto">
                  tamaño parecido
                </span>
              )}
            </button>
          )
        })}
      </div>
      {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
      {sel ? (
        <BotonPrincipal icono="Siguiente" cargando={ocupado} disabled={ocupado} onClick={() => onEs(sel.id)}>
          {ocupado ? 'Guardando…' : `Es el ${sel.nombre}`}
        </BotonPrincipal>
      ) : (
        <p className="text-[14px] font-semibold text-texto-suave">Elegí uno para seguir</p>
      )}
      <div className="flex flex-wrap gap-2">
        <BotonChico type="button" onClick={onNuevo}>
          No está en la lista: es uno nuevo
        </BotonChico>
        <BotonChico type="button" icono="Reintentar" onClick={onRedibujar}>
          Lo dibujo de nuevo
        </BotonChico>
      </div>
    </LayoutMapa>
  )
}

function Nuevo({
  comun,
  dibujo,
  campo,
  ocupado,
  error,
  onGuardar,
  onRedibujar,
}: {
  comun: Comun
  dibujo: LatLng[]
  campo: CampoMapa
  ocupado: boolean
  error: string | null
  onGuardar: (numero: string, uso: 'hacienda' | 'sembrado' | 'vacio') => void
  onRedibujar: () => void
}) {
  const ha = haRedondo(hectareasDe(dibujo))
  const usados = campo.potreros.map((p) => parseInt(p.nombre.replace(/\D/g, ''), 10)).filter((n) => n > 0)
  const [numero, setNumero] = useState(String((usados.length ? Math.max(...usados) : 0) + 1))
  const [uso, setUso] = useState<'hacienda' | 'sembrado' | 'vacio'>('hacienda')
  const letra = campo.potreros[0]?.nombre.replace(/\d/g, '') ?? ''
  const repetido = campo.potreros.some((p) => p.nombre === `${numero}${letra}`)
  return (
    <LayoutMapa {...comun} encima={<PasoDe n={3} texto="dibujar los potreros" />} titulo={`Potrero nuevo: ${ha} ha`}>
      <CampoTexto
        etiqueta="Número"
        inputMode="numeric"
        value={numero}
        unidad={letra}
        onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 3))}
        error={repetido ? `Ya hay un ${numero}${letra}. Elegí otro número.` : undefined}
      />
      <Segmentos
        etiqueta="Qué hay"
        valor={uso}
        onCambio={setUso}
        opciones={[
          { valor: 'hacienda', texto: 'Hacienda' },
          { valor: 'sembrado', texto: 'Sembrado' },
          { valor: 'vacio', texto: 'Vacío' },
        ]}
      />
      <p className="text-[13px] text-texto-suave">La hacienda se mueve a este potrero después, desde Hacienda o en la manga.</p>
      {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
      <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado || !numero || repetido} onClick={() => onGuardar(numero, uso)}>
        {ocupado ? 'Guardando…' : 'Guardar el potrero'}
      </BotonPrincipal>
      <BotonChico type="button" icono="Reintentar" className="self-start" onClick={onRedibujar}>
        Lo dibujo de nuevo
      </BotonChico>
    </LayoutMapa>
  )
}

function TodosListos({ comun, campos }: { comun: Comun; campos: CampoMapa[] }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const t = totalesDelMapa(campos)
  const titulo = campos.length === 1 ? 'Tu campo, en el mapa' : campos.length === 2 ? 'Tus dos campos, en el mapa' : `Tus ${campos.length} campos, en el mapa`
  return (
    <LayoutMapa {...comun} titulo={titulo} salidas={false}>
      <Totales t={t} />
      <p className="text-[15.5px] text-texto-suave">
        Se abrió toda la app. Empezá por la Hacienda: ahí están tus {t.cabezas} cabezas, potrero por potrero.
      </p>
      {error && <Aviso tipo="problema" titulo="Falta algo">{error}</Aviso>}
      <BotonPrincipal
        icono="Siguiente"
        cargando={ocupado}
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true)
          setError(null)
          try {
            await terminarMapa()
            await qc.invalidateQueries()
            navigate('/', { replace: true })
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo abrir la app.')
            setOcupado(false)
          }
        }}
      >
        Ir al Inicio
      </BotonPrincipal>
    </LayoutMapa>
  )
}

/** Celular (35, «Tutorial celu · Primero tu campo»): el mapa se arma mejor en la compu. */
function PrimeroEnLaCompu({
  campo,
  celular,
  onCelular,
  onSaltear,
}: {
  campo: CampoMapa | null
  celular: string | null
  onCelular: () => void
  onSaltear: () => void
}) {
  const [mandado, setMandado] = useState(false)
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-principal px-[18px] pt-[max(18px,env(safe-area-inset-top))] pb-[max(22px,env(safe-area-inset-bottom))] text-superficie">
      <div className="flex justify-end">
        <BotonChico type="button" className="border-acento py-1.5 text-[13.5px] text-acento hover:bg-white/10" onClick={onSaltear}>
          Saltear
        </BotonChico>
      </div>
      <div className="mx-auto mt-6 w-full max-w-[330px]">
        <div className="rounded-[14px] border-[7px] border-tinta bg-tinta">
          <img src={ejemplo} alt="" className="aspect-[16/10] w-full rounded-[7px] object-cover" />
        </div>
        <div className="mx-[-14px] h-2.5 rounded-b-lg bg-tinta" />
      </div>
      <h1 className="titulo-display mt-10 text-[38px] leading-[1.02]">Primero, armá tu campo en la compu.</h1>
      <p className="mt-5 text-[16px] text-superficie/90">
        Marcás el campo y sus potreros en el mapa. Después el celular te ubica en cada uno.
      </p>
      <div className="mt-auto flex flex-col gap-3 pt-8">
        {mandado ? (
          <p role="status" className="rounded-[18px] bg-white/15 px-4 py-3 text-center text-[15px] font-semibold">
            Listo: abrí el link en la compu.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              const link = `${window.location.origin}/mapa${campo ? `/${campo.id}` : ''}`
              window.open(
                `https://wa.me/${(celular ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(`Tropero: abrí este link en la compu para armar tu campo en el mapa ${link}`)}`,
                '_blank',
                'noopener',
              )
              setMandado(true)
            }}
            className="flex w-full items-center justify-between rounded-full bg-acento py-2 pr-2 pl-6 text-left text-[16.5px] font-bold text-acento-texto"
          >
            Mandame el link a la compu
            <span className="grid size-12 place-items-center rounded-full bg-principal text-principal-texto">
              <Icono nombre="Mail" />
            </span>
          </button>
        )}
        <BotonChico type="button" className="self-center border-superficie/70 text-superficie hover:bg-white/10" onClick={onCelular}>
          Armarlo desde el celular
        </BotonChico>
      </div>
    </div>
  )
}
