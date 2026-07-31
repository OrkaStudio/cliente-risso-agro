-- ---------------------------------------------------------------------------
-- mover_animales v3: movimiento PARCIAL usable desde el campo.
--
-- Dos formas nuevas, ambas sobre `p_items`:
--
--  1. Cantidad NULL / ausente = TODAS las de esa categoría.
--     Parado en la portera nadie cuenta: mira qué tipo de animal pasa. Cubre
--     destete ("se fueron los terneros") y los apartes por categoría, con la
--     misma robustez que mover la tropa entera — no hay número que tenga que
--     coincidir con nada.
--
--  2. `p_tolerante` = mover LO QUE HAYA en vez de rechazar.
--     Sin esto, pedir 40 cuando hay 38 aborta el movimiento entero. En Oficina
--     está bien (mirás datos frescos y corregís). En el campo no: la
--     declaración llega horas o días después y los animales YA cruzaron el
--     alambre. Rechazar deja la realidad y la base divergentes sin nadie ahí.
--     Default false → Oficina conserva exactamente su comportamiento actual.
--
-- El resultado ahora informa `faltantes` por categoría, para poder decirle al
-- productor "pediste 40, moví 38" en vez de que la diferencia sea invisible.
--
-- DROP + CREATE otra vez (leccion 2026-07-30-risso-agro-rpc-sobrecarga-postgrest).
-- ---------------------------------------------------------------------------
drop function if exists public.mover_animales(uuid, uuid, uuid, uuid, boolean, jsonb, uuid[], uuid, text, uuid, date, jsonb);

