-- Acceso «Solo por WhatsApp» (propuesta de Lau, 13/11; spec del cerebro
-- clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona).
--
-- Para el encargado o el veterinario que se contrata de vez en cuando: no usa
-- la app, manda por WhatsApp. Al invitarlo, el dueño elige cómo va a usar
-- Troppero; si es por WhatsApp, en cada sección sólo «No ve» o «Solo manda».
-- El bot crea su cuenta y la vincula con su primer mensaje (rama del bot).

alter table public.invitacion add column acceso text not null default 'app' check (acceso in ('app', 'whatsapp'));
alter table public.miembro_empresa add column acceso text not null default 'app' check (acceso in ('app', 'whatsapp'));

-- Por WhatsApp sólo se manda: ningún nivel de ver.
create or replace function public.niveles_para_acceso(p_niveles jsonb, p_acceso text)
returns boolean
language sql
immutable
as $$
  select p_acceso = 'app' or not exists (
    select 1 from jsonb_each_text(coalesce(p_niveles, '{}')) e where e.value not in ('no', 'solo_manda')
  )
$$;
alter table public.invitacion add constraint invitacion_niveles_del_acceso check (public.niveles_para_acceso(niveles, acceso));
alter table public.miembro_empresa add constraint miembro_niveles_del_acceso check (rol = 'dueno' or public.niveles_para_acceso(niveles, acceso));

drop function public.crear_invitacion(text, text, text, jsonb);
create function public.crear_invitacion(p_celular text, p_nombre text, p_rol text, p_niveles jsonb, p_acceso text default 'app')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_celular text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_token   text;
begin
  select empresa_id into v_empresa
  from public.miembro_empresa
  where user_id = auth.uid() and rol = 'dueno';
  if v_empresa is null then
    raise exception 'Sólo el dueño de la empresa puede invitar.';
  end if;
  if coalesce(p_acceso, '') not in ('app', 'whatsapp') then
    raise exception 'Elegí cómo va a usar Troppero: en la app o sólo por WhatsApp.';
  end if;
  if not public.niveles_validos(coalesce(p_niveles, '{}')) or not public.niveles_alcanzan(coalesce(p_niveles, '{}')) then
    raise exception 'Elegí al menos una sección que va a ver o cargar.';
  end if;
  if not public.niveles_para_acceso(p_niveles, p_acceso) then
    raise exception 'Por WhatsApp sólo se manda: en cada sección, «No ve» o «Solo manda».';
  end if;
  -- Acepta el número local (10 dígitos) o con 54 / 549 adelante.
  if v_celular ~ '^\d{10}$' then v_celular := '549' || v_celular;
  elsif v_celular ~ '^54\d{10}$' then v_celular := '549' || right(v_celular, 10);
  end if;
  if v_celular !~ '^549\d{10}$' then
    raise exception 'El celular tiene que ser argentino, con la característica.';
  end if;
  insert into public.invitacion (empresa_id, celular, nombre, rol, niveles, acceso, invitado_por)
  values (v_empresa, v_celular, btrim(p_nombre), p_rol, p_niveles, p_acceso, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;
revoke all on function public.crear_invitacion(text, text, text, jsonb, text) from public, anon;
grant execute on function public.crear_invitacion(text, text, text, jsonb, text) to authenticated;

-- Al aceptar, queda con el acceso que eligió el dueño.
create or replace function public.aceptar_invitacion(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if exists (select 1 from public.miembro_empresa where user_id = v_user) then
    raise exception 'Tu usuario ya pertenece a una empresa.';
  end if;

  insert into public.miembro_empresa (empresa_id, user_id, rol, niveles, acceso)
  values (v_inv.empresa_id, v_user, v_inv.rol, v_inv.niveles, v_inv.acceso);
  update public.invitacion
  set aceptada_at = now(), aceptada_por = v_user
  where id = v_inv.id;
  return v_inv.empresa_id;
end;
$$;

-- Personas: cómo usa Troppero cada uno.
drop function public.personas_de_empresa();
create function public.personas_de_empresa()
returns table (
  user_id uuid,
  invitacion_id uuid,
  nombre text,
  celular text,
  rol text,
  niveles jsonb,
  acceso text,
  desde timestamptz,
  vence_at timestamptz,
  token text,
  soy_yo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select m.empresa_id into v_empresa
  from public.miembro_empresa m
  where m.user_id = auth.uid() and m.rol = 'dueno';
  if v_empresa is null then
    raise exception 'Sólo el dueño ve las personas de la empresa.';
  end if;
  return query
    select m.user_id, null::uuid,
      coalesce(i.nombre, nullif(btrim(u.raw_user_meta_data ->> 'nombre'), '')),
      u.phone::text, m.rol, m.niveles, m.acceso, m.created_at, null::timestamptz, null::text,
      m.user_id = auth.uid()
    from public.miembro_empresa m
    join auth.users u on u.id = m.user_id
    left join public.invitacion i on i.aceptada_por = m.user_id and i.empresa_id = m.empresa_id
    where m.empresa_id = v_empresa
    union all
    select null::uuid, i.id, i.nombre, i.celular, i.rol, i.niveles, i.acceso, i.creada_at, i.vence_at, i.token, false
    from public.invitacion i
    where i.empresa_id = v_empresa and i.aceptada_at is null;
end;
$$;
revoke all on function public.personas_de_empresa() from public, anon;
grant execute on function public.personas_de_empresa() to authenticated;

-- El dueño cambia los niveles respetando el acceso de esa persona.
create or replace function public.cambiar_niveles(p_user uuid, p_niveles jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_acceso text;
begin
  select empresa_id into v_empresa from public.miembro_empresa where user_id = auth.uid() and rol = 'dueno';
  if v_empresa is null then
    raise exception 'Sólo el dueño puede cambiar lo que ve cada uno.';
  end if;
  if not public.niveles_validos(coalesce(p_niveles, '{}')) or not public.niveles_alcanzan(coalesce(p_niveles, '{}')) then
    raise exception 'Tiene que ver o cargar al menos una sección. Para que no entre más, sacale el acceso.';
  end if;
  select acceso into v_acceso from public.miembro_empresa where user_id = p_user and empresa_id = v_empresa and rol <> 'dueno';
  if v_acceso is null then
    raise exception 'Esa persona no está en tu empresa.';
  end if;
  if not public.niveles_para_acceso(p_niveles, v_acceso) then
    raise exception 'Por WhatsApp sólo se manda: en cada sección, «No ve» o «Solo manda».';
  end if;
  update public.miembro_empresa set niveles = p_niveles where user_id = p_user and empresa_id = v_empresa;
end;
$$;

-- La invitación dice si es por WhatsApp (el link de una invitación así lleva al bot, no a la app).
drop function public.invitacion_por_token(text);
create function public.invitacion_por_token(p_token text)
returns table (
  empresa text,
  invita text,
  nombre text,
  rol text,
  celular text,
  vencida boolean,
  usada boolean,
  niveles jsonb,
  acceso text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    e.nombre,
    coalesce(nullif(u.raw_user_meta_data ->> 'nombre', ''), 'El dueño'),
    i.nombre,
    i.rol,
    i.celular,
    i.vence_at <= now(),
    i.aceptada_at is not null,
    i.niveles,
    i.acceso
  from public.invitacion i
  join public.empresa e on e.id = i.empresa_id
  left join auth.users u on u.id = i.invitado_por
  where i.token = p_token
$$;
revoke execute on function public.invitacion_por_token(text) from public;
grant execute on function public.invitacion_por_token(text) to anon, authenticated;
