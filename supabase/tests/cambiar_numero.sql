-- =====================================================================
--  TEST — cambiar el número desde soporte (interno.cambiar_numero, 25/11)
--
--  Cambia el número en la cuenta, su identidad y el bot, todo junto; rechaza
--  un número mal escrito, el mismo, uno de otra cuenta o uno vinculado al bot
--  por otro; y la app (anon/authenticated) no la puede llamar.
--
--  No destructivo: corre en una transacción que termina en ROLLBACK.
--  Correr con el rol de servicio (psql como postgres).
-- =====================================================================
begin;

insert into auth.users (id, instance_id, phone, phone_confirmed_at, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', '5492241000001', now(), 'authenticated', 'authenticated', now(), now(), '{}', '{"nombre":"Ana","celular":"+5492241000001"}', '', '', '', ''),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', '5492241000002', now(), 'authenticated', 'authenticated', now(), now(), '{}', '{}', '', '', '', '');
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
values (gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 'phone', 'e1000000-0000-0000-0000-000000000001',
        '{"sub":"e1000000-0000-0000-0000-000000000001","phone":"5492241000001","celular":"+5492241000001"}', now(), now());

do $$
declare
  v_empresa uuid;
  v_txt text;
  r record;
begin
  -- El bot, si la base lo tiene: Ana vinculada con su número viejo, con algo pendiente.
  if to_regclass('public.wa_vinculo') is not null then
    insert into public.empresa (nombre) values ('Cambio de número') returning id into v_empresa;
    execute 'insert into public.wa_vinculo (telefono, user_id, empresa_id, activo, pendiente, pendiente_at)
             values ($1, $2, $3, true, ''{"tipo":"x"}'', now())'
      using '5492241000001', 'e1000000-0000-0000-0000-000000000001'::uuid, v_empresa;
  end if;

  -- 1) Rechazos: cada uno con su motivo, sin tocar nada.
  foreach v_txt in array array['2241000009', '5492241000001', '5492241000002'] loop
    begin
      perform interno.cambiar_numero('e1000000-0000-0000-0000-000000000001', v_txt);
      raise exception 'FALLA: aceptó %', v_txt;
    exception when others then
      if sqlerrm like 'FALLA%' then raise; end if;
      raise notice 'ok, rechaza % → %', v_txt, sqlerrm;
    end;
  end loop;
  begin
    perform interno.cambiar_numero('e1000000-0000-0000-0000-00000000dead', '5492241000003');
    raise exception 'FALLA: aceptó una cuenta que no existe';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    raise notice 'ok, rechaza cuenta inexistente → %', sqlerrm;
  end;

  -- 2) Un número ya vinculado al bot por otra persona: no se pisa.
  if v_empresa is not null then
    execute 'insert into public.wa_vinculo (telefono, user_id, empresa_id, activo) values ($1, $2, $3, true)'
      using '5492241000004', 'e1000000-0000-0000-0000-000000000002'::uuid, v_empresa;
    begin
      perform interno.cambiar_numero('e1000000-0000-0000-0000-000000000001', '5492241000004');
      raise exception 'FALLA: pisó el vínculo de otro';
    exception when others then
      if sqlerrm like 'FALLA%' then raise; end if;
      raise notice 'ok, rechaza número del bot de otro → %', sqlerrm;
    end;
  end if;

  -- 3) El cambio: con espacios y «+», como lo copia alguien del chat.
  raise notice '%', interno.cambiar_numero('e1000000-0000-0000-0000-000000000001', '+54 9 2241 00-0003');
  select phone, phone_confirmed_at is not null as confirmado, raw_user_meta_data->>'celular' as celular into r
    from auth.users where id = 'e1000000-0000-0000-0000-000000000001';
  if r.phone <> '5492241000003' or not r.confirmado or r.celular <> '+5492241000003' then
    raise exception 'FALLA: la cuenta quedó %', row_to_json(r);
  end if;
  select identity_data->>'phone' as phone, identity_data->>'celular' as celular into r
    from auth.identities where user_id = 'e1000000-0000-0000-0000-000000000001' and provider = 'phone';
  if r.phone <> '5492241000003' or r.celular <> '+5492241000003' then
    raise exception 'FALLA: la identidad quedó %', row_to_json(r);
  end if;
  if v_empresa is not null then
    execute 'select telefono, pendiente from public.wa_vinculo where user_id = $1 and activo'
      into r using 'e1000000-0000-0000-0000-000000000001'::uuid;
    if r.telefono <> '5492241000003' or r.pendiente is not null then
      raise exception 'FALLA: el bot quedó %', row_to_json(r);
    end if;
    execute 'select count(*) from public.wa_vinculo where telefono = $1' into r using '5492241000001';
    raise notice 'ok, el bot pasó al número nuevo y el viejo ya no es de nadie';
  else
    raise notice '(sin wa_vinculo en esta base: se probó sólo la cuenta)';
  end if;
  raise notice 'ok, la cuenta entra con el número nuevo';

  -- 4) Con el número viejo, como lo tiene quien atiende: ida y vuelta.
  begin
    perform interno.cambiar_numero_de('+54 9 2241 99-9999', '5492241000006');
    raise exception 'FALLA: aceptó un número viejo que no es de nadie';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    raise notice 'ok, rechaza viejo inexistente → %', sqlerrm;
  end;
  raise notice '%', interno.cambiar_numero_de('+54 9 2241 00-0003', '+54 9 2241 00-0001');
  if (select phone from auth.users where id = 'e1000000-0000-0000-0000-000000000001') <> '5492241000001' then
    raise exception 'FALLA: cambiar_numero_de no cambió';
  end if;
end $$;

-- 5) La app no las puede llamar.
set local role authenticated;
do $$
begin
  perform interno.cambiar_numero('e1000000-0000-0000-0000-000000000002', '5492241000005');
  raise exception 'FALLA: authenticated la pudo llamar';
exception when insufficient_privilege then
  raise notice 'ok, authenticated no puede (%)', sqlerrm;
end $$;
do $$
begin
  perform interno.cambiar_numero_de('5492241000002', '5492241000005');
  raise exception 'FALLA: authenticated pudo llamar cambiar_numero_de';
exception when insufficient_privilege then
  raise notice 'ok, authenticated tampoco puede con el número viejo';
end $$;
reset role;

rollback;
