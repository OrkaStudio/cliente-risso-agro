import { useMemo, useState } from 'react'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useAnimales, useAsignarCaravanas, useDeshacerCaravanas, usePotreros } from '@/features/hacienda/hooks'
import { categoriaLabel, categoriaNombre, categoriasPorEspecie } from '@/features/hacienda/labels'
import { useMapa } from '@/features/mapa/api'
import type { CampoMapa } from '@/features/mapa/reglas'
import type { Database } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { rangos, type PotreroRef } from './asignacion'
import { ZonaArchivo } from './caravanas'
import { clasificar, palabrasYLugares, planificar, respuestasIniciales, respuestasVacias, sinCaravanaEn, type DelRodeo, type Plan, type Respuestas } from './carga-planilla'
import { ElegirCampo, Potreros } from './entradas-salidas-panel'
import { leerArchivo } from './leer-archivo'
import { interpretarConIa } from './planilla-ia'
import { interpretarSola, leerPlanilla, necesitaAyuda, soloDigitos, type Celda, type Columna, type Fila, type Hoja, type Interpretacion } from './planilla'

type Categoria = Database['public']['Enums']['categoria_animal']
type Paso = 'subir' | 'esta' | 'que' | 'donde' | 'nocierra' | 'revisa' | 'listo'
type Hecho = { lote: string; asignadas: number; chips: number; altas: number; lineas: string[]; deshecho: boolean }

const ORDEN = [...categoriasPorEspecie.bovino, ...categoriasPorEspecie.ovino, ...categoriasPorEspecie.equino]
const CHICO = 'inline-flex h-10 items-center gap-1.5 self-start rounded-full border-[1.5px] border-principal bg-superficie px-4 text-[14.5px] font-bold text-principal hover:bg-principal-suave disabled:opacity-40'
const PILL = 'inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[14.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40'
const ELEGIDO = 'border-tinta bg-tinta text-superficie'
const SEL = 'h-11 min-w-[200px] rounded-[12px] border-[1.5px] bg-superficie px-3 text-[15px] font-semibold text-texto outline-none focus:border-principal'
const NUM = 'cifra h-11 w-24 rounded-[10px] border-[1.5px] border-borde bg-superficie px-2.5 text-[17px]'
const plural = (c: Categoria, n = 2) => categoriaNombre(c, n)
const enRango = (f: Fila, desde: string, hasta: string) => {
  const n = Number(soloDigitos(f.visual))
  return !!soloDigitos(f.visual) && !!soloDigitos(desde) && n >= Number(soloDigitos(desde)) && n <= Number(soloDigitos(hasta) || soloDigitos(desde))
}

/**
 * Las caravanas, desde una planilla (prototipo del 19/10). Se resuelve por
 * grupos, nunca fila por fila: qué son, dónde estaban y qué pasa con lo que no
 * cierra, cada pregunta sobre todas las filas a la vez. Nada se supone y nada
 * se guarda sin el Revisá. A uno solo se le pone desde su ficha.
 */
