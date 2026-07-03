-- =====================================================================
--  Lote en varios potreros (M:N).
--
--  Antes: `lote.potrero_id` ataba un lote a UN potrero. Caso real: un lote
--  se COLOCA en varios potreros de un campo (Lote 1 → 1A con 30 vacas + 2A
--  con 20), y si dos potreros se unifican, el lote queda "en ambos".
--
--  Modelo:
--   · lote.campo_id  → el lote pertenece a un campo (puede estar en varios
--                      de sus potreros).
--   · lote_potrero   → M:N: en qué potreros está el lote (reparto + unificados,
--                      incluso sin animales todavía).
--   · El conteo por potrero sale de los animales (animal.lote_id + potrero_id).
--   · lote.potrero_id queda como legacy (no se borra; additivo).
--
--  Aplicada a prod vía Supabase MCP el 2026-07-03.
-- =====================================================================
alter table lote add column if not exists campo_id uuid
  references campo(id) on delete cascade;
create index if not exists lote_campo_id_idx on lote (campo_id);

create table if not exists lote_potrero (
  lote_id    uuid not null references lote(id)    on delete cascade,
  potrero_id uuid not null references potrero(id) on delete cascade,
  empresa_id uuid not null references empresa(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lote_id, potrero_id)
);
create index if not exists lote_potrero_potrero_idx on lote_potrero (potrero_id);

alter table lote_potrero enable row level security;
create policy lote_potrero_mod on lote_potrero for all
  using (empresa_id in (select auth_empresa_ids()))
  with check (empresa_id in (select auth_empresa_ids()));
