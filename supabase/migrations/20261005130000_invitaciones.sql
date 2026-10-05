-- ---------------------------------------------------------------------
-- A4 · Te invitaron. El dueño invita a alguien por su celular (Configuración
-- → Personas, módulo 12) y le llega un link /invitacion/<token>. Quien abre
-- el link ve quién lo invita, a qué empresa y con qué rol, entra con un código
-- al número invitado y queda en la empresa sin pasar por el onboarding.
--
-- Reglas:
-- - La invitación vence a los 7 días y se usa una sola vez.
-- - Se acepta sólo con una sesión del MISMO celular invitado: el link solo no
--   alcanza (el código por WhatsApp prueba que el número es suyo).
-- - Una persona pertenece a una sola empresa (uq_miembro_empresa_un_usuario_una_empresa).
-- - Los permisos por rol (qué ve cada uno) son del módulo «Estados y permisos»:
--   acá sólo se guarda el rol.
-- ---------------------------------------------------------------------

create table public.invitacion (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  empresa_id    uuid not null references public.empresa (id) on delete cascade,
  -- Como lo guarda Supabase Auth: sin «+» (5492241634410).
  celular       text not null check (celular ~ '^549\d{10}$'),
  nombre        text not null check (length(btrim(nombre)) between 2 and 80),
  rol           text not null check (rol in ('encargado', 'peon', 'vet')),
  invitado_por  uuid not null references auth.users (id),
  creada_at     timestamptz not null default now(),
  vence_at      timestamptz not null default now() + interval '7 days',
  aceptada_at   timestamptz,
  aceptada_por  uuid references auth.users (id)
);
create index idx_invitacion_empresa on public.invitacion (empresa_id);
create index idx_invitacion_celular on public.invitacion (celular) where aceptada_at is null;

alter table public.invitacion enable row level security;

-- El dueño ve y borra las invitaciones de su empresa. Nadie más las lee
-- directo: el invitado pasa por invitacion_por_token().
create policy invitacion_dueno_select on public.invitacion for select to authenticated
  using (empresa_id in (
    select empresa_id from public.miembro_empresa where user_id = (select auth.uid()) and rol = 'dueno'
  ));
create policy invitacion_dueno_delete on public.invitacion for delete to authenticated
  using (empresa_id in (
    select empresa_id from public.miembro_empresa where user_id = (select auth.uid()) and rol = 'dueno'
  ));

-- El dueño invita. Devuelve el token para armar el link.
create or replace function public.crear_invitacion(p_celular text, p_nombre text, p_rol text)
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
  -- Acepta el número local (10 dígitos) o con 54 / 549 adelante.
  if v_celular ~ '^\d{10}$' then v_celular := '549' || v_celular;
  elsif v_celular ~ '^54\d{10}$' then v_celular := '549' || right(v_celular, 10);
  end if;
  if v_celular !~ '^549\d{10}$' then
    raise exception 'El celular tiene que ser argentino, con la característica.';
  end if;
  insert into public.invitacion (empresa_id, celular, nombre, rol, invitado_por)
  values (v_empresa, v_celular, btrim(p_nombre), p_rol, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;
revoke execute on function public.crear_invitacion(text, text, text) from public, anon;
grant execute on function public.crear_invitacion(text, text, text) to authenticated;

-- Lo que muestra A4 al abrir el link, sin sesión. Sólo lo que va en pantalla:
-- quién invita, la empresa, el nombre y el rol, el número enmascarado y si venció.
create or replace function public.invitacion_por_token(p_token text)
returns table (
  empresa text,
  invita text,
  nombre text,
  rol text,
  celular text,
  vencida boolean,
  usada boolean
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
    i.aceptada_at is not null
  from public.invitacion i
  join public.empresa e on e.id = i.empresa_id
  left join auth.users u on u.id = i.invitado_por
  where i.token = p_token
$$;
revoke execute on function public.invitacion_por_token(text) from public;
grant execute on function public.invitacion_por_token(text) to anon, authenticated;

-- El invitado, ya con sesión de SU celular, acepta: queda en la empresa con su rol.
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

  insert into public.miembro_empresa (empresa_id, user_id, rol)
  values (v_inv.empresa_id, v_user, v_inv.rol);
  update public.invitacion
  set aceptada_at = now(), aceptada_por = v_user
  where id = v_inv.id;
  return v_inv.empresa_id;
end;
$$;
revoke execute on function public.aceptar_invitacion(text) from public, anon;
grant execute on function public.aceptar_invitacion(text) to authenticated;
