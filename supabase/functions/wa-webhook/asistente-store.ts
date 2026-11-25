import type postgres from 'npm:postgres@3.4.5'
import { sql, usarCuentaVinculada, type Vinculo } from './db.ts'
import { cargaSeccion, nivelesDe, veSeccion, type Niveles, type Seccion } from '../_shared/wa/permisos.ts'
import type { PasoAsistente } from '../_shared/wa/asistente.ts'

export type Tx = postgres.TransactionSql
const json = (v: unknown) => v as postgres.JSONValue
export class AccesoAsistente extends Error { constructor() { super('Acceso no disponible para este vínculo y cuenta') } }

/** La identidad viene del webhook vinculado. Nunca de argumentos del modelo. */
export async function conAlcance<T>(v: Vinculo, fn: (tx: Tx, niveles: Niveles) => Promise<T>): Promise<T> {
  return await sql.begin(async tx => {
    const [m] = await tx<{ rol: string; niveles: Niveles }[]>`
      select m.rol,to_jsonb(m)->'niveles' as niveles from wa_vinculo w join miembro_empresa m
        on m.user_id=w.user_id and m.empresa_id=w.empresa_id
      where w.id=${v.id} and w.user_id=${v.user_id} and w.empresa_id=${v.empresa_id}
        and w.telefono=${v.telefono} and w.activo
        and (to_regprocedure('public.cuenta_pedida()') is not null or not exists (
          select 1 from miembro_empresa otra where otra.user_id=w.user_id and otra.empresa_id<>w.empresa_id))
      for share of w,m`
    if (!m) throw new AccesoAsistente()
    return fn(tx, nivelesDe(m))
  }) as T
}

export async function datosComoPersona<T>(tx: Tx, v: Vinculo, fn: () => Promise<T>): Promise<T> {
  await usarCuentaVinculada(tx, v)
  try { return await fn() } finally { await tx.unsafe('reset role') }
}

export async function leerDatos<T>(v: Vinculo, seccion: Seccion, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return conAlcance(v, async (tx, niveles) => {
    if (!veSeccion(niveles, seccion)) throw new AccesoAsistente()
    return datosComoPersona(tx, v, () => fn(tx))
  })
}

export type TurnoGuardado = { mensaje_id: string; captura_id: string; estado: string; respuesta: Record<string, unknown> | null; salida_estado: string }
export async function iniciarTurno(v: Vinculo, mensajeId: string, texto: string, entrada: 'texto' | 'audio' | 'foto') {
  return conAlcance(v, async tx => {
    const [m] = await tx`select id from wa_mensaje where id=${mensajeId} and vinculo_id=${v.id}
      and empresa_id=${v.empresa_id} and telefono=${v.telefono} and direccion='entrante'
      and cuerpo #>> '{troppero_origen,actor_id}'=${v.user_id} and cuerpo #>> '{troppero_origen,vinculo_id}'=${v.id} for share`
    if (!m) throw new AccesoAsistente()
    await tx`select pg_advisory_xact_lock(hashtextextended(${mensajeId},2311))`
    const [existente] = await tx<TurnoGuardado[]>`select mensaje_id,captura_id,estado,respuesta,salida_estado
      from interno.wa_asistente_turno where mensaje_id=${mensajeId} and vinculo_id=${v.id}
        and actor_id=${v.user_id} and empresa_id=${v.empresa_id}`
    if (existente) return { ...existente, nuevo: false }
    const [c] = await tx<{ id: string }[]>`insert into captura(empresa_id,user_id,mensaje_id,entrada,texto,estado,interpretado_por)
      values(${v.empresa_id},${v.user_id},${mensajeId},${entrada},${texto},'recibida','asistente-haiku-5-5') returning id`
    const [t] = await tx<TurnoGuardado[]>`insert into interno.wa_asistente_turno(mensaje_id,vinculo_id,actor_id,empresa_id,captura_id,texto)
      values(${mensajeId},${v.id},${v.user_id},${v.empresa_id},${c.id},${texto})
      returning mensaje_id,captura_id,estado,respuesta,salida_estado`
    return { ...t, nuevo: true }
  })
}

