-- Planilla viva de telemetría (Google Sheets). La edge function
-- `planilla-telemetria` lee las vistas de `interno` con la conexión directa a
-- la base y sólo responde si la clave coincide con este hash. La clave vive en
-- las propiedades del Apps Script de la planilla, nunca en el repo.
-- Rotar = insertar un hash nuevo y borrar el viejo.

create table interno.planilla_clave (
  hash text primary key,
  creada timestamptz not null default now(),
  nota text
);

revoke all on interno.planilla_clave from public, anon, authenticated;

create function interno.planilla_clave_ok(clave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from interno.planilla_clave
    where hash = encode(sha256(convert_to(clave, 'UTF8')), 'hex')
  )
$$;

revoke all on function interno.planilla_clave_ok(text) from public, anon, authenticated;
