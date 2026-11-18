-- Esquema mínimo copiado de producción (12/10/2026): sólo lo que toca el guardado de la recorrida.
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}',phone text,phone_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
grant usage on schema auth to authenticated;

create type agua_estado as enum ('llena','normal','baja','seca');
create type pasto_estado as enum ('abundante','normal','escaso','pelado');
create type electrico_estado as enum ('ok','cortado');

create table empresa (id uuid primary key, nombre text not null);
create table miembro_empresa (user_id uuid not null, empresa_id uuid not null references empresa(id), rol text not null default 'dueno', niveles jsonb, acceso text);
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

create type estado_animal as enum ('activo','vendido','muerto','baja');
create type categoria_animal as enum ('vaca','vaquillona','novillo','ternero','ternera','toro','capon','oveja');
create table animal (id uuid primary key default gen_random_uuid(), empresa_id uuid not null references empresa(id), potrero_id uuid references potrero(id), estado estado_animal not null default 'activo', categoria categoria_animal not null default 'vaca');
create view v_stock_potrero with (security_invoker = true) as
  select empresa_id, potrero_id, count(*)::integer as cabezas from animal a where estado = 'activo' and potrero_id is not null group by empresa_id, potrero_id;

create function auth_empresa_ids() returns setof uuid language sql stable set search_path to 'public' as $$
  select empresa_id from miembro_empresa
  where user_id = auth.uid() and case
    when nullif(current_setting('request.headers',true),'')::jsonb ? 'x-troppero-cuenta'
      then empresa_id::text = nullif(current_setting('request.headers',true),'')::jsonb->>'x-troppero-cuenta'
    else (select count(*) from miembro_empresa where user_id=auth.uid()) = 1
  end $$;
grant select on miembro_empresa, empresa to authenticated;
grant all on campo, potrero, recorrida, observacion_potrero to authenticated;
grant select on animal, v_stock_potrero to authenticated;
alter table animal enable row level security;
create policy animal_mod on animal for all using (empresa_id in (select auth_empresa_ids())) with check (empresa_id in (select auth_empresa_ids()));
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

-- Igual que producción (20260625173942_geometria_infraestructura_lote.sql).
create type tipo_infraestructura as enum ('molino','laguna','tranquera','manga');
create table infraestructura(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresa(id) on delete cascade,
 campo_id uuid not null references campo(id) on delete cascade,tipo tipo_infraestructura not null,lat float8 not null,lng float8 not null,
 radio_m numeric,angulo_deg numeric,escala numeric,created_at timestamptz not null default now());
alter table infraestructura enable row level security;
create policy infraestructura_mod on infraestructura for all using(empresa_id in(select auth_empresa_ids())) with check(empresa_id in(select auth_empresa_ids()));
grant all on infraestructura to authenticated;

-- Permisos por persona (13/11): el nivel de cada uno y por dónde entró cada carga.
alter table miembro_empresa add column if not exists rol text not null default 'dueno';
alter table miembro_empresa add column if not exists niveles jsonb;
alter table lluvia add column if not exists canal text not null default 'app';
alter table movimiento_financiero add column if not exists canal text not null default 'app';
alter table recorrida add column if not exists canal text not null default 'app';
alter table observacion_potrero add column if not exists canal text not null default 'app';
alter table infraestructura add column if not exists canal text not null default 'app';
do $$ begin
  if to_regclass('movimiento_iva_linea') is not null then
    alter table movimiento_iva_linea add column if not exists canal text not null default 'app';
  end if;
end $$;

-- Varias cuentas (14/11): la cuenta pedida (x-troppero-cuenta) recorta los
-- permisos como en producción, y las invitaciones que el bot ofrece a quien ya lo usa.
create or replace function cuenta_pedida() returns uuid language sql stable as $$
  select case when h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then h::uuid end
  from (select nullif(current_setting('request.headers', true), '')::json ->> 'x-troppero-cuenta' as h) s $$;
create or replace function auth_empresa_ids() returns setof uuid language sql stable set search_path to 'public' as $$
  select empresa_id from miembro_empresa where user_id = auth.uid()
    and case when cuenta_pedida() is not null then empresa_id = cuenta_pedida()
      else (select count(*) from miembro_empresa x where x.user_id = auth.uid()) = 1 end $$;
create table if not exists invitacion (
  id uuid primary key default gen_random_uuid(), empresa_id uuid references empresa(id), celular text, nombre text,
  acceso text not null default 'app', niveles jsonb, token text unique default md5(random()::text), invitado_por uuid,
  creada_at timestamptz not null default now(), vence_at timestamptz not null default now() + interval '7 days',
  aceptada_at timestamptz, rechazada_at timestamptz, preguntada_at timestamptz);
