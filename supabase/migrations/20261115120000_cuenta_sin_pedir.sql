-- Varias cuentas, revisión del 15/11 (spec del cerebro
-- clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona, «Una
-- persona en varios campos»).
--
-- Hasta acá, un pedido sin cuenta (sin `x-troppero-cuenta`, o con uno que no es
-- un uuid) veía todas las cuentas de la persona. Para quien está en una sola da
-- igual; para quien está en varias, un pedido que se olvidó la cuenta mezclaría
-- datos de dos clientes. Desde acá: sin cuenta pedida, sólo quien está en una
-- sola cuenta ve la suya; quien está en varias no ve nada hasta decir cuál.
-- Nada se elige solo, tampoco en la base.
--
-- `mis_cuentas()` sigue listando todas (es lo que se usa para elegir).

-- Las cuentas de la persona (sin RLS: sólo cuenta las propias).
create or replace function public.cuentas_de_quien_pide()
returns integer
language sql
stable security definer
set search_path to ''
as $$
  select count(*)::int from public.miembro_empresa where user_id = auth.uid()
$$;
revoke all on function public.cuentas_de_quien_pide() from public, anon;
grant execute on function public.cuentas_de_quien_pide() to authenticated;

-- ¿Puede actuar en esta cuenta en este pedido? La pedida; sin pedir, la única.
create or replace function public.cuenta_en_juego(p_empresa uuid)
returns boolean
language sql
stable
set search_path to ''
as $$
  select case
    when public.cuenta_pedida() is not null then p_empresa = public.cuenta_pedida()
    else public.cuentas_de_quien_pide() = 1
  end
$$;

create or replace function public.auth_empresa_ids()
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select empresa_id from miembro_empresa
  where user_id = auth.uid() and public.cuenta_en_juego(empresa_id)
$$;

create or replace function public.empresas_donde(p_seccion text, p_niveles text[])
returns setof uuid
language sql
stable security definer
set search_path to ''
as $$
  select m.empresa_id from public.miembro_empresa m
  where m.user_id = auth.uid()
    and public.cuenta_en_juego(m.empresa_id)
    and case when m.rol = 'dueno' then 'carga' else coalesce(m.niveles ->> p_seccion, 'no') end = any(p_niveles)
$$;

create or replace function public.empresas_como_dueno()
returns setof uuid
language sql
stable security definer
set search_path to ''
as $$
  select empresa_id from public.miembro_empresa
  where user_id = auth.uid() and rol = 'dueno' and public.cuenta_en_juego(empresa_id)
$$;

create or replace function public.empresa_propia()
returns uuid
language sql
stable security definer
set search_path to ''
as $$
  select empresa_id from public.miembro_empresa
  where user_id = auth.uid() and rol = 'dueno' and public.cuenta_en_juego(empresa_id)
$$;
