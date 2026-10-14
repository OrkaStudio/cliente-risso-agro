import postgres from 'npm:postgres@3.4.5'
import type { Vinculo } from '../wa-webhook/db.ts'
import type { PeriodoSemana } from '../_shared/wa/semanal.ts'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 20 })
export async function configurar(v: Vinculo, activo: boolean): Promise<void> {
  const rows = await sql`insert into interno.wa_resumen_config(vinculo_id,activo)
    select id,${activo} from public.wa_vinculo where id=${v.id} and user_id=${v.user_id} and empresa_id=${v.empresa_id} and activo
    and exists(select 1 from public.miembro_empresa where user_id=${v.user_id} and empresa_id=${v.empresa_id})
    on conflict(vinculo_id) do update set activo=excluded.activo,actualizado_at=now() returning vinculo_id`
  if (!rows.length) throw new Error('El vínculo no está activo o no tiene acceso')
}
export async function destinatarios(p: PeriodoSemana): Promise<Vinculo[]> {
  return await sql<Vinculo[]>`select v.id,v.telefono,v.user_id,v.empresa_id,v.pendiente,v.pendiente_at
    from public.wa_vinculo v join interno.wa_resumen_config c on c.vinculo_id=v.id
    where v.activo and c.activo and exists(select 1 from public.miembro_empresa where user_id=v.user_id and empresa_id=v.empresa_id)
    and not exists(select 1 from interno.wa_resumen_envio e where e.vinculo_id=v.id and e.desde=${p.desde} and e.hasta=${p.hasta}
      and not(e.estado='error_preparacion' and e.intentos<3 or e.estado='preparando' and e.actualizado_at<now()-interval '10 minutes' and e.intentos<3))
    order by v.id limit 25`
}
export async function reclamar(v: Vinculo, p: PeriodoSemana): Promise<string | null> {
  const rows = await sql<{ lease: string }[]>`insert into interno.wa_resumen_envio(vinculo_id,empresa_id,user_id,desde,hasta,estado)
    select v.id,v.empresa_id,v.user_id,${p.desde},${p.hasta},'preparando'
    from public.wa_vinculo v join interno.wa_resumen_config c on c.vinculo_id=v.id
    where v.id=${v.id} and v.empresa_id=${v.empresa_id} and v.user_id=${v.user_id} and v.activo and c.activo
    and exists(select 1 from public.miembro_empresa where user_id=v.user_id and empresa_id=v.empresa_id)
    on conflict(vinculo_id,desde,hasta) do update set estado='preparando',intentos=wa_resumen_envio.intentos+1,lease=gen_random_uuid(),error=null,actualizado_at=now()
    where wa_resumen_envio.empresa_id=excluded.empresa_id and wa_resumen_envio.user_id=excluded.user_id and wa_resumen_envio.intentos<3 and (wa_resumen_envio.estado='error_preparacion'
      or wa_resumen_envio.estado='preparando' and wa_resumen_envio.actualizado_at<now()-interval '10 minutes')
    returning lease`
  return rows[0]?.lease ?? null
}
export async function sigueActivo(v: Vinculo, p: PeriodoSemana, lease: string): Promise<boolean> {
  const [row] = await sql`select v.id from public.wa_vinculo v join interno.wa_resumen_config c on c.vinculo_id=v.id
    where v.id=${v.id} and v.empresa_id=${v.empresa_id} and v.user_id=${v.user_id} and v.activo and c.activo
    and exists(select 1 from public.miembro_empresa where user_id=v.user_id and empresa_id=v.empresa_id)`
  if (!row) await estado(v,p,lease,'cancelado')
  return Boolean(row)
}
export async function estado(v: Vinculo, p: PeriodoSemana, lease: string, estado: string, wamid: string | null = null, error: string | null = null): Promise<void> {
  await sql`update interno.wa_resumen_envio set estado=${estado},wamid=coalesce(${wamid},wamid),error=${error},actualizado_at=now()
    where vinculo_id=${v.id} and empresa_id=${v.empresa_id} and user_id=${v.user_id} and desde=${p.desde} and hasta=${p.hasta} and lease=${lease}`
}

/** La activación y el turno se revalidan en la transición atómica previa a Meta. */
export async function marcarEnviando(v: Vinculo,p: PeriodoSemana,lease: string): Promise<boolean> {
  const rows=await sql`update interno.wa_resumen_envio e set estado='enviando',actualizado_at=now()
    where e.vinculo_id=${v.id} and e.empresa_id=${v.empresa_id} and e.user_id=${v.user_id}
      and e.desde=${p.desde} and e.hasta=${p.hasta} and e.lease=${lease} and e.estado='preparando'
      and exists(select 1 from public.wa_vinculo v join interno.wa_resumen_config c on c.vinculo_id=v.id
        where v.id=e.vinculo_id and v.empresa_id=e.empresa_id and v.user_id=e.user_id and v.activo and c.activo
        and exists(select 1 from public.miembro_empresa m where m.user_id=v.user_id and m.empresa_id=v.empresa_id)) returning id`
  return rows.length===1
}
