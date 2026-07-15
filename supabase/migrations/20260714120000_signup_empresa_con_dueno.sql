-- ---------------------------------------------------------------------
-- Multi-tenant operativo Fase A: alta de empresa self-serve.
--
-- Un usuario recién registrado (auth.signUp) no tiene membresía y la RLS
-- no le deja insertar en empresa/miembro_empresa (no hay policies de
-- INSERT ahí — a propósito). Esta RPC SECURITY DEFINER es la única puerta
-- de alta: crea empresa + membresía 'dueno' en una transacción.
-- ---------------------------------------------------------------------

-- Invariante dura: 1 usuario = 1 empresa (Fase A). Las queries del cliente
-- confían solo en RLS (sin filtro de empresa activa); dos membresías
-- mezclarían datos de dos empresas en cada listado. Cuando exista el
-- concepto de "empresa activa" (Fase B, invitaciones), este índice se baja.
create unique index uq_miembro_empresa_un_usuario_una_empresa
  on miembro_empresa (user_id);

create or replace function crear_empresa_con_dueno(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_nombre  text := btrim(coalesce(p_nombre, ''));
  v_empresa uuid;
begin
  if v_user is null then
    raise exception 'Tenés que iniciar sesión para crear una empresa.';
  end if;

  if exists (select 1 from miembro_empresa where user_id = v_user) then
    raise exception 'Tu usuario ya pertenece a una empresa.';
  end if;

  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'El nombre de la empresa debe tener entre 2 y 80 caracteres.';
  end if;

  insert into empresa (nombre) values (v_nombre) returning id into v_empresa;

  insert into miembro_empresa (empresa_id, user_id, rol)
  values (v_empresa, v_user, 'dueno');

  return v_empresa;
end;
$$;

-- Solo usuarios autenticados; anon ni lo ve.
revoke execute on function crear_empresa_con_dueno(text) from public, anon;
grant execute on function crear_empresa_con_dueno(text) to authenticated;
