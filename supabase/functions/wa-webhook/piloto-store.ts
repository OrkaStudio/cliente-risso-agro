import type postgres from 'npm:postgres@3.4.5'
import { comoUsuario, sql, type Vinculo } from './db.ts'
import type { Borrador } from '../_shared/wa/tipos.ts'
import type { Comparacion } from '../_shared/wa/piloto.ts'
import { potreroEnPunto } from '../_shared/wa/resolver.ts'
import { potrerosDibujados } from './db.ts'

const json = (v: unknown) => sql.json(v as postgres.JSONValue)
type Datos = Record<string, unknown>
export type Accion =
  | { k: 'incidencia'; campoId: string; potreroId: string; descripcion: string; equipoId?: string }
  | { k: 'resolver'; id: string; version: number }
  | { k: 'tarea'; campoId: string; potreroId: string | null; descripcion: string; responsableId: string; fecha: string }
  | { k: 'tarea_estado'; id: string; version: number; estado: 'aceptada' | 'completa' }
  | { k: 'ajustar'; id: string; tabla: 'lluvia' | 'movimiento_financiero'; antes: Datos; valor?: number; anular: boolean }
export type Propuesta = { id: string; accion: Accion; estado: string }
export async function proponer(v: Vinculo, mensajeId: string, accion: Accion): Promise<Propuesta> {
  return await sql.begin(async tx => {
    await tx`update interno.wa_propuesta_piloto set estado='cancelada' where vinculo_id=${v.id} and estado='pendiente' and mensaje_id<>${mensajeId}`
    const [row] = await tx<Propuesta[]>`insert into interno.wa_propuesta_piloto(vinculo_id,mensaje_id,accion)
      values(${v.id},${mensajeId},${json(accion)}) on conflict(vinculo_id,mensaje_id) do update set mensaje_id=excluded.mensaje_id
      returning id,accion,estado`
    return row
  }) as Propuesta
}
export async function pendiente(v: Vinculo): Promise<Propuesta | null> {
  const [row] = await sql<Propuesta[]>`select id,accion,estado from interno.wa_propuesta_piloto where vinculo_id=${v.id}
    and estado='pendiente' and created_at>now()-interval '1 hour' order by created_at desc limit 1`
  return row ?? null
}
export async function cancelar(v: Vinculo, id: string): Promise<void> {
  await sql`update interno.wa_propuesta_piloto set estado='cancelada' where id=${id} and vinculo_id=${v.id} and estado='pendiente'`
}

export async function confirmar(v: Vinculo, id: string): Promise<string> {
  const [p] = await sql<Propuesta[]>`update interno.wa_propuesta_piloto set estado='ejecutando' where id=${id}
    and vinculo_id=${v.id} and estado='pendiente' and created_at>now()-interval '1 hour' returning id,accion,estado`
  if (!p) {
    const saved = await comoUsuario(v.user_id, tx => tx`select 1 from wa_piloto_evento where operacion_id=${id} and empresa_id=${v.empresa_id} and actor_id=${v.user_id}`)
    return saved.length ? 'Esa acción ya quedó guardada. No la repetí.' : 'Esa propuesta venció, fue cancelada o necesita revisión. No la ejecuté de nuevo.'
  }
  try {
    const texto = await aplicar(v, id, p.accion)
    await sql`update interno.wa_propuesta_piloto set estado='completo' where id=${id} and vinculo_id=${v.id}`
    return texto
  } catch {
    const saved = await comoUsuario(v.user_id, tx => tx`select 1 from wa_piloto_evento where operacion_id=${id} and empresa_id=${v.empresa_id} and actor_id=${v.user_id}`).catch(() => null)
    await sql`update interno.wa_propuesta_piloto set estado=${saved?.length ? 'completo' : 'revision'} where id=${id} and vinculo_id=${v.id}`.catch(() => {})
    return saved?.length ? 'Comprobé que la acción quedó guardada. No la repetí.' : 'No pude completar o comprobar esa acción. Conservé el historial y tu otra carga pendiente. Pedí revisión a Fran o Lau antes de repetirla.'
  }
}

