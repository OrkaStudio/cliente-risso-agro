-- Una persona en varias cuentas (Lau, 14/11; spec del cerebro
-- clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona,
-- «Una persona en varios campos»).
--
-- Un ingeniero o un veterinario que atiende varios campos usa el mismo celular,
-- la misma app y el mismo bot para todos. Hasta ahora una persona pertenecía a
-- una sola empresa. Desde acá:
--
-- · Puede estar invitada en varias cuentas; su propio campo (dueño), uno solo.
-- · La cuenta con la que trabaja se manda en cada pedido (encabezado
--   `x-troppero-cuenta`; la app en cada request, el bot en cada transacción) y
--   la base la hace cumplir: todos los permisos pasan por auth_empresa_ids /
--   empresas_donde / empresas_como_dueno, que se quedan sólo con esa cuenta.
--   Así ninguna consulta mezcla datos de dos clientes aunque se olvide de
--   filtrar por empresa. Sin encabezado (procesos internos) rige lo de antes:
--   todas sus cuentas.
-- · Las funciones del dueño (invitar, personas, baja, mapa…) actúan sobre su
--   propio campo y sólo si la cuenta pedida es ésa.

-- ── Varias membresías ────────────────────────────────────────────────────
drop index if exists public.uq_miembro_empresa_un_usuario_una_empresa;
create unique index if not exists miembro_un_campo_propio on public.miembro_empresa (user_id) where rol = 'dueno';

-- ── La cuenta pedida ─────────────────────────────────────────────────────
-- Un valor que no es un uuid se ignora (no rompe la consulta) y uno de una
-- cuenta ajena no da acceso a nada: siempre se cruza con las membresías.
create or replace function public.cuenta_pedida()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case when h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then h::uuid end
  from (select nullif(current_setting('request.headers', true), '')::json ->> 'x-troppero-cuenta' as h) s
$$;

create or replace function public.auth_empresa_ids()
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select empresa_id from miembro_empresa
  where user_id = auth.uid()
    and (public.cuenta_pedida() is null or empresa_id = public.cuenta_pedida())
$$;

create or replace function public.empresas_donde(p_seccion text, p_niveles text[])
returns setof uuid
language sql
stable security definer
set search_path to ''
as $$
  select m.empresa_id from public.miembro_empresa m
  where m.user_id = auth.uid()
    and (public.cuenta_pedida() is null or m.empresa_id = public.cuenta_pedida())
    and case when m.rol = 'dueno' then 'carga' else coalesce(m.niveles ->> p_seccion, 'no') end = any(p_niveles)
$$;

create or replace function public.empresas_como_dueno()
returns setof uuid
language sql
stable security definer
set search_path to ''
as $$
  select empresa_id from public.miembro_empresa
  where user_id = auth.uid() and rol = 'dueno'
    and (public.cuenta_pedida() is null or empresa_id = public.cuenta_pedida())
$$;

-- El campo propio, si es la cuenta pedida (a lo sumo uno: miembro_un_campo_propio).
create or replace function public.empresa_propia()
returns uuid
language sql
stable security definer
set search_path to ''
as $$
  select empresa_id from public.miembro_empresa
  where user_id = auth.uid() and rol = 'dueno'
    and (public.cuenta_pedida() is null or empresa_id = public.cuenta_pedida())
$$;
revoke all on function public.empresa_propia() from public, anon;
grant execute on function public.empresa_propia() to authenticated;

-- ── Las cuentas de quien entra (para elegir y cambiar) ──────────────────
-- No depende de la cuenta pedida: lista todas las suyas.
create or replace function public.mis_cuentas()
returns table (
  empresa_id uuid,
  nombre text,
  rol text,
  niveles jsonb,
  acceso text,
  onboarding_completo_at timestamptz,
  mapa_completo_at timestamptz,
  created_at timestamptz
)
language sql
stable security definer
set search_path to ''
as $$
  select m.empresa_id, e.nombre, m.rol, m.niveles, m.acceso, e.onboarding_completo_at, e.mapa_completo_at, e.created_at
  from public.miembro_empresa m
  join public.empresa e on e.id = m.empresa_id
  where m.user_id = auth.uid()
  order by lower(e.nombre), m.empresa_id
