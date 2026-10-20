import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Aviso } from '@/components/tropero/aviso'
import { BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Segmentos } from '@/components/tropero/segmentos'
import { crearPotrero, type CampoConPotreros } from '@/features/campos/api'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { asignarDibujo, corregirHectareasPotrero } from '@/features/mapa/api'
import { MapaTutorial, type MapaTutorialApi, type ModoMapa } from '@/features/mapa/mapa-tutorial'
import { compararBorde, fueraDelBorde, haRedondo, haTexto, hectareasDe, pisaA, type CampoMapa, type LatLng } from '@/features/mapa/reglas'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'
import { adentro, dividir, numeroSiguiente } from './dividir'

// El editor del mapa del campo (Figma 39, «Dibujar en el celular», 1054:782):
// elegí el potrero → marcá sus esquinas → dibujado; corregir el borde
// arrastrando sus puntos; dividir uno con una línea (el alambrado nuevo).
// El mapa es el del tutorial: los mismos colores y la misma forma de dibujar.

type PotreroM = CampoMapa['potreros'][number]
type Uso = 'hacienda' | 'sembrado' | 'vacio'

type Paso =
  | { e: 'inicio' }
  | { e: 'potrero'; id: string }
  | { e: 'dibujar'; id: string | null; aviso?: string }
  | { e: 'confirmar'; id: string; dibujo: LatLng[] }
  | { e: 'nuevo'; dibujo: LatLng[] }
  /** Lo recién guardado: uno, o las dos partes de una división. */
  | { e: 'listo'; id: string; nombre: string; piezas: { id: string; nombre: string; poligono: LatLng[] }[] }
  | { e: 'borde'; id: string; pts: LatLng[] | null; aviso?: string }
  | { e: 'dividir'; id: string; puntos: number; aviso?: string }
  | { e: 'revisar'; id: string; piezas: [LatLng[], LatLng[]]; queda: 0 | 1 }

const ESTADO: Record<Uso, 'ganadero' | 'cultivo' | 'descanso'> = { hacienda: 'ganadero', sembrado: 'cultivo', vacio: 'descanso' }
const ordenar = (ps: PotreroM[]) => [...ps].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))

