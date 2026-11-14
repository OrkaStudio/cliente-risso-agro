-- =====================================================================
--  Salidas sin identificar: se resta el número, no se marca a nadie.
--
--  Decisión de Lau (14/10): cuando se vende o muere hacienda caravaneada sin
--  decir cuál fue, NO se da de baja un animal cualquiera (su ficha mentiría).
--  Se anota la salida («1 vaca del 3A, vendida el 14/10») y las POSIBLES: los
--  animales de esa categoría que estaban en ese potrero en ese momento. El
--  número del rodeo ya la descuenta; la ficha de cada posible sigue activa
--  hasta que se sepa cuál fue.
--
--  Se resuelve:
--   · «Fue ésta» (desde la ficha o la lista) → identificar_animal / identificar_salida.
--   · Con la planilla de la venta → identificar_salida (por caravana).
--   · «No sé cuál fue» → resolver_sin_saber: sale una cualquiera de las posibles,
--     y su ficha lo dice («dada de baja sin identificar»).
--   · «Fue un error» → anular_salida: todo vuelve como estaba.
--
--  Si una posible se mueve o sale por otro motivo DESPUÉS, no pudo ser la que
--  salió: deja de ser posible (se descarta sola). Si mover o dar de baja
--  dejaría menos posibles que salidas pendientes, la base lo frena con un
--  mensaje (no puede quedar una salida sin ninguna candidata).
--
--  Un solo lugar cuenta las cabezas: v_composicion_potrero (activos menos
--  salidas pendientes), y v_stock_potrero sale de ahí.
--
--  Reemplaza el modelo de 20261012130000 (pendiente_identificar en el evento
--  de baja de un animal elegido por la cuenta): esas bajas se convierten.
--  SECURITY INVOKER: todo bajo la RLS del usuario.
-- =====================================================================

-- ── Tablas ────────────────────────────────────────────────────────────
create table salida_pendiente (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references empresa(id) on delete cascade,
  salida_id          uuid not null,
  potrero_id         uuid not null references potrero(id) on delete cascade,
  categoria          categoria_animal not null,
  motivo             text not null check (motivo in ('venta', 'muerte')),
  fecha              date not null,
  nota               text,
  created_at         timestamptz not null default now(),
  resuelta_animal_id uuid references animal(id) on delete set null,
  resuelta_como      text check (resuelta_como in ('identificada', 'sin_saber', 'anulada')),
  resuelta_en        timestamptz
);
create index idx_salida_pendiente_abierta on salida_pendiente (empresa_id, potrero_id, categoria) where resuelta_en is null;
create index idx_salida_pendiente_salida on salida_pendiente (salida_id);

create table salida_candidato (
  salida_id   uuid not null,
  empresa_id  uuid not null references empresa(id) on delete cascade,
  animal_id   uuid not null references animal(id) on delete cascade,
  descartado  boolean not null default false,
  primary key (salida_id, animal_id)
);
create index idx_salida_candidato_animal on salida_candidato (animal_id) where not descartado;

alter table salida_pendiente enable row level security;
alter table salida_candidato enable row level security;
create policy salida_pendiente_empresa on salida_pendiente
  using (empresa_id in (select auth_empresa_ids())) with check (empresa_id in (select auth_empresa_ids()));
create policy salida_candidato_empresa on salida_candidato
  using (empresa_id in (select auth_empresa_ids())) with check (empresa_id in (select auth_empresa_ids()));

-- ── Vistas ────────────────────────────────────────────────────────────
/** Cada salida con lo que falta: cuántas siguen sin identificar y cuántas posibles quedan. */
create or replace view v_salidas_sin_identificar
with (security_invoker = true) as
select s.empresa_id, s.salida_id, s.potrero_id, s.categoria, s.motivo, s.fecha,
       min(s.created_at) as created_at,
       count(*)::int as pendientes,
       (select count(*)::int from salida_candidato c join animal a on a.id = c.animal_id
         where c.salida_id = s.salida_id and not c.descartado and a.estado = 'activo') as posibles
  from salida_pendiente s
 where s.resuelta_en is null
 group by s.empresa_id, s.salida_id, s.potrero_id, s.categoria, s.motivo, s.fecha;

