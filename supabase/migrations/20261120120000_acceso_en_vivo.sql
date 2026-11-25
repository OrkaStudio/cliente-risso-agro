-- El cambio de acceso le llega a la persona en el momento (Lau, 20/11).
--
-- Cuando el dueño le cambia a alguien lo que ve (por ejemplo, le habilita la Agenda
-- al veterinario), la app de esa persona lo pedía de nuevo cada minuto. Con la tabla
-- de miembros en el tiempo real de Supabase, la app escucha su propia fila y se
-- actualiza al instante.
--
-- No abre nada nuevo: el tiempo real respeta la RLS de la tabla (miembro_select: cada
-- uno ve sólo su fila), así que nadie se entera de los cambios de otro. Al borrar una
-- fila (le sacaron el acceso) el aviso lleva sólo la clave, sin datos.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'miembro_empresa'
  ) then
    alter publication supabase_realtime add table public.miembro_empresa;
  end if;
end
$$;
