-- Quién cargó qué, por dónde y si el dueño ya lo vio (permisos por persona,
-- entrega 4; spec del cerebro clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona).
--
-- - `canal`: por dónde entró (app o WhatsApp). El bot lo marca al cargar.
-- - `revisado_at` (plata): lo que cargó otro entra «Nuevo» y cuenta desde que
--   entra; deja de ser nuevo cuando el dueño (o quien carga la plata) lo mira.
--   Quien está en «Solo manda» corrige lo suyo sólo mientras no se revisó.

do $$
declare t text;
begin
  foreach t in array array['animal', 'caravana', 'evento', 'lote', 'salida_pendiente', 'lluvia', 'recorrida',
    'observacion_potrero', 'labor_potrero', 'marca_senal', 'infraestructura', 'movimiento_financiero', 'movimiento_iva_linea']
  loop
    execute format('alter table public.%I add column if not exists canal text not null default ''app'' check (canal in (''app'', ''whatsapp''))', t);
  end loop;
end
$$;

alter table public.movimiento_financiero add column revisado_at timestamptz;
-- Lo que ya estaba no es nuevo para nadie.
update public.movimiento_financiero set revisado_at = created_at;

-- Lo que carga quien lo va a mirar (el dueño, o quien carga la plata) ya está visto.
create or replace function public.movimiento_revisado_si_es_de_quien_mira()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.revisado_at is null and new.empresa_id in (select public.empresas_donde('plata', array['carga'])) then
    new.revisado_at := now();
  end if;
  return new;
end;
$$;
create trigger movimiento_revisado_si_es_de_quien_mira before insert on public.movimiento_financiero
  for each row execute function public.movimiento_revisado_si_es_de_quien_mira();

-- «Solo manda» corrige lo suyo sólo mientras nadie lo revisó.
drop policy movimiento_financiero_corregir on public.movimiento_financiero;
create policy movimiento_financiero_corregir on public.movimiento_financiero for update to authenticated
  using (
    empresa_id in (select public.empresas_donde('plata', array['carga']))
    or (created_by = (select auth.uid()) and revisado_at is null and empresa_id in (select public.empresas_donde('plata', array['solo_manda'])))
  )
  with check (
    empresa_id in (select public.empresas_donde('plata', array['carga']))
    or (created_by = (select auth.uid()) and revisado_at is null and empresa_id in (select public.empresas_donde('plata', array['solo_manda'])))
  );

-- Los nombres de la gente de la empresa, para «Cargó Juan». Los ve cualquiera de la empresa.
create or replace function public.nombres_de_empresa()
returns table (user_id uuid, nombre text, rol text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
    coalesce(i.nombre, nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'nombre', u.raw_user_meta_data ->> 'apellido')), ''), 'Alguien'),
    m.rol
  from public.miembro_empresa m
  join auth.users u on u.id = m.user_id
  left join public.invitacion i on i.aceptada_por = m.user_id and i.empresa_id = m.empresa_id
  where m.empresa_id in (select public.auth_empresa_ids())
$$;
revoke all on function public.nombres_de_empresa() from public, anon;
grant execute on function public.nombres_de_empresa() to authenticated;
