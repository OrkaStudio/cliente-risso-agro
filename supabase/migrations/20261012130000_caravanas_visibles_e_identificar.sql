-- =====================================================================
--  Caravanas: la visible sin electrónica, identificar lo que salió y la
--  planilla (página 35: «Las caravanas, desde un Excel», «14 sin
--  electrónica», «Revisá · Las caravanas: Después / Planilla / Rango / De a
--  una»).
--
--  1. Una caravana puede tener sólo el número visible: la planilla del
--     veterinario o la de SENASA traen el número que se lee de lejos; el chip
--     se empareja en la próxima manga (asignar_caravana completa la fila).
--  2. salida_por_cantidad acepta las caravanas que salieron: ésas salen
--     identificadas; el resto, por cantidad como antes.
--  3. identificar_salida: después de una salida por cantidad, decir cuáles
--     fueron. Si el que salió no era el elegido, se intercambian (el elegido
--     vuelve al rodeo) y queda todo en la historia.
--  4. asignar_caravanas_planilla: le pone caravana a los animales que se
--     cargaron por categoría, fila por fila. No crea animales.
--
--  SECURITY INVOKER: todo bajo la RLS del usuario.
-- =====================================================================

-- ── 1. La visible sin electrónica ────────────────────────────────────
alter table caravana alter column numero_rfid drop not null;
alter table caravana add constraint caravana_algun_numero
  check (numero_rfid is not null or numero_visual is not null);

/** El animal de la empresa con esa caravana vigente (visible o electrónica, sin separadores). */
create or replace function animal_por_caravana(p_empresa_id uuid, p_caravana text)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select c.animal_id
    from caravana c
   where c.empresa_id = p_empresa_id and c.vigente
     and (
       regexp_replace(coalesce(c.numero_visual, ''), '\D', '', 'g') = regexp_replace(p_caravana, '\D', '', 'g')
       or regexp_replace(coalesce(c.numero_rfid, ''), '[^0-9A-Za-z]', '', 'g') = regexp_replace(p_caravana, '[^0-9A-Za-z]', '', 'g')
     )
     and regexp_replace(p_caravana, '\D', '', 'g') <> ''
   order by (c.numero_visual is not null) desc
   limit 1
$$;

-- La manga: si el animal ya tiene la visible, el bastón la completa (empareja).
create or replace function asignar_caravana(
  p_animal_id     uuid,
  p_numero_rfid   text,
  p_numero_visual text             default null,
  p_categoria     categoria_animal default null,
  p_raza          text             default null,
  p_pelaje        text             default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_rfid       text := trim(p_numero_rfid);
  v_visible    uuid;
begin
  if v_rfid is null or v_rfid = '' then
    raise exception 'Falta el RFID';
  end if;

  select empresa_id into v_empresa_id from animal where id = p_animal_id;
  if v_empresa_id is null then
    raise exception 'Animal no encontrado';
  end if;

  select id into v_visible from caravana
   where animal_id = p_animal_id and vigente and numero_rfid is null;

  if v_visible is not null then
    -- Tenía sólo la visible: se completa con el chip (emparejar).
    update caravana
       set numero_rfid = v_rfid,
           numero_visual = coalesce(nullif(trim(p_numero_visual), ''), numero_visual)
     where id = v_visible;
  elsif exists (select 1 from caravana where animal_id = p_animal_id and vigente) then
    raise exception 'El animal ya tiene una caravana vigente (usá cambiar caravana)';
  else
    insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual, vigente)
    values (v_empresa_id, p_animal_id, v_rfid, nullif(trim(p_numero_visual), ''), true);
  end if;

  update animal set
    categoria  = coalesce(p_categoria, categoria),
    raza       = coalesce(nullif(trim(p_raza), ''),   raza),
    pelaje     = coalesce(nullif(trim(p_pelaje), ''), pelaje),
    updated_at = now()
  where id = p_animal_id;

  insert into evento (empresa_id, animal_id, tipo, datos)
  values (v_empresa_id, p_animal_id, 'caravana_asignada',
          jsonb_strip_nulls(jsonb_build_object(
            'rfid',      v_rfid,
            'visual',    nullif(trim(p_numero_visual), ''),
            'raza',      nullif(trim(p_raza), ''),
            'pelaje',    nullif(trim(p_pelaje), ''),
            'emparejada', case when v_visible is not null then true end
          )));
