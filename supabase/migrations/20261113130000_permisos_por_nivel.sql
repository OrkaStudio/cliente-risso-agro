-- Permisos por persona, entrega 2 (Lau, 13/11; spec del cerebro
-- clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona).
--
-- Hasta acá la base sólo restringía la plata: el resto de las tablas del
-- productor lo leía, cambiaba y borraba cualquier miembro, aunque el dueño no le
-- hubiera habilitado esa sección. Ahora cada sección tiene un nivel por persona:
--
--   no          no ve nada de la sección
--   ve          lee, no cambia nada
--   carga       lee, carga, corrige y borra
--   solo_manda  carga (por WhatsApp) y ve sólo lo que cargó él
--
-- Secciones con permiso: hacienda, campos y plata (la Agenda son montos: va con
-- la plata). El Inicio lo tiene todo el mundo y muestra lo que cada uno ve.
-- El dueño tiene todo, y además lo que no se delega: crear y borrar campos y
-- potreros, sus dibujos y nombres, invitar, Configuración y la baja.
--
-- El bot de WhatsApp lee y escribe como el usuario vinculado (comoUsuario), así
-- que estas mismas reglas valen para él.

-- ---------------------------------------------------------------- Niveles

create or replace function public.niveles_validos(p jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each_text(p) e
      where e.key not in ('hacienda', 'campos', 'plata')
         or e.value not in ('no', 've', 'carga', 'solo_manda')
    )
$$;

alter table public.miembro_empresa add column niveles jsonb;
alter table public.invitacion add column niveles jsonb not null default '{}';

-- Lo que ya había: una sección habilitada era ver y cargar todo; la Agenda sola era ver la plata.
update public.miembro_empresa set niveles = jsonb_build_object(
  'hacienda', case when 'hacienda' = any(secciones) then 'carga' else 'no' end,
  'campos', case when 'campos' = any(secciones) then 'carga' else 'no' end,
  'plata', case when 'plata' = any(secciones) then 'carga' when 'agenda' = any(secciones) then 've' else 'no' end)
where rol <> 'dueno';
update public.invitacion set niveles = jsonb_build_object(
  'hacienda', case when 'hacienda' = any(secciones) then 'carga' else 'no' end,
  'campos', case when 'campos' = any(secciones) then 'carga' else 'no' end,
  'plata', case when 'plata' = any(secciones) then 'carga' when 'agenda' = any(secciones) then 've' else 'no' end);

alter table public.miembro_empresa add constraint miembro_niveles_validos
  check (niveles is null or public.niveles_validos(niveles));
-- El dueño no tiene niveles (tiene todo); los demás, siempre.
alter table public.miembro_empresa add constraint miembro_niveles_si_no_es_dueno
  check ((rol = 'dueno') = (niveles is null));
alter table public.invitacion add constraint invitacion_niveles_validos
  check (public.niveles_validos(niveles));

-- La lista de secciones queda reemplazada por los niveles.
alter table public.miembro_empresa drop constraint miembro_secciones_validas;
alter table public.miembro_empresa drop constraint miembro_secciones_si_no_es_dueno;
alter table public.miembro_empresa drop column secciones;
alter table public.invitacion drop constraint invitacion_secciones_validas;
alter table public.invitacion drop column secciones;

