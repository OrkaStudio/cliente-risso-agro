import { accesoDenegado, puedeMandar, puedeVer } from '../_shared/wa/permisos.ts'
import { campoExacto } from '../_shared/wa/resolver.ts'
import { norm } from '../_shared/wa/texto.ts'
import type { Contexto, Interpretacion, Mensaje } from '../_shared/wa/tipos.ts'
import { cruzarCaravanas, type Adjunto } from './adjuntos-db.ts'
import { leerPlanilla, type Planilla } from './leer-planilla.ts'
import { descargarMedia } from './meta.ts'
import { actualizarCaptura, crearCaptura, permisosVinculados, sql, usarCuentaVinculada, type Vinculo } from './db.ts'

type Ficha = { id: string; rfid: string }
type Propuesta = {
  tipo: 'vacunacion_planilla'
  archivo: string
  campo: string
  fecha: string
  vacuna: string
  fichas: Ficha[]
}

const pregunta = (faltan: string[]) => new Intl.ListFormat('es-AR').format(faltan)

export async function leerAdjuntoPlanilla(adjunto: Adjunto): Promise<Planilla> {
  return leerPlanilla((await descargarMedia(adjunto.media, 1024 * 1024)).bytes, adjunto.nombre)
}

export async function prepararVacunacion(
  v: Vinculo, ctx: Contexto, adjunto: Adjunto, planilla: Planilla, pedido: Interpretacion, mensajeId: string, porAudio: boolean,
): Promise<Mensaje> {
  if (!puedeMandar(ctx.permisos, 'hacienda')) return { texto: accesoDenegado('hacienda', 'cargar') }
  if (!puedeVer(ctx.permisos, 'hacienda')) {
    return { texto: 'Recibí la planilla. Para cruzar las caravanas y registrar la aplicación hace falta acceso de lectura y carga a Hacienda.' }
  }
  if (!planilla.filas.length) return { texto: 'No encontré una columna de caravanas electrónicas con datos. ¿En qué hoja o columna figuran?' }
  const producto = pedido.vacuna || planilla.vacunas[0]
  const dia = pedido.fecha || planilla.fechas[0]
  const nombre = pedido.campo || planilla.campos[0]
  const campo = campoExacto(nombre, ctx.campos)
  const base = `Encontré ${planilla.filas.length} caravanas electrónicas distintas en la planilla.`
  if (planilla.vacunas.length > 1 || planilla.fechas.length > 1 || planilla.campos.length > 1
    || (pedido.vacuna && planilla.vacunas[0] && norm(pedido.vacuna) !== norm(planilla.vacunas[0]))
    || (pedido.fecha && planilla.fechas[0] && pedido.fecha !== planilla.fechas[0])
    || (pedido.campo && planilla.campos[0] && campo?.id !== campoExacto(planilla.campos[0], ctx.campos)?.id)) {
    return { texto: base + ' La planilla trae datos distintos de vacuna, fecha o campo. ¿Me mandás la planilla revisada para esa aplicación?' }
  }
  const cruce = await cruzarCaravanas(v, planilla.filas.map(f => f.rfid), dia && dia <= (ctx.fechaMensaje ?? ctx.hoy) ? dia : null)
  const porRFID = new Map(cruce.map(x => [x.rfid, x]))
  const fichas = new Map<string, Ficha>()
  const observar: string[] = []
  for (const f of planilla.filas) {
    const animal = porRFID.get(f.rfid)
    const problema = !animal ? 'sin animal activo asociado' : campo && animal.campo !== campo.id ? 'sin ubicación en el campo indicado'
      : fichas.has(animal.animal) ? 'otra caravana del mismo animal' : null
    if (problema && observar.length < 5) observar.push(`${f.hoja}, fila ${f.fila}: ${problema}`)
    if (!problema && animal) fichas.set(animal.animal, { id: animal.animal, rfid: f.rfid })
  }
  const excluidas = planilla.filas.length - fichas.size
  const avisos = [
    planilla.repetidas ? `${planilla.repetidas} ${planilla.repetidas === 1 ? 'fila repetida' : 'filas repetidas'}` : '',
    planilla.invalidas ? `${planilla.invalidas} filas con datos inválidos` : '',
    excluidas ? `${excluidas} caravanas para revisar` : '',
  ].filter(Boolean)
  const resumen = [base, `Pude ubicar ${fichas.size} animales${campo ? ' en ' + campo.nombre : ' en Hacienda'}.`,
    avisos.length ? `Para revisar: ${avisos.join(', ')}.` : '', ...observar].filter(Boolean).join('\n')
  const faltan = [!producto && 'qué vacuna aplicaron', (!dia || dia > (ctx.fechaMensaje ?? ctx.hoy)) && 'qué día la aplicaron', !campo && 'en qué campo']
    .filter((x): x is string => Boolean(x))
  if (faltan.length) {
    const id = await crearCaptura({ vinculo: v, mensajeId, entrada: porAudio ? 'audio' : 'texto', texto: pedido.descripcion })
    await actualizarCaptura(id, { estado: 'incompleta', propuesta: {
      tipo: 'vacunacion_planilla', archivo: adjunto.id, campo: nombre, vacuna: producto, fecha: dia,
    } })
    return { texto: resumen + `\n¿Me decís ${pregunta(faltan)}?` }
  }
  if (!fichas.size || !producto || !dia || !campo) return { texto: resumen + '\nRevisá las caravanas y el campo antes de cargar.' }


  const captura = await crearCaptura({ vinculo: v, mensajeId, entrada: porAudio ? 'audio' : 'texto', texto: pedido.descripcion })
  const propuesta: Propuesta = { tipo: 'vacunacion_planilla', archivo: adjunto.id, campo: campo.id, fecha: dia, vacuna: producto, fichas: [...fichas.values()] }
  await actualizarCaptura(captura, { estado: 'propuesta', propuesta })
  return {
    texto: resumen + `\n${producto} · ${dia.split('-').reverse().join('/')} · ${campo.nombre}. ¿Registro la aplicación en estas ${fichas.size} fichas?`,
    botones: [{ id: 'vacplan:guardar:' + captura, titulo: 'Confirmar aplicación' }, { id: 'vacplan:descartar:' + captura, titulo: 'Descartar' }],
  }
}

