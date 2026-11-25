import type postgres from 'npm:postgres@3.4.5'
import type { Vinculo } from './db.ts'
import type { PropuestaAsistente, Tx } from './asistente-store.ts'
import { esFecha, hoyAR, norm, sumarDias } from '../_shared/wa/texto.ts'

const campoValido=async(tx:Tx,v:Vinculo,id:unknown)=>{
  if (typeof id!=='string') throw Error('Falta identificar el campo')
  const filas=await tx`select id from campo where id=${id} and empresa_id=${v.empresa_id} for share`
  if (filas.length!==1) throw Error('El campo ya no está disponible')
  return id
}
const potreroValido=async(tx:Tx,v:Vinculo,id:unknown,campo?:unknown)=>{
  if (typeof id!=='string') throw Error('Falta identificar el potrero')
  const [p]=await tx<{id:string;campo_id:string}[]>`select id,campo_id from potrero where id=${id} and empresa_id=${v.empresa_id} for share`
  if (!p||(campo!=null&&p.campo_id!==campo)) throw Error('El potrero ya no coincide con la propuesta')
  return p
}

/** Revalidar las fichas que la persona revisó, no sólo los IDs. */
async function animalesValidos(tx:Tx,v:Vinculo,datos:Record<string,unknown>) {
  const fichas=datos.animales as {id:string;identificador:string;potreroId:string|null}[]|undefined
  if (!Array.isArray(fichas)||!fichas.length||fichas.length>2000) throw Error('Falta identificar animales')
  const ids=fichas.map(a=>a.id)
  if (new Set(ids).size!==ids.length) throw Error('Hay animales repetidos')
  const filas=await tx<{id:string;potrero_id:string|null;estado:string}[]>`select id,potrero_id,estado::text
    from animal where empresa_id=${v.empresa_id} and id=any(${ids}::uuid[]) order by id for update`
  if (filas.length!==fichas.length||filas.some(a=>a.estado!=='activo'||a.potrero_id!==fichas.find(f=>f.id===a.id)?.potreroId))
    throw Error('Cambió el estado o la ubicación de un animal; revisá una propuesta nueva')
  const caravanas=await tx<{animal_id:string;numero_visual:string|null;numero_rfid:string|null}[]>`
    select animal_id,numero_visual,numero_rfid from caravana where empresa_id=${v.empresa_id}
      and animal_id=any(${ids}::uuid[]) and vigente for share`
  if (fichas.some(f=>!caravanas.some(c=>c.animal_id===f.id&&(c.numero_visual===f.identificador||c.numero_rfid===f.identificador))))
    throw Error('Cambió la caravana de un animal; revisá una propuesta nueva')
  return ids
}

