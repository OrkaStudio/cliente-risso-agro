-- Telemetría: la siembra también cuenta.
-- Sigue a 20260926120000_telemetria_evento_producto.
--
-- El paso "hacienda" del onboarding es "qué hay en cada potrero": hacienda,
-- sembrado o vacío. Las vistas sólo miraban cabezas, y el score de
-- activación (copia de src/features/guia/estado.ts) exige hacienda y tropas a
-- todos: un productor agrícola nunca llega a 5/5 aunque use la app.
--
-- El score NO cambia (sigue igual al checklist de la app; redefinir la
-- activación por actividad es una decisión de producto pendiente). Se agrega
-- lo necesario para leerlo bien: perfil (ganadero / agrícola / mixto),
-- potreros sembrados, cultivos y labores, en la activación y en el cruce.
--
-- Hay que recrear la cadena: v_activacion usa h.* y el cruce usa v_activacion,
-- y una columna nueva en el medio no entra con create or replace.

drop view interno.v_onboarding_x_activacion;
drop view interno.v_activacion;
drop view interno.v_activacion_hoy;

create view interno.v_activacion_hoy as
select
  r.empresa_id,
  r.nombre,
  r.emails,
  r.registro,
  (now()::date - r.registro::date) as dias_desde_registro,
  c.campos,
  c.campos_sin_contorno,
  p.potreros,
  p.potreros_dibujados,
  a.activos as cabezas,
  a.sin_potrero,
  rc.recorridas,
  (c.campos >= 1 and c.campos_sin_contorno = 0) as t_campo,
  (p.potreros_dibujados >= 2) as t_potreros,
  (a.activos >= 1) as t_hacienda,
  (a.activos >= 1 and a.sin_potrero = 0) as t_tropas,
  (rc.recorridas >= 1) as t_recorrida,
  (c.campos >= 1 and c.campos_sin_contorno = 0)::int
    + (p.potreros_dibujados >= 2)::int
    + (a.activos >= 1)::int
    + (a.activos >= 1 and a.sin_potrero = 0)::int
    + (rc.recorridas >= 1)::int as score,
  case when c.alquilados = 0 then null else al.con_alquiler >= c.alquilados end as alquiler_ok,
  mf.movimientos as movimientos_plata,
  ev.trabajos as trabajos_manga,
  -- Siembra.
  case
    when a.activos > 0 and p.sembrados > 0 then 'mixto'
    when a.activos > 0 then 'ganadero'
    when p.sembrados > 0 then 'agricola'
  end as perfil,
  p.sembrados as potreros_sembrados,
  p.cultivos,
  lb.labores
from interno.v_empresa_real r
cross join lateral (
  select count(*) as campos,
         count(*) filter (where contorno is null) as campos_sin_contorno,
         count(*) filter (where tipo = 'alquilado') as alquilados
  from public.campo where empresa_id = r.empresa_id
) c
cross join lateral (
  select count(*) as potreros,
         count(*) filter (where poligono is not null) as potreros_dibujados,
         count(*) filter (where estado_ciclo = 'cultivo') as sembrados,
         array_agg(distinct cultivo order by cultivo) filter (where estado_ciclo = 'cultivo' and cultivo is not null) as cultivos
  from public.potrero where empresa_id = r.empresa_id
) p
cross join lateral (
  select count(*) as activos, count(*) filter (where potrero_id is null) as sin_potrero
  from public.animal where empresa_id = r.empresa_id and estado = 'activo'
) a
cross join lateral (
  select count(*) as recorridas from public.recorrida where empresa_id = r.empresa_id
) rc
cross join lateral (
  select count(distinct m.campo_id) as con_alquiler
  from public.movimiento_financiero m
  join public.categoria_movimiento cm on cm.id = m.categoria_id
  join public.campo ca on ca.id = m.campo_id and ca.tipo = 'alquilado'
  where m.empresa_id = r.empresa_id and cm.nombre = 'Alquiler de campo'
) al
cross join lateral (
  select count(*) as movimientos from public.movimiento_financiero where empresa_id = r.empresa_id
) mf
cross join lateral (
  select count(*) as trabajos from public.evento
  where empresa_id = r.empresa_id
    and tipo in ('sanidad', 'pesaje', 'servicio', 'tacto', 'destete', 'castracion', 'parto')
) ev
cross join lateral (
  -- Labores agrícolas cargadas (siembra, aplicación, cosecha…): el uso real
  -- de un agrícola, como la manga lo es de un ganadero.
  select count(*) as labores from public.labor_potrero where empresa_id = r.empresa_id
) lb;

create view interno.v_activacion as
select
  h.*,
  case
    when h.score = 5 and h.dias_desde_registro <= 7 then true
    when exists (
      select 1 from interno.activacion_foto f
      where f.empresa_id = h.empresa_id and f.score = 5 and f.fecha <= h.registro::date + 7
    ) then true
    when h.dias_desde_registro <= 7 then null
    when exists (
      select 1 from interno.activacion_foto f
      where f.empresa_id = h.empresa_id and f.fecha between h.registro::date and h.registro::date + 1
    ) then false
    else null
  end as activada_7d
from interno.v_activacion_hoy h;

create view interno.v_onboarding_x_activacion as
with por_user as (
  select
    user_id,
    (array_agg(dispositivo order by ts_cliente, id) filter (where nombre = 'onboarding_iniciado'))[1] as dispositivo,
    bool_or(nombre = 'onboarding_completado') as completo,
    bool_or(nombre = 'paso_salteado' and props ->> 'paso' = 'potreros') as salteo_potreros,
    bool_or(nombre = 'paso_salteado' and props ->> 'paso' = 'hacienda') as salteo_hacienda,
    (array_agg(props ->> 'paso' order by ts_cliente desc, id desc) filter (where nombre = 'paso_visto'))[1] as ultimo_paso,
    -- Qué dijo que había en sus potreros al registrarse (eventos desde 26/09).
    sum((props ->> 'potreros_sembrados')::int) filter (where nombre = 'paso_completado' and props ->> 'paso' = 'hacienda') as sembrados_en_onboarding
  from interno.v_evento
  group by user_id
)
select
  a.empresa_id,
  a.nombre,
  a.emails,
  a.registro,
  a.dias_desde_registro,
  o.dispositivo,
  case
    when o.user_id is null then 'sin telemetría'
    when o.completo and (o.salteo_potreros or o.salteo_hacienda) then 'completo con salteos'
    when o.completo then 'completo'
    else 'abandonó en ' || coalesce(o.ultimo_paso, '?')
  end as salida_onboarding,
  o.salteo_potreros,
  o.salteo_hacienda,
  a.perfil,
  a.score,
  a.activada_7d,
  a.t_campo, a.t_potreros, a.t_hacienda, a.t_tropas, a.t_recorrida,
  a.potreros, a.potreros_dibujados, a.cabezas, a.recorridas,
  o.sembrados_en_onboarding,
  a.potreros_sembrados, a.cultivos, a.labores,
  a.movimientos_plata, a.trabajos_manga
from interno.v_activacion a
left join lateral (
  select pu.* from por_user pu
  join public.miembro_empresa m on m.user_id = pu.user_id and m.empresa_id = a.empresa_id
  order by pu.completo desc
  limit 1
) o on true;

revoke all on interno.v_activacion_hoy, interno.v_activacion, interno.v_onboarding_x_activacion from public, anon, authenticated;
grant select on interno.v_activacion_hoy, interno.v_activacion, interno.v_onboarding_x_activacion to service_role;
