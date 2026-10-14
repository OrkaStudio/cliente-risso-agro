-- Esquema mínimo copiado de producción (12/10/2026): sólo lo que toca el guardado de la recorrida.
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
grant usage on schema auth to authenticated;

create type agua_estado as enum ('llena','normal','baja','seca');
create type pasto_estado as enum ('abundante','normal','escaso','pelado');
create type electrico_estado as enum ('ok','cortado');

create table empresa (id uuid primary key, nombre text not null);
create table miembro_empresa (user_id uuid not null, empresa_id uuid not null references empresa(id));
create table campo (id uuid primary key, empresa_id uuid not null references empresa(id), nombre text not null);
create table potrero (id uuid primary key, empresa_id uuid not null references empresa(id), campo_id uuid not null references campo(id), nombre text not null, poligono jsonb);
create table recorrida (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa (id) on delete cascade,
  campo_id uuid not null references campo (id) on delete cascade,
  fecha date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create table observacion_potrero (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa (id) on delete cascade,
  recorrida_id uuid not null references recorrida (id) on delete cascade,
  potrero_id uuid not null references potrero (id) on delete cascade,
  conteo integer check (conteo is null or conteo >= 0),
  agua agua_estado, pasto pasto_estado, electrico electrico_estado,
  en_tratamiento boolean not null default false,
  novedad text,
  created_at timestamptz not null default now(),
  audio_url text
);

create function auth_empresa_ids() returns setof uuid language sql stable set search_path to 'public' as $$
  select empresa_id from miembro_empresa where user_id = auth.uid() $$;
grant select on miembro_empresa, empresa to authenticated;
grant all on campo, potrero, recorrida, observacion_potrero to authenticated;
alter table campo enable row level security;
alter table potrero enable row level security;
alter table recorrida enable row level security;
alter table observacion_potrero enable row level security;
create policy campo_mod on campo for all using (empresa_id in (select auth_empresa_ids())) with check (empresa_id in (select auth_empresa_ids()));
create policy potrero_mod on potrero for all using (empresa_id in (select auth_empresa_ids())) with check (empresa_id in (select auth_empresa_ids()));
create policy recorrida_mod on recorrida for all using (empresa_id in (select auth_empresa_ids())) with check (empresa_id in (select auth_empresa_ids()));
create policy observacion_potrero_mod on observacion_potrero for all using (empresa_id in (select auth_empresa_ids())) with check (empresa_id in (select auth_empresa_ids()));

-- Tablas mínimas para las consultas nuevas. Fixture exclusivo de QA local.
create table categoria_movimiento (id uuid primary key, empresa_id uuid, nombre text);
create table lluvia (id uuid primary key, empresa_id uuid, campo_id uuid, fecha date, mm numeric, fuente text);
create table movimiento_financiero (id uuid primary key, empresa_id uuid, campo_id uuid, categoria_id uuid, tipo text, monto numeric, fecha_devengo date, estado text);
create table captura (id uuid primary key, empresa_id uuid, user_id uuid, estado text, escrito_tabla text, escrito_id uuid, propuesta jsonb, created_at timestamptz default now());
grant select on categoria_movimiento,lluvia,movimiento_financiero,captura to authenticated;
alter table categoria_movimiento enable row level security;
alter table lluvia enable row level security;
alter table movimiento_financiero enable row level security;
alter table captura enable row level security;
create policy cats on categoria_movimiento using (empresa_id is null or empresa_id in (select auth_empresa_ids()));
create policy rain on lluvia using (empresa_id in (select auth_empresa_ids()));
create policy expenses on movimiento_financiero using (empresa_id in (select auth_empresa_ids()));
create policy captures on captura using (empresa_id in (select auth_empresa_ids()));

-- Mensajes técnicos mínimos para el mapa. Sin números ni payloads reales.
create table wa_mensaje (
  id uuid primary key default gen_random_uuid(),
  vinculo_id text, empresa_id uuid, direccion text, tipo text,
  cuerpo jsonb, created_at timestamptz not null default now()
);
