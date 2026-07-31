-- ---------------------------------------------------------------------------
-- Operaciones de hacienda declaradas EN EL CAMPO: idempotencia server-side.
--
-- El teléfono genera un `cliente_id` por operación y lo manda con la RPC. Si el
-- ACK se pierde a mitad de vuelo (el escenario normal con señal intermitente),
-- el reintento NO puede volver a crear los animales. La fila acá es la marca de
-- "esto ya se procesó" y guarda el resultado para devolver lo mismo.
-- ---------------------------------------------------------------------------
create table if not exists public.operacion_campo (
  cliente_id  uuid primary key,
  empresa_id  uuid not null references public.empresa(id) on delete cascade,
  tipo        text not null,
  resultado   jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.operacion_campo enable row level security;

drop policy if exists operacion_campo_mod on public.operacion_campo;
create policy operacion_campo_mod on public.operacion_campo
  for all
  using (empresa_id in (select auth_empresa_ids()))
  with check (empresa_id in (select auth_empresa_ids()));

create index if not exists operacion_campo_empresa_fecha_idx
  on public.operacion_campo (empresa_id, created_at desc);

-- ---------------------------------------------------------------------------
-- crear_animales_masivo v2.
--
-- Se DROPEA y se recrea (no CREATE OR REPLACE): agregar parámetros genera una
-- SOBRECARGA y PostgREST queda con dos candidatas ambiguas. Los 5 parámetros
-- originales conservan nombre, tipo y orden, así que la carga masiva de Oficina
-- sigue llamando igual — los 3 nuevos son opcionales.
--
-- Novedades:
--   · p_alta_id  → idempotencia (reintento = no-op que devuelve el total previo)
--   · p_fecha    → fecha REAL del hecho. Un nacimiento anotado sin señal el
--                  lunes y sincronizado el jueves queda fechado el lunes, no el
--                  jueves: va a `animal.fecha_nacimiento` y a `evento.fecha`.
--   · p_contexto → de dónde salió (recorrida, potrero), para que un nacimiento
--                  del campo no sea indistinguible de una carga de escritorio.
-- ---------------------------------------------------------------------------
drop function if exists public.crear_animales_masivo(uuid, uuid, uuid, text, jsonb);

create function public.crear_animales_masivo(
  p_empresa_id uuid,
  p_potrero_id uuid default null::uuid,
  p_lote_id    uuid default null::uuid,
  p_origen     text default null::text,
  p_items      jsonb default '[]'::jsonb,
  p_alta_id    uuid default null::uuid,
  p_fecha      date default null::date,
  p_contexto   jsonb default null::jsonb
)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_item     jsonb;
  v_cat      categoria_animal;
  v_cant     int;
  v_total    int := 0;
  v_pedido   int;
  v_id       uuid;
  v_previo   int;
  v_fecha    date := coalesce(p_fecha, current_date);
  v_nacido   boolean := (nullif(trim(coalesce(p_origen, '')), '') = 'nacido');
  v_datos    jsonb;
  i          int;
begin
  -- Idempotencia: se RESERVA el id ANTES de crear nada. Si otra llamada con el
  -- mismo id ya pasó, no inserta y devolvemos su total. Si está en vuelo, el
  -- índice único la bloquea hasta que termine — nunca dos altas del mismo hecho.
  if p_alta_id is not null then
    insert into operacion_campo (cliente_id, empresa_id, tipo, resultado)
    values (p_alta_id, p_empresa_id,
            coalesce(nullif(trim(coalesce(p_contexto->>'tipo', '')), ''), 'alta'),
            '{}'::jsonb)
    on conflict (cliente_id) do nothing;

    if not found then
      select (resultado->>'total')::int into v_previo
        from operacion_campo where cliente_id = p_alta_id;
      return coalesce(v_previo, 0);
    end if;
  end if;

  select coalesce(sum(greatest((x->>'cantidad')::int, 0)), 0)
    into v_pedido
    from jsonb_array_elements(p_items) x;
  if v_pedido <= 0 then
    raise exception 'No hay cantidades para cargar';
  end if;
  if v_pedido > 2000 then
    raise exception 'Carga demasiado grande (max. 2000 por vez): %', v_pedido;
  end if;

  -- El contexto del campo se SUMA al dato base (no lo pisa): una carga de
  -- Oficina sigue viéndose exactamente igual que antes.
  v_datos := jsonb_build_object('carga', 'masiva', 'sin_caravana', true)
             || coalesce(p_contexto, '{}'::jsonb);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cat  := (v_item->>'categoria')::categoria_animal;
    v_cant := greatest(coalesce((v_item->>'cantidad')::int, 0), 0);
    for i in 1..v_cant loop
      insert into animal (empresa_id, categoria, potrero_id, lote_id, origen,
                          fecha_nacimiento)
      values (p_empresa_id, v_cat, p_potrero_id, p_lote_id,
              nullif(trim(p_origen), ''),
              case when v_nacido then v_fecha else null end)
      returning id into v_id;

      insert into evento (empresa_id, animal_id, tipo, fecha, datos)
      values (p_empresa_id, v_id, 'alta', v_fecha, v_datos);

      v_total := v_total + 1;
    end loop;
  end loop;

  if p_alta_id is not null then
    update operacion_campo
       set resultado = jsonb_build_object('total', v_total)
     where cliente_id = p_alta_id;
  end if;

  return v_total;
end $function$;
