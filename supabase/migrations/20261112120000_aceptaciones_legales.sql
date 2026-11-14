-- Quién aceptó qué versión de los términos y la privacidad, y cuándo (Lau, 12/11).
-- Es la prueba ante un reclamo: se escribe sólo por `aceptar_legales()`, con la
-- hora del servidor, y no se puede editar ni borrar desde la app.

create table public.aceptacion_legal (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null check (length(btrim(version)) between 1 and 40),
  -- Por dónde aceptó: al crear la cuenta, al entrar por una invitación o al aceptar una versión nueva.
  via text not null check (via in ('registro', 'invitacion', 'actualizacion')),
  aceptado_at timestamptz not null default now(),
  ip text,
  dispositivo text,
  unique (user_id, version)
);

alter table public.aceptacion_legal enable row level security;

-- Cada uno ve sólo las suyas. Sin políticas de insert/update/delete: se escribe por la función.
create policy aceptacion_legal_propia on public.aceptacion_legal
  for select to authenticated using (user_id = auth.uid());

create or replace function public.aceptar_legales(p_version text, p_via text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  encabezados json := nullif(current_setting('request.headers', true), '')::json;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión para aceptar';
  end if;
  insert into public.aceptacion_legal (user_id, version, via, ip, dispositivo)
  values (
    auth.uid(),
    p_version,
    p_via,
    split_part(coalesce(encabezados ->> 'x-forwarded-for', encabezados ->> 'x-real-ip', ''), ',', 1),
    left(encabezados ->> 'user-agent', 300)
  )
  on conflict (user_id, version) do nothing;
end;
$$;

revoke all on function public.aceptar_legales(text, text) from public, anon;
grant execute on function public.aceptar_legales(text, text) to authenticated;
