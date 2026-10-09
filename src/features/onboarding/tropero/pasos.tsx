import { useState } from 'react'
import { Aviso } from '@/components/tropero/aviso'
import { Boton, BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Calendario } from '@/components/tropero/calendario'
import { Icono } from '@/components/tropero/icono'
import { Segmentos } from '@/components/tropero/segmentos'
import { useClima } from '@/features/cotizaciones/hooks'
import { categoriaPlural, categoriasPorEspecie, type Especie } from '@/features/hacienda/labels'
import type { Localidad } from '@/lib/geocoding'
import { cn } from '@/lib/utils'
import { Escena, type Lamina } from './escena'
import type { DatosCampo, FilaPotrero } from './guardar'
import { LocalidadCampo } from './localidad-campo'
import { MedidorHectareas } from './medidor'
import {
  cabezasDe,
  conMayuscula,
  CULTIVOS,
  ATAJOS_DESCANSO,
  diasDesde,
  faltaEnContenido,
  haceDias,
  leerHectareas,
  letraDeCampo,
  filasRepetidas,
  nombrePropio,
  nombresPrevistos,
  siguienteNumero,
  sumaDePotreros,
  type CampoOnb,
  type Categoria,
  type Contenido,
  type TipoCampo,
} from './modelo'
import { OnboardingLayout } from './onboarding-layout'

type Atras = { texto: string; onClick: () => void } | undefined
type Totales = { hectareas: number | null; potreros: number | null; cabezas: number | null }

const SIN_TOTALES: Totales = { hectareas: null, potreros: null, cabezas: null }

function totalesDe(campo: CampoOnb, cabezasExtra?: { id: string; cabezas: number }): Totales {
  const cabezas = campo.potreros.reduce(
    (s, p) => s + (cabezasExtra && p.id === cabezasExtra.id ? cabezasExtra.cabezas : cabezasDe(p.contenido)),
    0,
  )
  return {
    hectareas: campo.hectareas,
    potreros: campo.potreros.length || null,
    cabezas: cabezas || null,
  }
}

function escenas({ lamina, totales }: { lamina: Lamina; totales: Totales }) {
  return {
    escena: <Escena lamina={lamina} totales={totales} />,
    escenaCelu: <Escena lamina={lamina} totales={totales} compacta />,
  }
}

function useError() {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
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
  return { error, ocupado, correr }
}

// ===== B1 · Empresa =====

export function PasoEmpresa({ inicial, onCrear }: { inicial: string; onCrear: (nombre: string) => Promise<void> }) {
  const [nombre, setNombre] = useState(inicial)
  const [falta, setFalta] = useState(false)
  const { error, ocupado, correr } = useError()
  return (
    <OnboardingLayout
      paso={1}
      {...escenas({ lamina: { tipo: 'vacio' }, totales: SIN_TOTALES })}
      titulo="¿Cómo se llama tu empresa?"
      bajada="Tu apellido o el nombre del establecimiento, como lo conocen en la zona."
      pie={
        <BotonPrincipal
          form="b1"
          type="submit"
          icono="Siguiente"
          cargando={ocupado}
          disabled={ocupado}
        >
          {ocupado ? 'Creando tu empresa…' : 'Crear mi empresa'}
        </BotonPrincipal>
      }
    >
      <form
        id="b1"
        className="contents"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (nombre.trim().length < 2) return setFalta(true)
          void correr(() => onCrear(nombre))
        }}
      >
        <CampoTexto
          etiqueta="Nombre"
          value={nombre}
          maxLength={80}
          autoFocus
          placeholder="Risso Agro"
          onChange={(e) => {
            setNombre(nombrePropio(e.target.value))
            setFalta(false)
          }}
          error={falta ? 'Falta el nombre de la empresa.' : (error ?? undefined)}
        />
      </form>
    </OnboardingLayout>
  )
}

// ===== B2 · Tu campo =====