export async function resolverVacunacion(v: Vinculo, boton: string): Promise<Mensaje | null> {
  const comando = /^vacplan:(guardar|descartar):([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(boton)
  if (!comando) return null
  const [, accion, id] = comando
  const texto = await sql.begin(async tx => {
    const acceso = await permisosVinculados(v, tx, true)
    if (!acceso || !puedeVer(acceso, 'hacienda') || !puedeMandar(acceso, 'hacienda')) {
      return 'El vínculo de WhatsApp ya no tiene permiso para confirmar esta aplicación.'
    }
    const [c] = await tx<{ estado: string; vigente: boolean; propuesta: Propuesta }[]>`
      select c.estado, c.propuesta, c.created_at >= now() - interval '12 hours' as vigente
      from captura c join wa_mensaje m on m.id=c.mensaje_id and m.vinculo_id=${v.id} and m.empresa_id=c.empresa_id
      where c.id=${id} and c.user_id=${v.user_id} and c.empresa_id=${v.empresa_id} for update of c`
    if (c?.propuesta?.tipo !== 'vacunacion_planilla') return 'Esa propuesta de vacunación ya no está disponible.'
    if (c.estado === 'confirmada') return 'Esa aplicación ya se procesó.'
    if (c.estado !== 'propuesta' || !c.vigente) return 'Esa propuesta venció o ya fue descartada.'
    if (accion === 'descartar') {
      await actualizarCaptura(id, { estado: 'descartada' }, tx, v)
      return 'Descarté la propuesta de vacunación.'
    }
    const p = c.propuesta
    const [posterior] = await tx`select 1 from captura anterior join captura nueva
      on nueva.user_id=anterior.user_id and nueva.empresa_id=anterior.empresa_id
      join wa_mensaje m on m.id=nueva.mensaje_id and m.vinculo_id=${v.id} and m.empresa_id=${v.empresa_id}
      where anterior.id=${id} and nueva.propuesta->>'tipo'='vacunacion_planilla'
        and nueva.propuesta->>'archivo'=${p.archivo}
        and nueva.id<>anterior.id
        and (nueva.created_at,nueva.id)>(anterior.created_at,anterior.id)`
    if (posterior) return 'Hay una revisión más reciente de esa planilla. Usá la última propuesta.'
    await tx`select pg_advisory_xact_lock(hashtextextended(${v.empresa_id + ':vacunacion:' + p.fecha}, 0))`
    await usarCuentaVinculada(tx, v)
    const rfids = p.fichas.map(f => f.rfid)
    const animales = p.fichas.map(f => f.id)
    const validos = await tx<{ id: string; rfid: string }[]>`select a.id, c.numero_rfid as rfid
      from animal a join caravana c on c.animal_id=a.id and c.empresa_id=a.empresa_id
      join potrero pot on pot.id=a.potrero_id and pot.empresa_id=a.empresa_id
      where a.empresa_id=${v.empresa_id} and pot.campo_id=${p.campo} and a.estado='activo'
        and a.id=any(${animales}::uuid[]) and c.numero_rfid=any(${rfids}::text[])
        and c.fecha_alta<=${p.fecha}::date and (c.fecha_baja is null or c.fecha_baja>=${p.fecha}::date)`
    const validosPorId = new Map(validos.map(f => [f.id, f.rfid]))
    if (p.fichas.some(f => validosPorId.get(f.id) !== f.rfid)) {
      return 'Cambió la información de uno o más animales. Volvé a enviar la planilla para revisarla.'
    }
    const datos = { tratamiento: p.vacuna, aplicacion: 'vacunacion', vacuna_normalizada: norm(p.vacuna), campo_id: p.campo, origen: 'whatsapp', archivo_mensaje_id: p.archivo }
    const escritos = await tx<{ id: string }[]>`
      insert into evento (empresa_id, animal_id, tipo, fecha, datos, nota)
      select ${v.empresa_id}, x.id, 'sanidad', ${p.fecha}::date, ${tx.json(datos)}, ${'Vacunación: ' + p.vacuna}
      from unnest(${animales}::uuid[]) as x(id)
      where not exists (
        select 1 from evento e where e.empresa_id=${v.empresa_id} and e.animal_id=x.id
          and e.tipo='sanidad' and e.fecha=${p.fecha}::date
          and (e.datos->>'vacuna_normalizada'=${norm(p.vacuna)} or lower(e.datos->>'tratamiento')=${p.vacuna.toLocaleLowerCase('es-AR')})
      ) returning id`
    await tx.unsafe('reset role')
    await actualizarCaptura(id, { estado: 'confirmada', escritoTabla: escritos.length ? 'evento' : undefined, escritoId: escritos[0]?.id }, tx, v)
    const ya = p.fichas.length - escritos.length
    return [escritos.length ? `Registré ${p.vacuna} en ${escritos.length} fichas de Hacienda.` : '', ya ? `${ya} ya tenían registrada esa aplicación.` : ''].filter(Boolean).join(' ')
  })
  return { texto }
}
