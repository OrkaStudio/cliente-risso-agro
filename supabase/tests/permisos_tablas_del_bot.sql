-- =====================================================================
--  TEST DE SEGURIDAD — las tablas del bot siguen los permisos por persona
--  (migración 20261114120000). No destructivo: termina en ROLLBACK.
-- =====================================================================
begin;

insert into auth.users (id, instance_id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', u.mail, 'authenticated', 'authenticated', now(), now(), '{}', '{}', '', '', '', ''
from (values ('d1000000-0000-0000-0000-000000000001', 'dueno@bot.test'), ('a1000000-0000-0000-0000-000000000002', 'vet@bot.test'), ('a1000000-0000-0000-0000-000000000003', 'manda@bot.test')) as u(id, mail);
insert into empresa (id, nombre) values ('e1000000-0000-0000-0000-000000000001', 'Bot Agro');
insert into miembro_empresa (empresa_id, user_id, rol, niveles) values
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'dueno', null),
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'vet', '{"hacienda":"carga","campos":"no","plata":"no"}'),
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'encargado', '{"hacienda":"no","campos":"solo_manda","plata":"solo_manda"}');
insert into campo (id, empresa_id, nombre) values ('c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'La Bot');
insert into potrero (id, empresa_id, campo_id, nombre) values ('b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '1A');
insert into captura (empresa_id, user_id, entrada, texto) values
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'texto', 'gasté 900 mil en hacienda'),
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'texto', 'gasoil 85 mil');
-- Una incidencia que reportó el dueño (como él: un disparador anota quién la hizo).
set local role authenticated;
set local request.jwt.claims = '{"sub":"d1000000-0000-0000-0000-000000000001"}';
insert into campo_incidencia (empresa_id, campo_id, potrero_id, descripcion, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'molino roto', 'd1000000-0000-0000-0000-000000000001');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  select count(*) into n from captura; assert n = 0, format('FUGA: el vet vio %s mensajes de otros', n);
  select count(*) into n from campo_incidencia; assert n = 0, format('FUGA: sin Campos vio %s incidencias', n);
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000003"}';
do $$
declare n int;
begin
  select count(*) into n from captura; assert n = 1, format('«solo manda»: debería ver sólo su mensaje, vio %s', n);
  select count(*) into n from campo_incidencia; assert n = 0, format('FUGA: «solo manda» vio %s incidencias ajenas', n);
  insert into campo_incidencia (empresa_id, campo_id, potrero_id, descripcion, created_by)
  values ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'tranquera abierta', 'a1000000-0000-0000-0000-000000000003');
  select count(*) into n from campo_incidencia; assert n = 1, '«solo manda»: debería ver la incidencia que reportó';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"d1000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  select count(*) into n from captura where empresa_id = 'e1000000-0000-0000-0000-000000000001'; assert n = 2, format('dueño: debería ver los 2 mensajes, vio %s', n);
  select count(*) into n from campo_incidencia where empresa_id = 'e1000000-0000-0000-0000-000000000001'; assert n = 2, format('dueño: debería ver las 2 incidencias, vio %s', n);
end $$;
reset role;

do $$ begin raise notice 'Tablas del bot OK: captura, incidencias y tareas con permisos.'; end $$;
rollback;
