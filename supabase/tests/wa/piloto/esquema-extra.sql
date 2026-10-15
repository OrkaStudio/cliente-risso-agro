create role anon nologin;
create role service_role nologin;
create schema interno;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
create table infraestructura(id uuid primary key,empresa_id uuid references empresa(id),campo_id uuid references campo(id),tipo text,lat float8,lng float8);
alter table infraestructura enable row level security;
create policy infraestructura_mod on infraestructura using(empresa_id in(select auth_empresa_ids()));
grant select on infraestructura to authenticated;
create table wa_vinculo(id uuid primary key default gen_random_uuid(),telefono text unique,user_id uuid,empresa_id uuid,activo boolean default true,pendiente jsonb,pendiente_at timestamptz);
alter table wa_mensaje add column wamid text unique,add column telefono text,add column estado text,add column estado_at timestamptz,add column error jsonb;
create type estado_captura as enum('recibida','propuesta','confirmada','incompleta','descartada','error','respondida');
alter table captura alter column estado type estado_captura using estado::estado_captura;
alter table captura alter column estado set default 'recibida';
alter table captura alter column id set default gen_random_uuid();
alter table captura add column mensaje_id uuid,add column entrada text,add column texto text,add column interpretacion jsonb,
 add column interpretado_por text,add column notas text[] default '{}',add column tokens_entrada integer,add column tokens_salida integer,add column updated_at timestamptz default now();
alter table categoria_movimiento add column grupo text,add column aplica_a text;
alter table movimiento_financiero add column comprobante_url text,add column neto_total numeric,add column iva_total numeric,
 add column fecha_cobro_pago date,add column descripcion text,add column contraparte text,add column cuit_contraparte text,add column comprobante_tipo text;
grant insert,update,delete on lluvia,movimiento_financiero to authenticated;
