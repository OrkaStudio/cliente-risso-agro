-- Capa fiscal (IVA discriminado) sobre movimiento_financiero.
-- Diseño AL DETALLE: un movimiento puede tener VARIAS líneas de IVA — el caso
-- real son las liquidaciones de consignataria (venta de hacienda al 10,5% +
-- comisiones y gastos de remate al 21%). Cada línea lleva su neto/alícuota/IVA;
-- el movimiento guarda el rollup (neto_total / iva_total) para que la Posición
-- de IVA se calcule sin agregar joins.
--   bruto (monto, ya existente) = lo que efectivamente se movió.
--   neto_total + iva_total = base imponible + IVA (fiscal), no necesariamente
--   igual a monto (hay deducciones/percepciones fuera de v1).

create type comprobante_fiscal_tipo as enum ('a', 'b', 'c', 'otro');

alter table movimiento_financiero
  add column if not exists comprobante_tipo comprobante_fiscal_tipo,
  add column if not exists cuit_contraparte text,
  add column if not exists neto_total numeric,
  add column if not exists iva_total numeric;

comment on column movimiento_financiero.neto_total is
  'Suma de netos de las líneas de IVA (rollup para la Posición de IVA).';
comment on column movimiento_financiero.iva_total is
  'Suma de IVA de las líneas (crédito si es gasto, débito si es ingreso).';

create table movimiento_iva_linea (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  movimiento_id uuid not null references movimiento_financiero(id) on delete cascade,
  concepto text,
  neto numeric not null default 0,
  alicuota numeric not null default 21,   -- 21 / 10.5 / 27 / 0
  iva numeric not null default 0,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index movimiento_iva_linea_mov_idx on movimiento_iva_linea (movimiento_id);
create index movimiento_iva_linea_empresa_idx on movimiento_iva_linea (empresa_id);

alter table movimiento_iva_linea enable row level security;

create policy movimiento_iva_linea_mod on movimiento_iva_linea
  for all
  using (empresa_id in (select auth_empresa_ids()))
  with check (empresa_id in (select auth_empresa_ids()));
