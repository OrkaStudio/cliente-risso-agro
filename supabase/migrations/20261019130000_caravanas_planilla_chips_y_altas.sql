-- Caravanas desde una planilla, lo que faltaba (rediseño Tropero, 19/10).
--
-- asignar_caravanas suma dos cosas a la misma carga, todo o nada:
--   · p_chips: el chip de animales que ya tienen caravana visible y no lo
--     tenían (la planilla del veterinario lo trae después de la manga).
--   · p_altas: los que entraron y no estaban cargados; se dan de alta con su
--     caravana en el potrero que eligió el productor.
-- deshacer_caravanas deshace también eso: saca el chip sumado y marca como
-- «corregido» al animal dado de alta (el historial no se borra).

drop function if exists asignar_caravanas(uuid, uuid, jsonb);

create or replace function asignar_caravanas(
  p_empresa_id uuid,
  p_lote       uuid,
  p_filas      jsonb,                    -- [{"animal_id","visual","rfid","nacimiento","raza"}]
  p_chips      jsonb default '[]'::jsonb, -- [{"animal_id","rfid"}]
  p_altas      jsonb default '[]'::jsonb  -- [{"categoria","potrero_id","visual","rfid","nacimiento","raza"}]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_f      jsonb;
  v_animal uuid;
  v_visual text;
  v_rfid   text;
  v_antes  jsonb;
  v_ok     int := 0;
  v_chips  int := 0;
  v_altas  int := 0;
begin
  -- 1. Los que ya estaban cargados sin caravana: el animal exacto.
  for v_f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_animal := (v_f->>'animal_id')::uuid;
    v_visual := nullif(trim(v_f->>'visual'), '');
    v_rfid   := nullif(trim(v_f->>'rfid'), '');
    if v_visual is null and v_rfid is null then
      raise exception 'Una fila no tiene número de caravana';
    end if;

    select jsonb_build_object('fecha_nacimiento', a.fecha_nacimiento, 'raza', a.raza) into v_antes
      from animal a
     where a.id = v_animal and a.empresa_id = p_empresa_id and a.estado = 'activo'
       and not exists (select 1 from caravana c where c.animal_id = a.id and c.vigente)
       for update of a;
    if v_antes is null then
      raise exception 'Uno de los animales ya tiene caravana o salió del rodeo. Volvé a subir la planilla.';
    end if;

    if animal_por_caravana(p_empresa_id, coalesce(v_rfid, v_visual)) is not null
       or (v_rfid is not null and v_visual is not null and animal_por_caravana(p_empresa_id, v_visual) is not null) then
      raise exception 'La % ya está puesta en otro animal', coalesce(v_visual, v_rfid);
    end if;

    insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual, vigente)
    values (p_empresa_id, v_animal, v_rfid, v_visual, true);

    update animal set
      fecha_nacimiento = coalesce(fecha_nacimiento, nullif(v_f->>'nacimiento', '')::date),
      raza = coalesce(raza, nullif(trim(v_f->>'raza'), '')),
      updated_at = now()
     where id = v_animal;

    insert into evento (empresa_id, animal_id, tipo, datos)
    values (p_empresa_id, v_animal, 'caravana_asignada',
            jsonb_strip_nulls(jsonb_build_object('rfid', v_rfid, 'visual', v_visual, 'origen', 'planilla', 'lote', p_lote, 'antes', v_antes)));
    v_ok := v_ok + 1;
  end loop;

  -- 2. El chip de los que ya tenían la visible.
  for v_f in select * from jsonb_array_elements(coalesce(p_chips, '[]'::jsonb)) loop
    v_animal := (v_f->>'animal_id')::uuid;
    v_rfid   := nullif(trim(v_f->>'rfid'), '');
    if v_rfid is null then raise exception 'Falta el chip'; end if;
    if animal_por_caravana(p_empresa_id, v_rfid) is not null then
      raise exception 'El chip % ya está puesto en otro animal', v_rfid;
    end if;
    update caravana set numero_rfid = v_rfid
     where animal_id = v_animal and empresa_id = p_empresa_id and vigente and numero_rfid is null;
    if not found then
      raise exception 'Uno de los animales ya tiene chip. Volvé a subir la planilla.';
    end if;
    insert into evento (empresa_id, animal_id, tipo, datos)
    values (p_empresa_id, v_animal, 'caravana_asignada',
            jsonb_build_object('rfid', v_rfid, 'origen', 'planilla', 'lote', p_lote, 'chip_sumado', true));
    v_chips := v_chips + 1;
  end loop;

  -- 3. Los que entraron y no estaban cargados.
  for v_f in select * from jsonb_array_elements(coalesce(p_altas, '[]'::jsonb)) loop
    v_visual := nullif(trim(v_f->>'visual'), '');
    v_rfid   := nullif(trim(v_f->>'rfid'), '');
    if v_visual is null and v_rfid is null then raise exception 'Una fila no tiene número de caravana'; end if;
    if animal_por_caravana(p_empresa_id, coalesce(v_rfid, v_visual)) is not null then
      raise exception 'La % ya está puesta en otro animal', coalesce(v_visual, v_rfid);
    end if;
    if not exists (select 1 from potrero where id = (v_f->>'potrero_id')::uuid and empresa_id = p_empresa_id) then
      raise exception 'Falta el potrero de un animal nuevo';
    end if;

    insert into animal (empresa_id, categoria, potrero_id, origen, fecha_nacimiento, raza)
    values (p_empresa_id, (v_f->>'categoria')::categoria_animal, (v_f->>'potrero_id')::uuid, 'planilla',
            nullif(v_f->>'nacimiento', '')::date, nullif(trim(v_f->>'raza'), ''))
    returning id into v_animal;

    insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual, vigente)
    values (p_empresa_id, v_animal, v_rfid, v_visual, true);

    insert into evento (empresa_id, animal_id, tipo, datos)
    values (p_empresa_id, v_animal, 'alta',
            jsonb_strip_nulls(jsonb_build_object('caravana', coalesce(v_visual, v_rfid), 'origen', 'planilla', 'lote', p_lote)));
    v_altas := v_altas + 1;
  end loop;

  return jsonb_build_object('asignadas', v_ok, 'chips', v_chips, 'altas', v_altas);
