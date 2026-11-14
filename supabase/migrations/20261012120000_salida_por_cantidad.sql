-- =====================================================================
--  Salieron, por cantidad: «vendí 12 terneros del 11B» sin leer caravanas.
--
--  Decisión de Lau (28/09): se vende sin leer caravanas; si los que salen
--  tienen caravana, quedan «pendientes de identificar» hasta que se diga
--  cuáles fueron (planilla, rango o la próxima manga). Lo cargado de más es
--  «corregir cabezas», no una venta ni una muerte.
--
--  Elige PRIMERO los sin caravana (como mover_animales): un caravaneado es
--  un individuo y darlo de baja «de a montón» puede no ser el que salió.
--  Los caravaneados que entran en la cuenta llevan pendiente_identificar en
--  su evento de baja; la salida entera comparte un salida_id.
--
--  Corregir cabezas sólo toca animales sin caravana: uno con caravana
--  existe (alguien lo leyó), así que no puede «sobrar».
--
--  SECURITY INVOKER: todo bajo la RLS del usuario.
-- =====================================================================
alter type estado_animal add value if not exists 'corregido';

create or replace function salida_por_cantidad(
  p_empresa_id uuid,
  p_potrero_id uuid,
  p_items      jsonb,             -- [{"categoria":"ternero","cantidad":12}]
  p_motivo     text,              -- venta | muerte | correccion
  p_fecha      date default current_date,
  p_nota       text default null
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
    v_cat  := (v_item->>'categoria')::categoria_animal;
    v_cant := (v_item->>'cantidad')::int;
    if v_cant is null or v_cant <= 0 then continue; end if;

    select count(*) into v_hay from animal a
     where a.empresa_id = p_empresa_id and a.potrero_id = p_potrero_id
       and a.categoria = v_cat and a.estado = 'activo'
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
         and a.categoria = v_cat and a.estado = 'activo'
         and (p_motivo <> 'correccion' or not exists (select 1 from caravana c where c.animal_id = a.id and c.vigente))
       order by exists (select 1 from caravana c where c.animal_id = a.id and c.vigente), a.created_at
       limit v_cant
       for update of a
    ) x;
    v_ids := v_ids || v_sel;
  end loop;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'Elegí cuántos salen';
  end if;

  update animal set estado = v_estado, updated_at = now() where id = any(v_ids);

  insert into evento (empresa_id, animal_id, tipo, fecha, nota, datos)
  select p_empresa_id, a.id, 'baja', p_fecha, nullif(trim(p_nota), ''),
         jsonb_build_object('estado', v_estado, 'motivo', p_motivo, 'por_cantidad', true, 'salida_id', v_salida)
         || case when exists (select 1 from caravana c where c.animal_id = a.id and c.vigente)
                 then '{"pendiente_identificar": true}'::jsonb else '{}'::jsonb end
    from animal a where a.id = any(v_ids);

  select count(*) into v_pend from caravana c where c.animal_id = any(v_ids) and c.vigente;

  return jsonb_build_object(
    'salieron', array_length(v_ids, 1),
    'pendientes_identificar', v_pend,
    'salida_id', v_salida
  );
end $$;

grant execute on function salida_por_cantidad(uuid, uuid, jsonb, text, date, text) to authenticated;
