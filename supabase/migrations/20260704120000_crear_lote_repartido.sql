-- =====================================================================
--  RPC: crear un lote repartido en varios potreros, en UNA sola transacción.
--
--  Reemplaza el patrón anterior (el cliente hacía 1 RPC por potrero + inserts
--  sueltos de lote/lote_potrero → si fallaba a mitad quedaban cosas a medias).
--  Ahora todo es atómico: crea el lote (si viene nombre), lo registra en cada
--  potrero (lote_potrero) y crea los animales sin caravana repartidos por
--  potrero. O todo, o nada.
--
--  SECURITY INVOKER → corre bajo la RLS del usuario (empresa_id IN
--  auth_empresa_ids()). La función vieja `crear_animales_masivo` queda sin uso
--  (additivo, no se borra).
--
--  p_bloques: [{"potrero_id": uuid|null, "items":[{"categoria","cantidad"}]}]
--  Devuelve:  {"lote_id": uuid|null, "total": int}
--
--  Aplicada a prod vía Supabase MCP el 2026-07-04.
-- =====================================================================
create or replace function crear_lote_repartido(
  p_empresa_id     uuid,
  p_campo_id       uuid  default null,
  p_lote_nombre    text  default null,
  p_lote_proposito text  default null,
  p_origen         text  default null,
  p_bloques        jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lote_id uuid;
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
  -- Cota total de seguridad.
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

  -- Crear el lote (si viene nombre) en el campo, y registrar sus potreros.
  if nullif(trim(coalesce(p_lote_nombre, '')), '') is not null then
    insert into lote (empresa_id, nombre, proposito, campo_id, potrero_id)
    values (
      p_empresa_id,
      trim(p_lote_nombre),
      nullif(trim(coalesce(p_lote_proposito, '')), ''),
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

  -- Crear los animales, por bloque (potrero).
  for v_bloque in select * from jsonb_array_elements(p_bloques)
  loop
    v_potrero := nullif(v_bloque->>'potrero_id', '')::uuid;
    for v_item in select * from jsonb_array_elements(v_bloque->'items')
    loop
      v_cat  := (v_item->>'categoria')::categoria_animal;  -- valida contra el enum
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
