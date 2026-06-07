-- =====================================================================
--  TEST DE SEGURIDAD — aislamiento multi-tenant (RLS)
--
--  Verifica la invariante #1, catastrófica si falla: un usuario de la
--  empresa A NO puede ver datos de la empresa B.
--
--  Self-contained y NO destructivo: corre dentro de una transacción que
--  termina en ROLLBACK (no deja usuarios ni datos de prueba). Ejecutar con
--  el rol de servicio (MCP execute_sql / SQL editor). Si alguna aserción
--  falla, la transacción aborta con el mensaje del assert.
-- =====================================================================
begin;

-- Dos usuarios de prueba (mínimo para satisfacer la FK de miembro_empresa).
insert into auth.users (
  id, instance_id, email, aud, role,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
   'a@test.local','authenticated','authenticated', now(), now(),
   '{"provider":"email","providers":["email"]}','{}', '', '', '', ''),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000',
   'b@test.local','authenticated','authenticated', now(), now(),
   '{"provider":"email","providers":["email"]}','{}', '', '', '', '');

-- Dos empresas + membresías (cada usuario a la suya).
insert into empresa (id, nombre) values
  ('aaaaaaaa-0000-0000-0000-000000000000','Empresa A'),
  ('bbbbbbbb-0000-0000-0000-000000000000','Empresa B');
insert into miembro_empresa (user_id, empresa_id) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000000');

-- Datos de cada empresa (insert como rol de servicio: bypasea RLS, es el setup).
insert into campo (empresa_id, nombre) values
  ('aaaaaaaa-0000-0000-0000-000000000000','Campo A'),
  ('bbbbbbbb-0000-0000-0000-000000000000','Campo B');
insert into animal (empresa_id, categoria) values
  ('aaaaaaaa-0000-0000-0000-000000000000','vaca'),
  ('bbbbbbbb-0000-0000-0000-000000000000','toro');

-- ---- Simular al usuario A autenticado ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare n int;
begin
  -- A ve sólo SU campo
  select count(*) into n from campo;
  assert n = 1, format('A deberia ver 1 campo, vio %s', n);
  select count(*) into n from campo where nombre = 'Campo B';
  assert n = 0, 'FUGA: A vio el campo de B';

  -- A ve sólo SU animal
  select count(*) into n from animal;
  assert n = 1, format('A deberia ver 1 animal, vio %s', n);

  -- A ve las categorías globales (semilla, empresa_id null)
  select count(*) into n from categoria_movimiento where empresa_id is null;
  assert n >= 13, format('A deberia ver las categorias globales, vio %s', n);

  -- A NO puede insertar datos en la empresa de B (with check)
  begin
    insert into campo (empresa_id, nombre)
    values ('bbbbbbbb-0000-0000-0000-000000000000','Hack');
    assert false, 'FUGA: A pudo insertar en la empresa de B';
  exception when others then
    null; -- esperado: la policy with check lo rechaza
  end;
end $$;
reset role;

-- ---- evento es APPEND-ONLY: no se puede UPDATE ni DELETE ----
insert into evento (empresa_id, animal_id, tipo)
select 'aaaaaaaa-0000-0000-0000-000000000000', a.id, 'alta'
from animal a where a.empresa_id = 'aaaaaaaa-0000-0000-0000-000000000000' limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare n int;
begin
  update evento set nota = 'editado';
  get diagnostics n = row_count;
  assert n = 0, format('APPEND-ONLY roto: A pudo editar %s eventos', n);

  delete from evento;
  get diagnostics n = row_count;
  assert n = 0, format('APPEND-ONLY roto: A pudo borrar %s eventos', n);
end $$;
reset role;

-- Si llegamos acá sin abortar, todo pasó.
do $$ begin raise notice 'RLS OK: aislamiento multi-tenant + append-only verificados.'; end $$;

rollback;