/** Las posibles de cada salida abierta (para la lista y para «¿Fue ésta?» en la ficha). */
create or replace view v_posibles_salida
with (security_invoker = true) as
select c.salida_id, c.animal_id, c.empresa_id
  from salida_candidato c
  join animal a on a.id = c.animal_id
 where not c.descartado and a.estado = 'activo'
   and exists (select 1 from salida_pendiente s where s.salida_id = c.salida_id and s.resuelta_en is null);

/** Cabezas por potrero y categoría: los activos menos las salidas sin identificar. */
create or replace view v_composicion_potrero
with (security_invoker = true) as
with activos as (
  select empresa_id, potrero_id, categoria, count(*)::int as n
    from animal where estado = 'activo' group by empresa_id, potrero_id, categoria
), pendientes as (
  select empresa_id, potrero_id, categoria, count(*)::int as n
    from salida_pendiente where resuelta_en is null group by empresa_id, potrero_id, categoria
)
select a.empresa_id, a.potrero_id, a.categoria, (a.n - coalesce(p.n, 0))::int as cabezas
  from activos a
  left join pendientes p on p.empresa_id = a.empresa_id and p.potrero_id is not distinct from a.potrero_id and p.categoria = a.categoria
 where a.n - coalesce(p.n, 0) > 0;

create or replace view v_stock_potrero
with (security_invoker = true) as
select empresa_id, potrero_id, sum(cabezas)::integer as cabezas
  from v_composicion_potrero
 where potrero_id is not null
 group by empresa_id, potrero_id;

-- ── Ninguna salida sin lugar ──────────────────────────────────────────
/**
 * Por potrero y categoría, todas las salidas sin identificar juntas tienen que
 * tener al menos tantas posibles (distintas) como pendientes: dos salidas no
 * pueden «compartir» la misma vaca. Devuelve los grupos que no cumplen.
 */
create or replace function _salidas_sin_lugar(p_empresa_id uuid)
returns table (potrero_id uuid, categoria categoria_animal, motivo text, fecha date, pendientes int, posibles int)
language sql
stable
security invoker
set search_path = public
as $$
  with abiertas as (
    select s.potrero_id, s.categoria, count(*)::int as pendientes,
           min(s.motivo) as motivo, max(s.fecha) as fecha
      from salida_pendiente s
     where s.empresa_id = p_empresa_id and s.resuelta_en is null
     group by s.potrero_id, s.categoria
  )
  select ab.potrero_id, ab.categoria, ab.motivo, ab.fecha, ab.pendientes,
         (select count(distinct c.animal_id)::int
            from salida_candidato c
            join salida_pendiente s on s.salida_id = c.salida_id and s.resuelta_en is null
            join animal a on a.id = c.animal_id
           where s.potrero_id = ab.potrero_id and s.categoria = ab.categoria
             and not c.descartado and a.estado = 'activo') as posibles
    from abiertas ab
$$;

