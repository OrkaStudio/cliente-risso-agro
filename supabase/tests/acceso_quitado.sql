-- =====================================================================
--  TEST — a quien le sacan el acceso se le dice (25/11)
--
--  Al sacarlo queda registrado y la persona lo ve (accesos_quitados); al
--  marcarlo visto no se repite; si lo vuelven a invitar y acepta, se borra.
--  Nadie ve los registros de otro, y sacar una invitación pendiente no deja
--  registro (todavía no había entrado).
--
--  No destructivo: corre en una transacción que termina en ROLLBACK.
--  Correr con el rol de servicio (psql como postgres).
-- =====================================================================
begin;

insert into auth.users (id, instance_id, email, phone, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('d3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'dueno@quitado.test', '5492247000001', 'authenticated', 'authenticated', now(), now(), '{}', '{}', '', '', '', ''),
  ('a3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'juan@quitado.test', '5492247000002', 'authenticated', 'authenticated', now(), now(), '{}', '{}', '', '', '', ''),
  ('a3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'otro@quitado.test', '5492247000003', 'authenticated', 'authenticated', now(), now(), '{}', '{}', '', '', '', '');
insert into empresa (id, nombre) values ('e3000000-0000-0000-0000-000000000001', 'Quitado Agro');
insert into miembro_empresa (empresa_id, user_id, rol, niveles, acceso) values
  ('e3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'dueno', null, 'app'),
  ('e3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'encargado', '{"hacienda":"carga","campos":"no","plata":"no"}', 'app');
insert into campo (id, empresa_id, nombre, contorno) values
  ('c3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'La Quitada', '[[-36,-59],[-36.01,-59],[-36.01,-59.01]]');
insert into potrero (empresa_id, campo_id, nombre, poligono) values
  ('e3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', '1A', '[[-36,-59],[-36.005,-59],[-36.005,-59.005]]');

-- 1) El dueño saca a Juan y cancela una invitación pendiente (que no deja registro).
set local role authenticated;
set local request.jwt.claims = '{"sub":"d3000000-0000-0000-0000-000000000001"}';
select public.quitar_persona('a3000000-0000-0000-0000-000000000002', null);
do $$
declare v_token text; v_inv uuid;
begin
  v_token := public.crear_invitacion('2247000009', 'Pendiente', 'peon', '{"hacienda":"ve","campos":"no","plata":"no"}');
  select id into v_inv from public.invitacion where token = v_token;
  perform public.quitar_persona(null, v_inv);
  begin
    perform public.quitar_persona('a3000000-0000-0000-0000-000000000002', null);
    raise exception 'FALLA: sacó dos veces a la misma persona';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.acceso_quitado where empresa_id = 'e3000000-0000-0000-0000-000000000001') = 1, 'debería quedar un solo registro (el de Juan)';
  raise notice 'ok, sacar a alguien queda registrado; cancelar una invitación, no';
end $$;

-- 2) Juan lo ve; otro, no.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3000000-0000-0000-0000-000000000003"}';
do $$
begin
  assert (select count(*) from public.accesos_quitados()) = 0, 'FUGA: otro vio el registro de Juan';
  assert (select count(*) from public.acceso_quitado) = 0, 'FUGA: otro leyó la tabla de Juan';
  raise notice 'ok, nadie ve lo de otro';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3000000-0000-0000-0000-000000000002"}';
do $$
declare n text;
begin
  select nombre into n from public.accesos_quitados();
  assert n = 'Quitado Agro', format('Juan debería ver de qué cuenta lo sacaron, vio %s', n);
  -- 3) Ya se le dijo: no se repite.
  perform public.acceso_quitado_visto('e3000000-0000-0000-0000-000000000001');
  assert (select count(*) from public.accesos_quitados()) = 0, 'marcado visto, no debería repetirse';
  raise notice 'ok, Juan ve de dónde lo sacaron y, una vez dicho, no se repite';
end $$;
reset role;

-- 4) Lo sacan de nuevo (se vuelve a decir) y después lo reinvitan y acepta: el registro se borra.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d3000000-0000-0000-0000-000000000001"}';
do $$
declare v_token text;
begin
  -- Vuelve a entrar por una invitación y lo vuelven a sacar.
  v_token := public.crear_invitacion('2247000002', 'Juan', 'encargado', '{"hacienda":"ve","campos":"no","plata":"no"}');
  perform set_config('test.token', v_token, true);
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3000000-0000-0000-0000-000000000002"}';
select public.aceptar_invitacion(current_setting('test.token'));
do $$
begin
  assert (select count(*) from public.acceso_quitado where user_id = 'a3000000-0000-0000-0000-000000000002') = 0, 'al volver a entrar, el registro debería borrarse';
  raise notice 'ok, si lo reinvitan y acepta, ya no se le dice que no tiene acceso';
end $$;
reset role;

rollback;