export function PasoCampo({
  numero,
  existente,
  atras,
  onGuardar,
}: {
  /** 1 = «Tu primer campo»; 2 = «Tu segundo campo»… */
  numero: number
  existente?: CampoOnb
  atras: Atras
  onGuardar: (datos: DatosCampo) => Promise<void>
}) {
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [localidad, setLocalidad] = useState<Localidad | null>(
    existente && existente.localidad
      ? { nombre: existente.localidad, provincia: existente.provincia, lat: existente.lat, lon: existente.lon }
      : null,
  )
  const [tipo, setTipo] = useState<TipoCampo>(existente?.tipo ?? 'propio')
  const [hectareas, setHectareas] = useState(existente ? String(existente.hectareas).replace('.', ',') : '')
  const [intento, setIntento] = useState(false)
  const { error, ocupado, correr } = useError()
  const clima = useClima(localidad ? { nombre: localidad.nombre, lat: localidad.lat, lon: localidad.lon } : null)

  const n = leerHectareas(hectareas)
  const errores = {
    nombre: !nombre.trim() ? 'Falta cómo se llama el campo.' : undefined,
    localidad: !localidad ? 'Elegí el pueblo de la lista.' : undefined,
    hectareas:
      n === null
        ? 'Faltan las hectáreas: están en la boleta de ARBA del campo.'
        : !(n > 0)
          ? 'Tiene que ser un número mayor que cero.'
          : undefined,
  }
  const valido = !errores.nombre && !errores.localidad && !errores.hectareas
  const ordinal = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto'][numero - 1]

  return (
    <OnboardingLayout
      paso={2}
      {...escenas({
        lamina: {
          tipo: 'campo',
          nombre: nombre.trim(),
          detalle: [localidad?.nombre, tipo === 'propio' ? 'propio' : 'alquilado'].filter(Boolean).join(', '),
          clima: clima.data && localidad ? `${clima.data.temp}°, ${clima.data.descripcion.toLowerCase()} en ${localidad.nombre}` : null,
        },
        totales: { hectareas: n && n > 0 ? n : null, potreros: null, cabezas: null },
      })}
      atras={atras}
      titulo={ordinal ? `Tu ${ordinal} campo` : 'Otro campo'}
      bajada="Con la ubicación te mostramos el clima de tu campo todos los días."
      pie={
        <BotonPrincipal form="b2" type="submit" icono="Siguiente" cargando={ocupado} disabled={ocupado}>
          {ocupado ? 'Guardando…' : 'Guardar el campo'}
        </BotonPrincipal>
      }
    >
      <form
        id="b2"
        className="flex flex-col gap-[18px]"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setIntento(true)
          if (!valido || !localidad || n === null) return
          void correr(() => onGuardar({ nombre, localidad, tipo, hectareas: n }))
        }}
      >
        <CampoTexto
          etiqueta="Cómo se llama"
          value={nombre}
          placeholder="La Porteña"
          maxLength={60}
          autoFocus={!existente}
          onChange={(e) => setNombre(nombrePropio(e.target.value))}
          error={intento ? errores.nombre : undefined}
        />
        <LocalidadCampo valor={localidad} onCambio={setLocalidad} error={intento ? errores.localidad : undefined} />
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold text-texto md:text-[14.5px]">¿Es tuyo o lo alquilás?</span>
          <Segmentos
            etiqueta="El campo es"
            valor={tipo}
            onCambio={setTipo}
            opciones={[
              { valor: 'propio', texto: 'Es mío' },
              { valor: 'alquilado', texto: 'Lo alquilo' },
            ]}
          />
          {tipo === 'alquilado' && (
            <p className="text-[12.5px] text-texto-suave">El contrato lo cargás después, en Campos.</p>
          )}
        </div>
        <CampoTexto
          etiqueta="Cuántas hectáreas"
          inputMode="decimal"
          unidad="ha"
          value={hectareas}
          placeholder="353"
          onChange={(e) => setHectareas(e.target.value.replace(/[^\d.,]/g, ''))}
          error={intento ? errores.hectareas : undefined}
        />
        {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
      </form>
    </OnboardingLayout>
  )
}

// ===== B3 · Los potreros =====

type Fila = { clave: string; id?: string; numero: string; hectareas: string }
let claves = 0
/** Una fila nueva ya trae su número: el siguiente al más alto (estándar 1, 2, 3…). */
const nuevaFila = (numero: string, hectareas = ''): Fila => ({ clave: `n${++claves}`, numero, hectareas })

