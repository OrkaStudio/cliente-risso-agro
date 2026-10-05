-- ---------------------------------------------------------------------
-- Onboarding de Tropero (spec «Tropero para código», sección 2).
--
-- 1. empresa.onboarding_completo_at: cuándo el dueño terminó de cargar sus
--    campos (B6). Mientras sea null, entrar lleva al onboarding, al paso donde
--    quedó, y no a una app a medio cargar (regla de destino de Acceso).
--    Las empresas que ya existen tienen el onboarding hecho: se marcan ahora.
-- 2. potrero.descanso_desde: B4 pregunta desde cuándo descansa un potrero
--    (recién, hace un mes, más de dos meses). Se guarda la fecha aproximada.
-- ---------------------------------------------------------------------

alter table public.empresa add column onboarding_completo_at timestamptz;
update public.empresa set onboarding_completo_at = created_at where onboarding_completo_at is null;

alter table public.potrero add column descanso_desde date;

-- El dueño marca su onboarding como terminado (la empresa no tiene policy de
-- UPDATE para el cliente: pasa por acá). Idempotente.
create or replace function public.terminar_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_cuando  timestamptz;
begin
  select empresa_id into v_empresa
  from public.miembro_empresa
  where user_id = auth.uid() and rol = 'dueno';
  if v_empresa is null then
    raise exception 'Sólo el dueño termina el onboarding de su empresa.';
  end if;
  update public.empresa
  set onboarding_completo_at = coalesce(onboarding_completo_at, now())
  where id = v_empresa
  returning onboarding_completo_at into v_cuando;
  return v_cuando;
end;
$$;
revoke execute on function public.terminar_onboarding() from public, anon;
grant execute on function public.terminar_onboarding() to authenticated;
