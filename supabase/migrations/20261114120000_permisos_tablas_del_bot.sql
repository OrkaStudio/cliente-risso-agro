-- Las tablas del bot siguen los permisos por persona (Lau, 13/11; spec del
-- cerebro clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona).
-- Depende de 20261113130000_permisos_por_nivel (empresas_donde, empresas_como_dueno).
--
-- - captura: el texto de cada mensaje que entendió el bot (incluye gastos). Cada
--   uno ve los suyos; el dueño, todos. Antes los veía cualquiera de la empresa.
-- - wa_piloto_evento: el antes y el después de cada cambio hecho por WhatsApp
--   (puede tener montos). Cada uno ve lo suyo; el dueño, todo.
-- - campo_incidencia y campo_tarea (piloto): son de Campos. Ver pide «ve» o
--   «carga»; reportar, «carga» o «solo manda» (y quien solo manda ve lo suyo);
--   la tarea la sigue pudiendo actualizar quien es responsable.

drop policy captura_select on public.captura;
create policy captura_select on public.captura for select to authenticated
  using (user_id = (select auth.uid()) or empresa_id in (select public.empresas_como_dueno()));

drop policy evento_leer on public.wa_piloto_evento;
create policy evento_leer on public.wa_piloto_evento for select to authenticated
  using (actor_id = (select auth.uid()) or empresa_id in (select public.empresas_como_dueno()));

drop policy incidencia_leer on public.campo_incidencia;
drop policy incidencia_crear on public.campo_incidencia;
drop policy incidencia_actualizar on public.campo_incidencia;
create policy incidencia_leer on public.campo_incidencia for select to authenticated
  using (
    empresa_id in (select public.empresas_donde('campos', array['ve', 'carga']))
    or (created_by = (select auth.uid()) and empresa_id in (select public.empresas_donde('campos', array['solo_manda'])))
  );
create policy incidencia_crear on public.campo_incidencia for insert to authenticated
  with check (empresa_id in (select public.empresas_donde('campos', array['carga', 'solo_manda'])) and created_by = (select auth.uid()));
create policy incidencia_actualizar on public.campo_incidencia for update to authenticated
  using (empresa_id in (select public.empresas_donde('campos', array['carga'])))
  with check (empresa_id in (select public.empresas_donde('campos', array['carga'])));

drop policy tarea_leer on public.campo_tarea;
drop policy tarea_crear on public.campo_tarea;
drop policy tarea_actualizar on public.campo_tarea;
create policy tarea_leer on public.campo_tarea for select to authenticated
  using (
    empresa_id in (select public.empresas_donde('campos', array['ve', 'carga']))
    or ((created_by = (select auth.uid()) or responsable_id = (select auth.uid())) and empresa_id in (select public.auth_empresa_ids()))
  );
create policy tarea_crear on public.campo_tarea for insert to authenticated
  with check (empresa_id in (select public.empresas_donde('campos', array['carga'])) and created_by = (select auth.uid()));
create policy tarea_actualizar on public.campo_tarea for update to authenticated
  using (
    empresa_id in (select public.empresas_donde('campos', array['carga']))
    or (responsable_id = (select auth.uid()) and empresa_id in (select public.auth_empresa_ids()))
  )
  with check (
    empresa_id in (select public.empresas_donde('campos', array['carga']))
    or (responsable_id = (select auth.uid()) and empresa_id in (select public.auth_empresa_ids()))
  );
