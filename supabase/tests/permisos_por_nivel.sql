-- =====================================================================
--  TEST DE SEGURIDAD — permisos por persona (niveles por sección)
--
--  Spec: orka-brain clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona.
--  Cada sección (hacienda, campos, plata) tiene un nivel por persona:
--  no / ve / carga / solo_manda. Lo que no está habilitado no se lee, no se
--  carga y no se borra, y lo del dueño (campos, dibujos) no se delega.
--
--  No destructivo: corre en una transacción que termina en ROLLBACK.
--  Correr con el rol de servicio (psql como postgres). Si una aserción falla,
--  la transacción aborta con su mensaje.
-- =====================================================================
begin;

insert into auth.users (id, instance_id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', u.mail, 'authenticated', 'authenticated', now(), now(), '{}', '{}', '', '', '', ''
from (values
  ('d0000000-0000-0000-0000-000000000001', 'dueno@permisos.test'),
  ('a0000000-0000-0000-0000-000000000002', 've-hacienda@permisos.test'),
  ('a0000000-0000-0000-0000-000000000003', 'carga-campos@permisos.test'),
  ('a0000000-0000-0000-0000-000000000004', 'manda-plata@permisos.test'),
  ('a0000000-0000-0000-0000-000000000005', 'otra-empresa@permisos.test')
) as u(id, mail);

insert into empresa (id, nombre) values
  ('e0000000-0000-0000-0000-000000000001', 'Permisos Agro'),
  ('e0000000-0000-0000-0000-000000000002', 'Otra Agro');

insert into miembro_empresa (empresa_id, user_id, rol, niveles) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'dueno', null),
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'vet',
     '{"hacienda": "ve", "campos": "no", "plata": "no"}'),
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'encargado',
     '{"hacienda": "no", "campos": "carga", "plata": "no"}'),
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'encargado',
     '{"hacienda": "ve", "campos": "no", "plata": "solo_manda"}'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'dueno', null);

insert into campo (id, empresa_id, nombre) values
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'La Permisos');
insert into potrero (id, empresa_id, campo_id, nombre) values
  ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '1A');
insert into animal (empresa_id, categoria, potrero_id) values
  ('e0000000-0000-0000-0000-000000000001', 'vaca', 'b0000000-0000-0000-0000-000000000001');
insert into lluvia (empresa_id, campo_id, fecha, mm) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', current_date, 12);
-- Un gasto que cargó el dueño.
insert into movimiento_financiero (empresa_id, campo_id, tipo, categoria_id, monto, fecha_devengo, fecha_vencimiento, created_by)
select 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'gasto', id, 100000, current_date, current_date + 10,
  'd0000000-0000-0000-0000-000000000001'
from categoria_movimiento where empresa_id is null limit 1;

-- ---- El dueño: todo ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  select count(*) into n from animal; assert n = 1, format('dueño: 1 animal, vio %s', n);
  select count(*) into n from lluvia; assert n = 1, format('dueño: 1 lluvia, vio %s', n);
  select count(*) into n from movimiento_financiero; assert n = 1, format('dueño: 1 gasto, vio %s', n);
  update potrero set nombre = '1A bis' where id = 'b0000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count; assert n = 1, 'dueño: no pudo renombrar su potrero';
end $$;
reset role;

-- ---- Hacienda «ve», el resto «no» ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  select count(*) into n from animal; assert n = 1, format('ve hacienda: debería ver 1 animal, vio %s', n);
  -- Los nombres de campos y potreros los ve (para ubicar los animales).
  select count(*) into n from potrero; assert n = 1, format('ve hacienda: debería ver el potrero, vio %s', n);
  select count(*) into n from lluvia; assert n = 0, format('FUGA: sin Campos vio %s lluvias', n);
  select count(*) into n from movimiento_financiero; assert n = 0, format('FUGA: sin Plata vio %s gastos', n);
  update animal set notas = 'cambiado';
  get diagnostics n = row_count; assert n = 0, format('FUGA: con «ve» cambió %s animales', n);
  delete from animal;
  get diagnostics n = row_count; assert n = 0, format('FUGA: con «ve» borró %s animales', n);
  begin
    insert into animal (empresa_id, categoria) values ('e0000000-0000-0000-0000-000000000001', 'vaca');
    assert false, 'FUGA: con «ve» pudo cargar un animal';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---- Campos «carga», el resto «no» ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003"}';
do $$
declare n int;
begin
  select count(*) into n from lluvia; assert n = 1, format('carga campos: debería ver 1 lluvia, vio %s', n);
  insert into lluvia (empresa_id, campo_id, fecha, mm) values ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', current_date - 1, 5);
  select count(*) into n from lluvia where created_by = 'a0000000-0000-0000-0000-000000000003';
  assert n = 1, 'carga campos: la lluvia que cargó no quedó con su nombre';
  select count(*) into n from animal; assert n = 0, format('FUGA: sin Hacienda vio %s animales', n);
  select count(*) into n from movimiento_financiero; assert n = 0, format('FUGA: sin Plata vio %s gastos', n);
  -- El estado del potrero lo corrige; el dibujo y el nombre, no.
  update potrero set estado_ciclo = estado_ciclo where id = 'b0000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count; assert n = 1, 'carga campos: no pudo corregir el estado del potrero';
  begin
    update potrero set nombre = 'Hack' where id = 'b0000000-0000-0000-0000-000000000001';
    assert false, 'FUGA: alguien que no es el dueño renombró un potrero';
  exception when raise_exception then null;
  end;
  -- Crear o borrar campos es del dueño.
  begin
    insert into campo (empresa_id, nombre) values ('e0000000-0000-0000-0000-000000000001', 'Hack');
    assert false, 'FUGA: alguien que no es el dueño creó un campo';
  exception when insufficient_privilege then null;
  end;
  delete from potrero;
  get diagnostics n = row_count; assert n = 0, format('FUGA: alguien que no es el dueño borró %s potreros', n);
