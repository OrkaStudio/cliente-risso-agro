-- ---------------------------------------------------------------------
-- Mapa del campo (spec «Tropero para código», sección 3). Primero el campo:
-- hasta que cada campo tenga su borde y cada potrero su dibujo, la app sólo
-- abre el Inicio y Campos (decisión de Lau del 30/09).
--
-- empresa.mapa_completo_at marca cuándo se terminó. Las empresas que ya
-- existen quedan marcadas: el bloqueo es para las que entran por el
-- onboarding nuevo, no para quien ya usa la app (Daniel).
-- ---------------------------------------------------------------------

alter table public.empresa add column mapa_completo_at timestamptz;
update public.empresa set mapa_completo_at = created_at where mapa_completo_at is null;

-- El dueño termina el mapa. Se verifica acá, no sólo en la pantalla: cada
-- campo con borde y cada potrero con su dibujo. Idempotente.
create or replace function public.terminar_mapa()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_falta   text;
  v_cuando  timestamptz;
begin
  select empresa_id into v_empresa
  from public.miembro_empresa
  where user_id = auth.uid() and rol = 'dueno';
  if v_empresa is null then
    raise exception 'Sólo el dueño termina el mapa de su empresa.';
  end if;

  select c.nombre into v_falta
  from public.campo c
  where c.empresa_id = v_empresa
    and (c.contorno is null
         or exists (select 1 from public.potrero p where p.campo_id = c.id and p.poligono is null))
  limit 1;
  if v_falta is not null then
    raise exception 'Falta terminar % en el mapa.', v_falta;
  end if;

  update public.empresa
  set mapa_completo_at = coalesce(mapa_completo_at, now())
  where id = v_empresa
  returning mapa_completo_at into v_cuando;
  return v_cuando;
end;
$$;
revoke execute on function public.terminar_mapa() from public, anon;
grant execute on function public.terminar_mapa() to authenticated;