export async function ejecutarOperacion(tx:Tx,v:Vinculo,p:PropuestaAsistente) {
  const d=p.datos,tipo=d.tipo,fecha=d.fecha
  if (typeof fecha!=='string'||!esFecha(fecha)||(tipo!=='nota'&&fecha>hoyAR())) throw Error('Revisá la fecha de la propuesta')
  const descripcion=typeof d.descripcion==='string'?d.descripcion:''
  if (!['nota','observacion','lluvia','gasto','muerte','movimiento','alta','vacunacion'].includes(String(tipo))) throw Error('Operación no disponible')
  if (tipo==='nota') return {tabla:'captura',id:p.captura_id,detalle:p.resumen}
  if (tipo==='lluvia') {
    const campo=await campoValido(tx,v,d.campoId)
    if (typeof d.mm!=='number'||!Number.isFinite(d.mm)||d.mm<0||d.mm>2000) throw Error('Revisá los milímetros')
    await tx`insert into lluvia(id,empresa_id,campo_id,fecha,mm,fuente,canal)
      values(${p.id},${v.empresa_id},${campo},${fecha},${d.mm},'manual','whatsapp')`
    return {tabla:'lluvia',id:p.id,detalle:p.resumen}
  }
  if (tipo==='gasto') {
    const campo=await campoValido(tx,v,d.campoId)
    const cat=typeof d.categoriaId==='string'?d.categoriaId:null
    if (!cat||(await tx`select 1 from categoria_movimiento where id=${cat} and (empresa_id is null or empresa_id=${v.empresa_id})`).length!==1)
      throw Error('Revisá la categoría')
    if (typeof d.monto!=='number'||!Number.isFinite(d.monto)||d.monto<=0||d.monto>1e12) throw Error('Revisá el monto')
    if (!['campo','yo','a_pagar'].includes(String(d.pago))) throw Error('Falta aclarar si se pagó')
    const pendiente=d.pago!=='campo',dias=Number(d.venceDias??0)
    if (!Number.isSafeInteger(dias)||dias<0||dias>3650) throw Error('Revisá el vencimiento')
    const vencimiento=pendiente?sumarDias(fecha,d.pago==='yo'?0:dias):null
    const contraparte=typeof d.contraparte==='string'?d.contraparte:null
    await tx`insert into movimiento_financiero(id,empresa_id,tipo,campo_id,categoria_id,monto,fecha_devengo,fecha_cobro_pago,estado,
      descripcion,contraparte,canal,fecha_vencimiento)
      values(${p.id},${v.empresa_id},'gasto',${campo},${cat},${d.monto},${fecha},${pendiente?null:fecha},${pendiente?'pendiente':'liquidado'},
        ${d.pago==='yo'?'Reintegro: '+descripcion:descripcion},${contraparte},'whatsapp',${vencimiento})`
    return {tabla:'movimiento_financiero',id:p.id,detalle:p.resumen}
  }
  if (tipo==='observacion') {
    const potrero=await potreroValido(tx,v,d.potreroId,d.campoId)
    await tx`select pg_advisory_xact_lock(hashtextextended(${v.empresa_id+'|'+potrero.campo_id+'|'+fecha},0))`
    let [r]=await tx<{id:string}[]>`select id from recorrida where empresa_id=${v.empresa_id} and campo_id=${potrero.campo_id}
      and fecha=${fecha} order by created_at limit 1`
    if (!r) [r]=await tx<{id:string}[]>`insert into recorrida(empresa_id,campo_id,fecha,canal)
      values(${v.empresa_id},${potrero.campo_id},${fecha},'whatsapp') returning id`
    const [previa]=await tx<{id:string;novedad:string|null}[]>`select id,novedad from observacion_potrero
      where empresa_id=${v.empresa_id} and recorrida_id=${r.id} and potrero_id=${potrero.id} order by created_at limit 1 for update`
    if (previa) {
      const novedad=!previa.novedad||previa.novedad===descripcion?descripcion:previa.novedad.includes(descripcion)?previa.novedad:previa.novedad+' · '+descripcion
      await tx`update observacion_potrero set agua=coalesce(${d.agua as string??null}::agua_estado,agua),
        pasto=coalesce(${d.pasto as string??null}::pasto_estado,pasto),electrico=coalesce(${d.electrico as string??null}::electrico_estado,electrico),
        conteo=coalesce(${d.conteo as number??null}::integer,conteo),novedad=${novedad} where id=${previa.id}`
      return {tabla:'observacion_potrero',id:previa.id,detalle:p.resumen}
    }
    await tx`insert into observacion_potrero(id,empresa_id,recorrida_id,potrero_id,agua,pasto,electrico,conteo,novedad,canal)
      values(${p.id},${v.empresa_id},${r.id},${potrero.id},${d.agua as string??null}::agua_estado,${d.pasto as string??null}::pasto_estado,
        ${d.electrico as string??null}::electrico_estado,${d.conteo as number??null}::integer,${descripcion},'whatsapp')`
    return {tabla:'observacion_potrero',id:p.id,detalle:p.resumen}
  }
  if (tipo==='alta') {
    await potreroValido(tx,v,d.potreroId,d.campoId)
    if (fecha!==hoyAR()||typeof d.cantidad!=='number'||!Number.isSafeInteger(d.cantidad)||d.cantidad<1||d.cantidad>2000)
      throw Error('Revisá cantidad y fecha del alta')
    const items=[{categoria:d.categoria,cantidad:d.cantidad}]
    const [r]=await tx<{cantidad:number}[]>`select crear_animales_masivo(p_empresa_id:=${v.empresa_id},p_potrero_id:=${d.potreroId as string},
      p_origen:=${descripcion},p_items:=${tx.json(items as postgres.JSONValue)}::jsonb) as cantidad`
    if (r.cantidad!==d.cantidad) throw Error('El resultado del alta no coincide')
    return {tabla:'interno.wa_asistente_propuesta',id:p.id,detalle:p.resumen}
  }
  const ids=await animalesValidos(tx,v,d)
  if (tipo==='muerte') {
    if (ids.length!==1) throw Error('Falta identificar un único animal')
    await tx`select dar_baja_animal(p_animal_id:=${ids[0]},p_estado:='muerto',p_motivo:=${descripcion},p_fecha:=${fecha}::date)`
    return {tabla:'animal',id:ids[0],detalle:p.resumen}
  }
  if (tipo==='movimiento') {
    const destino=await potreroValido(tx,v,d.destinoId)
    await tx`select mover_animales(p_empresa_id:=${v.empresa_id},p_potrero_destino:=${destino.id},p_animal_ids:=${ids}::uuid[])`
    return {tabla:'animal',id:ids[0],detalle:p.resumen}
  }
  if (tipo==='vacunacion') {
    if (typeof d.vacuna!=='string'||!d.vacuna.trim()) throw Error('Falta la vacuna')
    await tx`select pg_advisory_xact_lock(hashtextextended(${v.empresa_id+':vacunacion:'+fecha},0))`
    const datos={tratamiento:d.vacuna,aplicacion:'vacunacion',vacuna_normalizada:norm(d.vacuna),origen:'whatsapp',propuesta_asistente:p.id}
    const escritos=await tx<{id:string}[]>`insert into evento(empresa_id,animal_id,tipo,fecha,nota,datos)
      select ${v.empresa_id},a.id,'sanidad',${fecha}::date,${'Vacunación: '+d.vacuna},${tx.json(datos)}
      from animal a where a.id=any(${ids}::uuid[]) and a.empresa_id=${v.empresa_id} and not exists(
        select 1 from evento e where e.empresa_id=${v.empresa_id} and e.animal_id=a.id and e.tipo='sanidad'
          and e.fecha=${fecha}::date and e.datos->>'vacuna_normalizada'=${norm(d.vacuna)}) returning id`
    let eventoId=escritos[0]?.id
    if(!eventoId){
      const [previo]=await tx<{id:string}[]>`select id from evento where empresa_id=${v.empresa_id} and animal_id=any(${ids}::uuid[])
        and tipo='sanidad' and fecha=${fecha}::date and datos->>'vacuna_normalizada'=${norm(d.vacuna)} order by id limit 1`
      if(!previo)throw Error('No se pudo verificar el registro sanitario coincidente')
      eventoId=previo.id
    }
    return {tabla:'evento',id:eventoId,detalle:p.resumen+(escritos.length<ids.length?' Los registros sanitarios coincidentes no se duplicaron.':'')}
  }
  throw Error('Operación no disponible')
}