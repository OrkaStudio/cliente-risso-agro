-- =====================================================================
--  Bot de WhatsApp — aviso a Slack cuando el bot está mudo.
--  Tarea: orka-brain/clientes/risso-agro/tareas/TASK-063-2026-09-24.md
--
--  Un proceso que deja de contestar no "falla": sólo se queda callado. Con un
--  solo productor en el piloto, el silencio por sí solo no alcanza (Daniel no
--  escribe todos los días), así que se miran tres señales:
--    · sin_respuesta     entró un mensaje de un número vinculado y en 5 min no
--                        salió nada hacia ese número. Cubre también el envío
--                        que Meta rechaza: ese no llega a guardarse.
--    · saliente_fallido  Meta informó `failed` sobre algo que mandamos.
--    · silencio          72 h sin nada entrante habiendo números vinculados.
--  Cada condición avisa una sola vez (único por tipo + referencia).
--
--  El aviso va por Slack y no por WhatsApp: si el problema es WhatsApp, el
--  aviso tampoco llegaría. La URL del incoming webhook vive en el Vault
--  (`slack_alertas_webhook`); sin ella las alertas quedan en la tabla y se
--  mandan cuando se cargue (sólo las de las últimas 24 h).
--
--  Depende de 20260925120000_whatsapp_bot (wa_mensaje, wa_vinculo) y de
--  pg_cron (habilitado en 20260926120100_telemetria_foto_diaria).
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table interno.wa_alerta (
  id          bigint generated always as identity primary key,
  tipo        text not null check (tipo in ('sin_respuesta', 'saliente_fallido', 'silencio')),
  referencia  text not null,
  texto       text not null,
  created_at  timestamptz not null default now(),
  avisada_at  timestamptz,
  unique (tipo, referencia)
);
comment on table interno.wa_alerta is 'Alertas de salud del bot de WhatsApp. avisada_at = cuándo salió a Slack.';

create function interno.revisar_salud_wa()
returns integer
language plpgsql
-- Lee wa_mensaje (sin policies) y el Vault; la corre pg_cron.
security definer
set search_path = ''
as $$
declare
  v_url  text;
  v_a    record;
  v_n    integer := 0;
begin
  -- 1. Entró algo de un número vinculado y no salió nada después.
  insert into interno.wa_alerta (tipo, referencia, texto)
  select 'sin_respuesta', e.wamid,
         format('El bot no contestó: %s (…%s) escribió a las %s y pasaron más de 5 minutos sin respuesta.',
                coalesce(emp.nombre, 'sin empresa'), right(e.telefono, 4),
                to_char(e.created_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'))
  from public.wa_mensaje e
  left join public.empresa emp on emp.id = e.empresa_id
  where e.direccion = 'entrante'
    and e.vinculo_id is not null
    and e.created_at between now() - interval '2 hours' and now() - interval '5 minutes'
    and not exists (
      select 1 from public.wa_mensaje s
      where s.direccion = 'saliente' and s.telefono = e.telefono and s.created_at >= e.created_at
        -- Una respuesta que Meta rechazó no llegó: no cuenta como contestar.
        and s.estado is distinct from 'failed'
    )
  on conflict (tipo, referencia) do nothing;

  -- 2. Meta rechazó algo que mandamos.
  insert into interno.wa_alerta (tipo, referencia, texto)
  select 'saliente_fallido', s.wamid,
         format('Meta no entregó un mensaje del bot a …%s: %s',
                right(s.telefono, 4), coalesce(s.error::text, 'sin detalle'))
  from public.wa_mensaje s
  where s.direccion = 'saliente'
    and s.estado = 'failed'
    and coalesce(s.estado_at, s.created_at) > now() - interval '2 hours'
  on conflict (tipo, referencia) do nothing;

  -- 3. Silencio largo con números vinculados. Una alerta por episodio: la
  --    referencia es el último mensaje entrante (o el vínculo más viejo).
  insert into interno.wa_alerta (tipo, referencia, texto)
  select 'silencio', x.desde::text,
         format('Hace más de 72 h que no entra ningún mensaje de WhatsApp (el último: %s). Revisar el webhook en Meta.',
                to_char(x.desde at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'))
  from (
    select coalesce(
      (select max(created_at) from public.wa_mensaje where direccion = 'entrante'),
      (select min(vinculado_at) from public.wa_vinculo where activo)
    ) as desde
  ) x
  where exists (select 1 from public.wa_vinculo where activo)
    and x.desde < now() - interval '72 hours'
  on conflict (tipo, referencia) do nothing;

  -- Mandar a Slack lo que no salió todavía.
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'slack_alertas_webhook';
  if v_url is null then
    return 0;
  end if;

  for v_a in
    select id, tipo, texto from interno.wa_alerta
    where avisada_at is null and created_at > now() - interval '24 hours'
    order by id
  loop
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('text', format('[Tropero · %s] %s', v_a.tipo, v_a.texto)),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    update interno.wa_alerta set avisada_at = now() where id = v_a.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function interno.revisar_salud_wa() from public, anon, authenticated;
grant execute on function interno.revisar_salud_wa() to service_role;
revoke all on interno.wa_alerta from public, anon, authenticated;
grant select on interno.wa_alerta to service_role;

select cron.schedule('wa-salud', '*/5 * * * *', $$select interno.revisar_salud_wa()$$);
