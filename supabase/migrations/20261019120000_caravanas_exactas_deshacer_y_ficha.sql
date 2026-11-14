-- Caravanas sin suponer nada (rediseño Tropero, 19/10).
--
--  1. asignar_caravanas: reemplaza a asignar_caravanas_planilla. Aquella
--     elegía «el primer animal sin caravana de esa categoría en el potrero, o
--     en cualquier potrero del campo». Ahora la app manda el animal exacto de
--     cada número (lo eligió el productor: campo, potrero y categoría) y la
--     base sólo controla que siga sin caravana. Todo o nada: si uno falla, no
--     se pone ninguno. Cada carga lleva un `lote` para poder deshacerla.
--  2. deshacer_caravanas: saca las caravanas de una carga, mientras sigan
--     puestas, y deja en la historia que se deshizo (evento es append-only).
--  3. poner_caravana: la primera caravana de UN animal, desde su ficha.
--     Visible y/o chip; `cambiar_caravana` sigue siendo para reemplazarla.

drop function if exists asignar_caravanas_planilla(uuid, uuid, jsonb);

create or replace function asignar_caravanas(
  p_empresa_id uuid,
  p_lote       uuid,
  p_filas      jsonb      -- [{"animal_id","visual","rfid","nacimiento","raza"}]
) returns int
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
begin
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

    -- La planilla completa lo que falta; lo que el animal ya tenía no se pisa.
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
  return v_ok;
exception
  when unique_violation then
    raise exception 'Una de las electrónicas ya está registrada en tu rodeo';
end $$;

grant execute on function asignar_caravanas(uuid, uuid, jsonb) to authenticated;

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
    select e.empresa_id, e.animal_id, e.datos from evento e
     where e.tipo = 'caravana_asignada' and e.datos->>'lote' = p_lote::text
  loop
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

    insert into evento (empresa_id, animal_id, tipo, nota, datos)
    values (v_e.empresa_id, v_e.animal_id, 'nota', 'Se deshizo la carga de la planilla',
            jsonb_build_object('deshace', p_lote));
    v_ok := v_ok + 1;
  end loop;
  return v_ok;
end $$;

grant execute on function deshacer_caravanas(uuid) to authenticated;

create or replace function poner_caravana(
  p_animal_id uuid,
  p_visual    text default null,
  p_rfid      text default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_visual text := nullif(trim(p_visual), '');
  v_rfid   text := nullif(trim(p_rfid), '');
begin
  if v_visual is null and v_rfid is null then
    raise exception 'Escribí el número de la caravana';
  end if;

  select empresa_id into v_empresa_id from animal
   where id = p_animal_id and estado = 'activo'
   for update;
  if v_empresa_id is null then
    raise exception 'Animal no encontrado';
  end if;

  if exists (select 1 from caravana where animal_id = p_animal_id and vigente) then
    raise exception 'Este animal ya tiene caravana: usá «Cambiar caravana»';
  end if;

  if animal_por_caravana(v_empresa_id, coalesce(v_rfid, v_visual)) is not null
     or (v_rfid is not null and v_visual is not null and animal_por_caravana(v_empresa_id, v_visual) is not null) then
    raise exception 'La % ya está puesta en otro animal', coalesce(v_visual, v_rfid);
  end if;

  insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual, vigente)
  values (v_empresa_id, p_animal_id, v_rfid, v_visual, true);

  insert into evento (empresa_id, animal_id, tipo, datos)
  values (v_empresa_id, p_animal_id, 'caravana_asignada',
          jsonb_strip_nulls(jsonb_build_object('rfid', v_rfid, 'visual', v_visual, 'origen', 'ficha')));
exception
  when unique_violation then
    raise exception 'Esa caravana ya está registrada en tu rodeo';
end $$;

grant execute on function poner_caravana(uuid, text, text) to authenticated;
