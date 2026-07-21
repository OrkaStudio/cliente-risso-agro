-- =====================================================================
--  Propósito estandarizado (enum) + carga que suma a un lote existente.
--
--  Motivo: el propósito de tropa era texto libre ("Cría", "Cría - Invernada",
--  NULL) → inconsistente. Y `crear_lote_repartido` SIEMPRE creaba un lote nuevo
--  al recibir nombre → cargas repetidas generaban "Lote 1" duplicados. Ahora:
--   1) `proposito_lote` es un enum fijo (alimenta filtros y analítica).
--   2) La RPC acepta `p_lote_id` → suma animales a una tropa YA existente.
--
--  Aplicada a prod vía Supabase MCP el 2026-07-20 (2 pasos: esta + un fix del
--  cuerpo del loop). Este archivo es la versión final consolidada.
--  Nota: la limpieza de los "Lote N" duplicados ya existentes se hizo aparte,
--  como data-fix puntual (no forma parte del esquema).
-- =====================================================================

-- 1) Enum estandarizado de propósito de tropa.
create type proposito_lote as enum
  ('cria', 'recria', 'invernada', 'reproductores', 'consumo', 'general');

-- 2) lote.proposito: text -> enum (mapea los valores legacy; desconocido -> general).
alter table lote alter column proposito drop default;
alter table lote alter column proposito type proposito_lote using (
  case lower(trim(coalesce(proposito, '')))
    when ''                 then 'general'
    when 'cría'             then 'cria'
    when 'cria'             then 'cria'
    when 'recría'           then 'recria'
    when 'recria'           then 'recria'
    when 'invernada'        then 'invernada'
    when 'cría - invernada' then 'invernada'
    when 'cria - invernada' then 'invernada'
    when 'reproductores'    then 'reproductores'
    when 'consumo'          then 'consumo'
    else 'general'
  end::proposito_lote
);
alter table lote alter column proposito set default 'general';
alter table lote alter column proposito set not null;

-- 3) RPC: sumar a un lote existente (p_lote_id) + proposito estandarizado.
drop function if exists crear_lote_repartido(uuid, uuid, text, text, text, jsonb);

create or replace function crear_lote_repartido(
  p_empresa_id     uuid,
  p_campo_id       uuid  default null,
  p_lote_nombre    text  default null,
  p_lote_proposito text  default null,
  p_origen         text  default null,
  p_bloques        jsonb default '[]'::jsonb,
  p_lote_id        uuid  default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lote_id uuid;
  v_prop    proposito_lote;
  v_bloque  jsonb;
  v_item    jsonb;
  v_potrero uuid;
  v_cat     categoria_animal;
  v_cant    int;
  v_total   int := 0;
  v_pedido  int;
  v_id      uuid;
  i         int;
begin
  select coalesce(sum(greatest((it->>'cantidad')::int, 0)), 0)
    into v_pedido
    from jsonb_array_elements(p_bloques) b,
         jsonb_array_elements(b->'items') it;
  if v_pedido <= 0 then
    raise exception 'No hay cantidades para cargar';
  end if;
  if v_pedido > 5000 then
    raise exception 'Carga demasiado grande (máx. 5000 por vez): %', v_pedido;
  end if;

  -- Normalizar proposito: acepta valores nuevos y legacy; desconocido -> general.
  v_prop := case lower(trim(coalesce(p_lote_proposito, '')))
    when ''                 then null
    when 'cría'             then 'cria'
    when 'cria'             then 'cria'
    when 'recría'           then 'recria'
    when 'recria'           then 'recria'
    when 'invernada'        then 'invernada'
    when 'cría - invernada' then 'invernada'
    when 'cria - invernada' then 'invernada'
    when 'reproductores'    then 'reproductores'
    when 'consumo'          then 'consumo'
    when 'general'          then 'general'
    else 'general'
  end::proposito_lote;

  if p_lote_id is not null then
    -- Sumar a un lote existente: usarlo y registrar los potreros de esta carga.
    v_lote_id := p_lote_id;
    insert into lote_potrero (lote_id, potrero_id, empresa_id)
    select distinct v_lote_id, (b->>'potrero_id')::uuid, p_empresa_id
      from jsonb_array_elements(p_bloques) b
     where nullif(b->>'potrero_id', '') is not null
    on conflict do nothing;
  elsif nullif(trim(coalesce(p_lote_nombre, '')), '') is not null then
    insert into lote (empresa_id, nombre, proposito, campo_id, potrero_id)
    values (
      p_empresa_id,
      trim(p_lote_nombre),
      coalesce(v_prop, 'general'),
      p_campo_id,
      (select nullif(b->>'potrero_id', '')::uuid
         from jsonb_array_elements(p_bloques) b
        where nullif(b->>'potrero_id', '') is not null
        limit 1)
    )
    returning id into v_lote_id;

    insert into lote_potrero (lote_id, potrero_id, empresa_id)
    select distinct v_lote_id, (b->>'potrero_id')::uuid, p_empresa_id
      from jsonb_array_elements(p_bloques) b
     where nullif(b->>'potrero_id', '') is not null
    on conflict do nothing;
  end if;

  for v_bloque in select * from jsonb_array_elements(p_bloques)
  loop
    v_potrero := nullif(v_bloque->>'potrero_id', '')::uuid;
    for v_item in select * from jsonb_array_elements(v_bloque->'items')
    loop
      v_cat  := (v_item->>'categoria')::categoria_animal;
      v_cant := greatest(coalesce((v_item->>'cantidad')::int, 0), 0);
      for i in 1..v_cant loop
        insert into animal (empresa_id, categoria, potrero_id, lote_id, origen)
        values (p_empresa_id, v_cat, v_potrero, v_lote_id,
                nullif(trim(coalesce(p_origen, '')), ''))
        returning id into v_id;

        insert into evento (empresa_id, animal_id, tipo, datos)
        values (p_empresa_id, v_id, 'alta',
                jsonb_build_object('carga', 'masiva', 'sin_caravana', true));

        v_total := v_total + 1;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('lote_id', v_lote_id, 'total', v_total);
end $$;
