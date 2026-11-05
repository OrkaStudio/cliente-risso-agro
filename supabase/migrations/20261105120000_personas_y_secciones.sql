-- Configuración → Personas (Lau, 05/11): el dueño ve todo; lo que ve cada
-- invitado lo decide el dueño, sección por sección, al invitarlo y después.
--
-- - `secciones` en miembro_empresa: null = todo (el dueño). Para los demás,
--   las secciones habilitadas: inicio, hacienda, campos, plata, agenda.
--   Configuración es sólo del dueño, nunca se habilita.
-- - La plata no se esconde sólo en el menú: la base la niega. Movimientos e
--   IVA sólo los lee y escribe quien tiene «plata» o «agenda» (las vistas de
--   plata son security_invoker, heredan esto).

alter table public.miembro_empresa add column secciones text[];
alter table public.invitacion add column secciones text[] not null default '{}';

-- Los invitados que ya estaban arrancan con la tabla propuesta (05/11); el dueño la cambia.
update public.miembro_empresa set secciones = case rol when 'vet' then array['hacienda'] else array['inicio', 'hacienda', 'campos'] end
where rol <> 'dueno';

alter table public.miembro_empresa add constraint miembro_secciones_validas
  check (secciones is null or secciones <@ array['inicio', 'hacienda', 'campos', 'plata', 'agenda']);
alter table public.miembro_empresa add constraint miembro_secciones_si_no_es_dueno
  check (rol = 'dueno' or secciones is not null);
alter table public.invitacion add constraint invitacion_secciones_validas
  check (secciones <@ array['inicio', 'hacienda', 'campos', 'plata', 'agenda']);

-- Las empresas de quien puede ver la plata (dueño, o con plata/agenda habilitada).
create or replace function public.auth_empresa_ids_plata()
returns setof uuid
language sql
stable
set search_path = public
as $$
  select empresa_id from miembro_empresa
  where user_id = auth.uid()
    and (rol = 'dueno' or secciones && array['plata', 'agenda'])
$$;

drop policy movimiento_financiero_mod on public.movimiento_financiero;
create policy movimiento_financiero_mod on public.movimiento_financiero for all
  using (empresa_id in (select public.auth_empresa_ids_plata()))
  with check (empresa_id in (select public.auth_empresa_ids_plata()));

drop policy movimiento_iva_linea_mod on public.movimiento_iva_linea;
create policy movimiento_iva_linea_mod on public.movimiento_iva_linea for all
  using (empresa_id in (select public.auth_empresa_ids_plata()))
  with check (empresa_id in (select public.auth_empresa_ids_plata()));

-- Invitar con lo que va a ver. La firma vieja (sin secciones) se reemplaza.
drop function public.crear_invitacion(text, text, text);
create or replace function public.crear_invitacion(p_celular text, p_nombre text, p_rol text, p_secciones text[])
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
  if coalesce(array_length(p_secciones, 1), 0) = 0 then
    raise exception 'Elegí al menos una sección que va a ver.';
  end if;
  -- Acepta el número local (10 dígitos) o con 54 / 549 adelante.
  if v_celular ~ '^\d{10}$' then v_celular := '549' || v_celular;
  elsif v_celular ~ '^54\d{10}$' then v_celular := '549' || right(v_celular, 10);
  end if;
  if v_celular !~ '^549\d{10}$' then
    raise exception 'El celular tiene que ser argentino, con la característica.';
  end if;
  insert into public.invitacion (empresa_id, celular, nombre, rol, secciones, invitado_por)
  values (v_empresa, v_celular, btrim(p_nombre), p_rol, p_secciones, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;
grant execute on function public.crear_invitacion(text, text, text, text[]) to authenticated;

-- Al aceptar, queda con las secciones que eligió el dueño.
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

  insert into public.miembro_empresa (empresa_id, user_id, rol, secciones)
  values (v_inv.empresa_id, v_user, v_inv.rol, v_inv.secciones);
  update public.invitacion
  set aceptada_at = now(), aceptada_por = v_user
  where id = v_inv.id;
  return v_inv.empresa_id;
end;
$$;

-- Las personas de la empresa (sólo el dueño): las que ya entran y las invitadas que faltan.
create or replace function public.personas_de_empresa()
returns table (
  user_id uuid,
  invitacion_id uuid,
  nombre text,
  celular text,
  rol text,
  secciones text[],
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
      -- El nombre con que lo invitó el dueño; si no hubo invitación (el dueño), el de su cuenta.
      coalesce(i.nombre, nullif(btrim(u.raw_user_meta_data ->> 'nombre'), '')),
      u.phone::text, m.rol, m.secciones, m.created_at, null::timestamptz, null::text,
      m.user_id = auth.uid()
    from public.miembro_empresa m
    join auth.users u on u.id = m.user_id
    left join public.invitacion i on i.aceptada_por = m.user_id and i.empresa_id = m.empresa_id
    where m.empresa_id = v_empresa
    union all
    select null::uuid, i.id, i.nombre, i.celular, i.rol, i.secciones, i.creada_at, i.vence_at, i.token, false
    from public.invitacion i
    where i.empresa_id = v_empresa and i.aceptada_at is null;
end;
$$;
grant execute on function public.personas_de_empresa() to authenticated;

-- El dueño cambia lo que ve alguien (nunca a sí mismo ni a otro dueño).
create or replace function public.cambiar_secciones(p_user uuid, p_secciones text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.miembro_empresa where user_id = auth.uid() and rol = 'dueno';
  if v_empresa is null then
    raise exception 'Sólo el dueño puede cambiar lo que ve cada uno.';
  end if;
  if coalesce(array_length(p_secciones, 1), 0) = 0 then
    raise exception 'Tiene que ver al menos una sección. Para que no entre más, sacale el acceso.';
  end if;
  update public.miembro_empresa
  set secciones = p_secciones
  where user_id = p_user and empresa_id = v_empresa and rol <> 'dueno';
  if not found then
    raise exception 'Esa persona no está en tu empresa.';
  end if;
end;
$$;
grant execute on function public.cambiar_secciones(uuid, text[]) to authenticated;

-- El dueño le saca el acceso a alguien (o cancela una invitación que no se usó).
create or replace function public.quitar_persona(p_user uuid, p_invitacion uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.miembro_empresa where user_id = auth.uid() and rol = 'dueno';
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
$$;
grant execute on function public.quitar_persona(uuid, uuid) to authenticated;
