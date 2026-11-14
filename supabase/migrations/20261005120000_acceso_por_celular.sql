-- ---------------------------------------------------------------------
-- Acceso de Tropero: se entra sólo con el celular y un código por WhatsApp.
--
-- El código lo genera Supabase Auth (login por teléfono) y lo manda la
-- función enviar-codigo (hook «Send SMS»). Acá sólo hace falta saber, antes
-- de mandar nada, si un número ya tiene cuenta: en «Crear cuenta» (A3) se
-- avisa y se ofrece entrar, en vez de mandar un código que lo loguearía.
--
-- Revela si un número está registrado, igual que A1 («ese número no tiene
-- cuenta»), que es el comportamiento diseñado. Lo frenan los límites de
-- Supabase Auth.
-- ---------------------------------------------------------------------

create or replace function public.celular_tiene_cuenta(p_celular text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  -- auth.users.phone se guarda sin el «+»: 5492241558820.
  select exists (
    select 1 from auth.users
    where phone = regexp_replace(coalesce(p_celular, ''), '\D', '', 'g')
      and deleted_at is null
  )
$$;

revoke execute on function public.celular_tiene_cuenta(text) from public;
grant execute on function public.celular_tiene_cuenta(text) to anon, authenticated;
