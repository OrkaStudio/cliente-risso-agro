-- =====================================================================
--  A quien le sacan el acceso se le dice (Lau, 25/11)
--
--  Antes, al sacar a alguien se borraba su fila y nada más: si no le quedaba
--  otra cuenta, la app lo mandaba a «Creá tu campo» como a un productor nuevo.
--  Ahora queda registrado de qué cuenta lo sacaron, para que la app le diga
--  «Ya no tenés acceso a Risso Agro» (aunque entre días después). Si lo
--  vuelven a invitar y acepta, el registro se borra.
--  Cada uno ve sólo lo suyo (RLS) y lo marca como visto con su función.
-- =====================================================================

create table if not exists public.acceso_quitado (
  user_id    uuid not null references auth.users (id) on delete cascade,
  empresa_id uuid not null references public.empresa (id) on delete cascade,
  quitado_at timestamptz not null default now(),
  visto_at   timestamptz,
  primary key (user_id, empresa_id)
);
comment on table public.acceso_quitado is 'De qué cuentas sacaron a cada persona, para decírselo al entrar. visto_at: ya se lo dijimos.';
alter table public.acceso_quitado enable row level security;
create policy acceso_quitado_select on public.acceso_quitado for select using (user_id = (select auth.uid()));

-- Las cuentas de las que lo sacaron y todavía no se le dijo, con su nombre.
create or replace function public.accesos_quitados()
returns table (empresa_id uuid, nombre text, quitado_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select q.empresa_id, e.nombre, q.quitado_at
  from public.acceso_quitado q join public.empresa e on e.id = q.empresa_id
  where q.user_id = auth.uid() and q.visto_at is null
    and not exists (select 1 from public.miembro_empresa m where m.user_id = q.user_id and m.empresa_id = q.empresa_id)
  order by q.quitado_at desc
$$;

-- Ya se lo dijimos: no se repite.
create or replace function public.acceso_quitado_visto(p_empresa uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.acceso_quitado set visto_at = now() where user_id = auth.uid() and empresa_id = p_empresa
$$;

revoke all on function public.accesos_quitados() from public, anon;
revoke all on function public.acceso_quitado_visto(uuid) from public, anon;
grant execute on function public.accesos_quitados() to authenticated;
grant execute on function public.acceso_quitado_visto(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.quitar_persona(p_user uuid, p_invitacion uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
  v_n int;
begin
  v_empresa := public.empresa_propia();
  if v_empresa is null then
    raise exception 'Sólo el dueño puede sacar a alguien.';
  end if;
  if p_user is not null then
    delete from public.miembro_empresa where user_id = p_user and empresa_id = v_empresa and rol <> 'dueno';
    get diagnostics v_n = row_count;
    -- Se recuerda, para decírselo cuando vuelva a abrir la app (y no mandarlo a armar un campo).
    if v_n > 0 then
      insert into public.acceso_quitado (user_id, empresa_id) values (p_user, v_empresa)
      on conflict (user_id, empresa_id) do update set quitado_at = now(), visto_at = null;
    end if;
  else
    delete from public.invitacion where id = p_invitacion and empresa_id = v_empresa and aceptada_at is null;
    get diagnostics v_n = row_count;
  end if;
  if v_n = 0 then
    raise exception 'Esa persona no está en tu empresa.';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aceptar_invitacion(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user    uuid := auth.uid();
  v_celular text;
  v_inv     public.invitacion;
begin
  if v_user is null then
    raise exception 'Tenés que entrar con tu celular para aceptar la invitación.';
  end if;
  select phone into v_celular from auth.users where id = v_user;

  select * into v_inv from public.invitacion where token = p_token for update;
  if v_inv.id is null then
    raise exception 'La invitación no existe.';
  end if;
  if v_inv.aceptada_at is not null then
    raise exception 'La invitación ya se usó.';
  end if;
  if v_inv.vence_at <= now() then
    raise exception 'La invitación venció. Pedí que te manden otra.';
  end if;
  if v_inv.celular is distinct from v_celular then
    raise exception 'La invitación es para otro número.';
  end if;
  if v_inv.rechazada_at is not null then
    raise exception 'Esta invitación la rechazaste. Pedí que te manden otra.';
  end if;
  -- Puede estar en otras cuentas (un veterinario que atiende varios campos); en ésta, una sola vez.
  if exists (select 1 from public.miembro_empresa where user_id = v_user and empresa_id = v_inv.empresa_id) then
    raise exception 'Ya estás en esta cuenta.';
  end if;

  insert into public.miembro_empresa (empresa_id, user_id, rol, niveles, acceso)
  values (v_inv.empresa_id, v_user, v_inv.rol, v_inv.niveles, v_inv.acceso);
  -- Si lo habían sacado de esta cuenta y lo vuelven a invitar, ya no se le dice que no tiene acceso.
  delete from public.acceso_quitado where user_id = v_user and empresa_id = v_inv.empresa_id;
  update public.invitacion
  set aceptada_at = now(), aceptada_por = v_user
  where id = v_inv.id;
  return v_inv.empresa_id;
end;
$function$;
