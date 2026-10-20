-- Ficha del animal: un solo panel, «Corregir datos» (rediseño Tropero, 19/10).
--
-- corregir_animal corrige en una sola operación, todo o nada, lo que estaba
-- mal cargado: qué es, cuándo nació, raza, pelaje, la caravana y el potrero.
-- Sólo toca las claves que vienen en p_cambios. Lo de antes queda en la
-- historia, que no se borra nunca:
--   · los datos, en un evento 'nota' con {correccion: {campo: {antes, despues}}};
--   · la caravana, como 'caravana_asignada' (no tenía) o 'cambio_caravana'
--     (tenía), con la de antes;
--   · el potrero, como un 'movimiento' (vía mover_animales). Si el potrero
--     nuevo es de otro campo y el animal estaba en una tropa de ese campo,
--     sale de la tropa (una tropa vive en un campo).

create or replace function corregir_animal(
  p_animal_id uuid,
  p_cambios   jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_a        animal%rowtype;
  v_cor      jsonb := '{}'::jsonb;
  v_vis_ant  text;
  v_rfid_ant text;
  v_visual   text;
  v_rfid     text;
  v_otro     uuid;
  v_campo    uuid;
  v_txt      text;
begin
  select * into v_a from animal where id = p_animal_id and estado = 'activo' for update;
  if v_a.id is null then
    raise exception 'Animal no encontrado';
  end if;

  -- 1. Los datos.
  if p_cambios ? 'categoria' and (p_cambios->>'categoria')::categoria_animal is distinct from v_a.categoria then
    v_cor := v_cor || jsonb_build_object('categoria', jsonb_build_object('antes', v_a.categoria, 'despues', p_cambios->>'categoria'));
    update animal set categoria = (p_cambios->>'categoria')::categoria_animal where id = p_animal_id;
  end if;
  if p_cambios ? 'fecha_nacimiento' and nullif(p_cambios->>'fecha_nacimiento', '')::date is distinct from v_a.fecha_nacimiento then
    if nullif(p_cambios->>'fecha_nacimiento', '')::date > current_date then
      raise exception 'La fecha de nacimiento no puede ser futura';
    end if;
    v_cor := v_cor || jsonb_build_object('fecha_nacimiento', jsonb_build_object('antes', v_a.fecha_nacimiento, 'despues', nullif(p_cambios->>'fecha_nacimiento', '')));
    update animal set fecha_nacimiento = nullif(p_cambios->>'fecha_nacimiento', '')::date where id = p_animal_id;
  end if;
  foreach v_txt in array array['raza', 'pelaje'] loop
    if p_cambios ? v_txt and nullif(trim(p_cambios->>v_txt), '') is distinct from (case v_txt when 'raza' then v_a.raza else v_a.pelaje end) then
      v_cor := v_cor || jsonb_build_object(v_txt, jsonb_build_object('antes', case v_txt when 'raza' then v_a.raza else v_a.pelaje end, 'despues', nullif(trim(p_cambios->>v_txt), '')));
      if v_txt = 'raza' then
        update animal set raza = nullif(trim(p_cambios->>'raza'), '') where id = p_animal_id;
      else
        update animal set pelaje = nullif(trim(p_cambios->>'pelaje'), '') where id = p_animal_id;
      end if;
    end if;
  end loop;
  if v_cor <> '{}'::jsonb then
    update animal set updated_at = now() where id = p_animal_id;
    insert into evento (empresa_id, animal_id, tipo, nota, datos)
    values (v_a.empresa_id, p_animal_id, 'nota', 'Se corrigieron datos', jsonb_build_object('correccion', v_cor));
  end if;

  -- 2. La caravana.
  if p_cambios ? 'visual' or p_cambios ? 'rfid' then
    select numero_visual, numero_rfid into v_vis_ant, v_rfid_ant from caravana where animal_id = p_animal_id and vigente;
    v_visual := case when p_cambios ? 'visual' then nullif(trim(p_cambios->>'visual'), '') else v_vis_ant end;
    v_rfid   := case when p_cambios ? 'rfid' then nullif(trim(p_cambios->>'rfid'), '') else v_rfid_ant end;
    if v_visual is distinct from v_vis_ant or v_rfid is distinct from v_rfid_ant then
      if v_visual is null and v_rfid is null then
        raise exception 'Escribí el número de la caravana';
      end if;
      if v_rfid is distinct from v_rfid_ant and v_rfid is not null and v_rfid !~ '^\d{15}$' then
        raise exception 'El chip tiene que tener 15 números';
      end if;
      foreach v_txt in array array[v_visual, v_rfid] loop
        continue when v_txt is null;
        v_otro := animal_por_caravana(v_a.empresa_id, v_txt);
        if v_otro is not null and v_otro <> p_animal_id then
          raise exception 'La % ya está puesta en otro animal', v_txt;
        end if;
      end loop;

      if v_rfid_ant is not null and v_rfid is not distinct from v_rfid_ant then
        -- El mismo chip (que es único para siempre): se corrige sólo la visible.
        update caravana set numero_visual = v_visual where animal_id = p_animal_id and vigente;
      else
        update caravana set vigente = false, fecha_baja = current_date, motivo_baja = 'corrección'
         where animal_id = p_animal_id and vigente;
        insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual, vigente)
        values (v_a.empresa_id, p_animal_id, v_rfid, v_visual, true);
      end if;

      if v_vis_ant is null and v_rfid_ant is null then
        insert into evento (empresa_id, animal_id, tipo, datos)
        values (v_a.empresa_id, p_animal_id, 'caravana_asignada',
                jsonb_strip_nulls(jsonb_build_object('rfid', v_rfid, 'visual', v_visual, 'origen', 'ficha')));
      else
        insert into evento (empresa_id, animal_id, tipo, nota, datos)
        values (v_a.empresa_id, p_animal_id, 'cambio_caravana', 'corrección',
                jsonb_strip_nulls(jsonb_build_object('nuevo', coalesce(v_rfid, v_visual), 'visual', v_visual, 'rfid', v_rfid, 'origen', 'ficha',
                                                     'antes', jsonb_strip_nulls(jsonb_build_object('visual', v_vis_ant, 'rfid', v_rfid_ant)))));
      end if;
    end if;
  end if;

  -- 3. El potrero.
  if p_cambios ? 'potrero_id' and (p_cambios->>'potrero_id')::uuid is distinct from v_a.potrero_id then
    select campo_id into v_campo from potrero where id = (p_cambios->>'potrero_id')::uuid and empresa_id = v_a.empresa_id;
    if v_campo is null then
      raise exception 'Ese potrero no existe';
    end if;
    if v_a.lote_id is not null and (select campo_id from lote where id = v_a.lote_id) is distinct from v_campo then
      update animal set lote_id = null where id = p_animal_id;
    end if;
    perform mover_animales(p_empresa_id := v_a.empresa_id, p_potrero_destino := (p_cambios->>'potrero_id')::uuid, p_animal_ids := array[p_animal_id]);
  end if;
exception
  when unique_violation then
    raise exception 'Esa caravana ya está registrada en tu rodeo';
end $$;

grant execute on function corregir_animal(uuid, jsonb) to authenticated;