export function PasoPotreros({
  campo,
  atras,
  onGuardar,
  onCorregirHectareas,
}: {
  campo: CampoOnb
  atras: Atras
  onGuardar: (filas: FilaPotrero[]) => Promise<void>
  /** «El campo tiene N ha»: corrige las hectáreas del campo a la suma. */
  onCorregirHectareas: (hectareas: number) => Promise<void>
}) {
  const letra = letraDeCampo(campo.colorIdx)
  const [filas, setFilas] = useState<Fila[]>(() =>
    campo.potreros.length
      ? campo.potreros.map((p) => ({
          clave: p.id,
          id: p.id,
          numero: p.nombre.replace(/\D/g, ''),
          hectareas: String(p.hectareas).replace('.', ','),
        }))
      : [nuevaFila('1')],
  )
  const [intento, setIntento] = useState(false)
  const { error, ocupado, correr } = useError()

  const hs = filas.map((f) => leerHectareas(f.hectareas))
  const suma = sumaDePotreros(campo.hectareas, hs)
  const nombres = nombresPrevistos(
    filas.map((f) => f.numero),
    letra,
  )
  const cantidad = filas.length
  const repetidas = filasRepetidas(nombres)
  const siguiente = () => siguienteNumero(filas.map((f) => f.numero))

  function cambiar(clave: string, cambio: Partial<Fila>) {
    setFilas((xs) => xs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)))
  }

  function guardar() {
    setIntento(true)
    if (suma.estado === 'incompleto' || repetidas.size > 0) return
    void correr(() =>
      onGuardar(filas.map((f, i) => ({ id: f.id, numero: f.numero, hectareas: hs[i]! }))),
    )
  }

  const lamina: Lamina = {
    tipo: 'potreros',
    potreros: filas.map((f, i) => ({
      id: f.clave,
      nombre: nombres[i]!,
      hectareas: hs[i] && hs[i]! > 0 ? hs[i]! : 0,
      contenido: campo.potreros.find((p) => p.id === f.id)?.contenido ?? null,
    })),
  }

  const principal =
    suma.estado === 'faltan'
      ? 'Guardar igual: quedan sin potrero'
      : suma.estado === 'sobran'
        ? 'Guardar igual'
        : `Guardar ${cantidad === 1 ? 'el potrero' : `los ${cantidad} potreros`}`

  return (
    <OnboardingLayout
      paso={3}
      {...escenas({
        lamina,
        totales: { hectareas: campo.hectareas, potreros: cantidad, cabezas: null },
      })}
      atras={atras}
      titulo="¿Cómo lo tenés dividido?"
      bajada="Con el número con que los conocen. Las hectáreas dicen cuánta hacienda aguanta cada uno."
      pie={
        <BotonPrincipal type="button" icono="Siguiente" cargando={ocupado} disabled={ocupado} onClick={guardar}>
          {ocupado ? 'Guardando…' : principal}
        </BotonPrincipal>
      }
    >
      <div className="flex flex-col">
        <div className="grid grid-cols-[1fr_150px_auto] gap-x-3 pb-1.5 text-[13px] font-semibold text-texto-suave">
          <span>Potrero</span>
          <span>Hectáreas</span>
          <span className="w-9" />
        </div>
        {filas.map((f, i) => {
          const sinHa = intento && !(hs[i] && hs[i]! > 0)
          const repetida = repetidas.has(i)
          return (
            <div key={f.clave} className="grid grid-cols-[1fr_150px_auto] items-center gap-x-3 py-[7px]">
              <label
                className={cn(
                  'flex items-center gap-1 rounded-2xl border-[1.5px] bg-superficie px-[18px] focus-within:border-principal',
                  repetida ? 'border-estado-problema' : 'border-borde',
                )}
              >
                <span className="sr-only">Número del potrero {i + 1}</span>
                <input
                  inputMode="numeric"
                  value={f.numero}
                  placeholder={nombres[i]!.replace(letra, '')}
                  aria-invalid={repetida || undefined}
                  onChange={(e) => cambiar(f.clave, { numero: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                  className="w-full min-w-0 bg-transparent py-4 text-[16px] text-texto outline-none placeholder:text-texto-suave/60"
                />
                <span className="font-semibold text-texto-suave">{letra}</span>
              </label>
              <label
                className={cn(
                  'flex items-center gap-2 rounded-2xl border-[1.5px] bg-superficie px-[18px] focus-within:border-principal',
                  sinHa ? 'border-estado-problema' : 'border-borde',
                )}
              >
                <span className="sr-only">Hectáreas del potrero {nombres[i]}</span>
                <input
                  inputMode="decimal"
                  value={f.hectareas}
                  autoFocus={i === filas.length - 1 && i > 0 && !f.hectareas}
                  onChange={(e) => cambiar(f.clave, { hectareas: e.target.value.replace(/[^\d.,]/g, '') })}
                  className="w-full min-w-0 bg-transparent py-[15px] font-heading text-[20px] font-extrabold text-texto outline-none"
                />
                <span className="text-[15px] font-semibold text-texto-suave">ha</span>
              </label>
              {filas.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Sacar el potrero ${nombres[i]}`}
                  onClick={() => setFilas((xs) => xs.filter((x) => x.clave !== f.clave))}
                  className="grid size-9 place-items-center rounded-full text-texto-suave hover:bg-superficie-hundida"
                >
                  <Icono nombre="Cerrar" tamano={16} />
                </button>
              ) : (
                <span className="w-9" />
              )}
            </div>
          )
        })}
      </div>
      {/* Vacío a propósito: con varios potreros por cargar, precargar lo que
          falta obliga a borrar. Lo que falta lo dice el medidor. */}
      <BotonChico type="button" icono="Agregar" className="self-start" onClick={() => setFilas((xs) => [...xs, nuevaFila(siguiente(), '')])}>
        Sumar otro potrero
      </BotonChico>

      {repetidas.size > 0 && (
        <Aviso tipo="problema" icono="Cerrar" titulo={`Ya hay un ${nombres[[...repetidas][0]!]}: cambiá uno de los marcados`} />
      )}
      {suma.estado === 'incompleto' && intento && (
        <Aviso tipo="problema" icono="Cerrar" titulo="Cada potrero necesita sus hectáreas" />
      )}
      <MedidorHectareas
        total={campo.hectareas}
        potreros={filas.map((_, i) => ({ nombre: nombres[i]!, hectareas: hs[i] && hs[i]! > 0 ? hs[i]! : 0 }))}
        suma={suma}
        ocupado={ocupado}
        onCampoMasGrande={(n) => void correr(() => onCorregirHectareas(n))}
      />
      {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
    </OnboardingLayout>
  )
}

// ===== B4 · Qué hay en cada potrero =====

const ESPECIES: { valor: Especie; texto: string; icono: 'Vaca' | 'Oveja' | 'Caballo' }[] = [
  { valor: 'bovino', texto: 'Vacunos', icono: 'Vaca' },
  { valor: 'ovino', texto: 'Ovinos', icono: 'Oveja' },
  { valor: 'equino', texto: 'Equinos', icono: 'Caballo' },
]

export function PasoQueHay({
  campo,
  indice,
  atras,
  onGuardar,
}: {
  campo: CampoOnb
  indice: number
  atras: Atras
  onGuardar: (contenido: Contenido) => Promise<void>
}) {
  const potrero = campo.potreros[indice]!
  const previo = potrero.contenido
  const [tipo, setTipo] = useState<Contenido['tipo'] | null>(previo?.tipo ?? null)
  const [especie, setEspecie] = useState<Especie>('bovino')
  const [cabezas, setCabezas] = useState<Partial<Record<Categoria, number>>>(
    previo?.tipo === 'hacienda' ? previo.cabezas : {},
  )
  const [cultivo, setCultivo] = useState(previo?.tipo === 'sembrado' ? previo.cultivo : '')
  const [otro, setOtro] = useState(
    previo?.tipo === 'sembrado' && !(CULTIVOS as readonly string[]).includes(previo.cultivo),
  )
  const [desde, setDesde] = useState(previo?.tipo === 'descanso' ? previo.desde : '')
  const [intento, setIntento] = useState(false)
  const { error, ocupado, correr } = useError()

  const contenido: Contenido | null =
    tipo === 'hacienda'
      ? { tipo, cabezas }
      : tipo === 'sembrado'
        ? { tipo, cultivo }
        : tipo === 'descanso'
          ? { tipo, desde }
          : null
  const falta = faltaEnContenido(contenido)
  const ultimo = indice === campo.potreros.length - 1

  const potrerosVivos = campo.potreros.map((p, i) => (i === indice ? { ...p, contenido } : p))
  const delEspecie = (e: Especie) => categoriasPorEspecie[e].reduce((s, c) => s + (cabezas[c] ?? 0), 0)

  return (
    <OnboardingLayout
      paso={4}
      {...escenas({
        lamina: { tipo: 'potreros', potreros: potrerosVivos, activo: potrero.id },
        totales: totalesDe({ ...campo, potreros: potrerosVivos }),
      })}
      atras={atras}
      titulo={`¿Qué hay en el ${potrero.nombre}?`}
      bajada={campo.potreros.length > 1 ? `Potrero ${indice + 1} de ${campo.potreros.length} de ${campo.nombre}.` : undefined}
      pie={
        <>
          {intento && falta && (
            <p className="text-center text-[13.5px] text-estado-problema-texto" role="alert">
              {falta}
            </p>
          )}
          <BotonPrincipal
            type="button"
            icono="Siguiente"
            cargando={ocupado}
            disabled={ocupado}
            onClick={() => {
              setIntento(true)
              if (falta || !contenido) return
              void correr(() => onGuardar(contenido))
            }}
          >
            {ocupado ? 'Guardando…' : ultimo ? `Listo, ${campo.nombre}` : 'Siguiente potrero'}
          </BotonPrincipal>
        </>
      }
    >
      <Segmentos
        etiqueta={`Qué hay en el ${potrero.nombre}`}
        valor={tipo}
        onCambio={setTipo}
        opciones={[
          { valor: 'hacienda', texto: 'Hacienda', icono: 'Vaca' },
          { valor: 'sembrado', texto: 'Sembrado', icono: 'Campos' },
          { valor: 'descanso', texto: 'Descanso', icono: 'Agua' },
        ]}
      />

      {tipo === 'hacienda' && (
        <>
          <Segmentos
            etiqueta="Especie"
            valor={especie}
            onCambio={setEspecie}
            opciones={ESPECIES.map((e) => ({
              ...e,
              marca:
                e.valor !== especie && delEspecie(e.valor) > 0 ? (
                  <span className="cifra rounded-full bg-principal-suave px-1.5 text-[12px] font-bold text-acento-texto">
                    {delEspecie(e.valor)}
                  </span>
                ) : undefined,
            }))}
          />
          <div className="grid grid-cols-2 gap-x-6">
            {categoriasPorEspecie[especie].map((c) => {
              const n = cabezas[c] ?? 0
              return (
                <label key={c} className="flex items-center justify-between gap-2 border-b border-borde py-2.5">
                  <span className="text-[15px] text-texto">{categoriaPlural[c]}</span>
                  <input
                    inputMode="numeric"
                    aria-label={categoriaPlural[c]}
                    value={n === 0 ? '' : String(n)}
                    placeholder="0"
                    onChange={(e) => {
                      const v = parseInt(e.target.value.replace(/\D/g, '').slice(0, 5), 10)
                      setCabezas((x) => ({ ...x, [c]: Number.isFinite(v) ? v : 0 }))
                    }}
                    className={cn(
                      'w-16 rounded-lg bg-transparent px-1 py-1 text-right font-heading text-[20px] font-extrabold outline-none placeholder:text-texto-suave/70 focus:bg-superficie',
                      n > 0 ? 'text-texto' : 'text-texto-suave',
                    )}
                  />
                </label>
              )
            })}
          </div>
          <p className="text-[13px] text-texto-suave">
            Si todavía no tienen caravana, se cargan igual: las identificás después en la manga.
          </p>
        </>
      )}

      {tipo === 'sembrado' && (
        <>
          <div className="flex flex-wrap gap-2">
            {[...CULTIVOS, 'Otro'].map((c) => {
              const elegido = c === 'Otro' ? otro : !otro && cultivo === c
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => {
                    if (c === 'Otro') {
                      setOtro(true)
                      setCultivo('')
                    } else {
                      setOtro(false)
                      setCultivo(c)
                    }
                  }}
                  className={cn(
                    'rounded-full border-[1.5px] px-4 py-2 text-[14.5px] font-semibold transition-colors',
                    elegido ? 'border-acento bg-acento text-acento-texto' : 'border-borde bg-superficie text-texto hover:border-texto-suave/50',
                  )}
                >
                  {c}
                </button>
              )
            })}
          </div>
          {otro && (
            <CampoTexto
              etiqueta="Qué está sembrado"
              value={cultivo}
              autoFocus
              placeholder="Cebada"
              maxLength={40}
              onChange={(e) => setCultivo(conMayuscula(e.target.value))}
            />
          )}
          <p className="text-[13px] text-texto-suave">
            En el mapa se ve con surcos. Cuando lo coseches o entre hacienda, lo cambiás desde el potrero.
          </p>
        </>
      )}

      {tipo === 'descanso' && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[14px] font-semibold text-texto md:text-[14.5px]">
            ¿Desde cuándo descansa? <span className="font-normal text-texto-suave">Aproximado alcanza</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {ATAJOS_DESCANSO.map((a) => {
              const fecha = haceDias(a.dias, new Date())
              const elegido = desde === fecha
              return (
                <button
                  key={a.dias}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => setDesde(fecha)}
                  className={cn(
                    'rounded-full border-[1.5px] px-4 py-2 text-[14.5px] font-semibold transition-colors',
                    elegido ? 'border-principal bg-principal text-principal-texto' : 'border-borde bg-superficie text-texto hover:border-texto-suave/50',
                  )}
                >
                  {a.nombre}
                </button>
              )
            })}
          </div>
          {/* En compu el potrero de la escena ya lo dice en grande. */}
          {desde && (
            <p className="text-texto md:hidden">
              <span className="titulo-display text-[30px]">{diasDesde(desde, new Date())} días</span>
              <span className="text-[15px] font-semibold text-texto-suave"> descansando</span>
            </p>
          )}
          <Calendario valor={desde} onCambio={setDesde} max={haceDias(0, new Date())} etiqueta="Desde cuándo descansa" />
        </div>
      )}
      {error && <Aviso tipo="problema" titulo="No se pudo guardar">{error}</Aviso>}
    </OnboardingLayout>
  )
}

// ===== B5 · ¿Tenés otro campo? =====

export function PasoOtro({
  campos,
  atras,
  onOtro,
  onTerminar,
  onRevisar,
}: {
  campos: CampoOnb[]
  atras: Atras
  onOtro: () => void
  onTerminar: () => Promise<void>
  onRevisar: () => void
}) {
  const ultimo = campos.at(-1)!
  const { error, ocupado, correr } = useError()
  const nombres = campos.length === 1 ? `con ${ultimo.nombre} está` : `con estos ${campos.length} campos está`
  return (
    <OnboardingLayout
      paso={4}
      {...escenas({ lamina: { tipo: 'potreros', potreros: ultimo.potreros }, totales: totalesDe(ultimo) })}
      atras={atras}
      titulo="¿Tenés otro campo?"
      bajada="Si tenés más, sumalo ahora: el mapa se arma con todos juntos."
      pie={
        <>
          <BotonPrincipal type="button" icono="Agregar" onClick={onOtro} disabled={ocupado}>
            Sí, cargar otro campo
          </BotonPrincipal>
          <Boton
            tipo="secundario"
            tamano="grande"
            className="w-full rounded-full"
            disabled={ocupado}
            onClick={() => void correr(onTerminar)}
          >
            {ocupado ? 'Terminando…' : `No, ${nombres}`}
          </Boton>
        </>
      }
    >
      <BotonChico type="button" icono="Editar" className="self-start" onClick={onRevisar} disabled={ocupado}>
        Revisar {ultimo.nombre}
      </BotonChico>
      {error && <Aviso tipo="problema" titulo="No se pudo terminar">{error}</Aviso>}
    </OnboardingLayout>
  )
}
