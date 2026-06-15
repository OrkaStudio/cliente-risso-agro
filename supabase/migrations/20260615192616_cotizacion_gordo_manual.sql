-- =====================================================================
--  Cotización del GORDO — carga MANUAL
--  No hay API pública gratuita y confiable para el precio del gordo
--  (decisión de producto: lo carga el usuario). Guardamos el historial
--  con fecha; el ticker muestra el último valor.
--
--  ADITIVO: crea una tabla nueva, no toca ninguna existente.
--  Multi-tenant + RLS, mismo patrón que el resto del modelo
--  (empresa_id denormalizado, scope por auth_empresa_ids()).
-- =====================================================================
create table cotizacion_gordo (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa (id) on delete cascade,
  valor       numeric(14,2) not null check (valor >= 0),  -- $ por kg vivo
  fecha       date not null default current_date,
  nota        text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
create index idx_cotizacion_gordo_empresa
  on cotizacion_gordo (empresa_id, fecha desc, created_at desc);

alter table cotizacion_gordo enable row level security;
create policy cotizacion_gordo_select on cotizacion_gordo for select
  using (empresa_id in (select auth_empresa_ids()));
create policy cotizacion_gordo_mod on cotizacion_gordo for all
  using (empresa_id in (select auth_empresa_ids()))
  with check (empresa_id in (select auth_empresa_ids()));