-- Las empresas donde quien consulta tiene alguno de esos niveles en la sección.
-- El dueño cuenta como «carga». Se usa dentro de las políticas como
-- `empresa_id in (select …)`: se evalúa una vez por consulta, no por fila.
create or replace function public.empresas_donde(p_seccion text, p_niveles text[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.empresa_id from public.miembro_empresa m
  where m.user_id = auth.uid()
    and case when m.rol = 'dueno' then 'carga' else coalesce(m.niveles ->> p_seccion, 'no') end = any(p_niveles)
$$;
revoke all on function public.empresas_donde(text, text[]) from public, anon;
grant execute on function public.empresas_donde(text, text[]) to authenticated;

create or replace function public.empresas_como_dueno()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select empresa_id from public.miembro_empresa where user_id = auth.uid() and rol = 'dueno'
$$;
revoke all on function public.empresas_como_dueno() from public, anon;
grant execute on function public.empresas_como_dueno() to authenticated;

-- La de siempre para la plata, ahora con los niveles (la usan otras funciones).
create or replace function public.auth_empresa_ids_plata()
returns setof uuid
language sql
stable
set search_path = public
as $$
  select public.empresas_donde('plata', array['ve', 'carga'])
$$;

-- ---------------------------------------------------------------- Autor de lo cargado

-- Quién cargó cada cosa (el dueño lo ve: «Cargó Juan · por WhatsApp»), y la
-- base de «Solo manda», que ve sólo lo suyo. Lo cargado antes queda sin autor.
alter table public.animal add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.caravana add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.lote add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.salida_pendiente add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.lluvia add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.observacion_potrero add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.infraestructura add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.movimiento_iva_linea add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

-- ---------------------------------------------------------------- Políticas por sección

do $$
declare
  t record;
  ver text;
  propio text;
begin
  for t in
    select * from (values
      -- tabla,                 sección,    tiene autor, sólo leer y agregar
      ('animal',               'hacienda', true,  false),
      ('caravana',             'hacienda', true,  false),
      ('evento',               'hacienda', true,  true),
      ('lote',                 'hacienda', true,  false),
      ('lote_potrero',         'hacienda', false, false),
      ('salida_candidato',     'hacienda', false, false),
      ('salida_pendiente',     'hacienda', true,  false),
      ('lluvia',               'campos',   true,  false),
      ('recorrida',            'campos',   true,  false),
      ('observacion_potrero',  'campos',   true,  false),
      ('labor_potrero',        'campos',   true,  false),
      ('marca_senal',          'campos',   true,  false),
      ('infraestructura',      'campos',   true,  false),
      ('movimiento_financiero','plata',    true,  false),
      ('movimiento_iva_linea', 'plata',    true,  false)
    ) as x(tabla, seccion, con_autor, solo_agregar)
  loop
    -- Fuera las políticas de antes (una por empresa, para todo).
    execute (
      select coalesce(string_agg(format('drop policy %I on public.%I;', policyname, t.tabla), ' '), '')
      from pg_policies where schemaname = 'public' and tablename = t.tabla
    );

    ver := format('empresa_id in (select public.empresas_donde(%L, array[''ve'', ''carga'']))', t.seccion);
    -- «Solo manda» ve y corrige sólo lo que cargó él.
    propio := case when t.con_autor
      then format(' or (created_by = (select auth.uid()) and empresa_id in (select public.empresas_donde(%L, array[''solo_manda''])))', t.seccion)
      else '' end;

    execute format('create policy %I on public.%I for select to authenticated using (%s%s)',
      t.tabla || '_ver', t.tabla, ver, propio);
    execute format('create policy %I on public.%I for insert to authenticated with check (empresa_id in (select public.empresas_donde(%L, array[''carga'', ''solo_manda''])))',
      t.tabla || '_cargar', t.tabla, t.seccion);
    if not t.solo_agregar then
      execute format('create policy %I on public.%I for update to authenticated using (empresa_id in (select public.empresas_donde(%L, array[''carga'']))%s) with check (empresa_id in (select public.empresas_donde(%L, array[''carga'']))%s)',
        t.tabla || '_corregir', t.tabla, t.seccion, propio, t.seccion, propio);
      execute format('create policy %I on public.%I for delete to authenticated using (empresa_id in (select public.empresas_donde(%L, array[''carga''])))',
        t.tabla || '_borrar', t.tabla, t.seccion);
    end if;
  end loop;
end
$$;

-- Campos, potreros y establecimientos: los leen todos (Hacienda necesita los
-- nombres para ubicar los animales; el bot, para entender «el 3A»). Crearlos y
-- borrarlos es del dueño; el estado de un potrero lo corrige quien carga Campos.
drop policy campo_mod on public.campo;
create policy campo_ver on public.campo for select to authenticated
  using (empresa_id in (select public.auth_empresa_ids()));
create policy campo_dueno on public.campo for all to authenticated
  using (empresa_id in (select public.empresas_como_dueno()))
  with check (empresa_id in (select public.empresas_como_dueno()));

drop policy establecimiento_mod on public.establecimiento;
create policy establecimiento_ver on public.establecimiento for select to authenticated
  using (empresa_id in (select public.auth_empresa_ids()));
create policy establecimiento_dueno on public.establecimiento for all to authenticated
  using (empresa_id in (select public.empresas_como_dueno()))
  with check (empresa_id in (select public.empresas_como_dueno()));

drop policy potrero_mod on public.potrero;
create policy potrero_ver on public.potrero for select to authenticated
  using (empresa_id in (select public.auth_empresa_ids()));
create policy potrero_dueno on public.potrero for all to authenticated
  using (empresa_id in (select public.empresas_como_dueno()))
  with check (empresa_id in (select public.empresas_como_dueno()));
create policy potrero_corregir on public.potrero for update to authenticated
  using (empresa_id in (select public.empresas_donde('campos', array['carga'])))
  with check (empresa_id in (select public.empresas_donde('campos', array['carga'])));

-- Aunque pueda corregir el estado, el dibujo, el nombre y el tamaño de un
-- potrero los cambia sólo el dueño.
create or replace function public.potrero_dibujo_del_dueno()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or new.empresa_id in (select public.empresas_como_dueno()) then
    return new;
  end if;
  if new.poligono is distinct from old.poligono
     or new.nombre is distinct from old.nombre
     or new.hectareas is distinct from old.hectareas
     or new.campo_id is distinct from old.campo_id then
    raise exception 'El dibujo, el nombre y el tamaño de los potreros los cambia el dueño.';
  end if;
  return new;
end;
$$;
create trigger potrero_dibujo_del_dueno before update on public.potrero
  for each row execute function public.potrero_dibujo_del_dueno();

-- ---------------------------------------------------------------- Invitar y cambiar niveles

-- Al menos una sección con algo distinto de «no ve» (si no, no tiene sentido invitarlo).
create or replace function public.niveles_alcanzan(p jsonb)
returns boolean
language sql
immutable
as $$
  select exists (select 1 from jsonb_each_text(p) e where e.value <> 'no')
$$;

drop function public.crear_invitacion(text, text, text, text[]);
create function public.crear_invitacion(p_celular text, p_nombre text, p_rol text, p_niveles jsonb)
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
  if not public.niveles_validos(coalesce(p_niveles, '{}')) or not public.niveles_alcanzan(coalesce(p_niveles, '{}')) then
    raise exception 'Elegí al menos una sección que va a ver o cargar.';
  end if;
  -- Acepta el número local (10 dígitos) o con 54 / 549 adelante.
  if v_celular ~ '^\d{10}$' then v_celular := '549' || v_celular;
  elsif v_celular ~ '^54\d{10}$' then v_celular := '549' || right(v_celular, 10);
  end if;
  if v_celular !~ '^549\d{10}$' then
    raise exception 'El celular tiene que ser argentino, con la característica.';
  end if;
  insert into public.invitacion (empresa_id, celular, nombre, rol, niveles, invitado_por)
  values (v_empresa, v_celular, btrim(p_nombre), p_rol, p_niveles, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;
revoke all on function public.crear_invitacion(text, text, text, jsonb) from public, anon;
grant execute on function public.crear_invitacion(text, text, text, jsonb) to authenticated;

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

  insert into public.miembro_empresa (empresa_id, user_id, rol, niveles)
  values (v_inv.empresa_id, v_user, v_inv.rol, v_inv.niveles);
  update public.invitacion
  set aceptada_at = now(), aceptada_por = v_user
  where id = v_inv.id;
  return v_inv.empresa_id;
end;
$$;

drop function public.cambiar_secciones(uuid, text[]);
create function public.cambiar_niveles(p_user uuid, p_niveles jsonb)
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
  if not public.niveles_validos(coalesce(p_niveles, '{}')) or not public.niveles_alcanzan(coalesce(p_niveles, '{}')) then
    raise exception 'Tiene que ver o cargar al menos una sección. Para que no entre más, sacale el acceso.';
  end if;
  update public.miembro_empresa
  set niveles = p_niveles
  where user_id = p_user and empresa_id = v_empresa and rol <> 'dueno';
  if not found then
    raise exception 'Esa persona no está en tu empresa.';
  end if;
end;
$$;
revoke all on function public.cambiar_niveles(uuid, jsonb) from public, anon;
grant execute on function public.cambiar_niveles(uuid, jsonb) to authenticated;

drop function public.personas_de_empresa();
create function public.personas_de_empresa()
returns table (
  user_id uuid,
  invitacion_id uuid,
  nombre text,
  celular text,
  rol text,
  niveles jsonb,
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
      u.phone::text, m.rol, m.niveles, m.created_at, null::timestamptz, null::text,
      m.user_id = auth.uid()
    from public.miembro_empresa m
    join auth.users u on u.id = m.user_id
    left join public.invitacion i on i.aceptada_por = m.user_id and i.empresa_id = m.empresa_id
    where m.empresa_id = v_empresa
    union all
    select null::uuid, i.id, i.nombre, i.celular, i.rol, i.niveles, i.creada_at, i.vence_at, i.token, false
    from public.invitacion i
    where i.empresa_id = v_empresa and i.aceptada_at is null;
end;
$$;
revoke all on function public.personas_de_empresa() from public, anon;
grant execute on function public.personas_de_empresa() to authenticated;

-- La pantalla de la invitación muestra los niveles que eligió el dueño.
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
  niveles jsonb
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
    i.niveles
  from public.invitacion i
  join public.empresa e on e.id = i.empresa_id
  left join auth.users u on u.id = i.invitado_por
  where i.token = p_token
$$;
revoke execute on function public.invitacion_por_token(text) from public;
grant execute on function public.invitacion_por_token(text) to anon, authenticated;
