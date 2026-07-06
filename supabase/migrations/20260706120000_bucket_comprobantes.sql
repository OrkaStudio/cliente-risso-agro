-- =====================================================================
--  Bucket privado `comprobantes` — fotos de tickets/comprobantes.
--
--  Lo usa el Modo Campo (carga de gastos/ingresos con foto) y lo va a
--  reusar la capa fiscal (spec posición de IVA). Convención de paths:
--      {empresa_id}/{movimiento_id}.jpg
--  RLS por prefijo de carpeta: cada empresa solo ve/sube bajo su UUID
--  (mismo criterio multi-tenant que el resto: auth_empresa_ids()).
--  Sin update/delete en v1: el comprobante es evidencia inmutable.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

create policy comprobantes_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] in (
      select auth_empresa_ids()::text
    )
  );

create policy comprobantes_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] in (
      select auth_empresa_ids()::text
    )
  );
