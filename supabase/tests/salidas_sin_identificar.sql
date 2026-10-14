-- =====================================================================
--  TEST — salidas sin identificar (20261014120000)
--
--  Cada caso del modelo: vender o perder hacienda caravaneada sin decir cuál
--  resta del número sin marcar a nadie; las posibles; «fue ésta», «no sé
--  cuál fue», anular; y que mover o dar de baja no deje una salida sin
--  candidatas.
--
--  Self-contained y NO destructivo: arma su empresa, potreros y animales
--  dentro de una transacción que termina en ROLLBACK. Ejecutar con el rol de
--  servicio (psql como postgres / SQL editor). Si una aserción falla, la
--  transacción aborta con su mensaje.
-- =====================================================================
begin;

create function pg_temp.afirmar(ok boolean, que text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA: %', que; end if;
end $$;

-- Empresa, un campo, dos potreros (A con 5 vacas caravaneadas + 1 sin caravana, B vacío).
insert into empresa (id, nombre) values ('eeeeeeee-0000-0000-0000-000000000001', 'Test salidas');
insert into campo (id, empresa_id, nombre) values ('cccccccc-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'Campo test');
insert into potrero (id, empresa_id, campo_id, nombre) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TA'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TB');
insert into animal (id, empresa_id, categoria, potrero_id)
select ('00000000-0000-0000-0000-00000000000' || i)::uuid, 'eeeeeeee-0000-0000-0000-000000000001', 'vaca', 'aaaaaaaa-0000-0000-0000-00000000000a'
  from generate_series(1, 6) i;
insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual)
select 'eeeeeeee-0000-0000-0000-000000000001', ('00000000-0000-0000-0000-00000000000' || i)::uuid, '0320000000000' || i, '900' || i
  from generate_series(1, 5) i;  -- la 6 queda sin caravana

create function pg_temp.vacas_a() returns int language sql as $$
  select coalesce((select cabezas from v_composicion_potrero where potrero_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and categoria = 'vaca'), 0)
$$;
create function pg_temp.stock_a() returns int language sql as $$
  select coalesce((select cabezas from v_stock_potrero where potrero_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0)
$$;
create function pg_temp.activas_a() returns int language sql as $$
  select count(*)::int from animal where potrero_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and estado = 'activo'
$$;

-- 1. Vender 2: sale primero la sin caravana; la otra queda sin identificar.
do $$
declare r jsonb;
begin
  r := salida_por_cantidad('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '[{"categoria":"vaca","cantidad":2}]', 'venta');
  perform pg_temp.afirmar((r->>'sin_identificar')::int = 1, 'una sin identificar');
  perform pg_temp.afirmar(pg_temp.vacas_a() = 4, 'el número baja a 4');
  perform pg_temp.afirmar(pg_temp.stock_a() = 4, 'v_stock_potrero baja a 4');
  perform pg_temp.afirmar(pg_temp.activas_a() = 5, 'las 5 caravaneadas siguen activas (nadie marcado)');
  perform pg_temp.afirmar((select estado from animal where id = '00000000-0000-0000-0000-000000000006') = 'vendido', 'la sin caravana salió');
  perform pg_temp.afirmar((select posibles from v_salidas_sin_identificar where potrero_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 5, '5 posibles');
end $$;

-- 2. Mover 4 posibles a B: queda 1 posible para 1 pendiente.
do $$
begin
  perform mover_animales('eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-00000000000a',
    null, false, null, array['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
                             '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004']::uuid[]);
  perform pg_temp.afirmar((select posibles from v_salidas_sin_identificar where potrero_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 1, 'queda 1 posible');
  perform pg_temp.afirmar(pg_temp.vacas_a() = 0, 'en A: 1 activa menos 1 sin identificar = 0');
end $$;

-- 3. Mover o dar de baja la última posible se frena.
do $$
declare frenado boolean := false;
begin
  begin
    perform mover_animales('eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-00000000000a',
      null, false, null, array['00000000-0000-0000-0000-000000000005']::uuid[]);
  exception when others then frenado := sqlerrm like '%sin identificar%';
  end;
  perform pg_temp.afirmar(frenado, 'mover la última posible se frena');
  frenado := false;
  begin
    perform dar_baja_animal('00000000-0000-0000-0000-000000000005', 'muerto');
  exception when others then frenado := sqlerrm like '%sin identificar%';
  end;
  perform pg_temp.afirmar(frenado, 'dar de baja la última posible se frena');
end $$;

-- 4. «Fue ésta»: la 9005 queda vendida, la salida se cierra, el número no cambia.
do $$
begin
  perform identificar_animal('00000000-0000-0000-0000-000000000005');
  perform pg_temp.afirmar((select estado from animal where id = '00000000-0000-0000-0000-000000000005') = 'vendido', 'la 9005 vendida');
  perform pg_temp.afirmar(not exists (select 1 from v_salidas_sin_identificar where potrero_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'sin salidas abiertas');
  perform pg_temp.afirmar(pg_temp.vacas_a() = 0, 'el número sigue en 0');
end $$;

-- 5. Volver las 4 a A, vender 1 y anular: todo como estaba.
do $$
declare r jsonb;
begin
  perform mover_animales('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b',
    null, true, null, null);
  r := salida_por_cantidad('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '[{"categoria":"vaca","cantidad":1}]', 'venta');
  perform pg_temp.afirmar(pg_temp.vacas_a() = 3, 'vendida 1 de 4: quedan 3');
  perform anular_salida((r->>'salida_id')::uuid);
  perform pg_temp.afirmar(pg_temp.vacas_a() = 4, 'anulada: vuelven a ser 4');
  perform pg_temp.afirmar(pg_temp.activas_a() = 4, 'nadie marcado');
end $$;

-- 6. Dos salidas en el mismo potrero no comparten la misma vaca.
do $$
declare frenado boolean := false;
begin
  perform salida_por_cantidad('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '[{"categoria":"vaca","cantidad":3}]', 'venta');
  perform salida_por_cantidad('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '[{"categoria":"vaca","cantidad":1}]', 'muerte');
  perform pg_temp.afirmar(pg_temp.vacas_a() = 0, '4 activas menos 4 sin identificar');
  begin
    perform salida_por_cantidad('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '[{"categoria":"vaca","cantidad":1}]', 'venta');
  exception when others then frenado := true;
  end;
  perform pg_temp.afirmar(frenado, 'no se puede vender una quinta');
  frenado := false;
  begin
    perform dar_baja_animal('00000000-0000-0000-0000-000000000001', 'muerto');
  exception when others then frenado := sqlerrm like '%sin identificar%';
  end;
  perform pg_temp.afirmar(frenado, 'la baja a mano que deja 4 salidas para 3 vacas se frena');
end $$;

-- 7. «No sé cuál fue»: salen cualesquiera y sus fichas lo dicen.
do $$
declare s uuid;
begin
  for s in select salida_id from v_salidas_sin_identificar where potrero_id = 'aaaaaaaa-0000-0000-0000-00000000000a' loop
    perform resolver_sin_saber(s);
  end loop;
  perform pg_temp.afirmar(pg_temp.activas_a() = 0, 'salieron las 4');
  perform pg_temp.afirmar((select count(*) from evento where tipo = 'baja' and datos ? 'sin_identificar'
                             and animal_id in (select id from animal where empresa_id = 'eeeeeeee-0000-0000-0000-000000000001')) = 4,
                          '4 fichas dicen «sin identificar»');
  perform pg_temp.afirmar(pg_temp.vacas_a() = 0, 'el número sigue en 0');
end $$;

rollback;
