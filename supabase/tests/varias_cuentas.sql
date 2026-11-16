-- =====================================================================
--  TEST DE SEGURIDAD — una persona en varias cuentas
--
--  Spec: orka-brain clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona
--  («Una persona en varios campos»). Un veterinario atiende dos campos
--  (Risso y Pérez) y además tiene el suyo. Con la cuenta pedida
--  (`x-troppero-cuenta`) ve y carga sólo en esa cuenta, con los niveles que le
--  dio ese dueño; nunca se mezclan datos de dos clientes.
--
--  No destructivo: corre en una transacción que termina en ROLLBACK.
--  Correr con el rol de servicio (psql como postgres).
-- =====================================================================
begin;

insert into auth.users (id, instance_id, email, phone, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', u.mail, u.tel, 'authenticated', 'authenticated', now(), now(), '{}', '{}', '', '', '', ''
from (values
  ('d1000000-0000-0000-0000-000000000001', 'risso@cuentas.test', '5490000000001'),
  ('d1000000-0000-0000-0000-000000000002', 'perez@cuentas.test', '5490000000002'),
  ('d1000000-0000-0000-0000-000000000003', 'otro@cuentas.test', '5490000000003'),
  ('f1000000-0000-0000-0000-000000000001', 'vete@cuentas.test', '5490000000009')
) as u(id, mail, tel);

insert into empresa (id, nombre) values
  ('e1000000-0000-0000-0000-000000000001', 'Risso Cuentas'),
  ('e1000000-0000-0000-0000-000000000002', 'Pérez Cuentas'),
  ('e1000000-0000-0000-0000-000000000003', 'Campo del Vete'),
  ('e1000000-0000-0000-0000-000000000004', 'Otro Cuentas');

insert into miembro_empresa (empresa_id, user_id, rol, niveles) values
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'dueno', null),
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'dueno', null),
  ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000003', 'dueno', null),
  -- El vete: en Risso ve la hacienda y sólo manda la plata; en Pérez carga los campos; y tiene su campo.
  ('e1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'vet',
     '{"hacienda": "ve", "campos": "no", "plata": "solo_manda"}'),
  ('e1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'vet',
     '{"hacienda": "no", "campos": "carga", "plata": "no"}'),
  ('e1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'dueno', null);

insert into campo (id, empresa_id, nombre) values
  ('c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'La Risso'),
  ('c1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'La Pérez'),
  ('c1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000003', 'La del Vete');
insert into potrero (id, empresa_id, campo_id, nombre) values
  ('b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'El Bajo'),
  ('b1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'El Bajo');
-- Los campos con su mapa dibujado (sin el mapa no se invita, 16/11).
update campo set contorno = '[[-36,-59],[-36.01,-59],[-36.01,-59.01]]'::jsonb where contorno is null;
update potrero set poligono = '[[-36,-59],[-36.005,-59],[-36.005,-59.005]]'::jsonb where poligono is null;
insert into animal (empresa_id, categoria, potrero_id) values
  ('e1000000-0000-0000-0000-000000000001', 'vaca', 'b1000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002', 'vaca', 'b1000000-0000-0000-0000-000000000002'),
  ('e1000000-0000-0000-0000-000000000002', 'toro', 'b1000000-0000-0000-0000-000000000002');
insert into lluvia (empresa_id, campo_id, fecha, mm) values
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_date, 10),
  ('e1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', current_date, 20);

-- ---- El vete, con Risso pedida: sólo lo de Risso, con los niveles de Risso ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000001"}';
set local request.headers = '{"x-troppero-cuenta":"e1000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  select count(*) into n from animal; assert n = 1, format('Risso: 1 animal de Risso, vio %s', n);
  select count(*) into n from animal where empresa_id = 'e1000000-0000-0000-0000-000000000002';
  assert n = 0, format('FUGA: con Risso pedida vio %s animales de Pérez', n);
  select count(*) into n from lluvia; assert n = 0, format('FUGA: en Risso no ve Campos y vio %s lluvias (¿las de Pérez?)', n);
  select count(*) into n from campo; assert n = 1, format('Risso: sólo el campo de Risso, vio %s', n);
  -- En Pérez carga lluvias, pero con Risso pedida no puede cargar en Pérez.
  begin
    insert into lluvia (empresa_id, campo_id, fecha, mm) values ('e1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', current_date - 1, 5);
    assert false, 'FUGA: con Risso pedida cargó una lluvia en Pérez';
  exception when insufficient_privilege then null;
  end;
  -- Su gasto en Risso entra «Nuevo» (aunque en su propio campo carga la plata).
  insert into movimiento_financiero (empresa_id, campo_id, tipo, categoria_id, monto, fecha_devengo, fecha_vencimiento)
  select 'e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'gasto', id, 5000, current_date, current_date + 10
  from categoria_movimiento where empresa_id is null limit 1;
  select count(*) into n from movimiento_financiero; assert n = 1, format('Risso, solo manda: ve sólo lo suyo, vio %s', n);
  -- Las cosas del dueño no son suyas acá.
  begin
    perform public.personas_de_empresa();
    assert false, 'FUGA: con Risso pedida vio las personas de una cuenta';
  exception when raise_exception then null;
  end;
  begin
    perform public.terminar_onboarding();
    assert false, 'FUGA: con Risso pedida terminó el onboarding de su propio campo';
  exception when raise_exception then null;
  end;
  -- «Cargó …»: sólo la gente de Risso.
  select count(*) into n from public.nombres_de_empresa(); assert n = 2, format('Risso: 2 personas (dueño y vete), vio %s', n);
  -- Elegir y cambiar: las tres cuentas, pida la que pida.
  select count(*) into n from public.mis_cuentas(); assert n = 3, format('mis_cuentas: 3, vio %s', n);
end $$;
reset role;

-- El gasto que mandó el vete quedó «Nuevo» para el dueño de Risso.
do $$
declare n int;
begin
  select count(*) into n from movimiento_financiero
  where empresa_id = 'e1000000-0000-0000-0000-000000000001' and created_by = 'f1000000-0000-0000-0000-000000000001' and revisado_at is null;
  assert n = 1, format('el gasto del vete tenía que entrar Nuevo, hay %s', n);
end $$;

-- ---- El vete, con Pérez pedida ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000001"}';
set local request.headers = '{"x-troppero-cuenta":"e1000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  select count(*) into n from lluvia; assert n = 1, format('Pérez: 1 lluvia, vio %s', n);
  select count(*) into n from animal; assert n = 0, format('FUGA: en Pérez no ve Hacienda y vio %s animales (¿los de Risso?)', n);
  select count(*) into n from movimiento_financiero; assert n = 0, format('FUGA: con Pérez pedida vio %s gastos', n);
  insert into lluvia (empresa_id, campo_id, fecha, mm) values ('e1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', current_date - 2, 7);
  begin
    insert into lluvia (empresa_id, campo_id, fecha, mm) values ('e1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', current_date, 1);
    assert false, 'FUGA: con Pérez pedida cargó en su propio campo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---- El vete en su propio campo: dueño, sólo de ése ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000001"}';
set local request.headers = '{"x-troppero-cuenta":"e1000000-0000-0000-0000-000000000003"}';
do $$
declare n int;
begin
  select count(*) into n from campo; assert n = 1, format('su campo: 1 campo, vio %s', n);
  select count(*) into n from lluvia; assert n = 0, format('FUGA: en su campo vio %s lluvias de otros', n);
  select count(*) into n from public.personas_de_empresa(); assert n = 1, format('su campo: sólo él, vio %s', n);
  perform public.terminar_onboarding();
  -- Su campo propio es uno solo.
  begin
    perform public.crear_empresa_con_dueno('Otro campo del vete');
    assert false, 'tenía que rechazar un segundo campo propio';
  exception when raise_exception then null;
  end;
end $$;
reset role;

-- ---- Una cuenta pedida que no es suya: nada ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000001"}';
set local request.headers = '{"x-troppero-cuenta":"e1000000-0000-0000-0000-000000000004"}';
do $$
declare n int;
begin
  select count(*) into n from campo; assert n = 0, format('FUGA: pidiendo una cuenta ajena vio %s campos', n);
  select count(*) into n from animal; assert n = 0, format('FUGA: pidiendo una cuenta ajena vio %s animales', n);
  select count(*) into n from lluvia; assert n = 0, format('FUGA: pidiendo una cuenta ajena vio %s lluvias', n);
end $$;
reset role;

-- ---- Sin decir la cuenta, quien está en varias no ve nada (nada se elige solo) ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000001"}';
set local request.headers = '{"x-troppero-cuenta":"no-es-un-uuid"}';
do $$
declare n int;
begin
  select count(*) into n from campo; assert n = 0, format('FUGA: con una cuenta inválida vio %s campos', n);
  select count(*) into n from lluvia; assert n = 0, format('FUGA: con una cuenta inválida vio %s lluvias', n);
  begin
    insert into lluvia (empresa_id, campo_id, fecha, mm) values ('e1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', current_date - 3, 2);
    assert false, 'FUGA: sin cuenta válida cargó una lluvia';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000001"}';
set local request.headers = '{}';
do $$
declare n int;
begin
  select count(*) into n from campo; assert n = 0, format('FUGA: sin cuenta pedida vio %s campos', n);
  select count(*) into n from animal; assert n = 0, format('FUGA: sin cuenta pedida vio %s animales', n);
  assert public.empresa_propia() is null, 'FUGA: sin cuenta pedida actuó como dueño';
  select count(*) into n from public.mis_cuentas(); assert n = 3, format('mis_cuentas sin pedir: 3, vio %s', n);
end $$;
reset role;
-- Quien está en una sola cuenta, sin pedirla, ve la suya (como siempre).
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1000000-0000-0000-0000-000000000002"}';
set local request.headers = '{}';
do $$
declare n int;
begin
  select count(*) into n from campo; assert n = 1, format('una sola cuenta sin pedir: su campo, vio %s', n);
  assert public.empresa_propia() = 'e1000000-0000-0000-0000-000000000002', 'una sola cuenta: es dueño sin pedirla';
end $$;
reset role;

-- ---- Invitaciones ----
-- El dueño de Risso no puede volver a invitar a quien ya está.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1000000-0000-0000-0000-000000000001"}';
set local request.headers = '{"x-troppero-cuenta":"e1000000-0000-0000-0000-000000000001"}';
do $$
begin
  begin
    perform public.crear_invitacion('5490000000009', 'Vete', 'vet', '{"hacienda":"ve","campos":"no","plata":"no"}', 'app');
    assert false, 'tenía que rechazar invitar a alguien que ya está';
  exception when raise_exception then null;
  end;
  begin
    perform public.crear_invitacion('5490000000001', 'Yo', 'otro', '{"hacienda":"ve","campos":"no","plata":"no"}', 'app');
    assert false, 'tenía que rechazar que el dueño se invite a sí mismo';
  exception when raise_exception then null;
  end;
end $$;
reset role;

-- Primero el mapa (16/11): sin campos dibujados no se invita.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1000000-0000-0000-0000-000000000003"}';
set local request.headers = '{"x-troppero-cuenta":"e1000000-0000-0000-0000-000000000004"}';
do $$
begin
  begin
    perform public.crear_invitacion('5490000000077', 'Alguien', 'peon', '{"hacienda":"ve","campos":"no","plata":"no"}', 'app');
    assert false, 'tenía que pedir el mapa antes de invitar';
  exception when raise_exception then null;
  end;
end $$;
reset role;
-- Con el campo dibujado, sí.
insert into campo (id, empresa_id, nombre, contorno) values ('c1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000004', 'La de Otro',
  '[[-36,-59],[-36.01,-59],[-36.01,-59.01]]'::jsonb);

-- El dueño de Otro invita al vete: el vete acepta (ya estaba en otras cuentas).
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1000000-0000-0000-0000-000000000003"}';
set local request.headers = '{"x-troppero-cuenta":"e1000000-0000-0000-0000-000000000004"}';
create temp table tok on commit drop as
  select public.crear_invitacion('0000000009', 'Vete', 'vet', '{"hacienda":"ve","campos":"no","plata":"no"}', 'app') as t;
reset role;
do $$
begin
  -- El número local (10 dígitos) queda con 549 adelante: el del vete.
  assert (select celular from invitacion where token = (select t from tok)) = '5490000000009', 'celular normalizado';
end $$;
grant select on tok to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  perform public.aceptar_invitacion((select t from tok));
  select count(*) into n from public.mis_cuentas(); assert n = 4, format('después de aceptar: 4 cuentas, vio %s', n);
  begin
    perform public.aceptar_invitacion((select t from tok));
    assert false, 'una invitación usada no se acepta dos veces';
  exception when raise_exception then null;
  end;
end $$;
reset role;

-- Una invitación rechazada no se puede aceptar, y el dueño la ve rechazada.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1000000-0000-0000-0000-000000000002"}';
set local request.headers = '{"x-troppero-cuenta":"e1000000-0000-0000-0000-000000000002"}';
create temp table tok2 on commit drop as
  select public.crear_invitacion('5490000000003', 'Otro', 'otro', '{"hacienda":"no","campos":"solo_manda","plata":"no"}', 'whatsapp') as t;
reset role;
grant select on tok2 to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1000000-0000-0000-0000-000000000003"}';
set local request.headers = '{}';
do $$
begin
  perform public.rechazar_invitacion((select t from tok2));
  begin
    perform public.aceptar_invitacion((select t from tok2));
    assert false, 'tenía que rechazar aceptar una invitación rechazada';
  exception when raise_exception then null;
  end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1000000-0000-0000-0000-000000000002"}';
set local request.headers = '{"x-troppero-cuenta":"e1000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  select count(*) into n from public.personas_de_empresa() where rechazada;
  assert n = 1, format('el dueño tenía que ver la invitación rechazada, vio %s', n);
end $$;
reset role;

-- Un segundo campo propio no entra ni por la puerta de atrás.
do $$
begin
  begin
    insert into miembro_empresa (empresa_id, user_id, rol) values ('e1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'dueno');
    assert false, 'tenía que rechazar dos campos propios';
  exception when unique_violation then null;
  end;
end $$;

select 'OK: varias cuentas sin fugas' as resultado;
rollback;