$$;
revoke all on function public.mis_cuentas() from public, anon;
grant execute on function public.mis_cuentas() to authenticated;

-- ── Invitaciones ─────────────────────────────────────────────────────────
-- Quien ya usa Troppero y recibe una invitación «Sólo por WhatsApp» la acepta o
-- la rechaza en el bot; el dueño ve si la rechazó.
alter table public.invitacion add column if not exists rechazada_at timestamptz;

create or replace function public.rechazar_invitacion(p_token text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_celular text;
begin
  select phone into v_celular from auth.users where id = auth.uid();
  update public.invitacion set rechazada_at = now()
  where token = p_token and celular = v_celular and aceptada_at is null and rechazada_at is null;
  if not found then
    raise exception 'La invitación no está disponible.';
  end if;
end;
$$;
revoke all on function public.rechazar_invitacion(text) from public, anon;
grant execute on function public.rechazar_invitacion(text) to authenticated;

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
  update public.invitacion
  set aceptada_at = now(), aceptada_por = v_user
  where id = v_inv.id;
  return v_inv.empresa_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crear_empresa_con_dueno(p_nombre text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_nombre  text := btrim(coalesce(p_nombre, ''));
  v_empresa uuid;
begin
  if v_user is null then
    raise exception 'Tenés que iniciar sesión para crear una empresa.';
  end if;

  -- Puede estar invitado en otras cuentas; la de su propio campo, una sola.
  if exists (select 1 from miembro_empresa where user_id = v_user and rol = 'dueno') then
    raise exception 'Ya tenés la cuenta de tu campo.';
  end if;

  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'El nombre de la empresa debe tener entre 2 y 80 caracteres.';
  end if;

  insert into empresa (nombre) values (v_nombre) returning id into v_empresa;

  insert into miembro_empresa (empresa_id, user_id, rol)
  values (v_empresa, v_user, 'dueno');

  return v_empresa;
end;
$function$;

CREATE OR REPLACE FUNCTION public.terminar_mapa()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
  v_falta   text;
  v_cuando  timestamptz;
begin
  v_empresa := public.empresa_propia();
  if v_empresa is null then
    raise exception 'Sólo el dueño termina el mapa de su empresa.';
  end if;

  select c.nombre into v_falta
  from public.campo c
  where c.empresa_id = v_empresa
    and (c.contorno is null
         or exists (select 1 from public.potrero p where p.campo_id = c.id and p.poligono is null))
  limit 1;
  if v_falta is not null then
    raise exception 'Falta terminar % en el mapa.', v_falta;
  end if;

  update public.empresa
  set mapa_completo_at = coalesce(mapa_completo_at, now())
  where id = v_empresa
  returning mapa_completo_at into v_cuando;
  return v_cuando;
end;
$function$;

CREATE OR REPLACE FUNCTION public.terminar_onboarding()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
  v_cuando  timestamptz;
begin
  v_empresa := public.empresa_propia();
  if v_empresa is null then
    raise exception 'Sólo el dueño termina el onboarding de su empresa.';
  end if;
  update public.empresa
  set onboarding_completo_at = coalesce(onboarding_completo_at, now())
  where id = v_empresa
  returning onboarding_completo_at into v_cuando;
  return v_cuando;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pedir_baja()
 RETURNS baja
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
  v_baja public.baja;
begin
  v_empresa := public.empresa_propia();
  if v_empresa is null then
    raise exception 'Sólo el dueño puede dar de baja Troppero.';
  end if;
  select * into v_baja from public.baja where empresa_id = v_empresa and deshecha_at is null;
  if v_baja.id is not null then
    return v_baja;
  end if;
  insert into public.baja (empresa_id, pedida_por) values (v_empresa, auth.uid()) returning * into v_baja;
  return v_baja;
end;
$function$;

CREATE OR REPLACE FUNCTION public.deshacer_baja()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
begin
  v_empresa := public.empresa_propia();
  if v_empresa is null then
    raise exception 'Sólo el dueño puede deshacer la baja.';
  end if;
  update public.baja set deshecha_at = now()
  where empresa_id = v_empresa and deshecha_at is null and borrar_desde > now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.quitar_persona(p_user uuid, p_invitacion uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
begin
  v_empresa := public.empresa_propia();
  if v_empresa is null then
    raise exception 'Sólo el dueño puede sacar a alguien.';
  end if;
  if p_user is not null then
    delete from public.miembro_empresa where user_id = p_user and empresa_id = v_empresa and rol <> 'dueno';
  else
    delete from public.invitacion where id = p_invitacion and empresa_id = v_empresa and aceptada_at is null;
  end if;
  if not found then
    raise exception 'Esa persona no está en tu empresa.';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_niveles(p_user uuid, p_niveles jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
  v_acceso text;
begin
  v_empresa := public.empresa_propia();
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
$function$;

CREATE OR REPLACE FUNCTION public.crear_invitacion(p_celular text, p_nombre text, p_rol text, p_niveles jsonb, p_acceso text DEFAULT 'app'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
  v_celular text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_token   text;
begin
  v_empresa := public.empresa_propia();
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
  -- Ya está en la cuenta (también el dueño mismo): no se lo invita de nuevo.
  if exists (select 1 from public.miembro_empresa m join auth.users u on u.id = m.user_id
             where m.empresa_id = v_empresa and u.phone = v_celular) then
    raise exception 'Esa persona ya está en tu cuenta. Para cambiar lo que ve, tocala en la lista.';
  end if;
  insert into public.invitacion (empresa_id, celular, nombre, rol, niveles, acceso, invitado_por)
  values (v_empresa, v_celular, btrim(p_nombre), p_rol, p_niveles, p_acceso, auth.uid())
  returning token into v_token;
  return v_token;
end;
$function$;



drop function public.personas_de_empresa();
CREATE FUNCTION public.personas_de_empresa()
 RETURNS TABLE(user_id uuid, invitacion_id uuid, nombre text, celular text, rol text, niveles jsonb, acceso text, desde timestamp with time zone, vence_at timestamp with time zone, token text, soy_yo boolean, rechazada boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
begin
  v_empresa := public.empresa_propia();
  if v_empresa is null then
    raise exception 'Sólo el dueño ve las personas de la empresa.';
  end if;
  return query
    select m.user_id, null::uuid,
      coalesce(i.nombre, nullif(btrim(u.raw_user_meta_data ->> 'nombre'), '')),
      u.phone::text, m.rol, m.niveles, m.acceso, m.created_at, null::timestamptz, null::text,
      m.user_id = auth.uid(), false
    from public.miembro_empresa m
    join auth.users u on u.id = m.user_id
    -- Si lo sacaron y lo volvieron a invitar hay dos invitaciones aceptadas: vale la última.
    left join lateral (
      select x.nombre from public.invitacion x
      where x.aceptada_por = m.user_id and x.empresa_id = m.empresa_id
      order by x.aceptada_at desc limit 1
    ) i on true
    where m.empresa_id = v_empresa
    union all
    select null::uuid, i.id, i.nombre, i.celular, i.rol, i.niveles, i.acceso, i.creada_at, i.vence_at, i.token, false, i.rechazada_at is not null
    from public.invitacion i
    where i.empresa_id = v_empresa and i.aceptada_at is null;
end;
$function$;revoke all on function public.personas_de_empresa() from public, anon;
grant execute on function public.personas_de_empresa() to authenticated;

-- «Cargó Juan»: si lo sacaron y lo volvieron a invitar, vale la última invitación.
create or replace function public.nombres_de_empresa()
returns table (user_id uuid, nombre text, rol text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
    coalesce(i.nombre, nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'nombre', u.raw_user_meta_data ->> 'apellido')), ''), 'Alguien'),
    m.rol
  from public.miembro_empresa m
  join auth.users u on u.id = m.user_id
  left join lateral (
    select x.nombre from public.invitacion x
    where x.aceptada_por = m.user_id and x.empresa_id = m.empresa_id
    order by x.aceptada_at desc limit 1
  ) i on true
  where m.empresa_id in (select public.auth_empresa_ids())
$$;
