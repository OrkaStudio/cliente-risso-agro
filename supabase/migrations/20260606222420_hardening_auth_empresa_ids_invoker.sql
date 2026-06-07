-- =====================================================================
--  HARDENING (auditoría) — auth_empresa_ids(): SECURITY DEFINER → INVOKER
--
--  El advisor de Supabase marca las funciones SECURITY DEFINER expuestas vía
--  RPC. auth_empresa_ids() no necesita DEFINER: la RLS de miembro_empresa
--  (user_id = auth.uid()) es self-contained y no referencia otras tablas RLS
--  → no hay recursión. Con INVOKER la función lee miembro_empresa bajo su RLS
--  y devuelve exactamente las empresas del usuario actual. Equivalente y sin
--  el warning. Verificado con el test de aislamiento multi-tenant.
-- =====================================================================
create or replace function auth_empresa_ids()
returns setof uuid
language sql
security invoker
set search_path = public
stable
as $$
  select empresa_id from miembro_empresa where user_id = auth.uid()
$$;
