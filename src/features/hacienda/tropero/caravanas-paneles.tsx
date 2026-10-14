import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { Grupo, PanelLateral } from '@/components/tropero/panel-lateral'
import { Segmentos } from '@/components/tropero/segmentos'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useAnimales, useAsignarCaravanasPlanilla, useBajasPendientes, useIdentificarSalida, usePotreros } from '@/features/hacienda/hooks'
import { categoriaNombre } from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import { CaravanasQueSalieron, ZonaArchivo } from './caravanas'
import { usePosibles } from './posibles'
import { leerArchivo } from './leer-archivo'
import { leerPlanilla, soloDigitos, type Lectura } from './planilla'
import { bajarPlanillaEjemplo } from './planilla-ejemplo'

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

/**
 * Las que salieron por cantidad y todavía no se sabe cuáles fueron. Se dice
 * acá (eligiéndolas de la lista o con la planilla) o en la próxima manga. Si la que salió no
 * era la que eligió la cuenta, la base las intercambia y lo deja anotado.
 */
export function IdentificarSalidas({ empresaId, abierto, onCerrar }: { empresaId: string; abierto: boolean; onCerrar: () => void }) {
  const pendientes = useBajasPendientes()
  const potreros = usePotreros()
  const identificar = useIdentificarSalida()
  const [caravanas, setCaravanas] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const ps = pendientes.data ?? []
  const nombrePotrero = (id: string | null) => potreros.data?.find((p) => p.id === id)?.nombre ?? 'sin potrero'
  // Agrupado: «2 terneros del 11B · 12/10».
  const grupos = [...ps.reduce((m, p) => {
    const k = `${p.categoria}|${p.potrero_id}|${p.fecha}`
    m.set(k, { ...p, n: (m.get(k)?.n ?? 0) + 1 })
    return m
  }, new Map<string, (typeof ps)[number] & { n: number }>()).values()]
  // Las de los potreros y categorías que salieron: las que siguen en el rodeo y las que eligió la cuenta.
  const claves = new Set(ps.map((p) => `${p.potrero_id}|${p.categoria}`))
  const pendientesIds = new Set(ps.map((p) => p.animal_id))
  const posibles = usePosibles((a) => claves.has(`${a.potrero_id}|${a.categoria}`) && (a.estado === 'activo' || pendientesIds.has(a.id)))

  async function guardar() {
    setError(null)
    if (caravanas.length === 0) return setError('Sumá al menos una caravana.')
    try {
      const r = await identificar.mutateAsync({ empresaId, caravanas })
      toast.success(`Listo: ${r.identificadas} ${r.identificadas === 1 ? 'identificada' : 'identificadas'}`, {
        description: r.cambiados > 0 ? `${r.cambiados} no ${r.cambiados === 1 ? 'era el que salió: volvió' : 'eran los que salieron: volvieron'} al rodeo.` : 'Eran las que había elegido la cuenta.',
      })
      setCaravanas([])
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`${ps.length} para identificar`}
      bajada="La cuenta del rodeo ya está bien. Falta saber qué ficha es cuál: se resuelve solo en la próxima manga, o elegilas acá si las reconocés."
      pie={
        <BotonPrincipal icono="Guardar" cargando={identificar.isPending} disabled={identificar.isPending || caravanas.length === 0} onClick={guardar}>
          {caravanas.length ? `Identificar ${caravanas.length}` : 'Sumá las caravanas'}
        </BotonPrincipal>
      }
    >
      <ul className="divide-y divide-borde border-y border-borde">
        {grupos.map((g) => (
          <li key={`${g.categoria}${g.potrero_id}${g.fecha}`} className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
            <span className="font-semibold text-texto">
              {g.n} {g.categoria ? categoriaNombre(g.categoria, g.n).toLowerCase() : ''} del {nombrePotrero(g.potrero_id)}
            </span>
            <span className="text-[13.5px] text-texto-suave">salieron el {ddmm(g.fecha)}</span>
          </li>
        ))}
      </ul>
      <Grupo titulo="Cuáles fueron" className="mt-6">
        <CaravanasQueSalieron posibles={posibles} elegidas={caravanas} onCambio={setCaravanas} cuantas={ps.length} conDespues={false} />
      </Grupo>
      {error && <p className="mt-5 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
    </PanelLateral>
  )
}

/**
 * Las caravanas, desde un Excel (página 35): la planilla del veterinario, la de
 * SENASA o la del bastón le pone número a los que se cargaron por categoría.
 * No suma animales: cuenta contra los que ya están.
 */
export function CaravanasPorExcel({ empresaId, abierto, onCerrar }: { empresaId: string; abierto: boolean; onCerrar: () => void }) {
  const animales = useAnimales()
  const potreros = usePotreros()
  const { campos, elegido } = useCampoElegido()
  const asignar = useAsignarCaravanasPlanilla()
  const [campoId, setCampoId] = useState<string | null>(elegido?.id ?? campos[0]?.id ?? null)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [ver, setVer] = useState<'sinElectronica' | 'corregir' | null>(null)
  const [hecho, setHecho] = useState<{ asignadas: number; sinAnimal: string[]; sinElectronica: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activos = (animales.data ?? []).filter((a) => a.estado === 'activo')
  const sinCaravana = activos.filter((a) => !a.caravana_visual && !a.caravana_rfid).length
  const yaPuestas = useMemo(
    () => ({
      visual: new Set(activos.flatMap((a) => (a.caravana_visual ? [soloDigitos(a.caravana_visual)] : []))),
      rfid: new Set(activos.flatMap((a) => (a.caravana_rfid ? [soloDigitos(a.caravana_rfid)] : []))),
    }),
    [activos],
  )
  // El potrero se busca entre todos los de la empresa (el nombre no se repite);
  // el campo elegido es sólo para las filas que no dicen potrero.
  const todos = potreros.data ?? []
  const listas = lectura ? [...lectura.completas, ...lectura.sinElectronica] : []

  function cerrar() {
    setLectura(null)
    setHecho(null)
    setVer(null)
    setError(null)
    onCerrar()
  }

  async function leer(f: File) {
    setError(null)
    setLeyendo(true)
    try {
      setLectura(leerPlanilla(await leerArchivo(f), todos, yaPuestas))
    } catch {
      setError('No pudimos leer ese archivo. Probá con un Excel (.xlsx) o un CSV.')
    } finally {
      setLeyendo(false)
    }
  }

  async function guardar() {
    if (!campoId || listas.length === 0) return
    setError(null)
    try {
      const r = await asignar.mutateAsync({ empresaId, campoId, filas: listas.map((f) => ({ visual: f.visual, rfid: f.rfid, categoria: f.categoria!, potreroId: f.potreroId, nacimiento: f.nacimiento, raza: f.raza })) })
      setHecho({ ...r, sinElectronica: lectura!.sinElectronica.filter((f) => !r.sinAnimal.includes(f.visual ?? '')).length })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }

  const bajarEjemplo = () => void bajarPlanillaEjemplo(todos.filter((p) => !campoId || p.campo_id === campoId).map((p) => p.nombre))

  const titulo = hecho ? `Listo: ${hecho.asignadas} ${hecho.asignadas === 1 ? 'caravana puesta' : 'caravanas puestas'}` : lectura && !lectura.faltan.length ? `Leímos ${lectura.filas} ${lectura.filas === 1 ? 'fila' : 'filas'}` : 'Las caravanas, desde un Excel'
  const pie = hecho ? (
    <BotonPrincipal icono="Guardar" onClick={cerrar}>
      Listo
    </BotonPrincipal>
  ) : lectura && listas.length > 0 ? (
    <BotonPrincipal icono="Guardar" cargando={asignar.isPending} disabled={asignar.isPending} onClick={guardar}>
      {`Ponerle caravana a ${listas.length}`}
    </BotonPrincipal>
  ) : undefined

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={cerrar}
      titulo={titulo}
      bajada={!lectura && !hecho ? 'Le pone número a los animales que cargaste por categoría. Sirve la planilla del veterinario, la de SENASA o la del bastón.' : undefined}
      pie={pie}
    >
      {hecho ? (
        <div>
          <span className="grid size-12 place-items-center rounded-full bg-estado-bien text-superficie">
            <Icono nombre="Guardar" />
          </span>
          <ul className="mt-5 divide-y divide-borde border-y border-borde text-[15px]">
            {hecho.sinElectronica > 0 && (
              <li className="py-3">
                <b className="text-texto">{hecho.sinElectronica} sin electrónica</b>
                <span className="block text-[13.5px] text-texto-suave">Tienen la visible. El chip se empareja en la próxima manga: el bastón pregunta «¿es la 1172?».</span>
              </li>
            )}
            {hecho.sinAnimal.length > 0 && (
              <li className="py-3">
                <b className="text-texto">{hecho.sinAnimal.length} sin animal</b>
                <span className="block text-[13.5px] text-texto-suave">
                  No había de esa categoría sin caravana en ese potrero: {hecho.sinAnimal.slice(0, 6).join(', ')}
                  {hecho.sinAnimal.length > 6 ? '…' : ''}. Si entraron, sumalos con «Entraron».
                </span>
              </li>
            )}
            <li className="py-3 text-[13.5px] text-texto-suave">Ya se ven en la lista del rodeo, con su caravana.</li>
          </ul>
        </div>
      ) : !lectura || lectura.faltan.length ? (
        <>
          <ZonaArchivo titulo="Soltá acá el Excel" bajada="o tocá para buscarlo en la compu. Excel o CSV." onArchivo={leer} cargando={leyendo} />
          {lectura?.faltan.length ? (
            <p className="mt-3 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">No encontramos {lectura.faltan.join(' ni ')}. Fijate que la primera fila tenga los títulos de las columnas.</p>
          ) : null}
          <Grupo titulo="Qué columnas leemos" className="mt-6">
            <dl className="divide-y divide-borde border-y border-borde text-[14.5px]">
              {[
                ['Caravana visible', 'Obligatoria'],
                ['Categoría', 'Obligatoria: vaca, ternero, novillo…'],
                ['Potrero', 'Si falta, va al campo de abajo'],
                ['Electrónica', 'Si falta, queda para emparejar'],
                ['Nacimiento y raza', 'Si están'],
              ].map(([a, b]) => (
                <div key={a} className="flex justify-between gap-4 py-2.5">
                  <dt className="font-semibold text-texto">{a}</dt>
                  <dd className="text-right text-texto-suave">{b}</dd>
                </div>
              ))}
            </dl>
          </Grupo>
          <button type="button" onClick={bajarEjemplo} className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border-[1.5px] border-principal px-3.5 text-[14px] font-bold text-principal hover:bg-principal-suave">
            <Icono nombre="Descargar" tamano={16} /> Bajar la planilla de ejemplo (Excel)
          </button>
          {campos.length > 1 && (
            <Grupo titulo="Si falta el potrero, ¿a qué campo van?" className="mt-6">
              <Segmentos etiqueta="Campo" opciones={campos.slice(0, 4).map((c) => ({ valor: c.id, texto: c.nombre }))} valor={campoId} onCambio={setCampoId} />
            </Grupo>
          )}
        </>
      ) : (
        <div>
          <p className="flex items-baseline gap-3">
            <span className="titulo-display text-[64px] leading-none text-texto">{listas.length}</span>
            <span className="font-heading text-[18px] font-extrabold text-texto">caravanas para tu rodeo</span>
          </p>
          <ul className="mt-5 flex flex-col gap-2.5">
            <Resumen tono="bien" titulo={`${lectura.completas.length} ${lectura.completas.length === 1 ? 'completa' : 'completas'}`} bajada="Se las ponemos a los que ya cargaste, en su potrero." />
            {lectura.sinElectronica.length > 0 && (
              <Resumen tono="atencion" titulo={`${lectura.sinElectronica.length} sin electrónica`} bajada="Se ponen igual; el chip se empareja en la próxima manga." onVer={() => setVer(ver === 'sinElectronica' ? null : 'sinElectronica')} />
            )}
            {lectura.paraCorregir.length > 0 && (
              <Resumen tono="problema" titulo={`${lectura.paraCorregir.length} para corregir`} bajada="Quedan aparte. Corregilas en el Excel y volvé a subirlo." onVer={() => setVer(ver === 'corregir' ? null : 'corregir')} />
            )}
          </ul>
          {ver === 'corregir' && (
            <ul className="mt-3 divide-y divide-borde border-y border-borde text-[14px]">
              {lectura.paraCorregir.map((p) => (
                <li key={p.fila} className="flex gap-3 py-2">
                  <span className="cifra w-14 shrink-0 text-[16px] font-bold text-texto">{p.caravana}</span>
                  <span className="text-texto-suave">
                    Fila {p.fila}: {p.problema}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Grupo titulo={ver === 'sinElectronica' ? 'Las que no tienen electrónica' : 'Así quedan, las primeras'} className="mt-6">
            <table className="w-full text-[14.5px]">
              <tbody className="divide-y divide-borde">
                {(ver === 'sinElectronica' ? lectura.sinElectronica : listas).slice(0, ver ? 50 : 5).map((f) => (
                  <tr key={f.fila}>
                    <td className="cifra py-2 text-[16px] font-bold text-texto">{f.visual ?? '—'}</td>
                    <td className="py-2 text-texto">{f.categoria ? categoriaNombre(f.categoria, 1) : ''}</td>
                    <td className="py-2 text-texto-suave">{f.potrero ?? 'en el campo'}</td>
                    <td className={cn('cifra py-2 text-right', f.rfid ? 'text-texto-suave' : 'font-bold text-estado-atencion-texto')}>{f.rfid ?? 'falta'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Grupo>
          <p className="mt-4 text-[13.5px] text-texto-suave">
            No se suman animales: el Excel cuenta contra los {sinCaravana} sin caravana que cargaste.
            {listas.length > sinCaravana ? ` Sobran ${listas.length - sinCaravana}: si entraron, sumalos con «Entraron».` : ''}
          </p>
        </div>
      )}
      {error && <p className="mt-5 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
    </PanelLateral>
  )
}

function Resumen({ tono, titulo, bajada, onVer }: { tono: 'bien' | 'atencion' | 'problema'; titulo: string; bajada: string; onVer?: () => void }) {
  const raya = { bien: 'bg-estado-bien', atencion: 'bg-trigo-500', problema: 'bg-estado-problema' }[tono]
  return (
    <li className="flex items-center gap-3 rounded-[14px] bg-superficie py-3 pr-3 pl-0">
      <span className={cn('h-10 w-1 shrink-0 rounded-r-full', raya)} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-texto">{titulo}</span>
        <span className="block text-[13.5px] text-texto-suave">{bajada}</span>
      </span>
      {onVer && (
        <button type="button" onClick={onVer} className="h-9 rounded-full border-[1.5px] border-principal px-3.5 text-[14px] font-bold text-principal hover:bg-principal-suave">
          Ver
        </button>
      )}
    </li>
  )
}
