import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Aviso } from '@/components/tropero/aviso'
import { Boton, BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Segmentos } from '@/components/tropero/segmentos'
import { crearPotrero, type CampoConPotreros } from '@/features/campos/api'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { buscarParcelaRural, parcelaEnPunto } from '@/features/lotes/catastro'
import { asignarDibujo, campoDeUnSoloPotrero, corregirHectareasCampo, corregirHectareasPotrero, guardarBorde, terminarMapa } from '@/features/mapa/api'
import { MapaTutorial, type Guia, type MapaTutorialApi, type ModoMapa } from '@/features/mapa/mapa-tutorial'
import { Boleta, Buscador, Comparacion, ComoSeDibuja, Totales } from '@/features/mapa/piezas'
import { abrirSoporte } from '@/features/mapa/soporte'
import {
  candidatos,
  compararBorde,
  esquinaDe,
  estadoDe,
  fueraDelBorde,
  haRedondo,
  haTexto,
  hectareasDe,
  pisaA,
  preseleccion,
  totalesDelMapa,
  type CampoMapa,
  type LatLng,
} from '@/features/mapa/reglas'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'
import { Acompanante, type Objetivo } from './acompanante'
import { dudasDe } from './dudas'
import { useMarcarVista, usePendiente } from '@/features/guia/guia-store'
import { adentro, dividir, numeroSiguiente } from './dividir'

// El mapa del campo, adentro de Campos: ubicarlo (encontrarlo en el satélite y
// marcar el borde, con el catastro, la boleta o a mano), dibujar sus potreros y
// después corregirlos o dividirlos (Figma 39, «Dibujar en el celular»). Es el
// tutorial de la página 35 sin salir de la web: la barra, el encabezado y los
// campos quedan; cambia el mapa y la tarjeta. Mientras se arma, el asistente
// acompaña cada paso (acompanante.tsx).

type PotreroM = CampoMapa['potreros'][number]
type Uso = 'hacienda' | 'sembrado' | 'vacio'

type Paso =
  // ===== El borde =====
  | { e: 'bienvenida' }
  | { e: 'encontrar'; buscando: boolean }
  | { e: 'tocar'; buscando: boolean; aviso?: string }
  | { e: 'parcela'; borde: LatLng[] }
  | { e: 'boleta' }
  | { e: 'marcar' }
  /** `corrigiendo`: el campo ya tenía borde y se lo está ajustando. */
  | { e: 'borde-listo'; borde: LatLng[]; ajustando: boolean; altaCorregida?: boolean; corrigiendo?: boolean }
  | { e: 'sin-potreros' }
  // ===== Los potreros =====
  | { e: 'inicio' }
  | { e: 'potrero'; id: string }
  /** `id`: el elegido de la lista; null: se dibuja y después se dice cuál es. */
  | { e: 'dibujar'; id: string | null; aviso?: string }
  | { e: 'cual'; dibujo: LatLng[] }
  | { e: 'confirmar'; id: string; dibujo: LatLng[] }
  | { e: 'nuevo'; dibujo: LatLng[] }
  /** Lo recién guardado: uno, o las dos partes de una división. */
  | { e: 'listo'; id: string; nombre: string; piezas: { id: string; nombre: string; poligono: LatLng[] }[] }
  | { e: 'borde'; id: string; pts: LatLng[] | null; aviso?: string }
  | { e: 'dividir'; id: string; puntos: number; aviso?: string }
  | { e: 'revisar'; id: string; piezas: [LatLng[], LatLng[]]; queda: 0 | 1 }
  // ===== El campo, listo =====
  | { e: 'cierre' }

const ESTADO: Record<Uso, 'ganadero' | 'cultivo' | 'descanso'> = { hacienda: 'ganadero', sembrado: 'cultivo', vacio: 'descanso' }
const ordenar = (ps: PotreroM[]) => [...ps].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))

function pasoDeEntrada(mapa: CampoMapa): Paso {
  const est = estadoDe(mapa)
  if (est.tipo === 'sin-borde') return { e: 'bienvenida' }
  if (est.tipo === 'sin-potreros') return { e: 'sin-potreros' }
  return { e: 'inicio' }
}

