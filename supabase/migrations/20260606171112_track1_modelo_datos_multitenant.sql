-- =====================================================================
--  TRACK 1 — Modelo de datos multi-tenant + RLS
--  Cliente: Risso Agro · Vertical: agropecuaria
--  Fecha: 2026-06-06
--
--  Diseño: orka-brain/clientes/risso-agro/especificaciones/
--          2026-06-03-decisiones-producto-y-ux.md (D1–D16)
--  Stack/seguridad: orka-brain/decisiones/agro-stack-vite-spa.md
--
--  PRINCIPIOS:
--   · Multi-tenant desde el día 1: empresa_id DENORMALIZADO en toda tabla.
--   · RLS es LA seguridad (SPA habla directo con Postgres). Toda tabla con
--     RLS habilitada, scopeada por empresa_id vía helper SECURITY DEFINER.
--   · Invariantes DURAS en Postgres (montos, append-only, identidad caravana).
--     Las reglas ADVISORY (cruce RENSPA, categoría, sugerencias) NO se
--     encodean como constraints — viven en la UI (D12/D13 "sugiere, no impone").
--   · numeric, nunca float, para plata.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type tipo_campo            as enum ('propio', 'alquilado');
create type estado_ciclo_potrero  as enum
  ('ganadero', 'descanso', 'preparacion', 'siembra', 'cultivo', 'cosecha', 'rastrojo');
create type categoria_animal      as enum
  ('vaca', 'vaquillona', 'novillo', 'ternero', 'ternera', 'toro', 'capon');
create type sexo_animal           as enum ('macho', 'hembra');
create type estado_animal         as enum ('activo', 'vendido', 'muerto');
create type tipo_evento           as enum
  ('alta', 'parto', 'sanidad', 'pesaje', 'movimiento', 'servicio', 'tacto',
   'destete', 'castracion', 'cambio_caravana', 'baja', 'nota');
create type agua_estado           as enum ('llena', 'normal', 'baja', 'seca');
create type pasto_estado          as enum ('abundante', 'normal', 'escaso', 'pelado');
create type electrico_estado      as enum ('ok', 'cortado');
create type fuente_lluvia         as enum ('manual', 'open_meteo');
-- Financiero (D6)
create type tipo_movimiento       as enum ('ingreso', 'gasto');
create type estado_movimiento     as enum ('pendiente', 'liquidado', 'anulado');
create type medio_pago            as enum ('efectivo', 'transferencia', 'cheque', 'mercadopago', 'otro');


-- ---------------------------------------------------------------------
-- TENANT: empresa + membresía
-- ---------------------------------------------------------------------
create table empresa (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_at  timestamptz not null default now()
);

create table miembro_empresa (
  user_id     uuid not null references auth.users (id) on delete cascade,
  empresa_id  uuid not null references empresa (id) on delete cascade,
  rol         text not null default 'dueno',   -- dueno | encargado | peon | vet (multi-usuario futuro)
  created_at  timestamptz not null default now(),
  primary key (user_id, empresa_id)
);
create index idx_miembro_empresa_user on miembro_empresa (user_id);

-- Helper SECURITY DEFINER: empresas del usuario actual.
-- SECURITY DEFINER evita la recursión de RLS (la policy de una tabla NO
-- vuelve a disparar la RLS de miembro_empresa al resolver el helper).
create or replace function auth_empresa_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select empresa_id from miembro_empresa where user_id = auth.uid()
$$;


-- ---------------------------------------------------------------------
-- DOMINIO: campo, establecimiento (RENSPA), potrero
-- ---------------------------------------------------------------------
create table campo (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa (id) on delete cascade,
  nombre      text not null,
  tipo        tipo_campo not null default 'propio',
  hectareas   numeric(10,2) check (hectareas is null or hectareas >= 0),
  created_at  timestamptz not null default now()
);
create index idx_campo_empresa on campo (empresa_id);