export async function transcripcionGuardada(v: Vinculo, mensajeId: string, texto: string) {
  await conAlcance(v, async tx => {
    const [t] = await tx<{ captura_id: string }[]>`update interno.wa_asistente_turno set texto=${texto},updated_at=now()
      where mensaje_id=${mensajeId} and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id}
      returning captura_id`
    if (!t) throw new AccesoAsistente()
    await tx`update captura set texto=${texto},updated_at=now() where id=${t.captura_id}
      and user_id=${v.user_id} and empresa_id=${v.empresa_id}`
  })
}

export async function registrarPaso(v: Vinculo, mensajeId: string, paso: PasoAsistente) {
  await conAlcance(v, async tx => {
    const r = await tx`update interno.wa_asistente_turno set pasos=pasos || ${tx.json([json(paso)])}::jsonb,updated_at=now()
      where mensaje_id=${mensajeId} and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id} and estado='procesando'
      returning mensaje_id`
    if (!r.length) throw new AccesoAsistente()
  })
}

export type PropuestaAsistente = {
  id: string; revision: string; captura_id: string; seccion: Seccion; datos: Record<string, unknown>
  resumen: string; estado: 'incompleta' | 'propuesta' | 'confirmada' | 'descartada'; resultado: unknown
}
export async function propuestas(v: Vinculo): Promise<PropuestaAsistente[]> {
  return conAlcance(v, async (tx, niveles) => {
    const filas = await tx<PropuestaAsistente[]>`select id,revision,captura_id,seccion,datos,resumen,estado,resultado
      from interno.wa_asistente_propuesta where vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id}
        and estado in ('incompleta','propuesta') order by updated_at desc,id limit 12`
    return filas.filter(p => cargaSeccion(niveles, p.seccion) || veSeccion(niveles, p.seccion))
  })
}

export async function proponer(v: Vinculo, mensajeId: string, p: {
  clave: string; seccion: Seccion; datos: Record<string, unknown>; resumen: string; fuente: string
  incompleta: boolean; anterior?: { id: string; revision: string }
}): Promise<PropuestaAsistente> {
  return conAlcance(v, async (tx, niveles) => {
    if (!cargaSeccion(niveles, p.seccion)) throw new AccesoAsistente()
    const [turno] = await tx`select 1 from interno.wa_asistente_turno where mensaje_id=${mensajeId}
      and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id} and estado='procesando'`
    if (!turno) throw new AccesoAsistente()
    if (p.anterior) {
      const [anterior] = await tx<PropuestaAsistente[]>`select * from interno.wa_asistente_propuesta
        where id=${p.anterior.id} and revision=${p.anterior.revision} and vinculo_id=${v.id}
          and actor_id=${v.user_id} and empresa_id=${v.empresa_id} and estado in ('propuesta','incompleta') for update`
      if (!anterior) throw new AccesoAsistente()
      const [actual] = await tx<PropuestaAsistente[]>`update interno.wa_asistente_propuesta set revision=gen_random_uuid(),
        datos=${tx.json(json(p.datos))},resumen=${p.resumen},seccion=${p.seccion},estado=${p.incompleta ? 'incompleta' : 'propuesta'},updated_at=now()
        where id=${anterior.id} returning *`
      await tx`update captura set propuesta=${tx.json(json(p.datos))},texto=${p.fuente},estado=${p.incompleta ? 'incompleta' : 'propuesta'},updated_at=now()
        where id=${actual.captura_id} and user_id=${v.user_id} and empresa_id=${v.empresa_id}`
      return actual
    }
    const [ya] = await tx<PropuestaAsistente[]>`select * from interno.wa_asistente_propuesta
      where mensaje_id=${mensajeId} and clave=${p.clave} and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id}`
    if (ya) return ya
    const [captura] = await tx<{ id: string }[]>`insert into captura(empresa_id,user_id,mensaje_id,entrada,texto,estado,propuesta,interpretado_por)
      values(${v.empresa_id},${v.user_id},${mensajeId},'texto',${p.fuente},${p.incompleta ? 'incompleta' : 'propuesta'},${tx.json(json(p.datos))},'asistente-haiku-5-5') returning id`
    const [r] = await tx<PropuestaAsistente[]>`insert into interno.wa_asistente_propuesta
      (mensaje_id,vinculo_id,actor_id,empresa_id,captura_id,clave,seccion,datos,resumen,estado)
      values(${mensajeId},${v.id},${v.user_id},${v.empresa_id},${captura.id},${p.clave},${p.seccion},${tx.json(json(p.datos))},${p.resumen},${p.incompleta ? 'incompleta' : 'propuesta'}) returning *`
    return r
  })
}

