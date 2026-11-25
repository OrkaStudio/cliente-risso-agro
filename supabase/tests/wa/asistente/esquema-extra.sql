-- Complemento mínimo de QA. Las funciones de Hacienda se cargan del SQL real.
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create type tipo_evento as enum('alta','parto','sanidad','pesaje','movimiento','servicio','tacto','destete','castracion','cambio_caravana','baja','nota');
create table lote(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresa(id),campo_id uuid references campo(id),nombre text not null);
create table lote_potrero(lote_id uuid references lote(id),potrero_id uuid references potrero(id),empresa_id uuid not null,primary key(lote_id,potrero_id));
alter table animal add column lote_id uuid references lote(id),add column origen text,add column updated_at timestamptz default now(),add column created_at timestamptz default now();
create table caravana(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresa(id),animal_id uuid not null references animal(id),numero_rfid text,numero_visual text,vigente boolean default true,fecha_alta date default current_date,fecha_baja date);
create unique index caravana_vigente on caravana(animal_id) where vigente;
create table evento(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresa(id),animal_id uuid not null references animal(id),tipo tipo_evento not null,fecha date not null default current_date,datos jsonb not null default '{}',nota text,created_at timestamptz default now(),created_by uuid default auth.uid());
grant select,insert,update on animal,lote,lote_potrero to authenticated;
-- mover_animales elimina relaciones anteriores de la tropa al moverla.
grant delete on lote_potrero to authenticated;
-- Columna de la migración base 20260606171112, omitida en el fixture anterior.
alter table movimiento_financiero add column fecha_vencimiento date;
-- SELECT y UPDATE verificados en producción por consulta de privilegios, sin datos, 23/11/2026.
grant select,update on caravana to authenticated;
grant select,insert on evento to authenticated;
alter table caravana enable row level security;
alter table evento enable row level security;
alter table lote enable row level security;
alter table lote_potrero enable row level security;
create policy caravana_scope on caravana using(empresa_id in(select auth_empresa_ids()));
create policy evento_scope on evento using(empresa_id in(select auth_empresa_ids())) with check(empresa_id in(select auth_empresa_ids()));
create policy lote_scope on lote using(empresa_id in(select auth_empresa_ids())) with check(empresa_id in(select auth_empresa_ids()));
create policy lote_potrero_scope on lote_potrero using(empresa_id in(select auth_empresa_ids())) with check(empresa_id in(select auth_empresa_ids()));