-- ── Resolver una pendiente con un animal ─────────────────────────────
create or replace function _resolver_pendiente(p_pendiente uuid, p_animal uuid, p_como text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_p      salida_pendiente;
  v_estado estado_animal;
begin
  select * into v_p from salida_pendiente where id = p_pendiente and resuelta_en is null for update;
  if v_p.id is null then raise exception 'Esa salida ya estaba resuelta'; end if;
  v_estado := case v_p.motivo when 'venta' then 'vendido' else 'muerto' end::estado_animal;

  perform set_config('tropero.resolviendo', '1', true);
  update animal set estado = v_estado, updated_at = now() where id = p_animal and estado = 'activo';
  if not found then raise exception 'Ese animal ya no está en el rodeo'; end if;
  perform set_config('tropero.resolviendo', '', true);

  insert into evento (empresa_id, animal_id, tipo, fecha, nota, datos)
  values (v_p.empresa_id, p_animal, 'baja', v_p.fecha,
          case p_como when 'sin_saber' then 'Dada de baja sin identificar: no se supo cuál fue' end,
          jsonb_build_object('estado', v_estado, 'motivo', v_p.motivo, 'salida_id', v_p.salida_id,
                             case p_como when 'sin_saber' then 'sin_identificar' else 'identificada' end, true));

  update salida_pendiente
     set resuelta_animal_id = p_animal, resuelta_como = p_como, resuelta_en = now()
   where id = p_pendiente;

  -- Si también era posible de otra salida, ésa no puede quedar sin candidatas.
  if exists (select 1 from _salidas_sin_lugar(v_p.empresa_id) g where g.posibles < g.pendientes) then
    raise exception 'Ese animal era la única posible de otra salida sin identificar: resolvé esa primero.';
  end if;
end $$;

-- ── Las posibles: si una se mueve o sale después, no pudo ser ─────────
create or replace function _descartar_posible()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_s    record;
  v_pot  text;
  v_ids  uuid[];
begin
  if coalesce(current_setting('tropero.resolviendo', true), '') = '1' then
    return new;
  end if;
  if new.potrero_id is not distinct from old.potrero_id and new.estado = old.estado then
    return new;
  end if;

  with u as (
    update salida_candidato c set descartado = true
     where c.animal_id = new.id and not c.descartado
       and exists (select 1 from salida_pendiente s where s.salida_id = c.salida_id and s.resuelta_en is null)
    returning c.salida_id
  ) select array_agg(salida_id) into v_ids from u;
  if v_ids is null then
    return new;
  end if;

  -- Ningún grupo (potrero y categoría) puede quedar con menos posibles que pendientes.
  for v_s in
    select * from _salidas_sin_lugar(new.empresa_id) g
     where g.posibles < g.pendientes
       and (g.potrero_id, g.categoria) in (select sp.potrero_id, sp.categoria from salida_pendiente sp where sp.salida_id = any(v_ids))
  loop
    select nombre into v_pot from potrero where id = v_s.potrero_id;
    raise exception 'En el % hay % % sin identificar de una salida del %: antes de mover o dar de baja ésta, decí cuál salió o anulá esa salida.',
      v_pot, v_s.pendientes,
      case when v_s.pendientes = 1 then v_s.categoria::text else v_s.categoria::text || 's' end,
      to_char(v_s.fecha, 'DD/MM')
      using errcode = 'P0001';
  end loop;
  return new;
end $$;

create trigger animal_descarta_posible
  after update of potrero_id, estado on animal
  for each row execute function _descartar_posible();

-- ── Salieron, por cantidad ────────────────────────────────────────────
drop function if exists salida_por_cantidad(uuid, uuid, jsonb, text, date, text, text[]);

create or replace function salida_por_cantidad(
  p_empresa_id uuid,
  p_potrero_id uuid,
  p_items      jsonb,               -- [{"categoria":"vaca","cantidad":2}]
  p_motivo     text,                -- venta | muerte | correccion
  p_fecha      date default current_date,
  p_nota       text default null,
  p_caravanas  text[] default null  -- las que se sabe que salieron
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado   estado_animal;
  v_item     jsonb;
  v_falta    jsonb := '{}'::jsonb;
  v_cat      categoria_animal;
  v_cant     int;
  v_car      text;
  v_animal   record;
  v_ident    uuid[] := '{}';
  v_sin      uuid[];
  v_bajas    uuid[] := '{}';
  v_hay      int;
  v_pend     int;
  v_resto    int;
  v_libres   int;
  v_salida   uuid := gen_random_uuid();
  v_sin_id   int := 0;
begin
  if p_motivo not in ('venta', 'muerte', 'correccion') then
    raise exception 'Motivo inválido: %', p_motivo;
  end if;
  v_estado := case p_motivo when 'venta' then 'vendido' when 'muerte' then 'muerto' else 'corregido' end::estado_animal;
  if not exists (select 1 from potrero where id = p_potrero_id and empresa_id = p_empresa_id) then
    raise exception 'Potrero inexistente';
  end if;
  if p_fecha > current_date then
    raise exception 'La fecha no puede ser futura';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_cant := (v_item->>'cantidad')::int;
    if v_cant is null or v_cant <= 0 then continue; end if;
    v_falta := v_falta || jsonb_build_object(v_item->>'categoria', coalesce((v_falta->>(v_item->>'categoria'))::int, 0) + v_cant);
  end loop;

  -- Las identificadas.
  foreach v_car in array coalesce(p_caravanas, '{}') loop
    select a.id, a.categoria, a.estado, a.potrero_id, p.nombre as potrero into v_animal
      from animal a left join potrero p on p.id = a.potrero_id
     where a.id = animal_por_caravana(p_empresa_id, v_car)
     for update of a;
    if v_animal.id is null then raise exception 'No encontramos la caravana %', v_car; end if;
    if v_animal.estado <> 'activo' then raise exception 'La % ya no está en el rodeo', v_car; end if;
    if v_animal.potrero_id is distinct from p_potrero_id then
      raise exception 'La % está en el %, no en este potrero', v_car, coalesce(v_animal.potrero, 'ningún potrero');
    end if;
    if v_animal.id = any(v_ident) then raise exception 'La % está dos veces', v_car; end if;
    if coalesce((v_falta->>v_animal.categoria::text)::int, 0) <= 0 then
      raise exception 'La % es %: no está en lo que sale', v_car, v_animal.categoria;
    end if;
    v_falta := v_falta || jsonb_build_object(v_animal.categoria::text, (v_falta->>v_animal.categoria::text)::int - 1);
    v_ident := v_ident || v_animal.id;
  end loop;
  v_bajas := v_ident;

  -- El resto: primero los sin caravana (no tienen identidad); lo que falte, sin identificar.
  for v_item in select jsonb_build_object('categoria', key, 'cantidad', value) from jsonb_each(v_falta) loop
    v_cat  := (v_item->>'categoria')::categoria_animal;
    v_cant := (v_item->>'cantidad')::int;
    if v_cant <= 0 then continue; end if;

    select count(*) into v_hay from animal a
     where a.empresa_id = p_empresa_id and a.potrero_id = p_potrero_id and a.categoria = v_cat
       and a.estado = 'activo' and a.id <> all(v_ident);
    select count(*) into v_pend from salida_pendiente
     where empresa_id = p_empresa_id and potrero_id = p_potrero_id and categoria = v_cat and resuelta_en is null;
    if v_hay - v_pend < v_cant then
      raise exception 'En el potrero hay % (%), no %', greatest(v_hay - v_pend, 0), v_cat, v_cant;
    end if;

    select array_agg(x.id) into v_sin from (
      select a.id from animal a
       where a.empresa_id = p_empresa_id and a.potrero_id = p_potrero_id and a.categoria = v_cat
         and a.estado = 'activo' and a.id <> all(v_ident)
         and not exists (select 1 from caravana c where c.animal_id = a.id and c.vigente)
       order by a.created_at
       limit v_cant
       for update of a
    ) x;
    v_sin := coalesce(v_sin, '{}');
    v_bajas := v_bajas || v_sin;
    v_resto := v_cant - coalesce(array_length(v_sin, 1), 0);

    if v_resto > 0 then
      if p_motivo = 'correccion' then
        raise exception 'Sin caravana hay % (%), no %. Los que tienen caravana se dan de baja de a uno.', coalesce(array_length(v_sin, 1), 0), v_cat, v_cant;
      end if;
      -- Hay que dejar al menos tantas posibles libres como salidas sin identificar.
      select count(*) into v_libres from animal a
       where a.empresa_id = p_empresa_id and a.potrero_id = p_potrero_id and a.categoria = v_cat
         and a.estado = 'activo' and a.id <> all(v_bajas);
      if v_libres - v_pend < v_resto then
        raise exception 'En el potrero hay % (%), no %', greatest(v_libres - v_pend, 0), v_cat, v_resto;
      end if;

      insert into salida_pendiente (empresa_id, salida_id, potrero_id, categoria, motivo, fecha, nota)
      select p_empresa_id, v_salida, p_potrero_id, v_cat, p_motivo, p_fecha, nullif(trim(p_nota), '')
        from generate_series(1, v_resto);
      -- Las posibles: las de esa categoría que estaban ahí y no salieron identificadas.
      insert into salida_candidato (salida_id, empresa_id, animal_id)
      select v_salida, p_empresa_id, a.id from animal a
       where a.empresa_id = p_empresa_id and a.potrero_id = p_potrero_id and a.categoria = v_cat
         and a.estado = 'activo' and a.id <> all(v_bajas)
      on conflict do nothing;
      v_sin_id := v_sin_id + v_resto;
    end if;
  end loop;

  if coalesce(array_length(v_bajas, 1), 0) + v_sin_id = 0 then
    raise exception 'Elegí cuántos salen';
  end if;

  perform set_config('tropero.resolviendo', '1', true);
  update animal set estado = v_estado, updated_at = now() where id = any(v_bajas);
  perform set_config('tropero.resolviendo', '', true);

  -- Una identificada puede haber sido la posible de otra salida sin identificar.
  if exists (select 1 from _salidas_sin_lugar(p_empresa_id) g where g.potrero_id = p_potrero_id and g.posibles < g.pendientes) then
    raise exception 'Alguna de esas caravanas era la única posible de otra salida sin identificar de este potrero: resolvé esa primero.';
  end if;

  insert into evento (empresa_id, animal_id, tipo, fecha, nota, datos)
  select p_empresa_id, a.id, 'baja', p_fecha, nullif(trim(p_nota), ''),
         jsonb_build_object('estado', v_estado, 'motivo', p_motivo, 'por_cantidad', true, 'salida_id', v_salida)
         || case when a.id = any(v_ident) then '{"identificada": true}'::jsonb else '{}'::jsonb end
    from animal a where a.id = any(v_bajas);

  return jsonb_build_object(
    'salieron', coalesce(array_length(v_bajas, 1), 0) + v_sin_id,
    'identificadas', coalesce(array_length(v_ident, 1), 0),
    'sin_identificar', v_sin_id,
    'salida_id', v_salida
  );
end $$;

grant execute on function salida_por_cantidad(uuid, uuid, jsonb, text, date, text, text[]) to authenticated;

-- ── Decir cuál fue ────────────────────────────────────────────────────
/**
 * «Fue ésta». Sin salida: el animal tiene que ser una de las posibles de alguna
 * (la más vieja). Con salida: cualquier animal del rodeo — la que salió puede
 * no estar entre las posibles (se tocó otro potrero al cargar, o era otra):
 * la salida se cierra con ése, el potrero de la salida recupera su número y
 * el del animal lo pierde.
 */
create or replace function identificar_animal(p_animal_id uuid, p_salida_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pend uuid;
begin
  if p_salida_id is null then
    select s.id into v_pend
      from salida_pendiente s
      join salida_candidato c on c.salida_id = s.salida_id and c.animal_id = p_animal_id and not c.descartado
     where s.resuelta_en is null
     order by s.created_at
     limit 1
     for update of s;
    if v_pend is null then
      raise exception 'Ese animal no es una de las posibles de una salida sin identificar';
    end if;
  else
    select s.id into v_pend
      from salida_pendiente s
     where s.salida_id = p_salida_id and s.resuelta_en is null
     order by s.created_at
     limit 1
     for update;
    if v_pend is null then
      raise exception 'Esa salida ya no tiene nada sin identificar';
    end if;
    if not exists (
      select 1 from animal a join salida_pendiente s on s.id = v_pend
       where a.id = p_animal_id and a.empresa_id = s.empresa_id and a.estado = 'activo'
    ) then
      raise exception 'Ese animal ya no está en el rodeo';
    end if;
  end if;
  perform _resolver_pendiente(v_pend, p_animal_id, 'identificada');
end $$;

drop function if exists identificar_salida(uuid, text[]);
/** Por caravana (la lista o la planilla de la venta). */
create or replace function identificar_salida(p_empresa_id uuid, p_caravanas text[], p_salida_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_car    text;
  v_animal uuid;
  v_ok     int := 0;
begin
  foreach v_car in array coalesce(p_caravanas, '{}') loop
    v_animal := animal_por_caravana(p_empresa_id, v_car);
    if v_animal is null then raise exception 'No encontramos la caravana %', v_car; end if;
    begin
      perform identificar_animal(v_animal, p_salida_id);
    exception when others then
      raise exception 'La % no es una de las posibles de esa salida', v_car;
    end;
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('identificadas', v_ok);
end $$;

/**
 * «No sé cuál fue»: sale una de las posibles y la ficha lo dice. La pantalla
 * muestra cuál va a salir y la manda en `p_animal_ids` (las primeras de la
 * lista que ve el productor); sin ellas, la más vieja.
 */
drop function if exists resolver_sin_saber(uuid);
create or replace function resolver_sin_saber(p_salida_id uuid, p_animal_ids uuid[] default null)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_p   record;
  v_a   uuid;
  v_n   int := 0;
  v_i   int := 1;
begin
  for v_p in select id from salida_pendiente where salida_id = p_salida_id and resuelta_en is null order by created_at loop
    v_a := null;
    if p_animal_ids is not null and v_i <= array_length(p_animal_ids, 1) then
      select c.animal_id into v_a
        from salida_candidato c join animal a on a.id = c.animal_id
       where c.salida_id = p_salida_id and c.animal_id = p_animal_ids[v_i] and not c.descartado and a.estado = 'activo';
      if v_a is null then raise exception 'Ese animal ya no es una de las posibles'; end if;
      v_i := v_i + 1;
    else
      select c.animal_id into v_a
        from salida_candidato c join animal a on a.id = c.animal_id
       where c.salida_id = p_salida_id and not c.descartado and a.estado = 'activo'
       order by a.created_at
       limit 1;
    end if;
    if v_a is null then raise exception 'No quedan posibles para esa salida'; end if;
    perform _resolver_pendiente(v_p.id, v_a, 'sin_saber');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

/**
 * «Sigue en el campo»: la que salió «sin identificar» en realidad está. Vuelve
 * al rodeo y la salida queda otra vez sin identificar, ya sin ella entre las
 * posibles. Si no queda ninguna otra posible, la salida no cierra: se pide
 * anularla.
 */
create or replace function reabrir_sin_saber(p_animal_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_p   salida_pendiente;
  v_ev  uuid;
begin
  select * into v_p from salida_pendiente
   where resuelta_animal_id = p_animal_id and resuelta_como = 'sin_saber'
   order by resuelta_en desc limit 1 for update;
  if v_p.id is null then raise exception 'Ese animal no salió «sin identificar»'; end if;

  update salida_candidato set descartado = true where salida_id = v_p.salida_id and animal_id = p_animal_id;
  if not exists (
    select 1 from salida_candidato c join animal a on a.id = c.animal_id
     where c.salida_id = v_p.salida_id and not c.descartado and a.estado = 'activo'
  ) then
    raise exception 'No queda otra posible: si ésta sigue en el campo, esa salida estuvo mal cargada. Anulala desde Hacienda.';
  end if;

  select id into v_ev from evento
   where animal_id = p_animal_id and tipo = 'baja' and datos->>'salida_id' = v_p.salida_id::text
   order by created_at desc limit 1;

  perform set_config('tropero.resolviendo', '1', true);
  update animal set estado = 'activo', updated_at = now() where id = p_animal_id;
  perform set_config('tropero.resolviendo', '', true);

  insert into evento (empresa_id, animal_id, tipo, nota, datos)
  values (v_p.empresa_id, p_animal_id, 'nota', 'Sigue en el campo: la salida vuelve a quedar sin identificar',
          jsonb_build_object('resuelve', v_ev, 'salida_id', v_p.salida_id, 'vuelve_al_rodeo', true));

  update salida_pendiente set resuelta_como = 'anulada', resuelta_en = coalesce(resuelta_en, now())
   where id = v_p.id;
  insert into salida_pendiente (empresa_id, salida_id, potrero_id, categoria, motivo, fecha, nota)
  values (v_p.empresa_id, v_p.salida_id, v_p.potrero_id, v_p.categoria, v_p.motivo, v_p.fecha, v_p.nota);
  return v_p.salida_id;
end $$;

/** «Fue un error»: la salida entera se deshace; los que habían salido vuelven al rodeo. */
create or replace function anular_salida(p_salida_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n int := 0;
  v_e record;
begin
  update salida_pendiente set resuelta_como = 'anulada', resuelta_en = now()
   where salida_id = p_salida_id and resuelta_en is null;

  perform set_config('tropero.resolviendo', '1', true);
  for v_e in
    select distinct on (e.animal_id) e.animal_id, e.empresa_id
      from evento e join animal a on a.id = e.animal_id
     where e.tipo = 'baja' and e.datos->>'salida_id' = p_salida_id::text and a.estado <> 'activo'
  loop
    update animal set estado = 'activo', updated_at = now() where id = v_e.animal_id;
    insert into evento (empresa_id, animal_id, tipo, nota, datos)
    values (v_e.empresa_id, v_e.animal_id, 'nota', 'Se anuló la salida: vuelve al rodeo',
            jsonb_build_object('anula_salida', p_salida_id, 'vuelve_al_rodeo', true));
    v_n := v_n + 1;
  end loop;
  perform set_config('tropero.resolviendo', '', true);
  return v_n;
end $$;

/**
 * «Me equivoqué al cargarla»: corrige UNA categoría de una salida. Deshace lo
 * que esa salida hizo con esa categoría (las pendientes se cierran, los que
 * salieron vuelven al rodeo) y la vuelve a cargar con el potrero y la
 * cantidad correctos, con la misma fecha y motivo. Cantidad 0 = no salió.
 * Devuelve la salida nueva (o null si no salió).
 */
create or replace function corregir_salida(
  p_salida_id  uuid,
  p_categoria  categoria_animal,
  p_potrero_id uuid,
  p_cantidad   int
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_p   salida_pendiente;
  v_e   record;
  v_r   jsonb;
begin
  select * into v_p from salida_pendiente
   where salida_id = p_salida_id and categoria = p_categoria and resuelta_en is null
   order by created_at limit 1;
  if v_p.id is null then raise exception 'Esa salida ya no está abierta'; end if;
  if p_cantidad < 0 then raise exception 'La cantidad no puede ser negativa'; end if;

  update salida_pendiente set resuelta_como = 'anulada', resuelta_en = now()
   where salida_id = p_salida_id and categoria = p_categoria and resuelta_en is null;

  perform set_config('tropero.resolviendo', '1', true);
  for v_e in
    select distinct on (e.animal_id) e.animal_id
      from evento e join animal a on a.id = e.animal_id
     where e.tipo = 'baja' and e.datos->>'salida_id' = p_salida_id::text
       and a.categoria = p_categoria and a.estado <> 'activo'
  loop
    update animal set estado = 'activo', updated_at = now() where id = v_e.animal_id;
    insert into evento (empresa_id, animal_id, tipo, nota, datos)
    values (v_p.empresa_id, v_e.animal_id, 'nota', 'Se corrigió la salida: vuelve al rodeo',
            jsonb_build_object('anula_salida', p_salida_id, 'vuelve_al_rodeo', true));
  end loop;
  perform set_config('tropero.resolviendo', '', true);

  if p_cantidad = 0 then
    return null;
  end if;
  v_r := salida_por_cantidad(v_p.empresa_id, p_potrero_id,
           jsonb_build_array(jsonb_build_object('categoria', p_categoria, 'cantidad', p_cantidad)),
           v_p.motivo, v_p.fecha, v_p.nota);
  return v_r;
end $$;

grant execute on function identificar_animal(uuid, uuid) to authenticated;
grant execute on function corregir_salida(uuid, categoria_animal, uuid, int) to authenticated;
grant execute on function identificar_salida(uuid, text[], uuid) to authenticated;
grant execute on function resolver_sin_saber(uuid, uuid[]) to authenticated;
grant execute on function reabrir_sin_saber(uuid) to authenticated;
grant execute on function anular_salida(uuid) to authenticated;

-- ── Convertir las bajas del modelo anterior ───────────────────────────
-- (las que la cuenta había dado de baja con pendiente_identificar): el animal
-- vuelve al rodeo y la salida queda sin identificar, con sus posibles.
do $$
declare
  v_b record;
begin
  for v_b in
    select e.id as evento_id, e.empresa_id, e.animal_id, e.fecha, e.datos, a.categoria, a.potrero_id
      from evento e join animal a on a.id = e.animal_id
     where e.tipo = 'baja' and (e.datos->>'pendiente_identificar')::boolean and a.estado <> 'activo'
       and not exists (select 1 from evento r where r.animal_id = e.animal_id and r.tipo = 'nota' and r.datos->>'resuelve' = e.id::text)
       and a.potrero_id is not null
  loop
    insert into salida_pendiente (empresa_id, salida_id, potrero_id, categoria, motivo, fecha)
    values (v_b.empresa_id, (v_b.datos->>'salida_id')::uuid, v_b.potrero_id, v_b.categoria,
            case v_b.datos->>'estado' when 'muerto' then 'muerte' else 'venta' end, v_b.fecha);
    insert into salida_candidato (salida_id, empresa_id, animal_id)
    select (v_b.datos->>'salida_id')::uuid, v_b.empresa_id, a.id from animal a
     where a.empresa_id = v_b.empresa_id and a.potrero_id = v_b.potrero_id and a.categoria = v_b.categoria
       and (a.estado = 'activo' or a.id = v_b.animal_id)
    on conflict do nothing;
    perform set_config('tropero.resolviendo', '1', true);
    update animal set estado = 'activo', updated_at = now() where id = v_b.animal_id;
    perform set_config('tropero.resolviendo', '', true);
    insert into evento (empresa_id, animal_id, tipo, nota, datos)
    values (v_b.empresa_id, v_b.animal_id, 'nota', 'Vuelve al rodeo: la salida queda sin identificar',
            jsonb_build_object('resuelve', v_b.evento_id, 'vuelve_al_rodeo', true));
  end loop;
end $$;

drop view if exists v_bajas_pendientes;