export type MensajeHistoria={autor:'productor'|'tropero';texto:string;fecha:string}
export async function historial(v:Vinculo,mensajeId:string,buscar?:string):Promise<MensajeHistoria[]> {
  return conAlcance(v,async(tx,niveles)=>{
    const filas=await tx<{texto:string|null;fecha:string;respuesta:Record<string,unknown>|null}[]>`
      select left(coalesce(t.texto,m.cuerpo #>> '{text,body}',m.cuerpo #>> '{document,caption}',m.cuerpo #>> '{image,caption}',
        (select c.texto from captura c where c.mensaje_id=m.id and c.user_id=${v.user_id} and c.empresa_id=${v.empresa_id}
          and c.entrada='audio' order by c.created_at,c.id limit 1)),4000) as texto,
        to_char(m.created_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD HH24:MI') as fecha,t.respuesta
      from wa_mensaje m join wa_mensaje actual on actual.id=${mensajeId}
      left join interno.wa_asistente_turno t on t.mensaje_id=m.id and t.vinculo_id=${v.id} and t.actor_id=${v.user_id} and t.empresa_id=${v.empresa_id}
      where actual.vinculo_id=${v.id} and actual.empresa_id=${v.empresa_id} and actual.telefono=${v.telefono}
        and m.vinculo_id=${v.id} and m.empresa_id=${v.empresa_id} and m.telefono=${v.telefono} and m.direccion='entrante'
        and (case when m.cuerpo ? 'troppero_origen' then
          m.cuerpo #>> '{troppero_origen,actor_id}'=${v.user_id} and m.cuerpo #>> '{troppero_origen,vinculo_id}'=${v.id}
          else t.mensaje_id is not null or exists(select 1 from captura c where c.mensaje_id=m.id
            and c.user_id=${v.user_id} and c.empresa_id=${v.empresa_id}) end)
        and m.created_at<actual.created_at and m.created_at>=actual.created_at-interval '90 days'
        and (${buscar??null}::text is null or position(lower(${buscar??''}) in lower(coalesce(t.texto,m.cuerpo::text)))>0)
      order by m.created_at desc,m.id desc limit ${buscar?8:18}`
    return filas.reverse().flatMap(f=>{
      const r:MensajeHistoria[]=f.texto?[{autor:'productor',texto:f.texto,fecha:f.fecha}]:[]
      const secciones=f.respuesta?.secciones
      const respuesta=f.respuesta?.mensaje as {texto?:string}|undefined
      if(respuesta?.texto&&Array.isArray(secciones)&&secciones.every(s=>['campos','hacienda','plata'].includes(s)&&veSeccion(niveles,s as Seccion)))
        r.push({autor:'tropero',texto:respuesta.texto.slice(0,4000),fecha:f.fecha})
      return r
    })
  })
}

