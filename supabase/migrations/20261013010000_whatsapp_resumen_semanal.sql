-- PREPARADA: requiere autorización explícita antes de aplicar en producción.
-- Sólo tablas internas nuevas. No altera RLS ni datos de las tablas del productor.
-- La activación es individual desde el bot; nadie queda suscripto por defecto.
create table interno.wa_resumen_config (
  vinculo_id uuid primary key references public.wa_vinculo(id) on delete cascade,
  activo boolean not null default false,
  actualizado_at timestamptz not null default now()
);
create table interno.wa_resumen_envio (
  id uuid primary key default gen_random_uuid(),
  vinculo_id uuid not null references public.wa_vinculo(id) on delete cascade,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  desde date not null,
  hasta date not null check(hasta=desde+6),
  estado text not null check(estado in ('preparando','enviando','enviado','error_preparacion','incierto','cancelado')),
  intentos integer not null default 1 check(intentos between 1 and 3),
  lease uuid not null default gen_random_uuid(),
  wamid text,
  error text,
  actualizado_at timestamptz not null default now(),
  unique(vinculo_id,desde,hasta)
);
-- Estas tablas no se exponen al cliente. Sólo las usa el servidor del bot.
alter table interno.wa_resumen_config enable row level security;
alter table interno.wa_resumen_envio enable row level security;
revoke all on interno.wa_resumen_config,interno.wa_resumen_envio from public,anon,authenticated;
grant select,insert,update on interno.wa_resumen_config,interno.wa_resumen_envio to service_role;

-- El cron se instala por separado tras publicar el servidor y configurar
-- el token privado en Edge Secrets y Vault. Ver tests/wa/weekly/README.md.
