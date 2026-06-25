-- Geometría de campos/potreros + infraestructura + lotes.
-- Aplicada vía Supabase MCP el 2026-06-25 (versión 20260625173942).
-- Salida de Fase 0: la vista satelital pasa a usar este modelo real.

-- 1) Geometría (JSONB de [lat,lng])
alter table public.campo   add column if not exists contorno jsonb;
alter table public.potrero add column if not exists poligono jsonb;
comment on column public.campo.contorno is 'Contorno del campo (catastro) como array de [lat,lng].';
comment on column public.potrero.poligono is 'Polígono del potrero como array de [lat,lng].';

-- 2) Infraestructura (molino / laguna / tranquera / manga)
create type public.tipo_infraestructura as enum ('molino', 'laguna', 'tranquera', 'manga');

create table public.infraestructura (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  campo_id   uuid not null references public.campo(id)   on delete cascade,
  tipo public.tipo_infraestructura not null,
  lat double precision not null,
  lng double precision not null,
  radio_m numeric,
  angulo_deg numeric,
  escala numeric,
  created_at timestamptz not null default now()
);
create index infraestructura_campo_id_idx on public.infraestructura (campo_id);
alter table public.infraestructura enable row level security;
create policy "infraestructura_mod" on public.infraestructura for all
  using (empresa_id in (select auth_empresa_ids()))
  with check (empresa_id in (select auth_empresa_ids()));

-- 3) Lotes (tropa dentro de un potrero) + vínculo del animal
create table public.lote (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  potrero_id uuid references public.potrero(id) on delete set null,
  nombre text not null,
  especie text,
  proposito text,
  created_at timestamptz not null default now()
);
create index lote_potrero_id_idx on public.lote (potrero_id);
alter table public.lote enable row level security;
create policy "lote_mod" on public.lote for all
  using (empresa_id in (select auth_empresa_ids()))
  with check (empresa_id in (select auth_empresa_ids()));

alter table public.animal add column if not exists lote_id uuid
  references public.lote(id) on delete set null;
create index animal_lote_id_idx on public.animal (lote_id);
