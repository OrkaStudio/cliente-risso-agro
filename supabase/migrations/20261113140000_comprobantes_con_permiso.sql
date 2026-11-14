-- Las fotos de los comprobantes siguen el permiso de la Plata (revisión de
-- permisos, 13/11): antes las podía bajar cualquiera de la empresa, aunque el
-- dueño no le hubiera habilitado la plata.
--
--   ve / carga   ve todos los de su empresa
--   carga        sube
--   solo_manda   sube y ve sólo los que subió él

drop policy comprobantes_select on storage.objects;
drop policy comprobantes_insert on storage.objects;

create policy comprobantes_select on storage.objects for select to authenticated
using (
  bucket_id = 'comprobantes'
  and (
    (storage.foldername(name))[1] in (select public.empresas_donde('plata', array['ve', 'carga'])::text)
    or (
      owner_id = (select auth.uid())::text
      and (storage.foldername(name))[1] in (select public.empresas_donde('plata', array['solo_manda'])::text)
    )
  )
);

create policy comprobantes_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'comprobantes'
  and (storage.foldername(name))[1] in (select public.empresas_donde('plata', array['carga', 'solo_manda'])::text)
);
