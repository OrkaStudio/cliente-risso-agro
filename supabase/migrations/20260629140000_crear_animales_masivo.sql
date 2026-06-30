-- =====================================================================
--  RPC: carga masiva de animales por lote, SIN caravana.
--  Cada animal queda como FILA individual (sexo derivado de la categoría),
--  sin caravana vigente → se caravanean después en la manga.
--  Mismo patrón que el resto de Hacienda: SECURITY INVOKER (todo bajo la RLS
--  del usuario, `empresa_id IN auth_empresa_ids()`), cuerpo atómico.
-- =====================================================================
create or replace function crear_animales_masivo(
  p_empresa_id uuid,
  p_potrero_id uuid default null,
  p_lote_id    uuid default null,
  p_origen     text default null,
  p_items      jsonb default '[]'::jsonb   -- [{"categoria":"vaca","cantidad":87}, ...]
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item   jsonb;
  v_cat    categoria_animal;
  v_cant   int;
  v_total  int := 0;
  v_pedido int;
  v_id     uuid;
  i        int;
begin
  -- Cota de seguridad: total razonable por carga.
  select coalesce(sum(greatest((x->>'cantidad')::int, 0)), 0)
    into v_pedido
    from jsonb_array_elements(p_items) x;
  if v_pedido <= 0 then
    raise exception 'No hay cantidades para cargar';
  end if;
  if v_pedido > 2000 then
    raise exception 'Carga demasiado grande (máx. 2000 por vez): %', v_pedido;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cat  := (v_item->>'categoria')::categoria_animal;  -- valida contra el enum
    v_cant := greatest(coalesce((v_item->>'cantidad')::int, 0), 0);
    for i in 1..v_cant loop
      insert into animal (empresa_id, categoria, potrero_id, lote_id, origen)
      values (p_empresa_id, v_cat, p_potrero_id, p_lote_id, nullif(trim(p_origen), ''))
      returning id into v_id;

      insert into evento (empresa_id, animal_id, tipo, datos)
      values (p_empresa_id, v_id, 'alta',
              jsonb_build_object('carga', 'masiva', 'sin_caravana', true));

      v_total := v_total + 1;
    end loop;
  end loop;

  return v_total;
end $$;
