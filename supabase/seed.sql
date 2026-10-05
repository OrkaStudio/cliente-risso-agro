-- Semilla de la base LOCAL (supabase start / supabase db reset). Nunca corre
-- en producción.
--
-- Cuenta de los tests de punta a punta: entra con el celular +54 9 2240 00-0001
-- y el código fijo 123456 ([auth.sms.test_otp] en config.toml, sólo local).
-- Empresa «E2E Pruebas» con el campo «E2E Campo base» y su potrero 1A, que es
-- lo que suponen e2e/*.spec.ts.

-- Los tokens van en '' y no en null: Supabase Auth los lee como texto.
insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'e2e00000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  '5492240000001', now(),
  '{"provider":"phone","providers":["phone"]}',
  '{"nombre":"Prueba","apellido":"E2E","celular":"+5492240000001"}',
  now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at
) values (
  gen_random_uuid(),
  'e2e00000-0000-4000-8000-000000000001',
  'e2e00000-0000-4000-8000-000000000001',
  'phone',
  '{"sub":"e2e00000-0000-4000-8000-000000000001","phone":"5492240000001"}',
  now(), now(), now()
);

insert into public.empresa (id, nombre, onboarding_completo_at)
values ('e2e00000-0000-4000-8000-0000000000e1', 'E2E Pruebas', now());

insert into public.miembro_empresa (user_id, empresa_id, rol)
values ('e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-0000000000e1', 'dueno');

insert into public.campo (id, empresa_id, nombre)
values ('e2e00000-0000-4000-8000-0000000000c1', 'e2e00000-0000-4000-8000-0000000000e1', 'E2E Campo base');

insert into public.potrero (empresa_id, campo_id, nombre)
values ('e2e00000-0000-4000-8000-0000000000e1', 'e2e00000-0000-4000-8000-0000000000c1', '1A');