create function public.mover_animales(
  p_empresa_id      uuid,
  p_potrero_destino uuid,
  p_potrero_origen  uuid default null::uuid,
  p_lote_id         uuid default null::uuid,
  p_todo            boolean default false,
  p_items           jsonb default null::jsonb,
  p_animal_ids      uuid[] default null::uuid[],
  p_lote_destino    uuid default null::uuid,
  p_lote_nuevo      text default null::text,
  p_alta_id         uuid default null::uuid,
  p_fecha           date default null::date,
  p_contexto        jsonb default null::jsonb,
  p_tolerante       boolean default false
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_ids           uuid[];
  v_sel           uuid[];
  v_modos         int;
  v_campo_origen  uuid;
  v_campo_destino uuid;
  v_lote_final    uuid;
  v_keep_each     boolean := false;
  v_tropa_mudada  boolean := false;
  v_item          jsonb;
  v_cat           categoria_animal;
  v_cant          int;
  v_disp          int;
  v_todas         boolean;
  v_restantes     int;
  v_nombre_pd     text;
  v_nombre_ld     text;
  v_previo        jsonb;
  v_res           jsonb;
  v_faltantes     jsonb := '[]'::jsonb;
  v_fecha         date := coalesce(p_fecha, current_date);
begin
  -- ── Idempotencia: se RESERVA el id antes de mover nada ────────────
  if p_alta_id is not null then
    insert into operacion_campo (cliente_id, empresa_id, tipo, resultado)
    values (p_alta_id, p_empresa_id,
            coalesce(nullif(trim(coalesce(p_contexto->>'tipo', '')), ''), 'movimiento'),
            '{}'::jsonb)
    on conflict (cliente_id) do nothing;

    if not found then
      select resultado into v_previo
        from operacion_campo where cliente_id = p_alta_id;
      return coalesce(v_previo, '{}'::jsonb);
    end if;
  end if;

  -- ── Validaciones de forma ─────────────────────────────────────────
  v_modos := (p_animal_ids is not null)::int + p_todo::int + (p_items is not null)::int;
  if v_modos <> 1 then
    raise exception 'Elegí UN modo de selección: animal_ids, todo, o items';
  end if;
  if p_lote_destino is not null and p_lote_nuevo is not null then
    raise exception 'Tropa destino: existente O nueva, no ambas';
  end if;
  if p_animal_ids is null and p_potrero_origen is null then
    raise exception 'Falta el potrero de origen';
  end if;
  if p_potrero_origen is not null and p_potrero_origen = p_potrero_destino then
    raise exception 'El destino es el mismo potrero de origen';
  end if;

  select p.campo_id, p.nombre into v_campo_destino, v_nombre_pd
    from potrero p where p.id = p_potrero_destino and p.empresa_id = p_empresa_id;
  if v_campo_destino is null then
    raise exception 'Potrero destino inexistente';
  end if;
  if p_potrero_origen is not null then
    select p.campo_id into v_campo_origen
      from potrero p where p.id = p_potrero_origen and p.empresa_id = p_empresa_id;
    if v_campo_origen is null then
      raise exception 'Potrero origen inexistente';
    end if;
  end if;

  -- ── Selección de animales (lockeados FOR UPDATE) ──────────────────
  if p_animal_ids is not null then
    select array_agg(id) into v_ids from (
      select a.id from animal a
      where a.id = any(p_animal_ids)
        and a.empresa_id = p_empresa_id
        and a.estado = 'activo'
      for update of a
    ) s;
    if coalesce(array_length(v_ids, 1), 0) <>
       (select count(distinct x) from unnest(p_animal_ids) x) then
      raise exception 'Hay animales inexistentes o no activos en la selección';
    end if;

  elsif p_todo then
    select array_agg(id) into v_ids from (
      select a.id from animal a
      where a.empresa_id = p_empresa_id
        and a.estado = 'activo'
        and a.potrero_id = p_potrero_origen
        and a.lote_id is not distinct from p_lote_id
      for update of a
    ) s;

  else
    v_ids := '{}';
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_cat := (v_item->>'categoria')::categoria_animal;  -- valida contra el enum

      -- cantidad ausente o null ⇒ TODAS las de esa categoría
      v_todas := (v_item->'cantidad') is null
                 or jsonb_typeof(v_item->'cantidad') = 'null';

      if v_todas then
        select array_agg(id) into v_sel from (
          select a.id from animal a
          where a.empresa_id = p_empresa_id
            and a.estado = 'activo'
            and a.potrero_id = p_potrero_origen
            and a.lote_id is not distinct from p_lote_id
            and a.categoria = v_cat
          for update of a
        ) s;
        v_ids := v_ids || coalesce(v_sel, '{}');
        continue;
      end if;

      v_cant := coalesce((v_item->>'cantidad')::int, 0);
      continue when v_cant <= 0;
      select array_agg(id) into v_sel from (
        select a.id from animal a
        left join caravana c on c.animal_id = a.id and c.vigente
        where a.empresa_id = p_empresa_id
          and a.estado = 'activo'
          and a.potrero_id = p_potrero_origen
          and a.lote_id is not distinct from p_lote_id
          and a.categoria = v_cat
        order by (c.id is not null), a.created_at
        limit v_cant
        for update of a
      ) s;
      v_disp := coalesce(array_length(v_sel, 1), 0);
      if v_disp < v_cant then
        if not p_tolerante then
          raise exception 'Pediste mover % de "%" pero hay %', v_cant, v_cat, v_disp;
        end if;
        -- Tolerante: se mueve lo que hay y se informa la diferencia.
        v_faltantes := v_faltantes || jsonb_build_object(
          'categoria', v_cat, 'pedido', v_cant, 'movido', v_disp);
      end if;
      v_ids := v_ids || coalesce(v_sel, '{}');
    end loop;
  end if;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'No hay animales para mover';
  end if;
  if array_length(v_ids, 1) > 2000 then
    raise exception 'Movimiento demasiado grande (máx. 2000 por vez): %',
      array_length(v_ids, 1);
  end if;

  -- ── Resolver la tropa destino ─────────────────────────────────────
  if p_lote_nuevo is not null then
    if trim(p_lote_nuevo) = '' then
      raise exception 'El nombre de la tropa nueva está vacío';
    end if;
    insert into lote (empresa_id, campo_id, nombre)
      values (p_empresa_id, v_campo_destino, trim(p_lote_nuevo))
      returning id, nombre into v_lote_final, v_nombre_ld;

  elsif p_lote_destino is not null then
    select l.id, l.nombre into v_lote_final, v_nombre_ld
      from lote l where l.id = p_lote_destino and l.empresa_id = p_empresa_id;
    if v_lote_final is null then
      raise exception 'Tropa destino inexistente';
    end if;
    if (select campo_id from lote where id = v_lote_final)
       is distinct from v_campo_destino then
      raise exception 'La tropa destino no pertenece al campo del potrero destino';
    end if;

  elsif p_animal_ids is not null then
    v_keep_each := true;
    if exists (
      select 1 from animal a join lote l on l.id = a.lote_id
      where a.id = any(v_ids) and l.campo_id is distinct from v_campo_destino
    ) then
      raise exception 'Animales de tropas de otro campo: indicá la tropa destino (existente o nueva)';
    end if;

  else
    v_lote_final := p_lote_id;
    if v_lote_final is not null then
      select nombre into v_nombre_ld from lote where id = v_lote_final;
      if p_items is not null and v_campo_origen is distinct from v_campo_destino then
        raise exception 'Movés una parte de la tropa a otro campo: elegí una tropa destino (existente o nueva)';
      end if;
    end if;
  end if;

  -- ── Estado previo ─────────────────────────────────────────────────
  drop table if exists _mov;
  create temp table _mov on commit drop as
    select a.id, a.potrero_id as potrero_old, a.lote_id as lote_old
    from animal a where a.id = any(v_ids);

  -- ── Movimiento ────────────────────────────────────────────────────
  if v_keep_each then
    update animal set potrero_id = p_potrero_destino, updated_at = now()
      where id = any(v_ids);
  else
    update animal set potrero_id = p_potrero_destino, lote_id = v_lote_final,
                      updated_at = now()
      where id = any(v_ids);
  end if;

  insert into evento (empresa_id, animal_id, tipo, fecha, datos)
  select p_empresa_id, m.id, 'movimiento', v_fecha,
    jsonb_strip_nulls(jsonb_build_object(
      'potrero_origen_id',  m.potrero_old,
      'potrero_origen',     po.nombre,
      'lote_origen_id',     m.lote_old,
      'lote_origen',        lo.nombre,
      'potrero_destino_id', p_potrero_destino,
      'potrero_destino',    v_nombre_pd,
      'lote_destino_id',    case when v_keep_each then m.lote_old else v_lote_final end,
      'lote_destino',       case when v_keep_each then lo.nombre else v_nombre_ld end
    )) || coalesce(p_contexto, '{}'::jsonb)
  from _mov m
  left join potrero po on po.id = m.potrero_old
  left join lote lo on lo.id = m.lote_old;

  -- ── Mudanza de tropa entera a otro campo ──────────────────────────
  if p_todo and p_lote_id is not null
     and p_lote_destino is null and p_lote_nuevo is null
     and v_campo_origen is distinct from v_campo_destino then
    select count(*) into v_restantes
      from animal a join potrero p on p.id = a.potrero_id
      where a.lote_id = p_lote_id and a.estado = 'activo'
        and p.campo_id = v_campo_origen;
    if v_restantes > 0 then
      raise exception 'La tropa quedaría partida en dos campos (quedan % animales en el campo de origen): elegí una tropa destino', v_restantes;
    end if;
    update lote set campo_id = v_campo_destino where id = p_lote_id;
    delete from lote_potrero lp using potrero p
      where lp.lote_id = p_lote_id and lp.potrero_id = p.id
        and p.campo_id = v_campo_origen;
    v_tropa_mudada := true;
  end if;

  -- ── lote_potrero: alta en destino, baja en orígenes vaciados ──────
  insert into lote_potrero (lote_id, potrero_id, empresa_id)
  select distinct a.lote_id, p_potrero_destino, p_empresa_id
    from animal a
    where a.id = any(v_ids) and a.lote_id is not null
  on conflict do nothing;

  delete from lote_potrero lp
  using (
    select distinct m.lote_old as lote_id, m.potrero_old as potrero_id
    from _mov m
    where m.lote_old is not null and m.potrero_old is not null
  ) o
  where lp.lote_id = o.lote_id and lp.potrero_id = o.potrero_id
    and not exists (
      select 1 from animal a
      where a.lote_id = o.lote_id and a.potrero_id = o.potrero_id
        and a.estado = 'activo'
    );

  v_res := jsonb_build_object(
    'movidos', array_length(v_ids, 1),
    'lote_destino_id', v_lote_final,
    'tropa_mudada', v_tropa_mudada,
    'faltantes', v_faltantes
  );

  if p_alta_id is not null then
    update operacion_campo set resultado = v_res where cliente_id = p_alta_id;
  end if;

  return v_res;
end;
$function$;
