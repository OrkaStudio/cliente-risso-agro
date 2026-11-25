-- Documentos remitidos por los números verificados del piloto de veterinaria.
-- La lectura y las transiciones se autorizan en el webhook. La API pública no accede a esta tabla.
create table interno.wa_documento_veterinario (
  id uuid primary key references public.wa_mensaje(id) on delete cascade,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  identidad text,
  datos jsonb not null check (datos->>'tipo' in ('factura', 'visita', 'protocolo', 'constancia')),
  original bytea,
  estado text not null default 'borrador' check (estado in ('borrador', 'guardado', 'descartado')),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  check ((estado = 'descartado') = (original is null)),
  check (original is null or octet_length(original) between 1 and 5242880)
);

alter table interno.wa_documento_veterinario enable row level security;
revoke all on table interno.wa_documento_veterinario from public, anon, authenticated, service_role;

create unique index wa_documento_vet_hash on interno.wa_documento_veterinario (empresa_id, sha256)
where estado <> 'descartado';
create unique index wa_documento_vet_identidad on interno.wa_documento_veterinario (empresa_id, identidad)
where identidad is not null and estado <> 'descartado';
create index wa_documento_vet_bandeja on interno.wa_documento_veterinario (empresa_id, actualizado_at desc)
where estado <> 'descartado';
