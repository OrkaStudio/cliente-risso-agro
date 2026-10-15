import { sql,type Vinculo } from './db.ts'
import {empresaEnPiloto} from '../_shared/wa/servicios.ts'
export const colaHabilitada = (empresaId?:string) => Deno.env.get('WA_QUEUE_ENABLED') === 'true' && (!empresaId || empresaEnPiloto(Deno.env.get('WA_PILOT_TENANTS'),empresaId))

export async function tomarTrabajo(vinculoId: string): Promise<{ mensajeId: string; cuerpo: unknown; token: string } | null> {
  return await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${vinculoId},712))`
    // Un proceso muerto puede haber escrito. No repetirlo automáticamente.
    await tx`update interno.wa_cola q set estado='revision' from wa_mensaje m where q.mensaje_id=m.id and q.vinculo_id=${vinculoId}
      and ((q.estado='procesando' and q.tomado_at<now()-interval '5 minutes') or (q.estado='pendiente' and m.created_at<now()-interval '23 hours'))`
    const ocupados = await tx`select 1 from interno.wa_cola where vinculo_id=${vinculoId} and estado in ('procesando','revision') limit 1`
    if (ocupados.length) return null
    const [job] = await tx<{ mensaje_id: string; cuerpo: unknown }[]>`
      select q.mensaje_id,m.cuerpo from interno.wa_cola q join wa_mensaje m on m.id=q.mensaje_id
      where q.vinculo_id=${vinculoId} and q.estado='pendiente' order by q.secuencia limit 1 for update of q`
    if (!job) return null
    const token = crypto.randomUUID()
    await tx`update interno.wa_cola set estado='procesando',token=${token},tomado_at=now() where mensaje_id=${job.mensaje_id}`
    return { mensajeId: job.mensaje_id, cuerpo: job.cuerpo, token }
  }) as { mensajeId: string; cuerpo: unknown; token: string } | null
}
export async function terminarTrabajo(mensajeId: string, token: string, revisar = false): Promise<void> {
  await sql`update interno.wa_cola set estado=${revisar ? 'revision' : 'completo'},terminado_at=now()
    where mensaje_id=${mensajeId} and token=${token} and estado='procesando'`
}
export async function canalEnRevision(vinculoId: string): Promise<boolean> {
  return (await sql`select 1 from interno.wa_cola where vinculo_id=${vinculoId} and estado='revision' limit 1`).length > 0
}
export const canalesConTrabajo = () => sql<Vinculo[]>`select v.id,v.telefono,v.user_id,v.empresa_id,v.pendiente,v.pendiente_at from wa_vinculo v
 where v.activo and not exists(select 1 from interno.wa_cola q where q.vinculo_id=v.id and q.estado='revision')
 and exists(select 1 from interno.wa_cola q where q.vinculo_id=v.id and (q.estado='pendiente' or (q.estado='procesando' and q.tomado_at<now()-interval '5 minutes')))
 order by v.id limit 3`