exception
  when unique_violation then
    raise exception 'La caravana % ya está registrada', v_rfid;
end $$;

-- ── 2. Salir con las caravanas identificadas ─────────────────────────
drop function if exists salida_por_cantidad(uuid, uuid, jsonb, text, date, text);

create or replace function salida_por_cantidad(
  p_empresa_id uuid,
  p_potrero_id uuid,
  p_items      jsonb,             -- [{"categoria":"ternero","cantidad":12}]
  p_motivo     text,              -- venta | muerte | correccion
  p_fecha      date default current_date,
  p_nota       text default null,
  p_caravanas  text[] default null -- las que se sabe que salieron (visible o electrónica)
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado    estado_animal;
  v_item      jsonb;
  v_cat       categoria_animal;
  v_cant      int;
  v_falta     jsonb := '{}'::jsonb;    -- categoría → cuántos faltan elegir
  v_car       text;
  v_animal    record;
  v_ident     uuid[] := '{}';
  v_sel       uuid[];
  v_ids       uuid[] := '{}';
  v_hay       int;
  v_salida    uuid := gen_random_uuid();
  v_pend      int;
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

  -- Las identificadas: tienen que estar en el potrero y entrar en la cuenta.
  foreach v_car in array coalesce(p_caravanas, '{}') loop
    select a.id, a.categoria, a.estado, a.potrero_id, p.nombre as potrero into v_animal
      from animal a left join potrero p on p.id = a.potrero_id
     where a.id = animal_por_caravana(p_empresa_id, v_car)
     for update of a;
    if v_animal.id is null then
      raise exception 'No encontramos la caravana %', v_car;
    end if;
    if v_animal.estado <> 'activo' then
      raise exception 'La % ya no está en el rodeo', v_car;
    end if;
    if v_animal.potrero_id is distinct from p_potrero_id then
      raise exception 'La % está en el %, no en este potrero', v_car, coalesce(v_animal.potrero, 'ningún potrero');
    end if;
    if v_animal.id = any(v_ident) then
      raise exception 'La % está dos veces', v_car;
    end if;
    if coalesce((v_falta->>v_animal.categoria::text)::int, 0) <= 0 then
      raise exception 'La % es %: no está en lo que sale', v_car, v_animal.categoria;
    end if;
    v_falta := v_falta || jsonb_build_object(v_animal.categoria::text, (v_falta->>v_animal.categoria::text)::int - 1);
    v_ident := v_ident || v_animal.id;
  end loop;

  -- El resto, por cantidad: primero los sin caravana.
  for v_item in select jsonb_build_object('categoria', key, 'cantidad', value) from jsonb_each(v_falta) loop
    v_cat  := (v_item->>'categoria')::categoria_animal;
    v_cant := (v_item->>'cantidad')::int;
    if v_cant <= 0 then continue; end if;

    select count(*) into v_hay from animal a
     where a.empresa_id = p_empresa_id and a.potrero_id = p_potrero_id
       and a.categoria = v_cat and a.estado = 'activo' and a.id <> all(v_ident)
       and (p_motivo <> 'correccion' or not exists (select 1 from caravana c where c.animal_id = a.id and c.vigente));
    if v_hay < v_cant then
      if p_motivo = 'correccion' then
        raise exception 'Sin caravana hay % (%), no %. Los que tienen caravana se dan de baja de a uno.', v_hay, v_cat, v_cant;
      end if;
      raise exception 'En el potrero hay % (%), no %', v_hay, v_cat, v_cant;
    end if;

    select array_agg(x.id) into v_sel from (
      select a.id from animal a
       where a.empresa_id = p_empresa_id and a.potrero_id = p_potrero_id
         and a.categoria = v_cat and a.estado = 'activo' and a.id <> all(v_ident)
         and (p_motivo <> 'correccion' or not exists (select 1 from caravana c where c.animal_id = a.id and c.vigente))
       order by exists (select 1 from caravana c where c.animal_id = a.id and c.vigente), a.created_at
       limit v_cant
       for update of a
    ) x;
    v_ids := v_ids || v_sel;
  end loop;

  if coalesce(array_length(v_ids, 1), 0) + coalesce(array_length(v_ident, 1), 0) = 0 then
    raise exception 'Elegí cuántos salen';
  end if;

  update animal set estado = v_estado, updated_at = now() where id = any(v_ids || v_ident);

  insert into evento (empresa_id, animal_id, tipo, fecha, nota, datos)
  select p_empresa_id, a.id, 'baja', p_fecha, nullif(trim(p_nota), ''),
         jsonb_build_object('estado', v_estado, 'motivo', p_motivo, 'por_cantidad', true, 'salida_id', v_salida)
         || case when a.id = any(v_ident) then '{"identificada": true}'::jsonb
                 when exists (select 1 from caravana c where c.animal_id = a.id and c.vigente) then '{"pendiente_identificar": true}'::jsonb
                 else '{}'::jsonb end
    from animal a where a.id = any(v_ids || v_ident);

  select count(*) into v_pend from caravana c where c.animal_id = any(v_ids) and c.vigente;

  return jsonb_build_object(
    'salieron', coalesce(array_length(v_ids, 1), 0) + coalesce(array_length(v_ident, 1), 0),
    'identificadas', coalesce(array_length(v_ident, 1), 0),
    'pendientes_identificar', v_pend,
    'salida_id', v_salida
  );
end $$;

grant execute on function salida_por_cantidad(uuid, uuid, jsonb, text, date, text, text[]) to authenticated;

-- ── 3. Decir cuáles fueron ───────────────────────────────────────────
/**
 * Las bajas que siguen pendientes de identificar: el evento de baja con
 * pendiente_identificar que ninguna nota posterior resolvió.
 */
create or replace view v_bajas_pendientes
with (security_invoker = true) as
select e.id as evento_id, e.empresa_id, e.animal_id, e.fecha, e.datos->>'salida_id' as salida_id,
       a.categoria, a.estado, a.potrero_id
  from evento e
  join animal a on a.id = e.animal_id
 where e.tipo = 'baja'
   and (e.datos->>'pendiente_identificar')::boolean
   and a.estado <> 'activo'
   and not exists (
     select 1 from evento r
      where r.animal_id = e.animal_id and r.tipo = 'nota' and r.datos->>'resuelve' = e.id::text
   );

create or replace function identificar_salida(
  p_empresa_id uuid,
  p_caravanas  text[]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_car     text;
  v_x       record;  -- el que de verdad salió
  v_p       record;  -- el que la cuenta había elegido
  v_ok      int := 0;
  v_cambios int := 0;
begin
  foreach v_car in array coalesce(p_caravanas, '{}') loop
    select a.id, a.categoria, a.estado, a.potrero_id into v_x
      from animal a where a.id = animal_por_caravana(p_empresa_id, v_car) for update;
    if v_x.id is null then
      raise exception 'No encontramos la caravana %', v_car;
    end if;

    -- ¿Ya era uno de los pendientes? Entonces era ése: queda resuelto.
    select * into v_p from v_bajas_pendientes where animal_id = v_x.id and empresa_id = p_empresa_id limit 1;
    if v_p.evento_id is not null then
      insert into evento (empresa_id, animal_id, tipo, nota, datos)
      values (p_empresa_id, v_x.id, 'nota', 'Era éste el que salió',
              jsonb_build_object('resuelve', v_p.evento_id, 'salida_id', v_p.salida_id));
      v_ok := v_ok + 1;
      continue;
    end if;

    if v_x.estado <> 'activo' then
      raise exception 'La % ya estaba fuera del rodeo', v_car;
    end if;

    -- Si no, sale éste y vuelve al rodeo uno de los pendientes de su categoría
    -- (el del mismo potrero primero, la salida más reciente primero).
    select * into v_p from v_bajas_pendientes
     where empresa_id = p_empresa_id and categoria = v_x.categoria
     order by (potrero_id is not distinct from v_x.potrero_id) desc, fecha desc
     limit 1;
    if v_p.evento_id is null then
      raise exception 'La % no corresponde a ninguna salida pendiente', v_car;
    end if;

    update animal set estado = v_p.estado, updated_at = now() where id = v_x.id;
    update animal set estado = 'activo', updated_at = now() where id = v_p.animal_id;

    insert into evento (empresa_id, animal_id, tipo, fecha, nota, datos)
    values (p_empresa_id, v_x.id, 'baja', v_p.fecha, 'Identificada después de la salida',
            jsonb_build_object('estado', v_p.estado, 'salida_id', v_p.salida_id, 'identificada', true));
    insert into evento (empresa_id, animal_id, tipo, nota, datos)
    values (p_empresa_id, v_p.animal_id, 'nota', 'No era el que salió: vuelve al rodeo',
            jsonb_build_object('resuelve', v_p.evento_id, 'salida_id', v_p.salida_id, 'vuelve_al_rodeo', true));
    v_ok := v_ok + 1;
    v_cambios := v_cambios + 1;
  end loop;

  return jsonb_build_object('identificadas', v_ok, 'cambiados', v_cambios);
end $$;

grant execute on function identificar_salida(uuid, text[]) to authenticated;

-- ── 4. La planilla: caravanas para los que se cargaron por categoría ──
create or replace function asignar_caravanas_planilla(
  p_empresa_id uuid,
  p_campo_id   uuid,      -- a qué campo van las filas sin potrero
  p_filas      jsonb      -- [{"visual","rfid","categoria","potrero_id","nacimiento","raza"}]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_f        jsonb;
  v_cat      categoria_animal;
  v_pot      uuid;
  v_visual   text;
  v_rfid     text;
  v_animal   uuid;
  v_ok       int := 0;
  v_sin      jsonb := '[]'::jsonb;
begin
  for v_f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_cat    := (v_f->>'categoria')::categoria_animal;
    v_pot    := nullif(v_f->>'potrero_id', '')::uuid;
    v_visual := nullif(trim(v_f->>'visual'), '');
    v_rfid   := nullif(trim(v_f->>'rfid'), '');
    if v_visual is null and v_rfid is null then continue; end if;

    if animal_por_caravana(p_empresa_id, coalesce(v_rfid, v_visual)) is not null then
      raise exception 'La % ya está puesta en otro animal', coalesce(v_visual, v_rfid);
    end if;

    -- Un animal sin caravana de esa categoría: en su potrero, o en el campo.
    select a.id into v_animal from animal a
     where a.empresa_id = p_empresa_id and a.estado = 'activo' and a.categoria = v_cat
       and not exists (select 1 from caravana c where c.animal_id = a.id and c.vigente)
       and (case when v_pot is not null then a.potrero_id = v_pot
                 else a.potrero_id in (select id from potrero where campo_id = p_campo_id) end)
     order by a.created_at
     limit 1
     for update of a;

    if v_animal is null then
      v_sin := v_sin || jsonb_build_array(coalesce(v_visual, v_rfid));
      continue;
    end if;

    insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual, vigente)
    values (p_empresa_id, v_animal, v_rfid, v_visual, true);

    update animal set
      fecha_nacimiento = coalesce(nullif(v_f->>'nacimiento', '')::date, fecha_nacimiento),
      raza = coalesce(nullif(trim(v_f->>'raza'), ''), raza),
      updated_at = now()
     where id = v_animal;

    insert into evento (empresa_id, animal_id, tipo, datos)
    values (p_empresa_id, v_animal, 'caravana_asignada',
            jsonb_strip_nulls(jsonb_build_object('rfid', v_rfid, 'visual', v_visual, 'origen', 'planilla')));
    v_ok := v_ok + 1;
  end loop;

  return jsonb_build_object('asignadas', v_ok, 'sin_animal', v_sin);
exception
  when unique_violation then
    raise exception 'Una de las electrónicas ya está registrada en tu rodeo';
end $$;

grant execute on function asignar_caravanas_planilla(uuid, uuid, jsonb) to authenticated;
grant execute on function animal_por_caravana(uuid, text) to authenticated;