export default function EditorCampo({
  campo,
  mapa,
  empresaId,
  onEmpezo,
  onSalir,
}: {
  campo: CampoConPotreros
  mapa: CampoMapa
  empresaId: string
  /** Antes del primer guardado: Campos se queda en el editor aunque el mapa quede completo. */
  onEmpezo: () => void
  /** null si todavía falta dibujar alguno (no se puede volver al campo). */
  onSalir: (() => void) | null
}) {
  const qc = useQueryClient()
  const movil = useIsMobile()
  const api = useRef<MapaTutorialApi>(null)
  const [paso, setPaso] = useState<Paso>({ e: 'inicio' })
  const [puntos, setPuntos] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const letra = colorDeCampo(mapa.colorIdx ?? 0).letra

  const faltan = ordenar(mapa.potreros.filter((p) => !p.poligono))
  const dibujados = ordenar(mapa.potreros.filter((p) => p.poligono))
  const de = (id: string) => mapa.potreros.find((p) => p.id === id)
  const fino = (id: string) => campo.potreros.find((p) => p.id === id)

  function ir(p: Paso) {
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
        [['mapa'], ['campo-mapa', campo.id], ['campos-con-potreros'], ['potreros-campo', campo.id], ['potreros'], ['panorama-inicio'], ['potrero-detalle']].map((queryKey) =>
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
  const enfocar = (p: LatLng[] | null | undefined) => p && api.current?.encuadrar(p)

  // ===== Lo que llega del mapa =====

  /** Un dibujo cerrado: que no se salga del campo ni pise a otro. */
  function alDibujar(p: LatLng[]) {
    if (paso.e !== 'dibujar') return
    const rechazar = (aviso: string) => (setPuntos(0), setPaso({ ...paso, aviso }))
    if (mapa.contorno && fueraDelBorde(p, mapa.contorno) > 0.3) return rechazar('Ese dibujo se sale del borde del campo. Dibujalo adentro.')
    const pisado = pisaA(p, dibujados.filter((x) => x.id !== paso.id))
    if (pisado) return rechazar(`Se pisa con el ${pisado.nombre}. Dibujalo al lado.`)
    if (!paso.id) return ir({ e: 'nuevo', dibujo: p })
    const pot = de(paso.id)
    if (pot?.hectareas && compararBorde(hectareasDe(p), pot.hectareas) === 'muy-distinto') return ir({ e: 'confirmar', id: paso.id, dibujo: p })
    void guardarDibujo(paso.id, p)
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

  function alTocar(lat: number, lng: number) {
    const p = dibujados.find((x) => x.poligono && adentro([lat, lng], x.poligono))
    if (p) ir({ e: 'potrero', id: p.id })
    else if (paso.e === 'potrero') ir({ e: 'inicio' })
  }

  // ===== Guardar =====

  async function guardarDibujo(id: string, p: LatLng[]) {
    const nombre = de(id)?.nombre ?? ''
    try {
      await correr(async () => {
        await asignarDibujo(id, p)
        await corregirHectareasPotrero(id, haRedondo(hectareasDe(p)))
      })
      ir({ e: 'listo', id, nombre, piezas: [{ id, nombre, poligono: p }] })
    } catch {
      /* el error queda en pantalla */
    }
  }

  async function guardarNuevo(dibujo: LatLng[], numero: string, uso: Uso) {
    try {
      let creado = { id: '', nombre: '' }
      await correr(async () => {
        creado = await crearPotrero({ empresaId, campoId: campo.id, nombre: `${numero}${letra}`, estadoCiclo: ESTADO[uso], hectareas: haRedondo(hectareasDe(dibujo)) })
        await asignarDibujo(creado.id, dibujo)
      })
      ir({ e: 'listo', id: creado.id, nombre: creado.nombre, piezas: [{ id: creado.id, nombre: creado.nombre, poligono: dibujo }] })
    } catch {
      /* el error queda en pantalla */
    }
  }

  async function guardarBorde(id: string, pts: LatLng[]) {
    const otros = dibujados.filter((x) => x.id !== id)
    if (mapa.contorno && fueraDelBorde(pts, mapa.contorno) > 0.3) return setPaso({ e: 'borde', id, pts, aviso: 'Así se sale del borde del campo.' })
    const pisado = pisaA(pts, otros)
    if (pisado) return setPaso({ e: 'borde', id, pts, aviso: `Así se pisa con el ${pisado.nombre}.` })
    await guardarDibujo(id, pts)
  }

  async function guardarDivision(id: string, piezas: [LatLng[], LatLng[]], queda: 0 | 1, numero: string) {
    const original = fino(id)
    const sigue = piezas[queda]
    const otra = piezas[queda === 0 ? 1 : 0]
    // La parte nueva sigue sembrada si el potrero lo estaba; si tenía hacienda, la hacienda queda en el que conserva el nombre.
    const sembrado = original && ['siembra', 'cultivo', 'cosecha'].includes(original.estadoCiclo)
    try {
      let nuevo = { id: '', nombre: '' }
      await correr(async () => {
        // Primero el nuevo: si el número está repetido, no se tocó nada.
        nuevo = await crearPotrero({ empresaId, campoId: campo.id, nombre: `${numero}${letra}`, estadoCiclo: sembrado ? original.estadoCiclo : 'descanso', hectareas: haRedondo(hectareasDe(otra)) })
        await asignarDibujo(id, sigue)
        await corregirHectareasPotrero(id, haRedondo(hectareasDe(sigue)))
        await asignarDibujo(nuevo.id, otra)
      })
      const viejo = de(id)?.nombre ?? ''
      ir({
        e: 'listo',
        id: nuevo.id,
        nombre: `${viejo} y ${nuevo.nombre}`,
        piezas: [
          { id, nombre: viejo, poligono: sigue },
          { id: nuevo.id, nombre: nuevo.nombre, poligono: otra },
        ],
      })
    } catch {
      /* el error queda en pantalla */
    }
  }

  // ===== El mapa, según el paso =====

  const sel = 'id' in paso && paso.id ? de(paso.id) : undefined
  const modo: ModoMapa =
    paso.e === 'dibujar' ? 'potrero' : paso.e === 'borde' ? 'ajustar' : paso.e === 'dividir' ? 'linea' : paso.e === 'inicio' || paso.e === 'potrero' ? 'tocar' : 'mirar'
  const borrador = paso.e === 'confirmar' || paso.e === 'nuevo' ? paso.dibujo : null
  const nombreNuevo = numeroSiguiente(mapa.potreros.map((p) => p.nombre))
  const conHa = (poligono: LatLng[], nombre: string) => ({ poligono, nombre, que: `${haTexto(haRedondo(hectareasDe(poligono)))} ha` })
  const piezas =
    paso.e === 'revisar'
      ? paso.piezas.map((poligono, i) => conHa(poligono, i === paso.queda ? (sel?.nombre ?? '') : `${nombreNuevo}${letra}`))
      : paso.e === 'listo'
        ? paso.piezas.map((x) => conHa(x.poligono, x.nombre))
        : undefined
  const ocultos =
    paso.e === 'listo' ? paso.piezas.map((x) => x.id) : paso.e === 'borde' || paso.e === 'revisar' || paso.e === 'confirmar' ? [paso.id] : undefined
  const pista: string | null =
    paso.e === 'inicio'
      ? faltan.length
        ? 'Elegí el potrero a dibujar'
        : 'Tocá un potrero para corregirlo'
      : paso.e === 'dibujar'
        ? puntos >= 3
          ? `${movil ? 'Tocá' : 'Hacé clic en'} el primer punto para cerrar`
          : `Marcá las esquinas${sel ? ` del ${sel.nombre}` : ''}`
        : paso.e === 'borde'
          ? 'Arrastrá los puntos hasta el alambrado'
          : paso.e === 'dividir'
            ? paso.puntos === 0
              ? 'Empezá afuera del potrero'
              : 'Terminá del otro lado, afuera'
            : null
  // En la compu, la pastilla que sigue al mouse ya dice qué hacer mientras se dibuja.
  const dibujando = paso.e === 'dibujar' || paso.e === 'dividir'

  const mapaEl = (
    <MapaTutorial
      ref={api}
      className="size-full"
      centro={{ lat: mapa.lat ?? -36.03, lon: mapa.lon ?? -59.1, zoom: 14 }}
      contorno={mapa.contorno}
      potreros={mapa.potreros}
      foco
      relleno={movil ? {} : { derecha: 400 }}
      modo={modo}
      borrador={borrador}
      editable={paso.e === 'borde' ? (sel?.poligono ?? null) : null}
      ocultos={ocultos}
      piezas={piezas}
      elegido={paso.e === 'potrero' || paso.e === 'dividir' ? (sel?.id ?? null) : null}
      pistaCursor={dibujando ? (pista ?? undefined) : undefined}
      onDibujo={alDibujar}
      onPuntos={setPuntos}
      onAjuste={(pts) => paso.e === 'borde' && setPaso({ ...paso, pts, aviso: undefined })}
      onLinea={alMarcarLinea}
      onToque={alTocar}
    />
  )

  // Compu: el mapa entero y la tarjeta flotando a la derecha. Celular (Figma M1–M4): el mapa arriba y la tarjeta abajo, sin taparlo.
  return (
    <div className={cn('absolute inset-0', movil && 'flex flex-col')}>
      <div className={cn('relative', movil ? 'h-[50%] shrink-0' : 'size-full')}>
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
        {paso.e === 'inicio' && (
          <Inicio
            campo={mapa}
            faltan={faltan}
            dibujados={dibujados}
            onDibujar={(id) => (enfocar(mapa.contorno), ir({ e: 'dibujar', id }))}
            onElegir={(id) => (enfocar(de(id)?.poligono), ir({ e: 'potrero', id }))}
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
            titulo={sel ? `Dibujá el ${sel.nombre}` : 'Dibujá el potrero nuevo'}
            texto={movil ? 'Tocá cada esquina. Cerrá el dibujo tocando el primer punto.' : 'Hacé clic en cada esquina. Cerrá el dibujo en el primer punto.'}
          >
            {sel?.poligono && <p className="text-[14px] text-texto-suave">El dibujo de antes sigue hasta que guardes el nuevo.</p>}
            <p className="text-[14.5px] font-semibold text-texto">{puntos === 0 ? 'Todavía sin esquinas' : `${puntos} ${puntos === 1 ? 'esquina' : 'esquinas'}`}</p>
            {paso.aviso && <Aviso tipo="atencion" titulo={paso.aviso} />}
            {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
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

        {paso.e === 'confirmar' && sel && (
          <Tarjeta titulo={`¿Es el ${sel.nombre}?`} texto={`Dibujaste ${haTexto(haRedondo(hectareasDe(paso.dibujo)))} ha y en el alta pusiste ${haTexto(sel.hectareas ?? 0)}. Revisá que hayas seguido el alambrado.`}>
            {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
            <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado} onClick={() => void guardarDibujo(sel.id, paso.dibujo)}>
              {ocupado ? 'Guardando…' : `Sí, mide ${haTexto(haRedondo(hectareasDe(paso.dibujo)))} ha`}
            </BotonPrincipal>
            <BotonChico type="button" icono="Reintentar" className="self-start" disabled={ocupado} onClick={() => ir({ e: 'dibujar', id: sel.id })}>
              Lo dibujo de nuevo
            </BotonChico>
          </Tarjeta>
        )}

        {paso.e === 'nuevo' && (
          <Nuevo
            ha={haRedondo(hectareasDe(paso.dibujo))}
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
            titulo={`${paso.nombre} ${paso.piezas.length > 1 ? 'listos' : 'dibujado'}`}
            texto={`${paso.piezas.map((x) => `${paso.piezas.length > 1 ? `${x.nombre}: ` : 'Mide '}${haTexto(haRedondo(hectareasDe(x.poligono)))} ha`).join(' · ')}. Podés corregir el borde cuando lo necesites.`}
          >
            {faltan.length > 0 && (
              <p className="text-[14.5px] text-texto">
                {faltan.length === 1 ? `Falta el ${faltan[0]!.nombre}.` : `Faltan ${faltan.length}: ${faltan.map((p) => p.nombre).join(', ')}.`}
              </p>
            )}
            {faltan.length > 0 ? (
              <BotonPrincipal icono="Siguiente" onClick={() => (enfocar(mapa.contorno), ir({ e: 'dibujar', id: faltan[0]!.id }))}>
                Dibujar el {faltan[0]!.nombre}
              </BotonPrincipal>
            ) : (
              onSalir && (
                <BotonPrincipal icono="Siguiente" onClick={onSalir}>
                  Volver al campo
                </BotonPrincipal>
              )
            )}
            <div className="flex flex-wrap gap-2">
              {paso.piezas.length === 1 && (
                <BotonChico type="button" icono="Editar" onClick={() => ir({ e: 'borde', id: paso.id, pts: null })}>
                  Corregir el borde
                </BotonChico>
              )}
              <BotonChico type="button" onClick={() => ir({ e: 'inicio' })}>
                Dibujar otro
              </BotonChico>
            </div>
          </Tarjeta>
        )}

        {paso.e === 'borde' && sel && (
          <Tarjeta titulo={`Corregí el borde del ${sel.nombre}`} texto="Arrastrá cada punto hasta el alambrado. Para sumar un punto, arrastrá el del medio de un lado.">
            {paso.pts && <p className="text-[14.5px] text-texto">Ahora mide <b>{haTexto(haRedondo(hectareasDe(paso.pts)))} ha</b> (antes {haTexto(haRedondo(hectareasDe(sel.poligono ?? [])))}).</p>}
            {paso.aviso && <Aviso tipo="atencion" titulo={paso.aviso} />}
            {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
            <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={!paso.pts || ocupado} onClick={() => paso.pts && void guardarBorde(sel.id, paso.pts)}>
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
      </aside>
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
  onSalir,
}: {
  campo: CampoMapa
  faltan: PotreroM[]
  dibujados: PotreroM[]
  onDibujar: (id: string | null) => void
  onElegir: (id: string) => void
  onSalir: (() => void) | null
}) {
  return (
    <Tarjeta
      titulo={faltan.length ? 'Elegí el potrero' : `El mapa de ${campo.nombre}`}
      texto={faltan.length ? 'Elegís cuál y después marcás sus esquinas.' : 'Tocá un potrero en el mapa o elegilo de la lista para corregirlo o dividirlo.'}
    >
      {faltan.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Faltan dibujar">
          <h3 className="text-[13px] font-bold text-texto-suave">Los que cargaste en el alta</h3>
          {faltan.map((p) => (
            <FilaPotrero key={p.id} p={p} onClick={() => onDibujar(p.id)} />
          ))}
        </section>
      )}
      <BotonChico type="button" icono="Agregar" className="self-start" onClick={() => onDibujar(null)}>
        Dibujar un potrero nuevo
      </BotonChico>
      {dibujados.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Ya dibujados">
          <h3 className="text-[13px] font-bold text-texto-suave">Ya dibujados</h3>
          {dibujados.map((p) => (
            <FilaPotrero key={p.id} p={p} onClick={() => onElegir(p.id)} />
          ))}
        </section>
      )}
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
