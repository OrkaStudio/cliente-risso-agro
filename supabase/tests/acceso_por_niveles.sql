-- =====================================================================
--  TEST — un solo ingreso: cómo entra sale de los niveles (25/11)
--
--  Recorre las 64 combinaciones (hacienda, campos, plata × no / ve / carga /
--  solo_manda), al invitar y al cambiar los niveles de alguien que ya está:
--    · con algún «ve» o «carga» → acceso 'app';
--    · todo «no» o «solo_manda» (y al menos uno «solo_manda») → 'whatsapp';
--    · todo «no» → se rechaza (para eso se le saca el acceso).
--  Y que ir y volver entre app y WhatsApp no deje datos a la vista: lo que
--  puede leer lo deciden los niveles, no el acceso.
--
--  No destructivo: corre en una transacción que termina en ROLLBACK.
--  Correr con el rol de servicio (psql como postgres).
-- =====================================================================
begin;

insert into auth.users (id, instance_id, email, phone, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('d2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'dueno@acceso.test', '5492249000001', 'authenticated', 'authenticated', now(), now(), '{}', '{}', '', '', '', ''),
  ('a2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'vera@acceso.test', '5492249000002', 'authenticated', 'authenticated', now(), now(), '{}', '{}', '', '', '', '');

insert into empresa (id, nombre) values ('e2000000-0000-0000-0000-000000000001', 'Acceso Agro');
insert into miembro_empresa (empresa_id, user_id, rol, niveles, acceso) values
  ('e2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'dueno', null, 'app'),
  ('e2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'vet', '{"hacienda":"solo_manda","campos":"no","plata":"no"}', 'whatsapp');
insert into campo (id, empresa_id, nombre, contorno) values
  ('c2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'La Acceso', '[[-36,-59],[-36.01,-59],[-36.01,-59.01]]');
insert into potrero (id, empresa_id, campo_id, nombre, poligono) values
  ('b2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', '1A', '[[-36,-59],[-36.005,-59],[-36.005,-59.005]]');
insert into animal (empresa_id, categoria, potrero_id) values ('e2000000-0000-0000-0000-000000000001', 'vaca', 'b2000000-0000-0000-0000-000000000001');
insert into lluvia (empresa_id, campo_id, fecha, mm) values ('e2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', current_date, 12);

-- ---- 1) Las 64 combinaciones, como el dueño ----
-- Con la identidad del dueño (auth.uid()) pero sin bajar de rol, para poder leer
-- después la fila de la otra persona, que su RLS no le muestra al dueño.
set local request.jwt.claims = '{"sub":"d2000000-0000-0000-0000-000000000001"}';
do $$
declare
  niv text[] := array['no', 've', 'carga', 'solo_manda'];
  h text; c text; p text;
  n jsonb; esperado text; obtenido text; i int := 0;
  rechazos int := 0; apps int := 0; whatsapps int := 0;
begin
  foreach h in array niv loop foreach c in array niv loop foreach p in array niv loop
    i := i + 1;
    n := jsonb_build_object('hacienda', h, 'campos', c, 'plata', p);
    esperado := case when 've' in (h, c, p) or 'carga' in (h, c, p) then 'app'
                     when 'solo_manda' in (h, c, p) then 'whatsapp' end;

    -- Al invitar (un número distinto por combinación).
    begin
      perform public.crear_invitacion('22480' || lpad(i::text, 5, '0'), 'Prueba ' || i, 'encargado', n, 'app');
      select acceso into obtenido from public.invitacion where celular = '54922480' || lpad(i::text, 5, '0');
      assert esperado is not null, format('invitar %s: aceptó todo en «No ve»', n);
      assert obtenido = esperado, format('invitar %s: quedó %s, esperaba %s', n, obtenido, esperado);
    exception when others then
      if sqlerrm like 'invitar %' then raise; end if;
      assert esperado is null, format('invitar %s: rechazó algo válido (%s)', n, sqlerrm);
    end;

    -- Al cambiar los niveles de Vera, que ya está.
    begin
      perform public.cambiar_niveles('a2000000-0000-0000-0000-000000000002', n);
      select acceso into obtenido from public.miembro_empresa where user_id = 'a2000000-0000-0000-0000-000000000002';
      assert esperado is not null, format('cambiar %s: aceptó todo en «No ve»', n);
      assert obtenido = esperado, format('cambiar %s: quedó %s, esperaba %s', n, obtenido, esperado);
    exception when others then
      if sqlerrm like 'cambiar %' then raise; end if;
      assert esperado is null, format('cambiar %s: rechazó algo válido (%s)', n, sqlerrm);
    end;

    if esperado is null then rechazos := rechazos + 1; elsif esperado = 'app' then apps := apps + 1; else whatsapps := whatsapps + 1; end if;
  end loop; end loop; end loop;
  assert i = 64 and rechazos = 1 and apps = 56 and whatsapps = 7, format('combinaciones: %s, rechazos %s, app %s, whatsapp %s', i, rechazos, apps, whatsapps);
  raise notice 'ok, 64 combinaciones al invitar y al cambiar: 56 app, 7 WhatsApp, 1 rechazada';
end $$;

-- ---- 2) Ida y vuelta: lo que ve lo deciden los niveles, no el acceso ----
-- Vera pasa a «Mira» en Hacienda (gana la app) → ve el animal, no las lluvias.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d2000000-0000-0000-0000-000000000001"}';
select public.cambiar_niveles('a2000000-0000-0000-0000-000000000002', '{"hacienda":"ve","campos":"no","plata":"no"}');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000002"}';
do $$
declare n int; a text;
begin
  select acceso into a from public.miembro_empresa where user_id = 'a2000000-0000-0000-0000-000000000002';
  assert a = 'app', format('con «Mira» debería usar la app, quedó %s', a);
  select count(*) into n from animal; assert n = 1, format('con Hacienda «Mira» debería ver 1 animal, vio %s', n);
  select count(*) into n from lluvia; assert n = 0, format('FUGA: sin Campos vio %s lluvias', n);
  raise notice 'ok, gana la app: ve la Hacienda y nada más';
end $$;
reset role;

-- Vuelve a sólo «Avisa» (pierde la app) → ya no lee la Hacienda.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d2000000-0000-0000-0000-000000000001"}';
select public.cambiar_niveles('a2000000-0000-0000-0000-000000000002', '{"hacienda":"solo_manda","campos":"no","plata":"no"}');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000002"}';
do $$
declare n int; a text;
begin
  select acceso into a from public.miembro_empresa where user_id = 'a2000000-0000-0000-0000-000000000002';
  assert a = 'whatsapp', format('con sólo «Avisa» debería ir por WhatsApp, quedó %s', a);
  select count(*) into n from animal; assert n = 0, format('FUGA: con sólo «Avisa» vio %s animales', n);
  raise notice 'ok, pierde la app: ya no lee la Hacienda';
end $$;

-- ---- 3) Ella no puede darse acceso a sí misma ----
do $$
begin
  perform public.cambiar_niveles('a2000000-0000-0000-0000-000000000002', '{"hacienda":"carga","campos":"carga","plata":"carga"}');
  raise exception 'FALLA: se cambió sus propios niveles';
exception when others then
  if sqlerrm like 'FALLA%' then raise; end if;
  raise notice 'ok, no puede cambiarse los niveles (%)', sqlerrm;
end $$;
reset role;

rollback;