export function CargarCaravanas({ empresaId, abierto, onCerrar }: { empresaId: string; abierto: boolean; onCerrar: () => void }) {
  const animales = useAnimales()
  const potreros = usePotreros()
  const { campos } = useCampoElegido()
  const { data: mapa } = useMapa(empresaId)
  const asignarM = useAsignarCaravanas()
  const deshacerM = useDeshacerCaravanas()
  const [paso, setPaso] = useState<Paso>('subir')
  const [archivo, setArchivo] = useState('')
  const [hojas, setHojas] = useState<Hoja[] | null>(null)
  const [interp, setInterp] = useState<Interpretacion | null>(null)
  const [filas, setFilas] = useState<Fila[]>([])
  const [r, setR] = useState<Respuestas>(respuestasVacias())
  const [sugeridas, setSugeridas] = useState<Set<string>>(new Set())
  const [ia, setIa] = useState<{ categorias: Record<string, Categoria>; potreros: Record<string, string> } | undefined>()
  const [leyendo, setLeyendo] = useState(false)
  const [verErrores, setVerErrores] = useState(false)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nombreCampo = (id: string) => campos.find((c) => c.id === id)?.nombre ?? ''
  const refs: PotreroRef[] = (potreros.data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, campoId: p.campo_id, campo: nombreCampo(p.campo_id) }))
  const pot = (id: string) => refs.find((p) => p.id === id)
  const lugar = (id: string) => (pot(id) ? `${pot(id)!.nombre} · ${pot(id)!.campo}` : '')
  const rodeo: DelRodeo[] = useMemo(
    () =>
      (animales.data ?? [])
        .filter((a) => a.estado === 'activo' && a.id && a.categoria)
        .map((a) => ({ id: a.id!, categoria: a.categoria!, potreroId: a.potrero_id, createdAt: a.created_at ?? '', propio: !!(a.fecha_nacimiento || a.raza || a.pelaje), visual: a.caravana_visual, rfid: a.caravana_rfid })),
    [animales.data],
  )
  const sinTotal = rodeo.filter((a) => !a.visual && !a.rfid).length
  const camposMapa = (mapa ?? []).filter((c) => c.potreros.length > 0)

  const conQue = interp?.columnas.categoria !== undefined
  const conDonde = interp?.columnas.potrero !== undefined
  const sinCaravanaCol = !!interp && interp.columnas.visual === undefined && interp.columnas.rfid === undefined
  const clase = useMemo(() => clasificar(filas, rodeo), [filas, rodeo])
  const cuenta = (c: string) => [...clase.values()].filter((x) => x.clase === c).length
  const plan: Plan = planificar(filas, rodeo, refs, r, conQue, conDonde)
  const poner = filas.filter((f) => clase.get(f.clave)?.clase === 'poner')
  const { palabras, lugares } = palabrasYLugares(poner, refs)
  // Las categorías de las filas para poner, según las respuestas (para saber qué buscar en el croquis).
  const cats: Categoria[] = poner
    .map((f) => (conQue ? r.que[f.categoriaTexto] : r.sinQue.modo === 'uno' ? r.sinQue.uno : r.sinQue.tramos.find((t) => t.categoria && enRango(f, t.desde, t.hasta))?.categoria))
    .filter((c): c is Categoria => !!c)

  // Qué pasos hacen falta: los que tienen algo para responder o confirmar.
  const hayQue = poner.length > 0 && (!conQue || palabras.some((p) => !p.sola))
  const hayDonde = poner.length > 0 && (!conDonde || lugares.some((l) => l.candidatos.length !== 1))
  const orden: Paso[] = ['esta', ...(hayQue ? (['que'] as Paso[]) : []), ...(hayDonde ? (['donde'] as Paso[]) : []), ...(plan.noCierran.length || paso === 'nocierra' ? (['nocierra'] as Paso[]) : []), 'revisa']
  const siguiente = () => setPaso(orden[orden.indexOf(paso) + 1] ?? 'revisa')
  const anterior = () => (orden.indexOf(paso) > 0 ? setPaso(orden[orden.indexOf(paso) - 1]!) : limpiar())
  const numPaso = ({ esta: 1, que: 2, donde: 3, nocierra: 4, revisa: 4 } as Partial<Record<Paso, number>>)[paso] ?? 0

  function limpiar() {
    setPaso('subir')
    setHojas(null)
    setInterp(null)
    setFilas([])
    setR(respuestasVacias())
    setSugeridas(new Set())
    setIa(undefined)
    setVerErrores(false)
    setError(null)
  }
  function cerrar() {
    limpiar()
    setHecho(null)
    onCerrar()
  }
  function aplicar(hs: Hoja[], i: Interpretacion, sug = ia) {
    const l = leerPlanilla(hs, refs, i)
    setInterp(i)
    setFilas(l.filas)
    // Con todas las filas, también las que tienen un error: al corregirlas en el Revisá, su palabra ya está resuelta.
    const ini = respuestasIniciales(l.filas, refs, sug)
    setR(ini.respuestas)
    setSugeridas(ini.sugeridas)
  }

  async function leer(f: File) {
    setError(null)
    setLeyendo(true)
    try {
      const hs = await leerArchivo(f)
      setArchivo(f.name)
      setHojas(hs)
      let i = interpretarSola(hs)
      let sug: typeof ia
      // Si los títulos o las palabras no se entienden solos, la IA sugiere (sin red, se sigue sin ella).
      if (necesitaAyuda(leerPlanilla(hs, refs, i), i)) {
        const x = await interpretarConIa(hs, refs)
        if (x) {
          i = { ...x, categorias: {}, potreros: {} }
          sug = { categorias: x.categorias, potreros: x.potreros }
        }
      }
      setIa(sug)
      aplicar(hs, i, sug)
      setPaso('esta')
    } catch {
      setError('No pudimos abrir ese archivo. Tiene que ser un Excel (.xlsx) o un CSV.')
    } finally {
      setLeyendo(false)
    }
  }

  async function guardar() {
    setError(null)
    const lote = crypto.randomUUID()
    try {
      const x = await asignarM.mutateAsync({ empresaId, lote, filas: plan.filas, chips: plan.chips, altas: plan.altas })
      const lineas = plan.grupos.map((g) => `${plural(g.categoria)} · ${lugar(g.potreroId)}: ${rangos(g.numeros)}${g.nuevas ? ` (${g.nuevas} nuevas)` : ''}`)
      if (x.chips) lineas.push(x.chips === 1 ? 'Chip sumado a 1 que ya tenía caravana' : `Chip sumado a ${x.chips} que ya tenían caravana`)
      setHecho({ lote, ...x, lineas, deshecho: false })
      setPaso('listo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }
  async function deshacer() {
    if (!hecho) return
    try {
      await deshacerM.mutateAsync(hecho.lote)
      setHecho({ ...hecho, deshecho: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo deshacer.')
    }
  }

  const cambiarR = (f: (x: Respuestas) => Respuestas) => setR((x) => f(structuredClone(x)))
  const aPoner = plan.filas.length + plan.altas.length

  // ===== Cada paso: título, bajada, cuerpo y botón =====
  let titulo = 'Caravanas desde una planilla'
  let bajada: React.ReactNode = 'La del veterinario o la de SENASA.'
  let cuerpo: React.ReactNode = null
  let pie: React.ReactNode = null

  if (paso === 'subir') {
    cuerpo = (
      <div className="flex flex-col gap-4">
        <ZonaArchivo titulo="Soltá acá el Excel" bajada="o tocá para buscarlo en la compu" onArchivo={leer} cargando={leyendo} />
        {leyendo && <p className="text-center text-[14px] text-texto-suave">Leyendo la planilla…</p>}
        <p className="text-[14.5px] text-texto-suave">{sinTotal === 1 ? 'Hay 1 animal sin caravana.' : `Hay ${sinTotal} animales sin caravana.`} A uno solo se la ponés desde su ficha.</p>
      </div>
    )
  } else if (paso === 'esta' && hojas && interp) {
    titulo = sinCaravanaCol ? '¿Cuál es la caravana?' : '¿Es ésta?'
    bajada = (
      <span className="inline-flex flex-wrap items-center gap-2">
        {archivo}
        {hojas.length > 1 && (
          <select aria-label="Hoja" value={interp.hoja} onChange={(e) => aplicar(hojas, { ...interpretarSola([hojas[Number(e.target.value)]!]), hoja: Number(e.target.value) })} className="rounded-full border border-borde bg-superficie px-2 py-0.5 text-[14px]">
            {hojas.map((h, i) => (
              <option key={i} value={i}>
                hoja «{h.nombre}»
              </option>
            ))}
          </select>
        )}
      </span>
    )
    cuerpo = (
      <div className="flex flex-col gap-4">
        {sinCaravanaCol ? (
          <Aviso tono="atencion">No encontramos la columna de la caravana. Elegila en el título de la tabla.</Aviso>
        ) : (
          <LoQueLeimos poner={cuenta('poner')} ya={cuenta('ya')} chip={cuenta('chip')} errores={cuenta('error')} falta={[...(hayQue ? ['qué son'] : []), ...(hayDonde ? ['dónde estaban'] : [])]} />
        )}
        <VistaPrevia hoja={hojas[interp.hoja]!} interp={interp} onCambio={(i) => aplicar(hojas, i)} />
        <p className="text-[14px] text-texto-suave">Las primeras filas de tu archivo. Si una columna se leyó mal, tocá el botón de arriba y elegí qué es.</p>
      </div>
    )
    pie = (
      <BotonPrincipal icono="Siguiente" disabled={sinCaravanaCol || filas.length === 0} onClick={siguiente}>
        Sí, es ésta
      </BotonPrincipal>
    )
  } else if (paso === 'que') {
    if (conQue) {
      titulo = '¿Qué son?'
      bajada = palabras.length === 1 ? 'Tu planilla usa 1 palabra.' : `Tu planilla usa ${palabras.length} palabras.`
      cuerpo = (
        <div className="flex flex-col gap-2.5">
          {palabras.map((p) => (
            <Linea key={p.texto} texto={p.texto} filas={p.filas} falta={!r.que[p.texto]}>
              {p.sola ? (
                <span className={cn(PILL, ELEGIDO)}>{categoriaLabel[p.sola]} ✓</span>
              ) : (
                <>
                  {sugeridas.has(`que:${p.texto}`) && r.que[p.texto] === ia?.categorias[p.texto] && <Sugerido />}
                  <SelCategoria valor={r.que[p.texto] ?? ''} onCambio={(c) => cambiarR((x) => ({ ...x, que: { ...x.que, [p.texto]: c } }))} etiqueta={`Qué es «${p.texto}»`} />
                </>
              )}
            </Linea>
          ))}
        </div>
      )
    } else {
      titulo = `¿Qué son estos ${poner.length}?`
      bajada = 'Tu planilla no lo dice.'
      cuerpo = <SinQue r={r} cambiarR={cambiarR} poner={poner} faltan={plan.faltanQue} />
    }
    pie = <PieSeguir faltan={plan.faltanQue} onSeguir={siguiente} />
  } else if (paso === 'donde') {
    const unicas = [...new Set(cats)]
    if (conDonde) {
      titulo = '¿Dónde estaban?'
      bajada = lugares.length === 1 ? 'Tu planilla usa 1 lugar.' : `Tu planilla usa ${lugares.length} lugares.`
      cuerpo = (
        <div className="flex flex-col gap-2.5">
          {lugares.map((l) => (
            <Linea key={l.texto} texto={l.texto} filas={l.filas} falta={!r.donde[l.texto]}>
              {l.candidatos.length === 1 ? (
                <span className={cn(PILL, ELEGIDO)}>{lugar(l.candidatos[0]!)} ✓</span>
              ) : l.candidatos.length > 1 ? (
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[12.5px] font-semibold text-estado-atencion-texto">Hay un {l.texto} en {l.candidatos.length} campos</span>
                  <div className="flex flex-wrap justify-end gap-2">
                    {l.candidatos.map((id) => (
                      <button key={id} type="button" aria-pressed={r.donde[l.texto] === id} onClick={() => cambiarR((x) => ({ ...x, donde: { ...x.donde, [l.texto]: id } }))} className={cn(PILL, r.donde[l.texto] === id ? ELEGIDO : 'border-borde bg-superficie')}>
                        {pot(id)!.campo}
                        <small className="text-[12.5px] font-medium opacity-75">{sinCaravanaEn(rodeo, id, unicas) || 'ninguno'} sin caravana</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <SelPotrero refs={refs} valor={r.donde[l.texto] ?? ''} sugerido={sugeridas.has(`donde:${l.texto}`)} onCambio={(id) => cambiarR((x) => ({ ...x, donde: { ...x.donde, [l.texto]: id } }))} etiqueta={`Dónde es «${l.texto}»`} />
              )}
            </Linea>
          ))}
        </div>
      )
    } else {
      titulo = r.sinDonde.modo === 'varios' ? '¿Dónde estaba cada grupo?' : '¿Estaban todos en el mismo potrero?'
      bajada = r.sinDonde.modo === 'varios' ? 'Tocá el potrero de cada uno en el croquis.' : 'Tocalo en el croquis.'
      cuerpo = <SinDonde r={r} cambiarR={cambiarR} cats={unicas} mapa={camposMapa} rodeo={rodeo} lugar={lugar} cuantos={(c) => cats.filter((x) => x === c).length} />
    }
    pie = <PieSeguir faltan={plan.faltanDonde} onSeguir={siguiente} />
  } else if (paso === 'nocierra') {
    titulo = plan.noCierran.length > 1 ? `${plan.noCierran.length} grupos no cierran` : 'Un grupo no cierra'
    bajada = 'Decí qué pasó. El resto ya está.'
    cuerpo = (
      <div className="flex flex-col gap-3">
        {plan.noCierran.map((g) => (
          <NoCierra key={g.clave} g={g} lugar={lugar} d={r.noCierra[g.clave]} mapa={camposMapa} rodeo={rodeo} onCambio={(d) => cambiarR((x) => ({ ...x, noCierra: { ...x.noCierra, [g.clave]: d } }))} />
        ))}
        {plan.noCierran.length === 0 && <p className="text-[15px] text-texto-suave">Ya está: todos los grupos cierran.</p>}
      </div>
    )
    pie = <PieSeguir faltan={plan.noCierran.length} onSeguir={() => setPaso('revisa')} />
  } else if (paso === 'revisa') {
    titulo = 'Revisá'
    bajada = 'Esto es lo que va a pasar. Si algo no está bien, volvé y cambialo.'
    cuerpo = (
      <div className="flex flex-col gap-2.5">
        {plan.grupos.map((g) => {
          const cuantos = g.numeros.length
          const nombre = (n: number) => (n === 1 ? categoriaLabel[g.categoria] : plural(g.categoria)).toLowerCase()
          const p = pot(g.potreroId)
          return (
            <div key={g.clave} className="flex flex-col gap-3 rounded-[18px] border border-borde bg-superficie p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-estado-bien text-[16px] font-black text-white" aria-hidden>
                  ✓
                </span>
                <div className="min-w-0">
                  <b className="block text-[16.5px]">
                    {cuantos} {nombre(cuantos)} del {p?.nombre} {cuantos === 1 ? 'va' : 'van'} a tener caravana
                  </b>
                  <span className="text-[13.5px] text-texto-suave">{p?.campo}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.numeros.slice(0, 24).map((x) => (
                  <span key={x} className="cifra rounded-[8px] border-[1.5px] border-principal px-2 py-0.5 text-[15px] font-bold text-principal">
                    {x}
                  </span>
                ))}
                {g.numeros.length > 24 && <span className="self-center text-[14px] font-semibold text-texto-suave">y {g.numeros.length - 24} más</span>}
              </div>
              <div className="flex flex-col gap-1 border-t border-borde pt-2.5 text-[14px]">
                {g.nuevas > 0 && <span className="font-semibold text-texto">{g.nuevas === 1 ? '1 no estaba cargada: entra al rodeo' : `${g.nuevas} no estaban cargadas: entran al rodeo`}</span>}
                <span className={g.despues === 0 ? 'font-semibold text-estado-bien-texto' : 'text-texto-suave'}>
                  {g.despues === 0
                    ? `En el ${p?.nombre} ya no quedan ${nombre(2)} sin caravana`
                    : `${g.despues === 1 ? 'Queda 1' : `Quedan ${g.despues}`} ${nombre(g.despues)} sin caravana en el ${p?.nombre}`}
                </span>
              </div>
            </div>
          )
        })}
        {plan.conChip > 0 && (
          <button type="button" role="checkbox" aria-checked={r.chip} onClick={() => cambiarR((x) => ({ ...x, chip: !x.chip }))} className="flex items-center gap-3 rounded-[14px] border border-borde bg-superficie px-4 py-3 text-left text-[15px] font-semibold">
            <span className={cn('grid size-5 shrink-0 place-items-center rounded-[6px] border-[1.5px]', r.chip ? 'border-principal bg-principal text-superficie' : 'border-borde')}>{r.chip && <Icono nombre="Guardar" tamano={16} />}</span>
            Sumarles el chip a {plan.conChip} que ya tenían caravana
          </button>
        )}
        {plan.ya > 0 && <Aviso tono="neutro">{plan.ya === 1 ? '1 ya tenía su caravana: se saltea' : `${plan.ya} ya tenían su caravana: se saltean`}</Aviso>}
        {plan.afuera.map((a) => (
          <Aviso key={a.clave} tono="atencion">
            {plural(a.categoria)} del {pot(a.potreroId)?.nombre}: {a.cuantas} quedan para después
          </Aviso>
        ))}
        {plan.faltanQue + plan.faltanDonde > 0 && <Aviso tono="atencion">{plan.faltanQue + plan.faltanDonde} sin decir qué son o dónde estaban: no se ponen</Aviso>}
        {plan.errores.length > 0 && (
          <Aviso
            tono="problema"
            accion={
              <button type="button" onClick={() => setVerErrores(!verErrores)} className={CHICO}>
                {verErrores ? 'Listo' : 'Ver y corregir'}
              </button>
            }
          >
            {plan.errores.length === 1 ? '1 no se pone: tiene un error' : `${plan.errores.length} no se ponen: tienen un error`}
          </Aviso>
        )}
        {verErrores && (
          <ul className="divide-y divide-borde rounded-[14px] border border-borde bg-superficie">
            {plan.errores.map(({ fila: f, motivo }) => (
              <li key={f.clave} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-2.5">
                <input aria-label={`Caravana de la fila ${f.fila}`} value={f.visual} onChange={(e) => setFilas((fs) => fs.map((x) => (x.clave === f.clave ? { ...x, visual: e.target.value } : x)))} className="cifra h-10 rounded-[10px] border-[1.5px] border-borde bg-superficie px-2.5 text-[16px] font-bold" />
                <span className="text-[13.5px] text-estado-problema-texto">
                  <span className="text-texto-suave">Fila {f.fila} · </span>
                  {motivo}
                </span>
                <button type="button" onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))} className="h-9 rounded-full px-3 text-[13.5px] font-bold text-texto-suave hover:bg-superficie-hundida">
                  Sacar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
    pie = (
      <BotonPrincipal icono="Guardar" cargando={asignarM.isPending} disabled={asignarM.isPending || aPoner + plan.chips.length === 0} onClick={guardar}>
        {aPoner ? `Ponerle caravana a ${aPoner}` : plan.chips.length ? `Sumar ${plan.chips.length === 1 ? '1 chip' : `${plan.chips.length} chips`}` : 'No hay nada para poner'}
      </BotonPrincipal>
    )
  } else if (paso === 'listo' && hecho) {
    const n = hecho.asignadas + hecho.altas
    titulo = hecho.deshecho ? 'Se deshizo la carga' : n ? `Listo: ${n} ${n === 1 ? 'caravana puesta' : 'caravanas puestas'}` : `Listo: ${hecho.chips === 1 ? '1 chip sumado' : `${hecho.chips} chips sumados`}`
    bajada = hecho.deshecho ? 'Todo quedó como antes de subir la planilla.' : 'Ya se ven en el rodeo con su número.'
    const conCaravana = rodeo.length - sinTotal
    cuerpo = hecho.deshecho ? (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-[18px] border border-borde bg-superficie p-4">
          <Estado tono="ya" signo="↺" titulo="No quedó nada de esta planilla">
            {n ? n === 1 ? 'El animal volvió a estar sin caravana.' : `Los ${n} animales volvieron a estar sin caravana.` : 'Se sacaron los chips sumados.'}
          </Estado>
          <ul className="flex flex-col gap-1 pl-1 text-[14.5px] text-texto-suave line-through">
            {hecho.lineas.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <button type="button" onClick={limpiar} className={cn(CHICO, 'self-start')}>
          <Icono nombre="Comprobante" tamano={16} /> Subir otra planilla
        </button>
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-[18px] border border-borde bg-superficie p-4">
          {hecho.lineas.map((l) => (
            <Estado key={l} tono="bien" titulo={l.split(': ')[0]!}>
              {l.split(': ').slice(1).join(': ')}
            </Estado>
          ))}
          {rodeo.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-baseline justify-between gap-3 text-[14.5px]">
                <b>{sinTotal === 0 ? 'Todo tu rodeo tiene caravana' : `${conCaravana} de ${rodeo.length} con caravana`}</b>
                {sinTotal > 0 && <span className="text-texto-suave">{sinTotal === 1 ? 'Queda 1 sin caravana' : `Quedan ${sinTotal} sin caravana`}</span>}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-superficie-hundida" aria-hidden>
                <span className="block h-full rounded-full bg-estado-bien transition-[width] duration-700" style={{ width: `${(conCaravana / rodeo.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        <button type="button" disabled={deshacerM.isPending} onClick={deshacer} className={cn(CHICO, 'self-start')}>
          <Icono nombre="Reintentar" tamano={16} /> Deshacer esta carga
        </button>
      </div>
    )
    pie = (
      <BotonPrincipal icono="Guardar" onClick={cerrar}>
        Listo
      </BotonPrincipal>
    )
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={cerrar}
      className="max-w-[800px]"
      titulo={titulo}
      bajada={bajada ?? undefined}
      onVolver={paso !== 'subir' && paso !== 'listo' ? anterior : undefined}
      pie={pie ?? undefined}
    >
      {numPaso > 0 && <Pasos activo={numPaso} />}
      {cuerpo}
      {error && <p className="mt-5 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
    </PanelLateral>
  )
}

function Pasos({ activo }: { activo: number }) {
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-2 text-[13.5px]" aria-label="Pasos">
      {['Planilla', 'Qué son', 'Dónde', 'Revisá'].map((p, i) => (
        <li key={p} aria-current={i + 1 === activo ? 'step' : undefined} className={cn('flex items-center gap-1.5', i + 1 === activo ? 'font-bold text-texto' : 'font-medium text-texto-suave')}>
          <span className={cn('grid size-[22px] place-items-center rounded-full text-[12px] font-bold', i + 1 === activo ? 'bg-principal text-principal-texto' : i + 1 < activo ? 'bg-estado-bien text-superficie' : 'bg-superficie-hundida')}>{i + 1 < activo ? '✓' : i + 1}</span>
          {p}
          {i < 3 && <span className="ml-1 text-borde">—</span>}
        </li>
      ))}
    </ol>
  )
}

/** Lo que leímos, por estado: lo que está bien, lo que falta y lo que tiene un error. Sólo lo que hay. */
function LoQueLeimos({ poner, ya, chip, errores, falta }: { poner: number; ya: number; chip: number; errores: number; falta: string[] }) {
  const total = poner + ya + chip + errores
  if (total === 0) return null
  const tramos = [
    { n: poner, c: falta.length ? 'bg-estado-atencion' : 'bg-estado-bien' },
    { n: ya + chip, c: 'bg-borde' },
    { n: errores, c: 'bg-estado-problema' },
  ].filter((t) => t.n > 0)
  const cuantos = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`)
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-borde bg-superficie p-4">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[18px]">Leímos {cuantos(total, 'animal', 'animales')}</b>
        {errores === 0 && !falta.length && poner > 0 && <span className="text-[14px] font-semibold text-estado-bien-texto">Todo en orden</span>}
      </div>
      <div className="flex h-2.5 gap-1 overflow-hidden rounded-full" aria-hidden>
        {tramos.map((t, i) => (
          <span key={i} className={cn('h-full rounded-full transition-[flex-grow] duration-700', t.c)} style={{ flexGrow: t.n }} />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {poner > 0 &&
          (falta.length ? (
            <Estado tono="falta" titulo={`${cuantos(poner, 'para ponerle', 'para ponerles')} caravana`}>
              Falta saber {falta.join(' y ')}. Te lo preguntamos ahora.
            </Estado>
          ) : (
            <Estado tono="bien" titulo={`${cuantos(poner, 'lista', 'listas')} para ponerles caravana`}>
              Tu planilla dice qué son y dónde están.
            </Estado>
          ))}
        {ya + chip > 0 && (
          <Estado tono="ya" titulo={`${cuantos(ya + chip, 'ya tiene', 'ya tienen')} caravana`}>
            {chip ? `${chip === 1 ? 'A 1 le sumás' : `A ${chip} les sumás`} el chip de la planilla.${ya ? ' Las demás se saltean.' : ''}` : 'Se saltean, no se toca nada.'}
          </Estado>
        )}
        {errores > 0 && (
          <Estado tono="error" titulo={cuantos(errores, 'fila con un error', 'filas con un error')}>
            Las ves y las corregís al final, antes de guardar.
          </Estado>
        )}
      </ul>
    </div>
  )
}

function Estado({ tono, titulo, signo, children }: { tono: 'bien' | 'falta' | 'ya' | 'error'; titulo: string; signo?: string; children: React.ReactNode }) {
  const t = {
    bien: { fondo: 'bg-estado-bien-suave', marca: 'bg-estado-bien text-white', texto: 'text-estado-bien-texto', signo: '✓' },
    falta: { fondo: 'bg-estado-atencion-suave', marca: 'bg-estado-atencion text-white', texto: 'text-estado-atencion-texto', signo: '?' },
    ya: { fondo: 'bg-superficie-hundida', marca: 'bg-superficie text-texto-suave border border-borde', texto: 'text-texto', signo: '✓' },
    error: { fondo: 'bg-estado-problema-suave', marca: 'bg-estado-problema text-white', texto: 'text-estado-problema-texto', signo: '!' },
  }[tono]
  return (
    <li className={cn('flex items-center gap-3 rounded-[14px] px-3.5 py-3', t.fondo)}>
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-[16px] font-black', t.marca)} aria-hidden>
        {signo ?? t.signo}
      </span>
      <div className="min-w-0">
        <b className={cn('block text-[15.5px]', t.texto)}>{titulo}</b>
        <span className="text-[13.5px] text-texto-suave">{children}</span>
      </div>
    </li>
  )
}

function Aviso({ tono, children, accion }: { tono: 'neutro' | 'atencion' | 'problema'; children: React.ReactNode; accion?: React.ReactNode }) {
  const c = { neutro: 'bg-superficie-hundida text-texto-suave', atencion: 'bg-estado-atencion-suave text-estado-atencion-texto', problema: 'bg-estado-problema-suave text-estado-problema-texto' }[tono]
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-4 py-3 text-[14.5px] font-semibold', c)}>
      <span>{children}</span>
      {accion}
    </div>
  )
}

const Sugerido = () => <span className="rounded-full bg-superficie-hundida px-2 py-0.5 text-[12px] font-semibold text-texto-suave">sugerido</span>

/** «Vq» · 40 animales → lo que es en Tropero. */
function Linea({ texto, filas, falta, children }: { texto: string; filas: number; falta: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 rounded-[16px] border bg-superficie py-3.5 pr-4 pl-5', falta ? 'border-principal ring-1 ring-principal' : 'border-borde')}>
      <div className="min-w-0">
        <b className="block truncate text-[17px]">«{texto}»</b>
        <span className="text-[13.5px] text-texto-suave">{filas === 1 ? '1 animal' : `${filas} animales`}</span>
      </div>
      <Icono nombre="Siguiente" tamano={16} className="text-texto-suave" />
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  )
}

function PieSeguir({ faltan, onSeguir }: { faltan: number; onSeguir: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {faltan > 0 && <p className="text-center text-[13.5px] text-texto-suave">{faltan === 1 ? 'Falta 1' : `Faltan ${faltan}`}</p>}
      <BotonPrincipal icono="Siguiente" disabled={faltan > 0} onClick={onSeguir}>
        Seguir
      </BotonPrincipal>
    </div>
  )
}

function SelCategoria({ valor, onCambio, etiqueta }: { valor: string; onCambio: (c: Categoria | '') => void; etiqueta: string }) {
  return (
    <select aria-label={etiqueta} value={valor} onChange={(e) => onCambio(e.target.value as Categoria | '')} className={cn(SEL, valor ? 'border-borde' : 'border-principal font-normal text-texto-suave')}>
      <option value="">Elegí</option>
      {ORDEN.map((c) => (
        <option key={c} value={c}>
          {categoriaLabel[c]}
        </option>
      ))}
    </select>
  )
}

function SelPotrero({ refs, valor, sugerido, onCambio, etiqueta }: { refs: PotreroRef[]; valor: string; sugerido: boolean; onCambio: (id: string) => void; etiqueta: string }) {
  return (
    <>
      {sugerido && valor && <Sugerido />}
      <select aria-label={etiqueta} value={valor} onChange={(e) => onCambio(e.target.value)} className={cn(SEL, valor ? 'border-borde' : 'border-principal font-normal text-texto-suave')}>
        <option value="">Elegí</option>
        {refs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} · {p.campo}
          </option>
        ))}
      </select>
    </>
  )
}

/** Sin columna «qué es»: todos lo mismo, o por tramos de números como vienen en las tiras. */
function SinQue({ r, cambiarR, poner, faltan }: { r: Respuestas; cambiarR: (f: (x: Respuestas) => Respuestas) => void; poner: Fila[]; faltan: number }) {
  const tramo = (i: number, k: 'desde' | 'hasta' | 'categoria', v: string) =>
    cambiarR((x) => {
      x.sinQue.tramos[i] = { ...x.sinQue.tramos[i]!, [k]: v }
      return x
    })
  const sinDecir = poner.filter((f) => !r.sinQue.tramos.some((t) => t.categoria && enRango(f, t.desde, t.hasta)))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(['uno', 'varios'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={r.sinQue.modo === m} onClick={() => cambiarR((x) => ({ ...x, sinQue: { ...x.sinQue, modo: m } }))} className={cn(PILL, r.sinQue.modo === m ? ELEGIDO : 'border-borde bg-superficie')}>
            {m === 'uno' ? 'Todos lo mismo' : 'Hay de varios'}
          </button>
        ))}
      </div>
      {r.sinQue.modo === 'uno' && (
        <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-borde bg-superficie px-5 py-4">
          <b>Los {poner.length} son</b>
          <SelCategoria valor={r.sinQue.uno} onCambio={(c) => cambiarR((x) => ({ ...x, sinQue: { ...x.sinQue, uno: c } }))} etiqueta="Qué son todos" />
        </div>
      )}
      {r.sinQue.modo === 'varios' && (
        <>
          <div className="flex flex-col gap-2.5 rounded-[16px] border border-borde bg-superficie px-5 py-4">
            <b>Por números, como vienen en las tiras</b>
            {r.sinQue.tramos.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-texto-suave">Del</span>
                <input aria-label={`Desde, tramo ${i + 1}`} inputMode="numeric" value={t.desde} onChange={(e) => tramo(i, 'desde', e.target.value)} className={NUM} />
                <span className="text-texto-suave">al</span>
                <input aria-label={`Hasta, tramo ${i + 1}`} inputMode="numeric" value={t.hasta} onChange={(e) => tramo(i, 'hasta', e.target.value)} className={NUM} />
                <span className="text-texto-suave">son</span>
                <SelCategoria valor={t.categoria} onCambio={(c) => tramo(i, 'categoria', c)} etiqueta={`Qué son, tramo ${i + 1}`} />
                {t.categoria && soloDigitos(t.desde) && <span className="cifra text-[15px] text-texto-suave">{poner.filter((f) => enRango(f, t.desde, t.hasta)).length}</span>}
              </div>
            ))}
            <button type="button" onClick={() => cambiarR((x) => ({ ...x, sinQue: { ...x.sinQue, tramos: [...x.sinQue.tramos, { desde: '', hasta: '', categoria: '' }] } }))} className={CHICO}>
              + Otro tramo
            </button>
          </div>
          {faltan > 0 ? (
            <Aviso tono="atencion">
              Te {faltan === 1 ? 'queda 1' : `quedan ${faltan}`} sin decir{sinDecir.length && sinDecir.every((f) => soloDigitos(f.visual)) ? `: ${rangos(sinDecir.map((f) => f.visual))}` : ''}
            </Aviso>
          ) : (
            <Aviso tono="neutro">Están los {poner.length}.</Aviso>
          )}
        </>
      )}
    </div>
  )
}

/** Sin columna «dónde»: todos en un potrero, o uno por grupo. Siempre en el croquis. */
function SinDonde({ r, cambiarR, cats, mapa, rodeo, lugar, cuantos }: { r: Respuestas; cambiarR: (f: (x: Respuestas) => Respuestas) => void; cats: Categoria[]; mapa: CampoMapa[]; rodeo: DelRodeo[]; lugar: (id: string) => string; cuantos: (c: Categoria) => number }) {
  if (r.sinDonde.modo !== 'varios')
    return (
      <div className="flex flex-col gap-3">
        <Croquis mapa={mapa} rodeo={rodeo} categorias={cats} elegido={r.sinDonde.potrero} onElegir={(id) => cambiarR((x) => ({ ...x, sinDonde: { ...x.sinDonde, modo: 'uno', potrero: id } }))} />
        {cats.length > 1 && (
          <button type="button" onClick={() => cambiarR((x) => ({ ...x, sinDonde: { modo: 'varios', potrero: '', porCategoria: {} } }))} className={CHICO}>
            No, estaban en varios
          </button>
        )}
      </div>
    )
  return (
    <div className="flex flex-col gap-3">
      {cats.map((c) => {
        const v = r.sinDonde.porCategoria[c]
        return (
          <div key={c} className={cn('flex flex-col gap-3 rounded-[16px] border bg-superficie px-5 py-4', v ? 'border-borde' : 'border-principal')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <b className="text-[16px]">
                {plural(c)} · {cuantos(c)}
              </b>
              {v && (
                <button type="button" onClick={() => cambiarR((x) => ({ ...x, sinDonde: { ...x.sinDonde, porCategoria: { ...x.sinDonde.porCategoria, [c]: '' } } }))} className={cn(PILL, ELEGIDO)}>
                  {lugar(v)} ✓
                </button>
              )}
            </div>
            {!v && <Croquis mapa={mapa} rodeo={rodeo} categorias={[c]} elegido={null} onElegir={(id) => cambiarR((x) => ({ ...x, sinDonde: { ...x.sinDonde, porCategoria: { ...x.sinDonde.porCategoria, [c]: id } } }))} />}
          </div>
        )
      })}
    </div>
  )
}

/** El campo y el croquis, con cuántos sin caravana de esas categorías hay en cada potrero. Si no hay en ningún lado, se puede tocar cualquiera (para sumarlos). */
function Croquis({ mapa, rodeo, categorias, elegido, onElegir }: { mapa: CampoMapa[]; rodeo: DelRodeo[]; categorias: Categoria[]; elegido: string | null; onElegir: (id: string) => void }) {
  const { campos: identidad } = useCampoElegido()
  const cuenta = (id: string) => sinCaravanaEn(rodeo, id, categorias)
  const enAlgunLado = mapa.some((c) => c.potreros.some((p) => cuenta(p.id) > 0))
  const [campoId, setCampoId] = useState<string | null>(mapa.length === 1 ? mapa[0]!.id : (mapa.find((c) => c.potreros.some((p) => p.id === elegido))?.id ?? null))
  const campo = mapa.find((c) => c.id === campoId)
  const que = (n: number) => (categorias.length === 1 ? `${n} ${plural(categorias[0]!, n).toLowerCase()}` : `${n} sin caravana`)
  return (
    <div className="flex flex-col gap-3">
      {!enAlgunLado && <Aviso tono="atencion">No hay {categorias.map((c) => plural(c).toLowerCase()).join(' ni ')} sin caravana en ningún potrero. Elegí dónde están para sumarlos.</Aviso>}
      {mapa.length > 1 && (
        <ElegirCampo
          titulo="Campo"
          identidad={identidad}
          campos={mapa}
          valor={campoId}
          onCambio={setCampoId}
          apagado={(id) => enAlgunLado && mapa.find((c) => c.id === id)!.potreros.every((p) => cuenta(p.id) === 0)}
          nota={(id) => {
            const n = mapa.find((c) => c.id === id)!.potreros.reduce((t, p) => t + cuenta(p.id), 0)
            return n ? String(n) : ''
          }}
        />
      )}
      {campo ? <Potreros campo={campo} elegido={elegido} onElegir={onElegir} dato={(p) => (cuenta(p.id) ? que(cuenta(p.id)) : null)} apagado={(p) => enAlgunLado && cuenta(p.id) === 0} /> : <p className="text-[14px] text-texto-suave">Elegí el campo.</p>}
    </div>
  )
}

function NoCierra({ g, lugar, d, mapa, rodeo, onCambio }: { g: Plan['noCierran'][number]; lugar: (id: string) => string; d: Respuestas['noCierra'][string] | undefined; mapa: CampoMapa[]; rodeo: DelRodeo[]; onCambio: (d: Respuestas['noCierra'][string]) => void }) {
  const falta = g.planilla - g.hay
  const ops: [Respuestas['noCierra'][string]['que'], string][] = [
    ['entraron', g.hay ? `Entraron ${falta} que no estaban cargadas: sumarlas al rodeo` : `Entraron y no estaban cargadas: sumar las ${g.planilla} al rodeo`],
    ['otro', g.hay ? `${falta} estaban en otro potrero: decir cuáles` : 'Estaban en otro potrero: elegirlo'],
    ['ninguna', 'No ponerles caravana por ahora'],
  ]
  const nums = g.numeros.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-borde bg-superficie px-5 py-4">
      <b className="text-[17px]">
        {plural(g.categoria)} · {lugar(g.potreroId)}
      </b>
      <div className="flex flex-wrap gap-8">
        <div>
          <span className="titulo-display block text-[34px] leading-none">{g.planilla}</span>
          <span className="text-[13.5px] text-texto-suave">en tu planilla</span>
        </div>
        <div>
          <span className="titulo-display block text-[34px] leading-none">{g.hay}</span>
          <span className="text-[13.5px] text-texto-suave">sin caravana en Tropero</span>
        </div>
      </div>
      <div role="radiogroup" aria-label="Qué pasó" className="flex flex-col gap-2">
        {ops.map(([k, t]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={d?.que === k}
            onClick={() => onCambio(k === 'otro' ? { que: 'otro', desde: String(nums.at(-falta) ?? nums[0] ?? ''), hasta: String(nums.at(-1) ?? ''), potrero: '' } : { que: k })}
            className={cn('flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left text-[15px]', d?.que === k ? 'border-2 border-principal bg-superficie font-semibold' : 'border-borde bg-fondo')}
          >
            <span className={cn('size-5 shrink-0 rounded-full bg-superficie', d?.que === k ? 'border-[6px] border-principal' : 'border-[1.5px] border-borde')} />
            {t}
          </button>
        ))}
      </div>
      {d?.que === 'otro' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-texto-suave">Del</span>
            <input aria-label="Desde" inputMode="numeric" value={d.desde ?? ''} onChange={(e) => onCambio({ ...d, desde: e.target.value })} className={NUM} />
            <span className="text-texto-suave">al</span>
            <input aria-label="Hasta" inputMode="numeric" value={d.hasta ?? ''} onChange={(e) => onCambio({ ...d, hasta: e.target.value })} className={NUM} />
            <span className="text-texto-suave">estaban en</span>
            {d.potrero && (
              <button type="button" onClick={() => onCambio({ ...d, potrero: '' })} className={cn(PILL, ELEGIDO)}>
                {lugar(d.potrero)} ✓
              </button>
            )}
          </div>
          {!d.potrero && <Croquis mapa={mapa} rodeo={rodeo} categorias={[g.categoria]} elegido={null} onElegir={(id) => onCambio({ ...d, potrero: id })} />}
        </div>
      )}
    </div>
  )
}

/** Las primeras filas del archivo, tal cual, con lo que leímos de cada columna en su título (y para cambiarlo). */
function VistaPrevia({ hoja, interp, onCambio }: { hoja: Hoja; interp: Interpretacion; onCambio: (i: Interpretacion) => void }) {
  const titulos = hoja.filas[interp.filaTitulos] ?? []
  const datos = hoja.filas.slice(interp.filaTitulos + 1).filter((f) => f.some((c) => celda(c))).slice(0, 5)
  const ancho = Math.min(10, Math.max(0, ...hoja.filas.slice(0, 50).map((f) => f.length)))
  const que = (i: number) => (Object.keys(interp.columnas) as Columna[]).find((c) => interp.columnas[c] === i) ?? ''
  const OPC: [Columna | '', string][] = [['visual', 'Caravana'], ['rfid', 'Chip'], ['categoria', 'Qué es'], ['potrero', 'Dónde'], ['nacimiento', 'Nació'], ['raza', 'Raza'], ['', 'No se usa']]
  return (
    <div className="overflow-x-auto rounded-[16px] border border-borde bg-superficie">
      <table className="w-full min-w-[560px] text-[14px]">
        <thead>
          <tr className="bg-superficie-hundida">
            {Array.from({ length: ancho }, (_, i) => (
              <th key={i} className="px-3 py-2.5 text-left align-top">
                <span className="mb-1.5 block truncate text-[12.5px] font-medium text-texto-suave">«{celda(titulos[i]) || `columna ${i + 1}`}»</span>
                <span className="relative inline-flex">
                  <select
                    aria-label={`Qué es la columna «${celda(titulos[i]) || i + 1}»`}
                    value={que(i)}
                    onChange={(e) => {
                      const columnas = { ...interp.columnas }
                      for (const k of Object.keys(columnas) as Columna[]) if (columnas[k] === i) delete columnas[k]
                      if (e.target.value) columnas[e.target.value as Columna] = i
                      onCambio({ ...interp, columnas })
                    }}
                    className={cn(
                      'cursor-pointer appearance-none rounded-full border py-1 pr-8 pl-3 text-[14px] font-bold shadow-sm transition-colors hover:border-principal focus-visible:ring-2 focus-visible:ring-principal focus-visible:outline-none',
                      que(i) ? 'border-principal bg-superficie text-principal' : 'border-dashed border-borde bg-transparent text-texto-suave',
                    )}
                  >
                    {OPC.map(([v, t]) => (
                      <option key={t} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <Icono nombre="Desplegar" tamano={16} className={cn('pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2', que(i) ? 'text-principal' : 'text-texto-suave')} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.map((f, k) => (
            <tr key={k} className="border-t border-borde">
              {Array.from({ length: ancho }, (_, i) => (
                <td key={i} className={cn('px-3 py-2', que(i) ? 'text-texto' : 'text-texto-suave', (que(i) === 'visual' || que(i) === 'rfid') && 'cifra text-[15px]')}>
                  {celda(f[i]) || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Una celda como la vería el productor en su Excel (las fechas, como fechas). */
const celda = (c: Celda) => (c == null ? '' : c instanceof Date ? `${String(c.getUTCDate()).padStart(2, '0')}/${String(c.getUTCMonth() + 1).padStart(2, '0')}/${c.getUTCFullYear()}` : String(c).trim())