exception
  when unique_violation then
    raise exception 'Una de las electrónicas ya está registrada en tu rodeo';
end $$;

grant execute on function asignar_caravanas(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;

create or replace function deshacer_caravanas(p_lote uuid) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_e  record;
  v_ok int := 0;
begin
  if exists (select 1 from evento where tipo = 'nota' and datos->>'deshace' = p_lote::text) then
    return 0; -- ya se deshizo
  end if;
  for v_e in
    select e.empresa_id, e.animal_id, e.tipo, e.datos from evento e
     where e.tipo in ('caravana_asignada', 'alta') and e.datos->>'lote' = p_lote::text
  loop
    if v_e.tipo = 'alta' then
      -- Entró por la planilla: se saca la caravana y queda como cargado de más.
      delete from caravana c where c.animal_id = v_e.animal_id and c.vigente;
      update animal set estado = 'corregido', updated_at = now() where id = v_e.animal_id and estado = 'activo';
      if not found then continue; end if;
    elsif (v_e.datos->>'chip_sumado')::boolean then
      update caravana set numero_rfid = null
       where animal_id = v_e.animal_id and vigente and numero_rfid = v_e.datos->>'rfid';
      if not found then continue; end if;
    else
      delete from caravana c
       where c.animal_id = v_e.animal_id and c.vigente
         and c.numero_visual is not distinct from (v_e.datos->>'visual')
         and c.numero_rfid is not distinct from (v_e.datos->>'rfid');
      if not found then continue; end if; -- ya la cambiaron: no se toca
      update animal set
        fecha_nacimiento = (v_e.datos->'antes'->>'fecha_nacimiento')::date,
        raza = v_e.datos->'antes'->>'raza',
        updated_at = now()
       where id = v_e.animal_id;
    end if;

    insert into evento (empresa_id, animal_id, tipo, nota, datos)
    values (v_e.empresa_id, v_e.animal_id, 'nota', 'Se deshizo la carga de la planilla',
            jsonb_build_object('deshace', p_lote));
    v_ok := v_ok + 1;
  end loop;
  return v_ok;
end $$;

grant execute on function deshacer_caravanas(uuid) to authenticated;