end $$;
reset role;

-- ---- Plata «solo manda»: carga y ve sólo lo suyo ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004"}';
do $$
declare n int; total numeric;
begin
  select count(*) into n from movimiento_financiero; assert n = 0, format('FUGA: «solo manda» vio %s gastos ajenos', n);
  insert into movimiento_financiero (empresa_id, campo_id, tipo, categoria_id, monto, fecha_devengo, fecha_vencimiento)
  select 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'gasto', id, 85000, current_date, current_date + 5
  from categoria_movimiento where empresa_id is null limit 1;
  select count(*), sum(monto) into n, total from movimiento_financiero;
  assert n = 1 and total = 85000, format('«solo manda»: debería ver sólo su gasto (85000), vio %s por %s', n, total);
  -- Corrige lo suyo; lo ajeno no lo puede tocar.
  update movimiento_financiero set monto = 90000 where created_by = 'a0000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count; assert n = 1, '«solo manda»: no pudo corregir lo suyo';
  delete from movimiento_financiero;
  get diagnostics n = row_count; assert n = 0, format('FUGA: «solo manda» borró %s movimientos', n);
  select count(*) into n from v_flujo_caja; assert n = 0, format('FUGA: «solo manda» vio %s filas del flujo de caja', n);
end $$;
reset role;

-- El dueño ve lo que cargó el invitado, con su nombre, como nuevo; lo suyo nace visto.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  select count(*) into n from movimiento_financiero where created_by = 'a0000000-0000-0000-0000-000000000004' and revisado_at is null;
  assert n = 1, 'dueño: el gasto del invitado debería verse como nuevo';
  insert into movimiento_financiero (empresa_id, campo_id, tipo, categoria_id, monto, fecha_devengo, fecha_vencimiento)
  select 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'gasto', id, 1000, current_date, current_date
  from categoria_movimiento where empresa_id is null limit 1;
  select count(*) into n from movimiento_financiero where created_by = 'd0000000-0000-0000-0000-000000000001' and monto = 1000 and revisado_at is null;
  assert n = 0, 'dueño: lo que carga él no debería quedar como nuevo';
  select count(*) into n from public.nombres_de_empresa() where nombre is not null;
  assert n = 4, format('dueño: debería ver los nombres de las 4 personas, vio %s', n);
  -- Lo revisa.
  update movimiento_financiero set revisado_at = now() where created_by = 'a0000000-0000-0000-0000-000000000004';
end $$;
reset role;

-- Ya revisado, «solo manda» no lo puede corregir.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004"}';
do $$
declare n int;
begin
  update movimiento_financiero set monto = 1 where created_by = 'a0000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count; assert n = 0, 'FUGA: «solo manda» corrigió algo ya revisado';
end $$;
reset role;

-- ---- Otra empresa: nada de esta ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000005"}';
do $$
declare n int;
begin
  select count(*) into n from animal where empresa_id = 'e0000000-0000-0000-0000-000000000001';
  assert n = 0, 'FUGA: otra empresa vio animales';
  select count(*) into n from potrero where empresa_id = 'e0000000-0000-0000-0000-000000000001';
  assert n = 0, 'FUGA: otra empresa vio potreros';
end $$;
reset role;

-- ---- Invitar: sin preestablecidos, al menos una sección ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001"}';
do $$
begin
  begin
    perform public.crear_invitacion('2241000001', 'Nadie', 'peon', '{"hacienda": "no", "campos": "no", "plata": "no"}');
    assert false, 'invitar sin ninguna sección debería fallar';
  exception when raise_exception then null;
  end;
  begin
    perform public.crear_invitacion('2241000001', 'Raro', 'peon', '{"hacienda": "todo"}');
    assert false, 'un nivel inventado debería fallar';
  exception when raise_exception then null;
  end;
  perform public.crear_invitacion('2241000001', 'Pedro', 'peon', '{"hacienda": "no", "campos": "solo_manda", "plata": "no"}');
end $$;
reset role;

-- ---- Comprobantes (fotos): siguen el permiso de la Plata ----
insert into storage.objects (bucket_id, name, owner_id) values
  ('comprobantes', 'e0000000-0000-0000-0000-000000000001/del-dueno.jpg', 'd0000000-0000-0000-0000-000000000001'),
  ('comprobantes', 'e0000000-0000-0000-0000-000000000001/del-que-manda.jpg', 'a0000000-0000-0000-0000-000000000004');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'comprobantes';
  assert n = 0, format('FUGA: sin Plata vio %s comprobantes', n);
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004"}';
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'comprobantes';
  assert n = 1, format('«solo manda»: debería ver sólo su comprobante, vio %s', n);
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'comprobantes' and name like 'e0000000-0000-0000-0000-000000000001/%';
  assert n = 2, format('dueño: debería ver los 2 comprobantes, vio %s', n);
end $$;
reset role;

do $$ begin raise notice 'Permisos OK: no / ve / carga / solo manda, lo del dueño y la otra empresa.'; end $$;

rollback;