export type EvidenciaAsistente = { id: string; mensaje_id: string; media_id: string; nombre: string; mime: string | null; tamano: number | null; ruta: string | null; texto: string | null; datos: unknown; estado: string }
export async function evidencias(v: Vinculo, buscar?: string): Promise<EvidenciaAsistente[]> {
  return conAlcance(v, tx => tx<EvidenciaAsistente[]>`select id,mensaje_id,media_id,nombre,mime,tamano,ruta,texto,datos,estado
    from interno.wa_asistente_evidencia where vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id}
      and (${buscar ?? null}::text is null or position(lower(${buscar ?? ''}) in lower(nombre || ' ' || coalesce(texto,'')))>0)
    order by created_at desc,id desc limit 12`)
}

export async function guardarEvidencia(v: Vinculo, mensajeId: string, archivo: {
  media: string; nombre: string; mime?: string; ruta?: string; sha256?: string; tamano?: number; texto?: string; datos?: unknown; estado: string
}): Promise<EvidenciaAsistente> {
  return conAlcance(v, async tx => {
    const [m] = await tx`select 1 from wa_mensaje where id=${mensajeId} and vinculo_id=${v.id}
      and empresa_id=${v.empresa_id} and telefono=${v.telefono} and direccion='entrante'
      and (cuerpo #>> '{troppero_origen,actor_id}'=${v.user_id} and cuerpo #>> '{troppero_origen,vinculo_id}'=${v.id})`
    if (!m) throw new AccesoAsistente()
    const [r] = await tx<EvidenciaAsistente[]>`insert into interno.wa_asistente_evidencia
      (mensaje_id,vinculo_id,actor_id,empresa_id,media_id,nombre,mime,ruta,sha256,tamano,texto,datos,estado)
      values(${mensajeId},${v.id},${v.user_id},${v.empresa_id},${archivo.media},${archivo.nombre},${archivo.mime ?? null},
        ${archivo.ruta ?? null},${archivo.sha256 ?? null},${archivo.tamano ?? null},${archivo.texto ?? null},${archivo.datos == null ? null : tx.json(json(archivo.datos))},${archivo.estado})
      on conflict(mensaje_id,media_id) do update set mime=coalesce(excluded.mime,wa_asistente_evidencia.mime),
        ruta=coalesce(excluded.ruta,wa_asistente_evidencia.ruta),sha256=coalesce(excluded.sha256,wa_asistente_evidencia.sha256),
        tamano=coalesce(excluded.tamano,wa_asistente_evidencia.tamano),texto=coalesce(excluded.texto,wa_asistente_evidencia.texto),
        datos=coalesce(excluded.datos,wa_asistente_evidencia.datos),estado=excluded.estado
      where wa_asistente_evidencia.vinculo_id=${v.id} and wa_asistente_evidencia.actor_id=${v.user_id}
        and wa_asistente_evidencia.empresa_id=${v.empresa_id}
      returning *`
    if(!r)throw new AccesoAsistente()
    return r
  })
}

export async function finalizarTurno(v: Vinculo, mensajeId: string, respuesta: Record<string, unknown>, error = false) {
  await conAlcance(v, async tx => {
    const [t] = await tx<{ captura_id: string }[]>`update interno.wa_asistente_turno set estado=${error ? 'error' : 'respondido'},
      respuesta=${tx.json(json(respuesta))},updated_at=now() where mensaje_id=${mensajeId}
      and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id} returning captura_id`
    if (!t) throw new AccesoAsistente()
    await tx`update captura set estado=${error ? 'error' : 'respondida'},interpretacion=${tx.json(json({ asistente: true, respuesta }))},updated_at=now()
      where id=${t.captura_id} and user_id=${v.user_id} and empresa_id=${v.empresa_id}`
  })
}