/** Datos y auditoría se escriben juntos, con RLS y bloqueo por operación. */
export async function aplicar(v: Vinculo, operacionId: string, a: Accion): Promise<string> {
  return comoUsuario(v.user_id, async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${operacionId},711))`
    const done = await tx`select 1 from wa_piloto_evento where operacion_id=${operacionId} and empresa_id=${v.empresa_id} and actor_id=${v.user_id}`
    if (done.length) return 'Esa acción ya quedó guardada. No la repetí.'
    await tx`select set_config('app.wa_operacion',${operacionId},true)`
    let objetoId = operacionId, antes: unknown = null, despues: unknown = null, texto = ''
    switch (a.k) {
      case 'incidencia': {
        const [row] = await tx<Datos[]>`insert into campo_incidencia(id,empresa_id,campo_id,potrero_id,infraestructura_id,descripcion)
          values(${operacionId},${v.empresa_id},${a.campoId},${a.potreroId},${a.equipoId ?? null},${a.descripcion}) returning *`
        despues = row; texto = `Problema guardado · INC-${operacionId.slice(0,8)}. Queda abierto hasta que lo resuelvas. Para cerrarlo: «resolver problema ${operacionId.slice(0,8)}».`; break
      }
      case 'resolver': {
        const [row] = await tx<Datos[]>`select * from campo_incidencia where id=${a.id} and empresa_id=${v.empresa_id} for update`
        if (!row || row.version !== a.version || row.estado !== 'abierta') throw new Error('La incidencia cambió')
        antes = row; objetoId = a.id
        const [updated] = await tx<Datos[]>`update campo_incidencia set estado='resuelta',resuelta_at=now(),resuelta_por=${v.user_id},version=version+1 where id=${a.id} and empresa_id=${v.empresa_id} returning *`
        despues = updated; texto = `Problema INC-${a.id.slice(0,8)} resuelto. Conservé el historial.`; break
      }
      case 'tarea': {
        const [row] = await tx<Datos[]>`insert into campo_tarea(id,empresa_id,campo_id,potrero_id,descripcion,responsable_id,vence)
          values(${operacionId},${v.empresa_id},${a.campoId},${a.potreroId},${a.descripcion},${a.responsableId},${a.fecha}) returning *`
        despues = row; texto = `Tarea guardada · TAR-${operacionId.slice(0,8)} · vence ${a.fecha}. El responsable puede aceptarla con «aceptar tarea ${operacionId.slice(0,8)}». No envié mensajes a otra persona.`; break
      }
      case 'tarea_estado': {
        const [row] = await tx<Datos[]>`select * from campo_tarea where id=${a.id} and empresa_id=${v.empresa_id} for update`
        if (!row || row.version !== a.version || row.estado === 'completa') throw new Error('La tarea cambió')
        if (a.estado === 'aceptada' && row.responsable_id !== v.user_id) throw new Error('Sólo el responsable puede aceptar')
        objetoId = a.id; antes = row
        const [updated] = await tx<Datos[]>`update campo_tarea set estado=${a.estado},completada_at=${a.estado === 'completa' ? new Date() : null},version=version+1 where id=${a.id} and empresa_id=${v.empresa_id} returning *`
        if (!updated) throw new Error('Sin permiso para actualizar la tarea')
        despues = updated; texto = `Tarea TAR-${a.id.slice(0,8)} ${a.estado}.`; break
      }
      case 'ajustar': {
        const own = await tx`select 1 from captura where empresa_id=${v.empresa_id} and user_id=${v.user_id}
          and escrito_id=${a.id} and escrito_tabla=${a.tabla} and estado='confirmada'`
        if (!own.length) throw new Error('Sólo cargas propias de WhatsApp')
        const rows = a.tabla === 'lluvia'
          ? await tx<{ datos: Datos }[]>`select to_jsonb(r) as datos from lluvia r where id=${a.id} and empresa_id=${v.empresa_id} for update`
          : await tx<{ datos: Datos }[]>`select to_jsonb(r) as datos from movimiento_financiero r where id=${a.id} and empresa_id=${v.empresa_id} and tipo='gasto' for update`
        const current = rows[0]?.datos
        // JSONB reordena claves; comparar valores ordenados, no el orden JS de sus claves.
        const canon = (o: Datos) => JSON.stringify(Object.keys(o).sort().map(k => [k,o[k]]))
        if (!current || canon(current) !== canon(a.antes)) throw new Error('La carga cambió desde la propuesta')
        if (!a.anular && (!Number.isFinite(a.valor) || a.valor! < 0 || (a.tabla === 'movimiento_financiero' && a.valor! <= 0))) throw new Error('Cantidad inválida')
        if (a.tabla === 'movimiento_financiero' && (current.estado === 'anulado' || current.comprobante_url || current.neto_total != null || current.iva_total != null)) throw new Error('Comprobante o gasto anulado: revisar en la app')
        antes = current; objetoId = a.id
        if (a.tabla === 'lluvia') {
          if (a.anular) { await tx`delete from lluvia where id=${a.id} and empresa_id=${v.empresa_id}`; despues = null }
          else { const [r] = await tx<Datos[]>`update lluvia set mm=${a.valor!} where id=${a.id} and empresa_id=${v.empresa_id} returning *`; despues = r }
        } else {
          const [r] = a.anular
            ? await tx<Datos[]>`update movimiento_financiero set estado='anulado' where id=${a.id} and empresa_id=${v.empresa_id} returning *`
            : await tx<Datos[]>`update movimiento_financiero set monto=${a.valor!} where id=${a.id} and empresa_id=${v.empresa_id} returning *`
          despues = r
        }
        texto = a.anular ? 'Carga anulada. Conservé quién lo hizo y los datos anteriores en el historial.' : `Carga corregida a ${a.valor}${a.tabla === 'lluvia' ? ' mm' : ' pesos'}. Conservé el valor anterior en el historial.`; break
      }
    }
    // Únicamente el historial técnico protegido se escribe como servidor;
    // todas las consultas y mutaciones del productor anteriores usaron RLS.
    await tx.unsafe('reset role')
    await tx`insert into wa_piloto_evento(operacion_id,empresa_id,actor_id,tipo,objeto_id,antes,despues)
      values(${operacionId},${v.empresa_id},${v.user_id},${a.k === 'ajustar' && a.anular ? 'anular' : a.k},${objetoId},${antes === null ? null : json(antes)},${despues === null ? null : json(despues)}) on conflict(operacion_id) do nothing`
    return texto
  })
}

export async function ultimaCarga(v: Vinculo): Promise<{ tabla: 'lluvia' | 'movimiento_financiero'; datos: Datos } | null> {
  return comoUsuario(v.user_id, async tx => {
    const [c] = await tx<{ escrito_tabla: string; escrito_id: string }[]>`select escrito_tabla,escrito_id from captura c where empresa_id=${v.empresa_id}
      and user_id=${v.user_id} and estado='confirmada' and escrito_id is not null
      and not exists(select 1 from wa_piloto_evento e where e.empresa_id=c.empresa_id and e.objeto_id=c.escrito_id and e.tipo='anular')
      order by created_at desc,id desc limit 1`
    if (!c || !['lluvia','movimiento_financiero'].includes(c.escrito_tabla)) return null
    const tabla = c.escrito_tabla as 'lluvia' | 'movimiento_financiero'
    const [row] = tabla === 'lluvia'
      ? await tx<{ datos: Datos }[]>`select to_jsonb(r) as datos from lluvia r where id=${c.escrito_id} and empresa_id=${v.empresa_id}`
      : await tx<{ datos: Datos }[]>`select to_jsonb(r) as datos from movimiento_financiero r where id=${c.escrito_id} and empresa_id=${v.empresa_id} and tipo='gasto' and estado<>'anulado'`
    return row ? { tabla, datos: row.datos } : null
  })
}

export type Incidencia = { id: string; descripcion: string; campo_id: string; potrero_id: string; estado: string; version: number }
export type Tarea = { id: string; descripcion: string; responsable_id: string; vence: string; estado: string; version: number }
export const incidencias = (v: Vinculo, pagina=1) => comoUsuario(v.user_id, tx => tx<Incidencia[]>`select id,descripcion,campo_id,potrero_id,estado,version from campo_incidencia where empresa_id=${v.empresa_id} and estado='abierta' order by created_at,id limit 11 offset ${(Math.max(1,pagina)-1)*10}`)
export const tareas = (v: Vinculo, pagina=1) => comoUsuario(v.user_id, tx => tx<Tarea[]>`select id,descripcion,responsable_id,vence::text,estado,version from campo_tarea where empresa_id=${v.empresa_id} and estado<>'completa' order by vence,id limit 11 offset ${(Math.max(1,pagina)-1)*10}`)
export const potrerosConProblemas = (v: Vinculo, campoId: string) => comoUsuario(v.user_id, async tx => (await tx<{potrero_id:string}[]>`select distinct potrero_id from campo_incidencia where empresa_id=${v.empresa_id} and campo_id=${campoId} and estado='abierta'`).map(r=>r.potrero_id))
export const equiposConProblemas = (v: Vinculo,campoId:string) => comoUsuario(v.user_id,tx=>tx<{id:string;lat:number;lng:number}[]>`select distinct i.id,i.lat,i.lng from infraestructura i join campo_incidencia c on c.infraestructura_id=i.id where i.empresa_id=${v.empresa_id} and i.campo_id=${campoId} and c.empresa_id=${v.empresa_id} and c.estado='abierta'`)
export async function equipoParaProblema(v:Vinculo,campoId:string,potreroId:string,descripcion:string):Promise<string|undefined>{
  const tipo=descripcion.toLowerCase().match(/\b(molino|laguna|tranquera|manga)\b/)?.[1]
  if(!tipo)return undefined
  const equipos=await comoUsuario(v.user_id,tx=>tx<{id:string;lat:number;lng:number}[]>`select id,lat,lng from infraestructura where empresa_id=${v.empresa_id} and campo_id=${campoId} and tipo::text=${tipo}`)
  const dibujos=await potrerosDibujados(v)
  const candidatos=equipos.filter(e=>potreroEnPunto(e.lat,e.lng,dibujos)?.id===potreroId)
  return candidatos.length===1?candidatos[0].id:undefined
}
export const incidenciasEnPotrero=(v:Vinculo,potreroId:string)=>comoUsuario(v.user_id,tx=>tx<Incidencia[]>`select id,descripcion,campo_id,potrero_id,estado,version from campo_incidencia where empresa_id=${v.empresa_id} and potrero_id=${potreroId} and estado='abierta' order by created_at,id`)
export const cierrePrevio=(v:Vinculo,sesionId:string)=>comoUsuario(v.user_id,async tx=>(await tx<{id:string;estado:string}[]>`select id,estado from captura where empresa_id=${v.empresa_id} and user_id=${v.user_id}
 and propuesta->>'sesionId'=${sesionId} and propuesta->>'cerrarSesion'='true' and estado in ('confirmada','error') and escrito_tabla='observacion_potrero' order by created_at desc limit 1`)[0]??null)
export const buscarIncidencia = (v: Vinculo, codigo: string) => comoUsuario(v.user_id, tx => tx<Incidencia[]>`select id,descripcion,campo_id,potrero_id,estado,version from campo_incidencia where empresa_id=${v.empresa_id} and estado='abierta' and id::text like ${codigo + '%'} limit 2`)
export const buscarTarea = (v: Vinculo, codigo: string) => comoUsuario(v.user_id, tx => tx<Tarea[]>`select id,descripcion,responsable_id,vence::text,estado,version from campo_tarea where empresa_id=${v.empresa_id} and estado<>'completa' and id::text like ${codigo + '%'} limit 2`)
export async function miembros(v: Vinculo): Promise<{ id: string; nombre: string }[]> {
  return sql<{ id: string; nombre: string }[]>`select m.user_id as id,coalesce(nullif(trim(u.raw_user_meta_data->>'nombre'),''),left(m.user_id::text,8)) as nombre
    from miembro_empresa m join auth.users u on u.id=m.user_id where m.empresa_id=${v.empresa_id}
    and exists(select 1 from miembro_empresa actor where actor.user_id=${v.user_id} and actor.empresa_id=${v.empresa_id}) order by nombre`
}
export const comparar = (v: Vinculo) => comoUsuario(v.user_id, tx => tx<Comparacion[]>`
  select c.nombre as campo,p.nombre as potrero,a.fecha,a.agua,a.pasto,a.electrico,b.fecha as anterior_fecha,b.agua as anterior_agua,b.pasto as anterior_pasto,b.electrico as anterior_electrico
  from potrero p join campo c on c.id=p.campo_id
  left join lateral(select distinct on(r.fecha) r.fecha::text,o.agua::text,o.pasto::text,o.electrico::text from observacion_potrero o join recorrida r on r.id=o.recorrida_id
    where o.potrero_id=p.id and o.empresa_id=${v.empresa_id} and r.empresa_id=${v.empresa_id} order by r.fecha desc,o.created_at desc,o.id desc limit 1) a on true
  left join lateral(select distinct on(r.fecha) r.fecha::text,o.agua::text,o.pasto::text,o.electrico::text from observacion_potrero o join recorrida r on r.id=o.recorrida_id
    where o.potrero_id=p.id and o.empresa_id=${v.empresa_id} and r.empresa_id=${v.empresa_id} and r.fecha<a.fecha::date order by r.fecha desc,o.created_at desc,o.id desc limit 1) b on true
  where p.empresa_id=${v.empresa_id} and c.empresa_id=${v.empresa_id} order by c.nombre,p.nombre`)

export type Sesion = { id: string; fecha: string; campo_id: string; estado: string; borrador: Borrador; version: number }
export const sesionActiva = (v: Vinculo) => comoUsuario(v.user_id, async tx => (await tx<Sesion[]>`select id,fecha::text,campo_id,estado,borrador,version from wa_recorrida_sesion where user_id=${v.user_id} and empresa_id=${v.empresa_id} and estado='abierta'`)[0] ?? null)
export async function abrirSesion(v: Vinculo, campoId: string, fecha: string): Promise<Sesion> {
  return comoUsuario(v.user_id, async tx => {
    const b: Borrador = { tipo:'recorrida',campoId,fecha,observaciones:[] }
    const [s] = await tx<Sesion[]>`insert into wa_recorrida_sesion(empresa_id,campo_id,fecha,borrador)
      values(${v.empresa_id},${campoId},${fecha},${json(b)}) returning id,fecha::text,campo_id,estado,borrador,version`
    return s
  })
}
export async function retomarSesion(v: Vinculo): Promise<Sesion | null> {
  return comoUsuario(v.user_id, async tx => {
    const [row] = await tx<Sesion[]>`update wa_recorrida_sesion set estado='abierta',version=version+1,updated_at=now() where id=(select id from wa_recorrida_sesion
      where user_id=${v.user_id} and empresa_id=${v.empresa_id} and estado='pausada' order by updated_at desc limit 1) returning id,fecha::text,campo_id,estado,borrador,version`
    return row ?? null
  })
}
export async function guardarSesion(v: Vinculo, s: Sesion, b: Borrador, mensajeId: string): Promise<boolean> {
  return comoUsuario(v.user_id, async tx => {
    const rows = await tx`update wa_recorrida_sesion set borrador=${json(b)},mensajes=array_append(mensajes,${mensajeId}::uuid),version=version+1,updated_at=now()
      where id=${s.id} and user_id=${v.user_id} and empresa_id=${v.empresa_id} and estado='abierta' and version=${s.version}
      and not (${mensajeId}::uuid=any(mensajes)) returning id`
    return rows.length === 1
  })
}
export async function estadoSesion(v: Vinculo, id: string, estado: 'pausada' | 'cerrada'): Promise<void> {
  await comoUsuario(v.user_id, tx => tx`update wa_recorrida_sesion set estado=${estado},version=version+1,updated_at=now()
    where id=${id} and user_id=${v.user_id} and empresa_id=${v.empresa_id} and estado='abierta'`)
}
