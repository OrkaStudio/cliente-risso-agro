-- Asistente con herramientas. Preparada para piloto; no aplicada a producción.
-- Evidencia y propuestas no son datos productivos confirmados.
-- Dependencias mínimas del asistente. No adelanta las pantallas ni las RLS del rediseño.
create table if not exists interno.wa_cola (
  mensaje_id uuid primary key references public.wa_mensaje(id) on delete cascade,
  vinculo_id uuid not null references public.wa_vinculo(id) on delete cascade,
  secuencia bigint generated always as identity unique,
  estado text not null default 'pendiente' check(estado in ('pendiente','procesando','completo','revision')),
  token uuid, tomado_at timestamptz, terminado_at timestamptz
);
create index if not exists wa_cola_pendiente on interno.wa_cola(vinculo_id,secuencia) where estado<>'completo';
alter table interno.wa_cola enable row level security;
revoke all on interno.wa_cola from public,anon,authenticated;
alter table public.lluvia add column if not exists canal text not null default 'app';
alter table public.movimiento_financiero add column if not exists canal text not null default 'app';
alter table public.recorrida add column if not exists canal text not null default 'app';
alter table public.observacion_potrero add column if not exists canal text not null default 'app';
alter table public.infraestructura add column if not exists canal text not null default 'app';
create table interno.wa_asistente_turno (
  mensaje_id uuid primary key references public.wa_mensaje(id),
  vinculo_id uuid not null references public.wa_vinculo(id),
  actor_id uuid not null references auth.users(id),
  empresa_id uuid not null references public.empresa(id),
  captura_id uuid not null references public.captura(id),
  texto text not null,
  estado text not null default 'procesando' check (estado in ('procesando','respondido','error')),
  pasos jsonb not null default '[]'::jsonb,
  respuesta jsonb,
  salida_estado text not null default 'pendiente' check (salida_estado in ('pendiente','enviando','enviada','revision')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wa_asistente_turno_hilo on interno.wa_asistente_turno(vinculo_id, empresa_id, actor_id, created_at desc);

create table interno.wa_asistente_propuesta (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references interno.wa_asistente_turno(mensaje_id),
  vinculo_id uuid not null references public.wa_vinculo(id),
  actor_id uuid not null references auth.users(id),
  empresa_id uuid not null references public.empresa(id),
  captura_id uuid not null references public.captura(id),
  revision uuid not null default gen_random_uuid(),
  clave text not null,
  seccion text not null check (seccion in ('campos','hacienda','plata')),
  datos jsonb not null,
  resumen text not null,
  estado text not null default 'propuesta' check (estado in ('incompleta','propuesta','confirmada','descartada')),
  resultado jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mensaje_id, clave)
);
create index wa_asistente_propuesta_hilo on interno.wa_asistente_propuesta(vinculo_id, empresa_id, actor_id, created_at desc)
  where estado in ('incompleta','propuesta');

create table interno.wa_asistente_evidencia (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references public.wa_mensaje(id),
  vinculo_id uuid not null references public.wa_vinculo(id),
  actor_id uuid not null references auth.users(id),
  empresa_id uuid not null references public.empresa(id),
  media_id text not null,
  nombre text not null,
  mime text,
  ruta text,
  sha256 text,
  tamano integer,
  texto text,
  datos jsonb,
  estado text not null default 'recibida' check (estado in ('recibida','archivada','error')),
  created_at timestamptz not null default now(),
  unique(mensaje_id, media_id)
);
create index wa_asistente_evidencia_hilo on interno.wa_asistente_evidencia(vinculo_id, empresa_id, actor_id, created_at desc);

-- Sin API pública ni acceso directo del cliente. El servidor valida vínculo,
-- persona, cuenta y permiso en cada operación; datos de negocio además bajo RLS.
alter table interno.wa_asistente_turno enable row level security;
alter table interno.wa_asistente_propuesta enable row level security;
alter table interno.wa_asistente_evidencia enable row level security;
revoke all on interno.wa_asistente_turno, interno.wa_asistente_propuesta, interno.wa_asistente_evidencia from public, anon, authenticated;

-- Bucket privado. Los archivos se recuperan desde el servidor con el alcance
-- del vínculo, nunca aceptando una ruta o una URL proporcionadas por el modelo.
insert into storage.buckets(id, name, public, file_size_limit)
values ('wa-evidencias','wa-evidencias',false,26214400)
on conflict(id) do nothing;