/** Envío ambiguo tras caída requiere revisión, no reenvío automático que duplique. */
export async function tomarSalida(v: Vinculo, mensajeId: string): Promise<boolean> {
  return conAlcance(v, async tx => (await tx`update interno.wa_asistente_turno set salida_estado='enviando',updated_at=now()
    where mensaje_id=${mensajeId} and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id}
      and salida_estado='pendiente' and respuesta is not null returning mensaje_id`).length === 1)
}
export async function terminarSalida(v: Vinculo, mensajeId: string, ok: boolean) {
  await conAlcance(v, tx => tx`update interno.wa_asistente_turno set salida_estado=${ok ? 'enviada' : 'revision'},updated_at=now()
    where mensaje_id=${mensajeId} and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id} and salida_estado='enviando'`)
}
export async function descartarPropuesta(v: Vinculo,id: string,revision: string): Promise<boolean> {
  return conAlcance(v,async(tx,niveles)=>{
    const [p]=await tx<PropuestaAsistente[]>`select * from interno.wa_asistente_propuesta
      where id=${id} and revision=${revision} and vinculo_id=${v.id} and actor_id=${v.user_id}
        and empresa_id=${v.empresa_id} and estado in ('propuesta','incompleta') for update`
    if (!p||!cargaSeccion(niveles,p.seccion)) return false
    await tx`update interno.wa_asistente_propuesta set estado='descartada',revision=gen_random_uuid(),updated_at=now() where id=${p.id}`
    await tx`update captura set estado='descartada',updated_at=now() where id=${p.captura_id}
      and user_id=${v.user_id} and empresa_id=${v.empresa_id}`
    return true
  })
}

/** Sólo lo invoca un botón firmado del vínculo, nunca una herramienta del modelo. */
export async function confirmarPropuesta(v: Vinculo,id: string,revision: string,
  ejecutar:(tx:Tx,p:PropuestaAsistente)=>Promise<{tabla:string;id:string;detalle:string}>,
):Promise<{estado:string;detalle?:string}> {
  return conAlcance(v,async(tx,niveles)=>{
    const [p]=await tx<PropuestaAsistente[]>`select * from interno.wa_asistente_propuesta where id=${id}
      and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id} for update`
    if (!p) return {estado:'no_disponible'}
    if (!cargaSeccion(niveles,p.seccion)) return {estado:'sin_permiso'}
    if (p.revision!==revision) return {estado:'version_anterior'}
    if (p.estado==='confirmada') return {estado:'ya_confirmada'}
    if (p.estado!=='propuesta') return {estado:'no_disponible'}
    await tx`select set_config('TimeZone','America/Argentina/Buenos_Aires',true)`
    const resultado=await datosComoPersona(tx,v,()=>ejecutar(tx,p))
    await tx`update interno.wa_asistente_propuesta set estado='confirmada',resultado=${tx.json(json(resultado))},updated_at=now() where id=${p.id}`
    await tx`update captura set estado='confirmada',escrito_tabla=${resultado.tabla},escrito_id=${resultado.id},updated_at=now()
      where id=${p.captura_id} and user_id=${v.user_id} and empresa_id=${v.empresa_id}`
    return {estado:'confirmada',detalle:resultado.detalle}
  })
}
export async function resultadoPropuesta(v:Vinculo,id:string,revision:string) {
  return conAlcance(v,async(tx,niveles)=>{
    const [p]=await tx<PropuestaAsistente[]>`select * from interno.wa_asistente_propuesta where id=${id}
      and revision=${revision} and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id}`
    if(!p||!cargaSeccion(niveles,p.seccion))return null
    return p
  })
}
export async function evidenciaPorId(v:Vinculo,id:string):Promise<EvidenciaAsistente|undefined> {
  return conAlcance(v,async tx=>(await tx<EvidenciaAsistente[]>`select id,mensaje_id,media_id,nombre,mime,tamano,ruta,texto,datos,estado
    from interno.wa_asistente_evidencia where id=${id} and vinculo_id=${v.id} and actor_id=${v.user_id} and empresa_id=${v.empresa_id}`)[0])
}