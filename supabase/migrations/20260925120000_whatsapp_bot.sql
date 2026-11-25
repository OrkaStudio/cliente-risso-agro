-- =====================================================================
--  Bot de WhatsApp — fase 1 (piloto con Daniel)
--  Spec: orka-brain/clientes/risso-agro/especificaciones/2026-09-24-whatsapp-captura-fase1.md
--
--  Sólo tablas nuevas; no toca nada existente.
--  · wa_vinculo: número de WhatsApp ↔ usuario ↔ empresa, y lo que el bot
--    le preguntó y todavía espera (pendiente).
--  · wa_mensaje: todo lo que entra y sale, crudo. Único por wamid: si Meta
--    reenvía un mensaje, el segundo insert no hace nada y no se procesa dos veces.
--  · captura: una por intención (lo que llegó, qué se entendió, qué se propuso,
--    qué se escribió). El productor ve las suyas por RLS; es la cola de
--    "lo que quedó a medias" y lo que mira la consola de soporte.
--
--  Escritura: la Edge Function wa-webhook escribe estas tablas como dueña.
--  Los datos del productor (lluvia, movimiento_financiero) los escribe con
--  `set local role authenticated` + los claims del usuario vinculado, así
--  rige RLS y created_by = auth.uid(). La clave de servicio no se usa para eso.
-- =====================================================================

create table wa_vinculo (
  id            uuid primary key default gen_random_uuid(),
  -- wa_id de Meta: E.164 sin '+', ej. 5492983123456
  telefono      text not null unique check (telefono ~ '^[0-9]{8,15}$'),
  user_id       uuid not null references auth.users (id) on delete cascade,
  empresa_id    uuid not null references empresa (id) on delete cascade,
  activo        boolean not null default true,
  pendiente     jsonb,
  pendiente_at  timestamptz,
  vinculado_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
comment on table wa_vinculo is 'Número de WhatsApp vinculado a un usuario. pendiente = lo que el bot preguntó y espera.';

-- Un usuario, un número activo.
create unique index wa_vinculo_un_numero_por_usuario on wa_vinculo (user_id) where activo;

alter table wa_vinculo enable row level security;
create policy wa_vinculo_select on wa_vinculo
  for select using (user_id = (select auth.uid()));


create table wa_mensaje (
  id          uuid primary key default gen_random_uuid(),
  wamid       text not null unique,
  direccion   text not null check (direccion in ('entrante', 'saliente')),
  telefono    text not null,
  vinculo_id  uuid references wa_vinculo (id) on delete set null,
  empresa_id  uuid references empresa (id) on delete cascade,
  tipo        text not null,
  cuerpo      jsonb not null,
  -- saliente: sent | delivered | read | failed (lo informa Meta después)
  estado      text,
  estado_at   timestamptz,
  error       jsonb,
  created_at  timestamptz not null default now()
);
comment on table wa_mensaje is 'Mensajes de WhatsApp crudos, entrantes y salientes. Sólo el servidor.';

create index wa_mensaje_telefono on wa_mensaje (telefono, created_at desc);
create index wa_mensaje_empresa on wa_mensaje (empresa_id, created_at desc);

-- Sin policies: nadie la lee ni la escribe desde el cliente.
alter table wa_mensaje enable row level security;


create type estado_captura as enum (
  'recibida', 'propuesta', 'confirmada', 'incompleta', 'descartada', 'error', 'respondida'
);

create table captura (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresa (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  puerta           text not null default 'whatsapp' check (puerta in ('whatsapp', 'web')),
  mensaje_id       uuid references wa_mensaje (id) on delete set null,
  entrada          text not null check (entrada in ('texto', 'audio', 'foto', 'boton')),
  texto            text,
  interpretacion   jsonb,
  interpretado_por text,
  propuesta        jsonb,
  estado           estado_captura not null default 'recibida',
  escrito_tabla    text,
  escrito_id       uuid,
  notas            text[] not null default '{}',
  tokens_entrada   integer,
  tokens_salida    integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table captura is 'Una intención del productor por WhatsApp (o chat web): qué llegó, qué se entendió, qué se propuso y qué se escribió.';

create index captura_empresa on captura (empresa_id, created_at desc);
create index captura_abiertas on captura (empresa_id, created_at desc)
  where estado in ('incompleta', 'error');

alter table captura enable row level security;
create policy captura_select on captura
  for select using (empresa_id in (select auth_empresa_ids()));


-- ── Vistas internas (consola de soporte) ─────────────────────────────
-- Schema `interno` sin acceso para anon/authenticated: sólo service_role
-- (la consola las lee por Edge Function, spec de GodMode v3).

create schema if not exists interno;
revoke all on schema interno from public, anon, authenticated;
grant usage on schema interno to service_role;

create view interno.v_wa_capturas as
select c.id, c.created_at, e.nombre as empresa, c.empresa_id, c.user_id, c.puerta,
       c.entrada, c.texto, c.interpretado_por, c.interpretacion, c.propuesta,
       c.estado, c.escrito_tabla, c.escrito_id, c.notas, c.tokens_entrada, c.tokens_salida
from captura c
join empresa e on e.id = c.empresa_id;

-- Salud del canal: si no entra nada o todo lo que sale falla, algo se rompió
-- aunque ningún proceso haya "fallado" (lección GL: la alerta de fallos no
-- detecta el silencio).
create view interno.v_wa_salud as
select
  max(created_at) filter (where direccion = 'entrante')                              as ultimo_entrante,
  max(created_at) filter (where direccion = 'saliente' and estado is distinct from 'failed') as ultimo_saliente_ok,
  count(*) filter (where direccion = 'saliente' and estado = 'failed'
                     and created_at > now() - interval '24 hours')                   as fallidos_24h,
  count(*) filter (where direccion = 'entrante'
                     and created_at > now() - interval '24 hours')                   as entrantes_24h
from wa_mensaje;

grant select on interno.v_wa_capturas, interno.v_wa_salud to service_role;
