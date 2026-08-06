-- Labores agrícolas por potrero.
--
-- Un potrero ganadero cuenta su historia solo (cabezas, categorías, tropa); uno
-- agrícola no tenía dónde anotar que se sembró, se fumigó o se cosechó. Esta
-- migración le da esa casa, y de paso le da a `potrero.estado_ciclo` quien lo
-- mueva: el ciclo preparación→siembra→cultivo→cosecha→rastrojo estaba modelado
-- desde el 03/06 y lo único que lo movía era el productor eligiéndolo a mano en
-- un desplegable, que ya se eliminó de la UI.
--
-- Additiva: no toca ninguna tabla ni función existente.
-- Spec: clientes/risso-agro/especificaciones/2026-08-06-labores-agricolas-por-potrero

-- ===== Tipos =====

create type tipo_labor as enum (
  'laboreo',
  'siembra',
  'fertilizacion',
  'fumigacion',
  'corte_forraje',
  'cosecha'
);

-- ===== Tabla =====

create table labor_potrero (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa(id) on delete cascade,
  potrero_id  uuid not null references potrero(id) on delete cascade,
  tipo        tipo_labor not null,
  fecha       date not null,
  nota        text,

  -- Los dos únicos datos propios de un tipo. Todo lo demás (variedad, producto,
  -- dosis, si el corte fue rollo o silo) va en la nota hasta que alguien
  -- necesite filtrar o sumar por eso.
  cultivo       text,     -- sólo siembra: es lo que se lee sobre el potrero en el mapa
  kg_cosechados numeric,  -- sólo cosecha; el rinde se deriva con la superficie del potrero

  -- El gasto que generó la labor, si se cargó con monto. La labor sobrevive a
  -- que el movimiento se borre: el hecho agronómico pasó igual.
  movimiento_id uuid references movimiento_financiero(id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),

  -- Los kilos son del que cosecha; el resto no los declara.
  constraint labor_kg_solo_en_cosecha
    check (kg_cosechados is null or tipo = 'cosecha'),
  constraint labor_kg_no_negativo
    check (kg_cosechados is null or kg_cosechados >= 0),
  -- El cultivo identifica una siembra. Sin esto se podría "sembrar" sin decir qué.
  constraint labor_cultivo_solo_en_siembra
    check (cultivo is null or tipo = 'siembra')
);

create index labor_potrero_potrero_fecha_idx
  on labor_potrero (potrero_id, fecha desc);
create index labor_potrero_empresa_idx
  on labor_potrero (empresa_id);

comment on table labor_potrero is
  'Trabajos agrícolas hechos en un potrero. El estado_ciclo del potrero se deriva de acá: la recorrida OBSERVA, las labores DECLARAN (decisiones/agro-recorrida-observa-labores-declaran).';

-- ===== RLS: mismo patrón uniforme que el resto =====

alter table labor_potrero enable row level security;

create policy labor_potrero_select on labor_potrero for select
  using (empresa_id in (select auth_empresa_ids()));

create policy labor_potrero_mod on labor_potrero for all
  using (empresa_id in (select auth_empresa_ids()))
  with check (empresa_id in (select auth_empresa_ids()));

-- ===== Registrar una labor =====
--
-- Transaccional y SECURITY INVOKER (corre con la RLS del usuario, como el resto
-- de las operaciones de escritura del repo). Hace hasta tres cosas que tienen
-- que pasar juntas o no pasar:
--   1. la labor,
--   2. el movimiento financiero, si vino con monto,
--   3. el estado del ciclo del potrero, si el tipo lo mueve.
--
-- Si el gasto falla, la labor no queda registrada como si nada hubiera pasado.

create function registrar_labor(
  p_empresa_id  uuid,
  p_potrero_id  uuid,
  p_tipo        tipo_labor,
  p_fecha       date,
  p_nota        text default null,
  p_cultivo     text default null,
  p_kg          numeric default null,
  p_monto       numeric default null,
  p_categoria_id uuid default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_labor_id uuid;
  v_mov_id   uuid;
  v_campo_id uuid;
  v_estado   estado_ciclo_potrero;
begin
  -- El potrero tiene que ser de la empresa. La RLS ya lo impediría al insertar,
  -- pero un mensaje claro vale más que un error de policy.
  select campo_id into v_campo_id
  from potrero
  where id = p_potrero_id and empresa_id = p_empresa_id;

  if v_campo_id is null then
    raise exception 'El potrero no existe o no es de esta empresa';
  end if;

  -- El gasto primero: si falla, no queda una labor huérfana apuntando a nada.
  if p_monto is not null and p_monto > 0 then
    -- `categoria_id` es NOT NULL en movimiento_financiero: sin categoría el
    -- insert revienta con un error de constraint que no le dice nada a nadie.
    if p_categoria_id is null then
      raise exception 'Para cargar el costo de la labor hace falta la categoría del gasto';
    end if;

    -- `estado` se deja en su default: si el gasto está pagado o pendiente lo
    -- decide el flujo de Plata, no la labor.
    insert into movimiento_financiero (
      empresa_id, campo_id, potrero_id, tipo, categoria_id,
      descripcion, monto, fecha_devengo, fecha_vencimiento, actividad
    ) values (
      p_empresa_id, v_campo_id, p_potrero_id, 'gasto', p_categoria_id,
      coalesce(nullif(p_nota, ''), initcap(replace(p_tipo::text, '_', ' '))),
      p_monto, p_fecha, p_fecha, 'agricultura'
    )
    returning id into v_mov_id;
  end if;

  insert into labor_potrero (
    empresa_id, potrero_id, tipo, fecha, nota, cultivo, kg_cosechados, movimiento_id
  ) values (
    p_empresa_id, p_potrero_id, p_tipo, p_fecha, nullif(p_nota, ''),
    case when p_tipo = 'siembra' then nullif(p_cultivo, '') end,
    case when p_tipo = 'cosecha' then p_kg end,
    v_mov_id
  )
  returning id into v_labor_id;

  -- El ciclo lo mueven sólo las labores que de verdad lo cambian. Fumigar o
  -- fertilizar no cambia la etapa: el cultivo sigue siendo el mismo.
  v_estado := case p_tipo
    when 'laboreo'  then 'preparacion'::estado_ciclo_potrero
    when 'siembra'  then 'siembra'::estado_ciclo_potrero
    when 'cosecha'  then 'rastrojo'::estado_ciclo_potrero
    else null
  end;

  if v_estado is not null then
    update potrero
       set estado_ciclo = v_estado,
           -- La siembra fija qué hay; la cosecha lo limpia porque ya no está.
           cultivo = case
             when p_tipo = 'siembra' then nullif(p_cultivo, '')
             when p_tipo = 'cosecha' then null
             else cultivo
           end
     where id = p_potrero_id and empresa_id = p_empresa_id;
  end if;

  return v_labor_id;
end;
$function$;

comment on function registrar_labor is
  'Registra una labor agrícola y, si viene con monto, su gasto imputado al potrero — en una sola transacción. Mueve el estado_ciclo sólo para laboreo, siembra y cosecha.';