create table establecimiento (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa (id) on delete cascade,
  campo_id    uuid not null references campo (id) on delete cascade,
  nombre      text not null,
  renspa      text,                       -- registro SENASA (gobierna guía/DTe)
  created_at  timestamptz not null default now()
);
create index idx_establecimiento_campo on establecimiento (campo_id);

-- Decisión de modelado: potrero pertenece al CAMPO (obligatorio); el vínculo a
-- RENSPA/establecimiento es opcional. Más flexible y no fuerza la pregunta
-- abierta del spec ("cómo se reparten los potreros entre RENSPA").
create table potrero (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references empresa (id) on delete cascade,
  campo_id           uuid not null references campo (id) on delete cascade,
  establecimiento_id uuid references establecimiento (id) on delete set null,
  nombre             text not null,
  hectareas          numeric(10,2) check (hectareas is null or hectareas >= 0),
  estado_ciclo       estado_ciclo_potrero not null default 'ganadero',
  created_at         timestamptz not null default now()
);
create index idx_potrero_campo on potrero (campo_id);


-- ---------------------------------------------------------------------
-- HACIENDA: animal, caravana, evento
-- ---------------------------------------------------------------------
create table animal (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references empresa (id) on delete cascade,
  categoria         categoria_animal not null,
  sexo              sexo_animal not null,
  estado            estado_animal not null default 'activo',
  origen            text,                 -- propio (nacido) / compra / etc.
  fecha_nacimiento  date,
  potrero_id        uuid references potrero (id) on delete set null,
  notas             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_animal_empresa  on animal (empresa_id);
create index idx_animal_potrero  on animal (potrero_id);
create index idx_animal_estado   on animal (empresa_id, estado);

-- Caravana: identidad RFID del animal. Reemplazable conservando identidad
-- (D15 "Cambiar caravana"). INVARIANTE DURA: una sola vigente por animal.
create table caravana (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresa (id) on delete cascade,
  animal_id      uuid not null references animal (id) on delete cascade,
  numero_rfid    text not null,           -- carga MANUAL en Track 1 (Bluetooth diferido)
  numero_visual  text,
  vigente        boolean not null default true,
  fecha_alta     date not null default current_date,
  fecha_baja     date,
  motivo_baja    text,
  created_at     timestamptz not null default now()
);
-- una sola caravana vigente por animal
create unique index uq_caravana_vigente_por_animal on caravana (animal_id) where vigente;
-- RFID único dentro de la empresa
create unique index uq_caravana_rfid_empresa on caravana (empresa_id, numero_rfid);
create index idx_caravana_animal on caravana (animal_id);

-- Evento: historial APPEND-ONLY del animal (D8/D15 "no se borra").
-- La inmutabilidad se garantiza por RLS: sólo SELECT + INSERT (sin UPDATE/DELETE).
create table evento (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa (id) on delete cascade,
  animal_id   uuid not null references animal (id) on delete cascade,
  tipo        tipo_evento not null,
  fecha       date not null default current_date,
  datos       jsonb not null default '{}'::jsonb,  -- payload flexible por tipo
  nota        text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
create index idx_evento_animal on evento (animal_id, fecha);


-- ---------------------------------------------------------------------
-- CAMPO/RECORRIDA: recorrida, observacion_potrero, lluvia
--   (entidades del Modo Campo — UI en próximo track, schema acá)
-- ---------------------------------------------------------------------
create table recorrida (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa (id) on delete cascade,
  campo_id    uuid not null references campo (id) on delete cascade,
  fecha       date not null default current_date,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
create index idx_recorrida_campo on recorrida (campo_id, fecha);

create table observacion_potrero (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresa (id) on delete cascade,
  recorrida_id   uuid not null references recorrida (id) on delete cascade,
  potrero_id     uuid not null references potrero (id) on delete cascade,
  conteo         integer check (conteo is null or conteo >= 0),
  agua           agua_estado,
  pasto          pasto_estado,
  electrico      electrico_estado,
  en_tratamiento boolean not null default false,
  novedad        text,
  created_at     timestamptz not null default now()
);
create index idx_obs_recorrida on observacion_potrero (recorrida_id);

-- Lluvia: evento del campo, DESACOPLADO de la recorrida (D8). Cruza
-- pluviómetro manual + Open-Meteo (fuente).
create table lluvia (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa (id) on delete cascade,
  campo_id    uuid not null references campo (id) on delete cascade,
  fecha       date not null,
  mm          numeric(6,2) not null check (mm >= 0),
  fuente      fuente_lluvia not null default 'manual',
  created_at  timestamptz not null default now()
);
create index idx_lluvia_campo on lluvia (campo_id, fecha);


-- ---------------------------------------------------------------------
-- CONTABLE (D6): categoria_movimiento + movimiento_financiero
-- ---------------------------------------------------------------------
-- empresa_id NULL = categoría global (semilla); non-null = custom de la empresa.
create table categoria_movimiento (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references empresa (id) on delete cascade,
  nombre      text not null,
  grupo       text not null,            -- hacienda | agricola | estructura | financiero | impuesto | ingreso
  aplica_a    tipo_movimiento,          -- null = ingreso y gasto
  activo      boolean not null default true
);

insert into categoria_movimiento (nombre, grupo, aplica_a) values
  ('Venta de hacienda',           'ingreso',    'ingreso'),
  ('Venta de cosecha',            'ingreso',    'ingreso'),
  ('Otros ingresos',              'ingreso',    'ingreso'),
  ('Medicamentos / veterinario',  'hacienda',   'gasto'),
  ('Compra de hacienda',          'hacienda',   'gasto'),
  ('Semillas',                    'agricola',   'gasto'),
  ('Combustible',                 'agricola',   'gasto'),
  ('Maquinaria / labores',        'agricola',   'gasto'),
  ('Fertilizantes / agroquímicos','agricola',   'gasto'),
  ('Alquiler de campo',           'estructura', 'gasto'),
  ('Infraestructura / eléctrico', 'estructura', 'gasto'),
  ('Gastos bancarios',            'financiero', 'gasto'),
  ('Impuestos',                   'impuesto',   'gasto');

-- El corazón contable. Las TRES fechas = "contablemente correcto" (D6):
--  devengo (siempre) · vencimiento (opcional) · cobro_pago (NULL = pendiente).
create table movimiento_financiero (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references empresa (id) on delete cascade,
  campo_id          uuid not null references campo (id) on delete cascade,
  potrero_id        uuid references potrero (id) on delete set null,
  animal_id         uuid references animal (id) on delete set null,
  tipo              tipo_movimiento not null,
  categoria_id      uuid not null references categoria_movimiento (id),
  descripcion       text,
  monto             numeric(14,2) not null check (monto >= 0),
  moneda            char(3) not null default 'ARS',
  tipo_cambio       numeric(14,4),
  fecha_devengo     date not null,
  fecha_vencimiento date,
  fecha_cobro_pago  date,                 -- NULL = pendiente (dato irreversible)
  medio_pago        medio_pago,
  estado            estado_movimiento not null default 'pendiente',
  comprobante_url   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  -- coherencia: liquidado ⇒ tiene fecha de cobro/pago
  constraint chk_liquidado_tiene_fecha
    check (estado <> 'liquidado' or fecha_cobro_pago is not null)
);
create index idx_mov_campo_potrero on movimiento_financiero (campo_id, potrero_id);
create index idx_mov_devengo       on movimiento_financiero (fecha_devengo);
create index idx_mov_cobro         on movimiento_financiero (fecha_cobro_pago);
create index idx_mov_estado        on movimiento_financiero (estado) where estado = 'pendiente';
create index idx_mov_categoria     on movimiento_financiero (categoria_id);


-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
--   Patrón uniforme: empresa_id IN (select auth_empresa_ids()).
--   El (select …) ayuda al planner a cachear el resultado por query.
-- ---------------------------------------------------------------------

-- empresa: el miembro ve su(s) empresa(s)
alter table empresa enable row level security;
create policy empresa_select on empresa for select
  using (id in (select auth_empresa_ids()));

-- miembro_empresa: cada quien ve sus propias filas de membresía
alter table miembro_empresa enable row level security;
create policy miembro_select on miembro_empresa for select
  using (user_id = auth.uid());

-- Tablas con scope simple por empresa_id (SELECT + ALL).
do $$
declare t text;
begin
  foreach t in array array[
    'campo','establecimiento','potrero','animal','caravana',
    'recorrida','observacion_potrero','lluvia','movimiento_financiero'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %1$s_select on %1$s for select using (empresa_id in (select auth_empresa_ids()));', t);
    execute format(
      'create policy %1$s_mod on %1$s for all using (empresa_id in (select auth_empresa_ids())) with check (empresa_id in (select auth_empresa_ids()));', t);
  end loop;
end $$;

-- evento: APPEND-ONLY → sólo SELECT + INSERT (sin UPDATE/DELETE = denegados).
alter table evento enable row level security;
create policy evento_select on evento for select
  using (empresa_id in (select auth_empresa_ids()));
create policy evento_insert on evento for insert
  with check (empresa_id in (select auth_empresa_ids()));

-- categoria_movimiento: ve globales (empresa_id null) + propias; modifica sólo propias.
alter table categoria_movimiento enable row level security;
create policy categoria_select on categoria_movimiento for select
  using (empresa_id is null or empresa_id in (select auth_empresa_ids()));
create policy categoria_mod on categoria_movimiento for all
  using (empresa_id in (select auth_empresa_ids()))
  with check (empresa_id in (select auth_empresa_ids()));


-- ---------------------------------------------------------------------
-- VISTAS  (security_invoker = true → respetan la RLS de las tablas base)
-- ---------------------------------------------------------------------

-- Stock por potrero: cabezas activas (Hacienda — Fase C).
create view v_stock_potrero with (security_invoker = true) as
select a.empresa_id, a.potrero_id, count(*)::int as cabezas
from animal a
where a.estado = 'activo' and a.potrero_id is not null
group by a.empresa_id, a.potrero_id;

-- Animal con su caravana vigente (conveniencia para listados/ficha).
create view v_animal_con_caravana with (security_invoker = true) as
select a.*,
       c.numero_rfid   as caravana_rfid,
       c.numero_visual as caravana_visual
from animal a
left join caravana c on c.animal_id = a.id and c.vigente;

-- D6 · DEVENGADO: economía real por potrero (use fecha_devengo).
create view v_rentabilidad_devengada with (security_invoker = true) as
select empresa_id, campo_id, potrero_id,
       date_trunc('month', fecha_devengo) as mes,
       sum(case when tipo = 'ingreso' then monto else 0 end) as ingresos,
       sum(case when tipo = 'gasto'   then monto else 0 end) as gastos,
       sum(case when tipo = 'ingreso' then monto else -monto end) as resultado
from movimiento_financiero
where estado <> 'anulado'
group by empresa_id, campo_id, potrero_id, date_trunc('month', fecha_devengo);

-- D6 · CAJA (percibido): plata que realmente entró/salió.
create view v_flujo_caja with (security_invoker = true) as
select empresa_id, campo_id, potrero_id,
       date_trunc('month', fecha_cobro_pago) as mes,
       sum(case when tipo = 'ingreso' then monto else 0 end) as cobrado,
       sum(case when tipo = 'gasto'   then monto else 0 end) as pagado,
       sum(case when tipo = 'ingreso' then monto else -monto end) as neto
from movimiento_financiero
where estado = 'liquidado'
group by empresa_id, campo_id, potrero_id, date_trunc('month', fecha_cobro_pago);

-- D6 · PENDIENTES: lo que falta cobrar/pagar.
create view v_pendientes with (security_invoker = true) as
select id, empresa_id, campo_id, tipo, descripcion, monto,
       fecha_vencimiento, medio_pago,
       (fecha_vencimiento - current_date) as dias_para_vencer
from movimiento_financiero
where estado = 'pendiente'
order by fecha_vencimiento nulls last;