export default function EditorCampo({
  campo,
  mapa,
  campos,
  empresaId,
  pendiente,
  nota,
  onEmpezo,
  onSalir,
  onSeguirCon,
}: {
  campo: CampoConPotreros
  mapa: CampoMapa
  /** Todos los campos de la empresa: para seguir con el que falta. */
  campos: CampoMapa[]
  empresaId: string
  /** El dueño todavía no terminó el mapa: el resto de la app espera. */
  pendiente: boolean
  /** Llegó desde una sección cerrada: «La Hacienda se abre cuando…». */
  nota?: string
  /** Antes del primer guardado: Campos se queda en el editor aunque el mapa quede completo. */
  onEmpezo: () => void
  /** null si todavía falta algo (no se puede volver al campo). */
  onSalir: (() => void) | null
  onSeguirCon: (campoId: string) => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const movil = useIsMobile()
  const api = useRef<MapaTutorialApi>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const hostMapa = useRef<HTMLDivElement>(null)
  const [paso, setPaso] = useState<Paso>(() => pasoDeEntrada(mapa))
  const [puntos, setPuntos] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verNota, setVerNota] = useState(!!nota)
  /** Ya arrastró el mapa buscando su campo: el asistente pasa a «Ya lo veo». */
  const [movido, setMovido] = useState(false)
  /** Cambia cuando el mapa se mueve: lo que se ubica sobre un punto del mapa se vuelve a medir. */
  const [vuelta, setVuelta] = useState(0)
  const [tamMapa, setTamMapa] = useState({ w: 0, h: 0 })
  const letra = colorDeCampo(mapa.colorIdx ?? 0).letra

  const faltan = ordenar(mapa.potreros.filter((p) => !p.poligono))
  const dibujados = ordenar(mapa.potreros.filter((p) => p.poligono))
  const de = (id: string) => mapa.potreros.find((p) => p.id === id)
  const fino = (id: string) => campo.potreros.find((p) => p.id === id)
  const esBA = mapa.provincia.includes('Buenos Aires')
  const siguienteCampo = campos.find((c) => c.id !== mapa.id && estadoDe(c).tipo !== 'listo')
  // El asistente acompaña mientras el campo se arma (o falta terminar el mapa); después, sólo la pista.
  const guiado = pendiente || estadoDe(mapa).tipo !== 'listo'
  // La primera vez que lo ve, el asistente se presenta en la bienvenida (una vez por persona, no por campo).
  const presentarse = usePendiente('presentacion')
  const marcarVista = useMarcarVista()

  useEffect(() => {
    const el = hostMapa.current
    if (!el) return
    const ro = new ResizeObserver(() => setTamMapa({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function ir(p: Paso) {
    setVerNota(false)
    setError(null)
    setPuntos(0)
    setPaso(p)
  }
  async function correr(fn: () => Promise<void>) {
    setOcupado(true)
    setError(null)
    onEmpezo()
    try {
      await fn()
      await Promise.all(
        [['mapa'], ['campo-mapa', campo.id], ['campos-con-potreros'], ['potreros-campo', campo.id], ['potreros'], ['panorama-inicio'], ['potrero-detalle'], ['asistente-checklist']].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      throw e
    } finally {
      setOcupado(false)
    }
  }
  /** Corre y se queda en el paso si falla (el error queda en la tarjeta). */
  const intentar = async (fn: () => Promise<void>, despues: () => void) => {
    try {
      await correr(fn)
      despues()
    } catch {
      /* el error queda en pantalla */
    }
  }
  const enfocar = (p: LatLng[] | null | undefined) => p && api.current?.encuadrar(p)

  // ===== Lo que llega del mapa =====

  function alDibujar(p: LatLng[]) {
    if (paso.e === 'marcar') return ir({ e: 'borde-listo', borde: p, ajustando: false })
    if (paso.e !== 'dibujar') return
    // Un dibujo rechazado no termina el paso: se avisa y el mapa ya está listo para el siguiente.
    const rechazar = (aviso: string) => (setPuntos(0), setPaso({ ...paso, aviso }))
    if (mapa.contorno && fueraDelBorde(p, mapa.contorno) > 0.3) return rechazar('Ese dibujo se sale del borde del campo. Dibujalo adentro.')
    const pisado = pisaA(p, dibujados.filter((x) => x.id !== paso.id))
    if (pisado) return rechazar(`Se pisa con el ${pisado.nombre}. Dibujalo al lado.`)
    if (!paso.id) return ir(faltan.length ? { e: 'cual', dibujo: p } : { e: 'nuevo', dibujo: p })
    const pot = de(paso.id)
    if (pot?.hectareas && compararBorde(hectareasDe(p), pot.hectareas) === 'muy-distinto') return ir({ e: 'confirmar', id: paso.id, dibujo: p })
    void guardarDibujo(paso.id, p, !pot?.hectareas)
  }

  /** Cada punto de la línea: cuando cruzó el potrero de lado a lado, se corta. */
  function alMarcarLinea(linea: LatLng[]) {
    if (paso.e !== 'dividir') return
    const pol = de(paso.id)?.poligono
    if (!pol) return
    if (linea.length < 2) return setPaso({ ...paso, puntos: linea.length, aviso: undefined })
    const r = dividir(pol, linea)
    if (r.ok) return ir({ e: 'revisar', id: paso.id, piezas: r.piezas, queda: hectareasDe(r.piezas[0]) >= hectareasDe(r.piezas[1]) ? 0 : 1 })
    if (r.motivo === 'cruza-de-mas') {
      api.current?.reiniciar()
      return setPaso({ ...paso, puntos: 0, aviso: 'La línea entró y salió del potrero más de una vez. Marcala de un lado al otro, sin volver.' })
    }
    setPaso({ ...paso, puntos: linea.length, aviso: undefined })
  }

  async function alTocar(lat: number, lng: number) {
    if (paso.e === 'tocar' || paso.e === 'parcela') {
      setPaso({ e: 'tocar', buscando: true })
      try {
        const p = await parcelaEnPunto(lat, lng)
        if (!p) return setPaso({ e: 'tocar', buscando: false, aviso: 'Ahí no hay una parcela del catastro. Tocá más adentro del campo.' })
        enfocar(p.anillo as LatLng[])
        setPaso({ e: 'parcela', borde: p.anillo as LatLng[] })
      } catch (e) {
        setPaso({ e: 'tocar', buscando: false, aviso: e instanceof Error ? e.message : 'No pudimos buscar la parcela.' })
      }
      return
    }
    const p = dibujados.find((x) => x.poligono && adentro([lat, lng], x.poligono))
    if (p) ir({ e: 'potrero', id: p.id })
    else if (paso.e === 'potrero') ir({ e: 'inicio' })
  }

  // ===== Guardar =====

  /** `conMedida`: el dibujo manda en las hectáreas (no había alta, o se confirmó que estaba mal). */
  function guardarDibujo(id: string, p: LatLng[], conMedida: boolean) {
    const nombre = de(id)?.nombre ?? ''
    return intentar(
      async () => {
        await asignarDibujo(id, p)
        if (conMedida) await corregirHectareasPotrero(id, haRedondo(hectareasDe(p)))
      },
      () => ir({ e: 'listo', id, nombre, piezas: [{ id, nombre, poligono: p }] }),
    )
  }

  function guardarNuevo(dibujo: LatLng[], numero: string, uso: Uso) {
    let creado = { id: '', nombre: '' }
    return intentar(
      async () => {
        creado = await crearPotrero({ empresaId, campoId: campo.id, nombre: `${numero}${letra}`, estadoCiclo: ESTADO[uso], hectareas: haRedondo(hectareasDe(dibujo)) })
        await asignarDibujo(creado.id, dibujo)
      },
      () => ir({ e: 'listo', id: creado.id, nombre: creado.nombre, piezas: [{ id: creado.id, nombre: creado.nombre, poligono: dibujo }] }),
    )
  }

  async function guardarBordePotrero(id: string, pts: LatLng[]) {
    const otros = dibujados.filter((x) => x.id !== id)
    if (mapa.contorno && fueraDelBorde(pts, mapa.contorno) > 0.3) return setPaso({ e: 'borde', id, pts, aviso: 'Así se sale del borde del campo.' })
    const pisado = pisaA(pts, otros)
    if (pisado) return setPaso({ e: 'borde', id, pts, aviso: `Así se pisa con el ${pisado.nombre}.` })
    await guardarDibujo(id, pts, true)
  }

  function guardarDivision(id: string, piezas: [LatLng[], LatLng[]], queda: 0 | 1, numero: string) {
    const original = fino(id)
    const sigue = piezas[queda]
    const otra = piezas[queda === 0 ? 1 : 0]
    // La parte nueva sigue sembrada si el potrero lo estaba; si tenía hacienda, la hacienda queda en el que conserva el nombre.
    const sembrado = original && ['siembra', 'cultivo', 'cosecha'].includes(original.estadoCiclo)
    const viejo = de(id)?.nombre ?? ''
    let nuevo = { id: '', nombre: '' }
    return intentar(
      async () => {
        // Primero el nuevo: si el número está repetido, no se tocó nada.
        nuevo = await crearPotrero({ empresaId, campoId: campo.id, nombre: `${numero}${letra}`, estadoCiclo: sembrado ? original.estadoCiclo : 'descanso', hectareas: haRedondo(hectareasDe(otra)) })
        await asignarDibujo(id, sigue)
        await corregirHectareasPotrero(id, haRedondo(hectareasDe(sigue)))
        await asignarDibujo(nuevo.id, otra)
      },
      () =>
        ir({
          e: 'listo',
          id: nuevo.id,
          nombre: `${viejo} y ${nuevo.nombre}`,
          piezas: [
            { id, nombre: viejo, poligono: sigue },
            { id: nuevo.id, nombre: nuevo.nombre, poligono: otra },
          ],
        }),
    )
  }

  async function abrirLaApp() {
    await intentar(
      async () => {
        await terminarMapa()
        await qc.invalidateQueries()
      },
      () => navigate('/', { replace: true }),
    )
  }

  // ===== El mapa, según el paso =====

  const sel = 'id' in paso && paso.id ? de(paso.id) : undefined
  const etapaBorde = ['bienvenida', 'encontrar', 'tocar', 'parcela', 'boleta', 'marcar', 'borde-listo'].includes(paso.e)
  const modo: ModoMapa =
    paso.e === 'tocar' || paso.e === 'parcela'
      ? 'tocar'
      : paso.e === 'marcar'
        ? 'borde'
        : (paso.e === 'borde-listo' && paso.ajustando) || paso.e === 'borde'
          ? 'ajustar'
          : paso.e === 'dibujar'
            ? 'potrero'
            : paso.e === 'dividir'
              ? 'linea'
              : paso.e === 'inicio' || paso.e === 'potrero'
                ? 'tocar'
                : 'mirar'
  const contorno = paso.e === 'borde-listo' ? paso.borde : mapa.contorno
  const borrador = paso.e === 'confirmar' || paso.e === 'nuevo' || paso.e === 'cual' ? paso.dibujo : null
  const nombreNuevo = numeroSiguiente(mapa.potreros.map((p) => p.nombre))
  const conHa = (poligono: LatLng[], nombre: string) => ({ poligono, nombre, que: `${haTexto(haRedondo(hectareasDe(poligono)))} ha` })
  const piezas = useMemo(
    () =>
      paso.e === 'revisar'
        ? paso.piezas.map((poligono, i) => conHa(poligono, i === paso.queda ? (de(paso.id)?.nombre ?? '') : `${nombreNuevo}${letra}`))
        : paso.e === 'listo'
          ? paso.piezas.map((x) => conHa(x.poligono, x.nombre))
          : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paso, nombreNuevo, letra],
  )
  const ocultos = useMemo(
    () => (paso.e === 'listo' ? paso.piezas.map((x) => x.id) : paso.e === 'borde' || paso.e === 'revisar' || paso.e === 'confirmar' ? [paso.id] : undefined),
    [paso],
  )
  const esquina = mapa.contorno ? esquinaDe(mapa.contorno) : null
  const primerDibujo = paso.e === 'dibujar' && puntos === 0 && dibujados.length === 0 && !!esquina

  // La mano sobre el mapa: qué gesto y dónde (sin texto: lo dice el asistente).
  const gesto: 'arrastrar' | 'tocar' | null =
    !guiado
      ? null
      : paso.e === 'encontrar' && !paso.buscando && !movido
        ? 'arrastrar'
        : (paso.e === 'tocar' && !paso.buscando) || (paso.e === 'marcar' && puntos === 0) || primerDibujo
          ? 'tocar'
          : null
  const guia = useMemo<Guia | null>(() => (gesto ? { tipo: gesto, en: primerDibujo ? esquina! : undefined } : null), [gesto, primerDibujo, esquina])

  // Dónde cae en pantalla la esquina que señala la mano: se vuelve a medir cuando el mapa se mueve.
  const [ptEsquina, setPtEsquina] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    setPtEsquina(primerDibujo && esquina ? (api.current?.aPantalla(esquina) ?? null) : null)
  }, [primerDibujo, esquina, vuelta, tamMapa])

  // Lo que dice el asistente y a dónde va. Si lo que hay que tocar está en la
  // tarjeta, se queda acoplado arriba de ella y habla la tarjeta (el texto que
  // queda acá no se muestra); si está en el mapa, va hasta ahí con su línea.
  const punto = (): Objetivo => {
    if (primerDibujo && ptEsquina) return { tipo: 'punto', ...ptEsquina }
    // Sin lugar fijo, la mano va un poco abajo y a la izquierda del centro (ver mapa-tutorial).
    return { tipo: 'punto', x: tamMapa.w * 0.4, y: tamMapa.h * 0.62 }
  }
  const verbo = movil ? 'Tocá' : 'Hacé clic'
  const [objetivo, dice] = ((): [Objetivo | null, string | null] => {
    if (!guiado) return [null, null]
    const boton = (id: string, t: string): [Objetivo, string] => [{ tipo: 'tarjeta', resalta: id }, t]
    const arriba = (t: string): [Objetivo, string] => [{ tipo: 'arriba' }, t]
    switch (paso.e) {
      case 'bienvenida':
        return boton('empezar', '¡Hola! Te acompaño a armar tu campo: son tres pasos.')
      case 'encontrar':
        if (paso.buscando) return boton('buscador', 'Escribí un camino o un paraje que conozcas.')
        return movido ? boton('ya-lo-veo', '¿Ves tus alambrados? Seguí.') : [punto(), 'Arrastrá el mapa hasta ver tu campo.']
      case 'tocar':
        return paso.buscando ? [{ tipo: 'tarjeta' }, null] : [punto(), `${verbo} adentro de tu campo.`]
      case 'parcela':
        return boton('es-este', 'Si es tu campo, confirmalo.')
      case 'boleta':
        return boton('boleta', 'Los números están arriba a la izquierda de la boleta.')
      case 'marcar':
        if (puntos === 0) return [punto(), 'Empezá por una esquina del alambrado.']
        return movil ? arriba('Seguí el alambrado y cerrá en el primer punto.') : [{ tipo: 'tarjeta' }, null]
      case 'borde-listo':
        if (paso.ajustando) return arriba('Arrastrá los puntos hasta el alambrado.')
        if (!paso.altaCorregida && compararBorde(haRedondo(hectareasDe(paso.borde)), mapa.hectareas) === 'muy-distinto')
          return boton('corregir-alta', 'No cuadra con el alta: decidí cuál está bien.')
        return boton('seguir-potreros', paso.corrigiendo ? 'Si sigue el alambrado, guardalo.' : 'El borde está. Ahora, los potreros.')
      case 'sin-potreros':
        return boton('dividido', '¿Tiene potreros adentro?')
      case 'inicio':
        if (!faltan.length) return [{ tipo: 'tarjeta' }, null]
        return boton('dibujar', dibujados.length ? 'Dibujá el siguiente.' : 'Dibujá cualquiera: después te pregunto cuál es.')
      case 'dibujar':
        if (primerDibujo) return [punto(), 'Empezá por una esquina.']
        if (puntos === 0) return arriba(`Marcá las esquinas${sel ? ` del ${sel.nombre}` : ' de un potrero'}.`)
        return movil ? arriba('Cerrá en el primer punto.') : [{ tipo: 'tarjeta' }, null]
      case 'cual':
        return boton('cual', '¿Cuál de los que cargaste es?')
      case 'nuevo':
        return boton('guardar-nuevo', 'Ponele número y qué hay.')
      case 'confirmar':
        return boton('confirmar', 'Mirá si seguiste el alambrado.')
      case 'listo':
        return boton('siguiente', faltan.length ? '¡Uno menos! Vamos con el que sigue.' : '¡Todos los potreros, en el mapa!')
      case 'cierre':
        return boton('cierre', siguienteCampo ? `¡Bien! Seguimos con ${siguienteCampo.nombre}.` : '¡Listo! Se abre toda la app.')
      default:
        return [{ tipo: 'tarjeta' }, null]
    }
  })()

  // Sin asistente (el campo ya está armado): la pastilla de siempre, arriba del mapa.
  const pista: string | null = guiado
    ? null
    : paso.e === 'inicio'
      ? 'Tocá un potrero para corregirlo'
      : paso.e === 'dibujar'
        ? puntos >= 3
          ? `${movil ? 'Tocá' : 'Hacé clic en'} el primer punto para cerrar`
          : `Marcá las esquinas${sel ? ` del ${sel.nombre}` : ''}`
        : paso.e === 'borde' || (paso.e === 'borde-listo' && paso.ajustando)
          ? 'Arrastrá los puntos hasta el alambrado'
          : paso.e === 'dividir'
            ? paso.puntos === 0
              ? 'Empezá afuera del potrero'
              : 'Terminá del otro lado, afuera'
            : null
  const dibujando = paso.e === 'dibujar' || paso.e === 'dividir' || paso.e === 'marcar'
  // Con mouse, la pastilla que sigue al cursor dice en qué esquina va.
  const pistaCursor =
    paso.e === 'dividir'
      ? pista ?? undefined
      : puntos === 0
        ? 'Primera esquina'
        : puntos < 3
          ? `Esquina ${puntos + 1}`
          : `Esquina ${puntos + 1}, o cerrá en el primer punto`

  const mapaEl = (
    <MapaTutorial
      ref={api}
      className="size-full"
      centro={{ lat: mapa.lat ?? -35.57, lon: mapa.lon ?? -58.0, zoom: 14 }}
      contorno={contorno}
      potreros={mapa.potreros}
      foco={!etapaBorde && !!mapa.contorno}
      pueblo={(paso.e === 'bienvenida' || paso.e === 'encontrar' || paso.e === 'tocar') && mapa.lat != null && mapa.lon != null && mapa.localidad ? { lat: mapa.lat, lon: mapa.lon, nombre: mapa.localidad } : null}
      relleno={movil ? {} : { derecha: 400 }}
      modo={modo}
      borrador={borrador}
      editable={paso.e === 'borde' ? (sel?.poligono ?? null) : null}
      ocultos={ocultos}
      piezas={piezas}
      candidato={paso.e === 'parcela' ? paso.borde : null}
      elegido={paso.e === 'potrero' || paso.e === 'dividir' ? (sel?.id ?? null) : null}
      guia={guia}
      pistaCursor={dibujando ? pistaCursor : undefined}
      onDibujo={alDibujar}
      onPuntos={setPuntos}
      onAjuste={(pts) => {
        if (paso.e === 'borde') setPaso({ ...paso, pts, aviso: undefined })
        if (paso.e === 'borde-listo') setPaso({ ...paso, borde: pts })
      }}
      onLinea={alMarcarLinea}
      onToque={(lat, lng) => void alTocar(lat, lng)}
      onArrastre={() => setMovido(true)}
      onMovio={primerDibujo ? () => setVuelta((v) => v + 1) : undefined}
    />
  )

  const ha = (p: LatLng[]) => haRedondo(hectareasDe(p))
  const problema = error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>

  // Compu: el mapa entero y la tarjeta flotando a la derecha. Celular (Figma M1–M4): el mapa arriba y la tarjeta abajo, sin taparlo.
  return (
    <div ref={raiz} data-guia="campos-editor" className={cn('absolute inset-0', movil && 'flex flex-col')}>
      <div ref={hostMapa} className={cn('relative', movil ? 'h-[50%] shrink-0' : 'size-full')}>
        {mapaEl}
        {pista && (movil || !dibujando) && (
          <div
            role="status"
            className="pointer-events-none absolute top-4 left-4 z-[500] flex items-center gap-2 rounded-full bg-tinta/90 px-4 py-2.5 text-[14px] font-semibold text-superficie shadow-lg max-lg:right-4 max-lg:w-fit"
          >
            <Icono nombre="Ayuda" tamano={16} className="text-acento" />
            {pista}
          </div>
        )}
      </div>
      <aside
        className={cn(
          'z-[600] flex flex-col gap-4 overflow-y-auto bg-superficie p-5',
          movil ? 'relative min-h-0 flex-1' : 'absolute top-3 right-3 max-h-[calc(100%-24px)] w-[380px] rounded-[22px] shadow-[0_12px_40px_rgba(19,27,22,0.22)]',
        )}
      >
        {verNota && nota && (
          <p className="flex w-fit items-center gap-2 rounded-full bg-estado-atencion-suave px-3.5 py-1.5 text-[13.5px] font-semibold text-estado-atencion-texto">
            <Icono nombre="Ayuda" tamano={16} />
            {nota}
          </p>
        )}
        {/* El lugar del asistente: arriba de la tarjeta, que es su voz. */}
        {guiado && (
          <div className="flex items-center gap-3">
            <span data-acompana="dock" aria-hidden className="size-16 shrink-0 rounded-full bg-[radial-gradient(circle,rgba(169,85,44,0.18)_0%,rgba(169,85,44,0)_68%)]" />
            <div className="flex min-w-0 flex-col">
              <span className="text-[14px] font-bold text-texto">Asistente de Tropero</span>
              <span className="text-[13.5px] text-texto-suave">Tocame si tenés una duda</span>
            </div>
          </div>
        )}
        {etapaBorde && paso.e !== 'bienvenida' && !(paso.e === 'borde-listo' && paso.corrigiendo) && <Progreso n={paso.e === 'encontrar' ? 1 : 2} texto={paso.e === 'encontrar' ? 'encontrar el campo' : 'el borde'} />}

        {paso.e === 'bienvenida' && (
          <Tarjeta titulo={`Armemos ${mapa.nombre} en el mapa`} texto="Unos 10 minutos. Si cortás, seguís donde quedaste.">
            <ol className="flex flex-col gap-2.5">
              {['Lo encontramos en el satélite', 'Marcamos el borde', 'Dibujamos los potreros'].map((t, i) => (
                <li key={t} className="flex items-center gap-3 text-[15px] font-semibold text-texto">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-principal-suave text-[13.5px] font-extrabold text-principal">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
            <BotonPrincipal
              icono="Siguiente"
              data-acompana="empezar"
              onClick={() => {
                if (presentarse) marcarVista('presentacion')
                ir({ e: 'encontrar', buscando: false })
              }}
            >
              Empezar
            </BotonPrincipal>
          </Tarjeta>
        )}

        {paso.e === 'encontrar' && (
          <Tarjeta
            titulo={paso.buscando ? '¿Te ayudamos a encontrarlo?' : 'Encontrá tu campo'}
            texto={
              paso.buscando
                ? 'Escribí un camino o un paraje que conozcas, y el mapa va ahí.'
                : mapa.lat != null
                  ? `El mapa arranca en ${mapa.localidad ?? 'el pueblo de tu campo'}, el pueblo que pusiste en el alta. Arrastralo hacia tu campo y acercate hasta ver los alambrados.`
                  : 'No sabemos el pueblo del campo. Buscá un camino o un paraje que conozcas.'
            }
          >
            {paso.buscando && (
              <div data-acompana="buscador">
                <Buscador abierto className="" cerca={mapa.lat != null && mapa.lon != null ? { lat: mapa.lat, lon: mapa.lon } : undefined} onElegir={(l) => api.current?.irA(l.lat, l.lon, 15)} />
              </div>
            )}
            <BotonPrincipal icono="Siguiente" data-acompana="ya-lo-veo" onClick={() => ir(esBA ? { e: 'tocar', buscando: false } : { e: 'marcar' })}>
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
          </Tarjeta>
        )}

        {paso.e === 'tocar' && (
          <Tarjeta titulo={movil ? 'Tocá tu campo' : 'Hacé clic en tu campo'} texto="Traemos el borde del catastro, como figura en la boleta.">
            {paso.buscando && (
              <div role="status" className="flex items-center gap-3 rounded-[16px] bg-superficie-hundida px-4 py-3">
                <span className="size-5 animate-spin rounded-full border-2 border-principal/25 border-t-principal" />
                <span className="text-[15px] font-semibold text-texto">Buscando la parcela…</span>
              </div>
            )}
            {paso.aviso && <Aviso tipo="atencion" icono="Ayuda" titulo={paso.aviso} />}
            <div className="flex flex-wrap gap-2">
              <BotonChico type="button" icono="Editar" onClick={() => ir({ e: 'marcar' })}>
                Lo marco a mano
              </BotonChico>
              <BotonChico type="button" icono="Comprobante" onClick={() => ir({ e: 'boleta' })}>
                Tengo la boleta
              </BotonChico>
            </div>
          </Tarjeta>
        )}

        {paso.e === 'parcela' && (
          <Tarjeta titulo="¿Es este tu campo?">
            <Comparacion medido={ha(paso.borde)} alta={mapa.hectareas} comp={compararBorde(ha(paso.borde), mapa.hectareas)} />
            <BotonPrincipal icono="Guardar" data-acompana="es-este" onClick={() => ir({ e: 'borde-listo', borde: paso.borde, ajustando: false })}>
              Sí, es este
            </BotonPrincipal>
            <p className="text-[14px] text-texto-suave">¿No es? {movil ? 'Tocá' : 'Hacé clic en'} otra parte del mapa.</p>
            <BotonChico type="button" icono="Editar" className="self-start" onClick={() => ir({ e: 'marcar' })}>
              Lo marco a mano
            </BotonChico>
          </Tarjeta>
        )}

        {paso.e === 'boleta' && (
          <Tarjeta titulo="Copiá los números de la boleta">
            <div data-acompana="boleta" className="flex flex-col gap-4">
              <Boleta
                ocupado={ocupado}
                error={error}
                onTraer={(datos) =>
                  void intentar(
                    async () => {
                      const res = await buscarParcelaRural(datos)
                      if (!res.length) throw new Error('No encontramos esa parcela. Revisá los números o marcala en el mapa.')
                      const borde = res[0]!.anillo as LatLng[]
                      enfocar(borde)
                      ir({ e: 'borde-listo', borde, ajustando: false })
                    },
                    () => {},
                  )
                }
                onAMano={() => ir({ e: 'marcar' })}
              />
            </div>
          </Tarjeta>
        )}

        {paso.e === 'marcar' && (
          <Tarjeta titulo={movil ? 'Tocá cada esquina' : 'Clic en cada esquina'}>
            <ComoSeDibuja puntos={puntos} movil={movil} que="del campo" />
            <div className="flex flex-wrap gap-2">
              <BotonChico type="button" icono="Reintentar" disabled={puntos === 0} onClick={() => api.current?.deshacer()}>
                Deshacer
              </BotonChico>
              <BotonChico type="button" disabled={puntos === 0} onClick={() => api.current?.reiniciar()}>
                Empezar de nuevo
              </BotonChico>
            </div>
          </Tarjeta>
        )}

        {paso.e === 'borde-listo' && (
          <BordeListo
            nombre={mapa.nombre}
            borde={paso.borde}
            alta={paso.altaCorregida ? ha(paso.borde) : mapa.hectareas}
            ajustando={paso.ajustando}
            corrigiendo={!!paso.corrigiendo}
            ocupado={ocupado}
            problema={problema}
            onAjustar={(si) => setPaso({ ...paso, ajustando: si })}
            onOtro={() => ir(esBA ? { e: 'tocar', buscando: false } : { e: 'marcar' })}
            onCorregirAlta={() => void intentar(() => corregirHectareasCampo(campo.id, ha(paso.borde)), () => setPaso({ ...paso, altaCorregida: true }))}
            onGuardar={() =>
              void intentar(
                () => guardarBorde(campo.id, paso.borde),
                () => ir(paso.corrigiendo || mapa.potreros.length ? { e: 'inicio' } : { e: 'sin-potreros' }),
              )
            }
            onCancelar={paso.corrigiendo ? () => ir({ e: 'inicio' }) : null}
          />
        )}

        {paso.e === 'sin-potreros' && (
          <Tarjeta titulo="¿Está dividido en potreros?" texto={`${haTexto(mapa.contorno ? ha(mapa.contorno) : 0)} ha, todavía sin potreros.`}>
            {problema}
            <div data-acompana="dividido" className="flex flex-col gap-3">
              <BotonPrincipal icono="Siguiente" onClick={() => ir({ e: 'dibujar', id: null })}>
                Sí, los dibujo ahora
              </BotonPrincipal>
              <Boton
                tipo="secundario"
                tamano="grande"
                className="w-full rounded-full"
                disabled={ocupado}
                onClick={() => void intentar(() => campoDeUnSoloPotrero(empresaId, mapa, mapa.contorno ? ha(mapa.contorno) : 0), () => ir({ e: 'cierre' }))}
              >
                No, es un solo potrero
              </Boton>
            </div>
            <BotonChico type="button" className="self-start" onClick={() => abrirSoporte(`Hola, no sé bien dónde están los potreros de ${mapa.nombre}.`)}>
              No sé bien dónde están
            </BotonChico>
          </Tarjeta>
        )}

        {paso.e === 'inicio' && (
          <Inicio
            campo={mapa}
            faltan={faltan}
            dibujados={dibujados}
            onDibujar={(id) => (enfocar(mapa.contorno), ir({ e: 'dibujar', id }))}
            onElegir={(id) => (enfocar(de(id)?.poligono), ir({ e: 'potrero', id }))}
            onCorregirBorde={mapa.contorno ? () => ir({ e: 'borde-listo', borde: mapa.contorno!, ajustando: true, altaCorregida: true, corrigiendo: true }) : null}
            onSalir={onSalir}
          />
        )}

        {paso.e === 'potrero' && sel && (
          <Tarjeta titulo={`El ${sel.nombre}`} texto={`${sel.hectareas ? `${haTexto(sel.hectareas)} ha · ` : ''}${sel.que}`}>
            <Accion icono="Editar" titulo="Corregir el borde" texto="Mover los puntos hasta el alambrado." onClick={() => ir({ e: 'borde', id: sel.id, pts: null })} />
            <Accion icono="Alambrado" titulo="Dividirlo con una línea" texto="Si le pusiste un alambrado en el medio: quedan dos potreros." onClick={() => ir({ e: 'dividir', id: sel.id, puntos: 0 })} />
            <Accion icono="Reintentar" titulo="Dibujarlo de nuevo" texto="Borra el dibujo y marcás las esquinas otra vez." onClick={() => ir({ e: 'dibujar', id: sel.id })} />
            <BotonChico type="button" className="self-start" onClick={() => ir({ e: 'inicio' })}>
              Elegir otro
            </BotonChico>
          </Tarjeta>
        )}

        {paso.e === 'dibujar' && (
          <Tarjeta
            titulo={sel ? `Dibujá el ${sel.nombre}` : dibujados.length ? 'Dibujá el siguiente' : faltan.length ? 'Dibujá un potrero' : 'Dibujá el potrero nuevo'}
          >
            {!sel && faltan.length > 0 && <Progreso n={3} texto={dibujados.length ? `${dibujados.length} de ${mapa.potreros.length} potreros` : 'dibujar los potreros'} />}
            <ComoSeDibuja puntos={puntos} movil={movil} que={sel ? `del ${sel.nombre}` : 'de un potrero, el que quieras'} />
            {sel?.poligono && <p className="text-[14px] text-texto-suave">El dibujo de antes sigue hasta que guardes el nuevo.</p>}
            {paso.aviso && <Aviso tipo="atencion" icono="Ayuda" titulo={paso.aviso} />}
            {problema}
            <div className="flex flex-wrap gap-2">
              <BotonChico type="button" icono="Reintentar" disabled={puntos === 0 || ocupado} onClick={() => api.current?.deshacer()}>
                Deshacer punto
              </BotonChico>
              <BotonChico type="button" disabled={puntos === 0 || ocupado} onClick={() => api.current?.reiniciar()}>
                Empezar de nuevo
              </BotonChico>
            </div>
            <BotonChico type="button" className="self-start" disabled={ocupado} onClick={() => ir(sel?.poligono ? { e: 'potrero', id: sel.id } : { e: 'inicio' })}>
              Cancelar dibujo
            </BotonChico>
          </Tarjeta>
        )}

        {paso.e === 'cual' && (
          <Cual
            dibujo={paso.dibujo}
            faltan={faltan}
            ocupado={ocupado}
            problema={problema}
            onEs={(id, corregir) => void guardarDibujo(id, paso.dibujo, corregir || !de(id)?.hectareas)}
            onNuevo={() => ir({ e: 'nuevo', dibujo: paso.dibujo })}
            onRedibujar={() => ir({ e: 'dibujar', id: null })}
          />
        )}

        {paso.e === 'confirmar' && sel && (
          <Tarjeta titulo={`¿Es el ${sel.nombre}?`} texto={`Dibujaste ${haTexto(ha(paso.dibujo))} ha y en el alta pusiste ${haTexto(sel.hectareas ?? 0)}. Revisá que hayas seguido el alambrado.`}>
            {problema}
            <BotonPrincipal icono="Guardar" data-acompana="confirmar" cargando={ocupado} disabled={ocupado} onClick={() => void guardarDibujo(sel.id, paso.dibujo, true)}>
              {ocupado ? 'Guardando…' : `Sí, mide ${haTexto(ha(paso.dibujo))} ha`}
            </BotonPrincipal>
            <BotonChico type="button" icono="Reintentar" className="self-start" disabled={ocupado} onClick={() => ir({ e: 'dibujar', id: sel.id })}>
              Lo dibujo de nuevo
            </BotonChico>
          </Tarjeta>
        )}

        {paso.e === 'nuevo' && (
          <Nuevo
            ha={ha(paso.dibujo)}
            letra={letra}
            sugerido={nombreNuevo}
            usados={mapa.potreros.map((p) => p.nombre)}
            ocupado={ocupado}
            error={error}
            onGuardar={(n, uso) => void guardarNuevo(paso.dibujo, n, uso)}
            onRedibujar={() => ir({ e: 'dibujar', id: null })}
          />
        )}

        {paso.e === 'listo' && (
          <Tarjeta
            titulo={paso.piezas.length > 1 ? `${paso.nombre} listos` : `El ${paso.nombre} ya está`}
            texto={
              paso.piezas.length > 1
                ? `${paso.piezas.map((x) => `${x.nombre}: ${haTexto(ha(x.poligono))} ha`).join(' · ')}.`
                : `${de(paso.id)?.hectareas ? `${haTexto(de(paso.id)!.hectareas!)} ha en el mapa` : 'Quedó en el mapa'}${(de(paso.id)?.cabezas ?? 0) > 0 ? `, con sus ${de(paso.id)!.cabezas} cabezas adentro.` : '.'}`
            }
          >
            {faltan.length > 0 && (
              <p className="text-[14.5px] text-texto">
                {faltan.length === 1 ? `Falta el ${faltan[0]!.nombre}.` : `Faltan ${faltan.length}: ${faltan.map((p) => p.nombre).join(', ')}.`}
              </p>
            )}
            <div data-acompana="siguiente">
              {faltan.length > 0 ? (
                <BotonPrincipal icono="Siguiente" onClick={() => (enfocar(mapa.contorno), ir({ e: 'dibujar', id: null }))}>
                  Dibujar otro
                </BotonPrincipal>
              ) : pendiente ? (
                <BotonPrincipal icono="Siguiente" onClick={() => ir({ e: 'cierre' })}>
                  Listo, {mapa.nombre}
                </BotonPrincipal>
              ) : (
                onSalir && (
                  <BotonPrincipal icono="Siguiente" onClick={onSalir}>
                    Volver al campo
                  </BotonPrincipal>
                )
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {paso.piezas.length === 1 && (
                <BotonChico type="button" icono="Editar" onClick={() => ir({ e: 'borde', id: paso.id, pts: null })}>
                  Corregir el borde
                </BotonChico>
              )}
              {faltan.length > 0 ? (
                <BotonChico type="button" onClick={() => abrirSoporte(`Hola, no encuentro uno de los potreros de ${mapa.nombre} en el mapa.`)}>
                  No encuentro uno: pedir ayuda
                </BotonChico>
              ) : (
                <BotonChico type="button" onClick={() => ir({ e: 'inicio' })}>
                  Ver los potreros
                </BotonChico>
              )}
            </div>
          </Tarjeta>
        )}

        {paso.e === 'borde' && sel && (
          <Tarjeta titulo={`Corregí el borde del ${sel.nombre}`} texto="Arrastrá cada punto hasta el alambrado. Para sumar un punto, arrastrá el del medio de un lado.">
            {paso.pts && <p className="text-[14.5px] text-texto">Ahora mide <b>{haTexto(ha(paso.pts))} ha</b> (antes {haTexto(ha(sel.poligono ?? []))}).</p>}
            {paso.aviso && <Aviso tipo="atencion" titulo={paso.aviso} />}
            {problema}
            <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={!paso.pts || ocupado} onClick={() => paso.pts && void guardarBordePotrero(sel.id, paso.pts)}>
              {ocupado ? 'Guardando…' : 'Guardar el borde'}
            </BotonPrincipal>
            <BotonChico type="button" className="self-start" disabled={ocupado} onClick={() => ir({ e: 'potrero', id: sel.id })}>
              Cancelar
            </BotonChico>
          </Tarjeta>
        )}

        {paso.e === 'dividir' && sel && (
          <Tarjeta titulo={`Dividí el ${sel.nombre} con una línea`} texto="Marcá el alambrado nuevo: empezá afuera del potrero, tocá cada quiebre y terminá del otro lado, afuera.">
            {paso.aviso && <Aviso tipo="atencion" titulo={paso.aviso} />}
            <div className="flex flex-wrap gap-2">
              <BotonChico type="button" icono="Reintentar" disabled={paso.puntos === 0} onClick={() => api.current?.deshacer()}>
                Deshacer punto
              </BotonChico>
              <BotonChico type="button" disabled={paso.puntos === 0} onClick={() => api.current?.reiniciar()}>
                Empezar de nuevo
              </BotonChico>
            </div>
            <BotonChico type="button" className="self-start" onClick={() => ir({ e: 'potrero', id: sel.id })}>
              Cancelar
            </BotonChico>
          </Tarjeta>
        )}

        {paso.e === 'revisar' && sel && (
          <Revisar
            p={sel}
            piezas={paso.piezas}
            queda={paso.queda}
            letra={letra}
            sugerido={nombreNuevo}
            usados={mapa.potreros.map((p) => p.nombre)}
            ocupado={ocupado}
            error={error}
            onQueda={(queda) => setPaso({ ...paso, queda })}
            onGuardar={(n) => void guardarDivision(sel.id, paso.piezas, paso.queda, n)}
            onDeshacer={() => ir({ e: 'dividir', id: sel.id, puntos: 0 })}
            onCancelar={() => ir({ e: 'potrero', id: sel.id })}
          />
        )}

        {paso.e === 'cierre' && (
          <Cierre campo={mapa} campos={campos} siguiente={siguienteCampo ?? null} pendiente={pendiente} ocupado={ocupado} problema={problema} onSeguir={onSeguirCon} onAbrir={() => void abrirLaApp()} onSalir={onSalir} />
        )}
      </aside>
      <Acompanante
        raiz={raiz}
        objetivo={objetivo}
        texto={dice}
        medir={vuelta}
        margenDerecho={movil ? 0 : 400}
        animo={paso.e === 'tocar' && paso.buscando ? 'piensa' : paso.e === 'listo' || paso.e === 'cierre' ? 'festeja' : 'normal'}
        dudas={dudasDe(paso.e, movil)}
        presentarse={presentarse && paso.e === 'bienvenida'}
      />
    </div>
  )
}

// ===== Piezas =====

function Tarjeta({ titulo, texto, children }: { titulo: string; texto?: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h2 className="titulo-display text-[26px] leading-[1.05] text-texto">{titulo}</h2>
        {texto && <p className="text-[14.5px] text-texto-suave">{texto}</p>}
      </div>
      {children}
    </>
  )
}

function Accion({ icono, titulo, texto, onClick }: { icono: 'Editar' | 'Alambrado' | 'Reintentar'; titulo: string; texto: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-start gap-3 rounded-[14px] border-[1.5px] border-borde bg-superficie px-4 py-3 text-left transition-colors hover:border-principal">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-principal-suave text-principal">
        <Icono nombre={icono} />
      </span>
      <span className="flex min-w-0 flex-col">
        <b className="text-[15.5px] text-texto">{titulo}</b>
        <span className="text-[13.5px] text-texto-suave">{texto}</span>
      </span>
    </button>
  )
}

function FilaPotrero({ p, onClick }: { p: PotreroM; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-borde bg-superficie px-4 py-2.5 text-left transition-colors hover:border-principal">
      <span className="font-heading text-[17px] font-extrabold text-texto">{p.nombre}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-texto-suave">
        {p.hectareas ? `${haTexto(p.hectareas)} ha · ` : ''}
        {p.que}
      </span>
      <Icono nombre="Siguiente" tamano={16} className="text-principal" />
    </button>
  )
}

function Inicio({
  campo,
  faltan,
  dibujados,
  onDibujar,
  onElegir,
  onCorregirBorde,
  onSalir,
}: {
  campo: CampoMapa
  faltan: PotreroM[]
  dibujados: PotreroM[]
  onDibujar: (id: string | null) => void
  onElegir: (id: string) => void
  onCorregirBorde: (() => void) | null
  onSalir: (() => void) | null
}) {
  const total = faltan.length + dibujados.length
  return (
    <Tarjeta
      titulo={faltan.length ? (dibujados.length ? 'Dibujá el siguiente' : 'Dibujá un potrero') : `El mapa de ${campo.nombre}`}
      texto={faltan.length ? 'Dibujás el que quieras y después elegís cuál es. O elegilo de la lista primero.' : 'Tocá un potrero en el mapa o elegilo de la lista para corregirlo o dividirlo.'}
    >
      {faltan.length > 0 && (
        <>
          <Progreso n={3} texto={dibujados.length ? `${dibujados.length} de ${total} potreros` : 'dibujar los potreros'} />
          <BotonPrincipal icono="Siguiente" data-acompana="dibujar" onClick={() => onDibujar(null)}>
            Dibujar un potrero
          </BotonPrincipal>
          <section className="flex flex-col gap-2" aria-label="Faltan dibujar">
            <h3 className="text-[13px] font-bold text-texto-suave">{dibujados.length ? 'Faltan' : 'Los que cargaste en el alta'}</h3>
            {faltan.map((p) => (
              <FilaPotrero key={p.id} p={p} onClick={() => onDibujar(p.id)} />
            ))}
          </section>
        </>
      )}
      {dibujados.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Ya dibujados">
          <h3 className="text-[13px] font-bold text-texto-suave">Ya dibujados</h3>
          {dibujados.map((p) => (
            <FilaPotrero key={p.id} p={p} onClick={() => onElegir(p.id)} />
          ))}
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <BotonChico type="button" icono="Agregar" onClick={() => onDibujar(null)}>
          Dibujar un potrero nuevo
        </BotonChico>
        {onCorregirBorde && !faltan.length && (
          <BotonChico type="button" icono="Editar" onClick={onCorregirBorde}>
            Corregir el borde del campo
          </BotonChico>
        )}
      </div>
      {onSalir && (
        <BotonPrincipal icono="Siguiente" onClick={onSalir}>
          Listo, volver al campo
        </BotonPrincipal>
      )}
    </Tarjeta>
  )
}

function Numero({ letra, valor, usados, onCambio }: { letra: string; valor: string; usados: string[]; onCambio: (v: string) => void }) {
  const repetido = usados.includes(`${valor}${letra}`)
  return (
    <CampoTexto
      etiqueta="Número del potrero nuevo"
      inputMode="numeric"
      value={valor}
      unidad={letra}
      onChange={(e) => onCambio(e.target.value.replace(/\D/g, '').slice(0, 3))}
      error={repetido ? `Ya hay un ${valor}${letra}. Elegí otro número.` : undefined}
    />
  )
}

function Nuevo({
  ha,
  letra,
  sugerido,
  usados,
  ocupado,
  error,
  onGuardar,
  onRedibujar,
}: {
  ha: number
  letra: string
  sugerido: string
  usados: string[]
  ocupado: boolean
  error: string | null
  onGuardar: (numero: string, uso: Uso) => void
  onRedibujar: () => void
}) {
  const [numero, setNumero] = useState(sugerido)
  const [uso, setUso] = useState<Uso>('vacio')
  const repetido = usados.includes(`${numero}${letra}`)
  return (
    <Tarjeta titulo={`Potrero nuevo: ${haTexto(ha)} ha`}>
      <Numero letra={letra} valor={numero} usados={usados} onCambio={setNumero} />
      <Segmentos
        etiqueta="Qué hay"
        valor={uso}
        onCambio={setUso}
        opciones={[
          { valor: 'hacienda', texto: 'Hacienda' },
          { valor: 'sembrado', texto: 'Sembrado' },
          { valor: 'vacio', texto: 'Descansa' },
        ]}
      />
      <p className="text-[13px] text-texto-suave">La hacienda se mueve a este potrero después, desde Hacienda o en la manga.</p>
      {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
      <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado || !numero || repetido} onClick={() => onGuardar(numero, uso)}>
        {ocupado ? 'Guardando…' : `Guardar el ${numero}${letra}`}
      </BotonPrincipal>
      <BotonChico type="button" icono="Reintentar" className="self-start" disabled={ocupado} onClick={onRedibujar}>
        Lo dibujo de nuevo
      </BotonChico>
    </Tarjeta>
  )
}

function Revisar({
  p,
  piezas,
  queda,
  letra,
  sugerido,
  usados,
  ocupado,
  error,
  onQueda,
  onGuardar,
  onDeshacer,
  onCancelar,
}: {
  p: PotreroM
  piezas: [LatLng[], LatLng[]]
  queda: 0 | 1
  letra: string
  sugerido: string
  usados: string[]
  ocupado: boolean
  error: string | null
  onQueda: (q: 0 | 1) => void
  onGuardar: (numero: string) => void
  onDeshacer: () => void
  onCancelar: () => void
}) {
  const [numero, setNumero] = useState(sugerido)
  const has = piezas.map((x) => haRedondo(hectareasDe(x))) as [number, number]
  const otra = queda === 0 ? 1 : 0
  const repetido = usados.includes(`${numero}${letra}`)
  const lugar = dondeQueda(piezas)
  const parecidas = Math.abs(has[0] - has[1]) <= Math.max(...has) * 0.1
  return (
    <Tarjeta titulo="Revisá la división" texto={`El ${p.nombre} queda en dos: ${haTexto(has[0])} ha y ${haTexto(has[1])} ha.`}>
      <div role="radiogroup" aria-label={`Cuál sigue siendo el ${p.nombre}`} className="flex flex-col gap-2">
        <span className="text-[13px] font-bold text-texto-suave">¿Cuál sigue siendo el {p.nombre}?</span>
        {([0, 1] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={queda === i}
            onClick={() => onQueda(i)}
            className={cn('flex items-center gap-3 rounded-[14px] border-[1.5px] bg-superficie px-4 py-2.5 text-left transition-colors', queda === i ? 'border-principal' : 'border-borde hover:border-texto-suave/50')}
          >
            <span className={cn('font-heading text-[17px] font-extrabold', queda === i ? 'text-principal' : 'text-texto')}>{haTexto(has[i])} ha</span>
            <span className="text-[13.5px] text-texto-suave">
              {lugar[i]}
              {!parecidas && (i === (has[0] >= has[1] ? 0 : 1) ? ', la más grande' : ', la más chica')}
            </span>
          </button>
        ))}
      </div>
      <Numero letra={letra} valor={numero} usados={usados} onCambio={setNumero} />
      <p className="text-[14px] text-texto">
        {p.cabezas > 0
          ? `Las ${p.cabezas} cabezas quedan en el ${p.nombre}. Si alguna está en la otra parte, movela desde Hacienda.`
          : `El ${numero}${letra} arranca con ${haTexto(has[otra])} ha.`}
      </p>
      {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
      <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado || !numero || repetido} onClick={() => onGuardar(numero)}>
        {ocupado ? 'Guardando…' : `Dividir el ${p.nombre}`}
      </BotonPrincipal>
      <div className="flex flex-wrap gap-2">
        <BotonChico type="button" icono="Reintentar" disabled={ocupado} onClick={onDeshacer}>
          Deshacer línea
        </BotonChico>
        <BotonChico type="button" disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </BotonChico>
      </div>
    </Tarjeta>
  )
}

/** «la del norte» / «la del sur»: dónde queda cada parte, para reconocerla en el mapa. */
function dondeQueda(piezas: [LatLng[], LatLng[]]): [string, string] {
  const centro = (p: LatLng[]): LatLng => p.reduce<LatLng>((a, [la, lo]) => [a[0] + la / p.length, a[1] + lo / p.length], [0, 0])
  const [a, b] = [centro(piezas[0]), centro(piezas[1])]
  const dLat = a[0] - b[0]
  const dLng = a[1] - b[1]
  if (Math.abs(dLat) >= Math.abs(dLng)) return dLat > 0 ? ['la del norte', 'la del sur'] : ['la del sur', 'la del norte']
  return dLng > 0 ? ['la del este', 'la del oeste'] : ['la del oeste', 'la del este']
}

/** «Paso 2 de 3, el borde»: los tres tramos del tutorial. */
function Progreso({ n, texto }: { n: 1 | 2 | 3; texto: string }) {
  return (
    <div className="flex items-center gap-3" aria-label={`Paso ${n} de 3, ${texto}`}>
      <span className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 w-7 rounded-full', i <= n ? 'bg-principal' : 'bg-borde')} />
        ))}
      </span>
      <span className="text-[13px] font-semibold text-texto-suave">
        Paso {n} de 3, {texto}
      </span>
    </div>
  )
}

/** El borde marcado: lo medido contra el alta; si no cuadra, no se sigue sin decidir. */
function BordeListo({
  nombre,
  borde,
  alta,
  ajustando,
  corrigiendo,
  ocupado,
  problema,
  onAjustar,
  onOtro,
  onCorregirAlta,
  onGuardar,
  onCancelar,
}: {
  nombre: string
  borde: LatLng[]
  alta: number | null
  ajustando: boolean
  corrigiendo: boolean
  ocupado: boolean
  problema: React.ReactNode
  onAjustar: (si: boolean) => void
  onOtro: () => void
  onCorregirAlta: () => void
  onGuardar: () => void
  onCancelar: (() => void) | null
}) {
  const ha = haRedondo(hectareasDe(borde))
  const comp = compararBorde(ha, alta)
  const trabado = comp === 'muy-distinto'
  return (
    <Tarjeta titulo={`${nombre} mide unas ${haTexto(ha)} ha`}>
      {ajustando ? (
        <p className="text-[15px] text-texto-suave">Arrastrá los puntos hasta que el borde siga el alambrado.</p>
      ) : (
        <Comparacion medido={ha} alta={alta} comp={comp} />
      )}
      {problema}
      {ajustando && !corrigiendo ? (
        <BotonPrincipal icono="Guardar" onClick={() => onAjustar(false)}>
          Listo, así queda
        </BotonPrincipal>
      ) : trabado && !corrigiendo ? (
        <BotonPrincipal icono="Guardar" data-acompana="corregir-alta" cargando={ocupado} disabled={ocupado} onClick={onCorregirAlta}>
          Sí, mide {haTexto(ha)} ha: lo corrijo
        </BotonPrincipal>
      ) : (
        <BotonPrincipal icono={corrigiendo ? 'Guardar' : 'Siguiente'} data-acompana="seguir-potreros" cargando={ocupado} disabled={ocupado} onClick={onGuardar}>
          {ocupado ? 'Guardando…' : corrigiendo ? 'Guardar el borde' : 'Seguir con los potreros'}
        </BotonPrincipal>
      )}
      <div className="flex flex-wrap gap-2">
        {!ajustando && (
          <BotonChico type="button" icono="Editar" onClick={() => onAjustar(true)}>
            Ajustar el borde
          </BotonChico>
        )}
        {onCancelar ? (
          <BotonChico type="button" onClick={onCancelar}>
            Cancelar
          </BotonChico>
        ) : (
          <BotonChico type="button" icono="Reintentar" onClick={onOtro}>
            Elegir otro borde
          </BotonChico>
        )}
      </div>
    </Tarjeta>
  )
}

/** Lo que dibujó, ¿cuál de los cargados en el alta es? Los de tamaño parecido, arriba (dato medido, no suposición). */
function Cual({
  dibujo,
  faltan,
  ocupado,
  problema,
  onEs,
  onNuevo,
  onRedibujar,
}: {
  dibujo: LatLng[]
  faltan: PotreroM[]
  ocupado: boolean
  problema: React.ReactNode
  /** `corregir`: el productor confirmó que las hectáreas del alta estaban mal. */
  onEs: (id: string, corregir: boolean) => void
  onNuevo: () => void
  onRedibujar: () => void
}) {
  const ha = haRedondo(hectareasDe(dibujo))
  const cs = candidatos(faltan, ha)
  const [elegido, setElegido] = useState<string | null>(preseleccion(cs))
  const dos = cs.filter((c) => c.parecido).length > 1
  const sel = cs.find((c) => c.id === elegido)
  const comp = sel?.hectareas ? compararBorde(ha, sel.hectareas) : null
  const noCuadra = comp === 'muy-distinto'
  return (
    <Tarjeta titulo="¿Cuál de estos es?" texto={`Lo que dibujaste mide unas ${haTexto(ha)} ha.${dos ? ' Hay dos de tamaño parecido: mirá qué tiene cada uno.' : ''}`}>
      <div role="radiogroup" aria-label="Qué potrero es" className="flex flex-col gap-2" data-acompana={sel ? undefined : 'cual'}>
        {cs.slice(0, 6).map((c) => {
          const activo = c.id === elegido
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setElegido(c.id)}
              className={cn('flex items-center gap-3 rounded-[14px] border-[1.5px] bg-superficie px-4 py-2.5 text-left transition-colors', activo ? 'border-principal' : 'border-borde hover:border-texto-suave/50')}
            >
              <span className={cn('font-heading text-[17px] font-extrabold', activo ? 'text-principal' : 'text-texto')}>{c.nombre}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-texto-suave">
                {c.hectareas ? `${haTexto(c.hectareas)} ha · ` : ''}
                {c.que}
              </span>
              {c.parecido && <span className="shrink-0 rounded-full bg-estado-atencion-suave px-2 py-0.5 text-[12px] font-semibold text-estado-atencion-texto">tamaño parecido</span>}
            </button>
          )
        })}
      </div>
      {sel && comp && <Comparacion medido={ha} alta={sel.hectareas} comp={comp} revisar={`Revisá que hayas seguido el alambrado del ${sel.nombre}. Si mide eso, corregimos el alta.`} />}
      {problema}
      {sel ? (
        <BotonPrincipal icono="Siguiente" data-acompana="cual" cargando={ocupado} disabled={ocupado} onClick={() => onEs(sel.id, noCuadra)}>
          {ocupado ? 'Guardando…' : noCuadra ? `Sí, el ${sel.nombre} mide ${haTexto(ha)} ha: lo corrijo` : `Es el ${sel.nombre}`}
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
    </Tarjeta>
  )
}

/** El campo quedó en el mapa: seguir con el que falta, o abrir toda la app. */
function Cierre({
  campo,
  campos,
  siguiente,
  pendiente,
  ocupado,
  problema,
  onSeguir,
  onAbrir,
  onSalir,
}: {
  campo: CampoMapa
  campos: CampoMapa[]
  siguiente: CampoMapa | null
  pendiente: boolean
  ocupado: boolean
  problema: React.ReactNode
  onSeguir: (id: string) => void
  onAbrir: () => void
  onSalir: (() => void) | null
}) {
  if (siguiente)
    return (
      <Tarjeta titulo={`${campo.nombre} ya está`}>
        <Totales t={totalesDelMapa([campo])} />
        <p className="text-[15px] text-texto-suave">
          Falta {siguiente.nombre}: {siguiente.potreros.length} {siguiente.potreros.length === 1 ? 'potrero' : 'potreros'}, unos {Math.max(3, siguiente.potreros.length * 2)} minutos.
          {pendiente ? ' Con eso se abre toda la app.' : ''}
        </p>
        <BotonPrincipal icono="Siguiente" data-acompana="cierre" onClick={() => onSeguir(siguiente.id)}>
          Seguir con {siguiente.nombre}
        </BotonPrincipal>
      </Tarjeta>
    )
  const titulo = campos.length === 1 ? 'Tu campo, en el mapa' : campos.length === 2 ? 'Tus dos campos, en el mapa' : `Tus ${campos.length} campos, en el mapa`
  const t = totalesDelMapa(campos)
  return (
    <Tarjeta titulo={titulo}>
      <Totales t={t} />
      {pendiente ? (
        <>
          <p className="text-[15px] text-texto-suave">Se abre toda la app. Empezá por la Hacienda: ahí están tus {t.cabezas} cabezas, potrero por potrero.</p>
          {problema}
          <BotonPrincipal icono="Siguiente" data-acompana="cierre" cargando={ocupado} disabled={ocupado} onClick={onAbrir}>
            Ir al Inicio
          </BotonPrincipal>
        </>
      ) : (
        onSalir && (
          <BotonPrincipal icono="Siguiente" data-acompana="cierre" onClick={onSalir}>
            Volver al campo
          </BotonPrincipal>
        )
      )}
    </Tarjeta>
  )
}
