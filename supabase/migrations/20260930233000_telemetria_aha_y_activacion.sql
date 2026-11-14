-- Activación: el aha y el camino hasta el hábito, para la planilla viva.
-- Sigue a 20260930210000_telemetria_uso_y_tutoriales. Spec:
-- clientes/risso-agro/especificaciones/2026-09-19-telemetria-onboarding-activacion
--
-- Definiciones (Lau, 30/09):
--  · AHA: todos sus campos con contorno y todos los potreros que cargó en el
--    onboarding asignados a uno dibujado (el potrero del alta pasa a tener
--    polígono). Si salteó los potreros en el alta, alcanza con uno dibujado.
--    Sólo se puede en la compu: en el celular no se delimita.
--  · El celular empuja a la compu: el embudo es uno solo, con el paso
--    «Llegó a la compu» adentro, abierto por dispositivo de registro.
--  · Primera anotación real (recorrida, manga, plata o labor) antes del día 7,
--    y hábito = una segunda anotación en otro día antes del día 14.
--  · La puesta a punto 5 de 5 es Setup, no activación (spec del 22/09).
--
-- Cuándo se dibujó un contorno o un polígono no queda guardado: el día del aha
-- sale de la foto, que pasa de diaria (03:00) a cada hora y con la fecha
-- argentina.

-- 1 · El aha, hoy.
create view interno.v_aha_hoy as
with alta as (
  select
    r.empresa_id,
    r.registro,
    (select min(e.ts_cliente) from interno.v_evento_empresa e
      where e.empresa = r.empresa_id and e.nombre = 'onboarding_completado') as onboarding_fin
  from interno.v_empresa_real r
)
select
  a.empresa_id,
  c.campos,
  c.campos_con_contorno,
  p.potreros_alta,
  p.potreros_alta_asignados,
  p.potreros_dibujados,
  (
    c.campos >= 1
    and c.campos_con_contorno = c.campos
    and case
      when p.potreros_alta > 0 then p.potreros_alta_asignados = p.potreros_alta
      else p.potreros_dibujados >= 1
    end
  ) as aha
from alta a
cross join lateral (
  select count(*) as campos, count(*) filter (where contorno is not null) as campos_con_contorno
  from public.campo where empresa_id = a.empresa_id
) c
cross join lateral (
  -- Del alta: creados hasta el final del onboarding (o el primer día, para
  -- quien se registró antes de que hubiera telemetría).
  select
    count(*) filter (where created_at <= coalesce(a.onboarding_fin + interval '10 minutes', a.registro + interval '1 day')) as potreros_alta,
    count(*) filter (where created_at <= coalesce(a.onboarding_fin + interval '10 minutes', a.registro + interval '1 day')
                       and poligono is not null) as potreros_alta_asignados,
    count(*) filter (where poligono is not null) as potreros_dibujados
  from public.potrero where empresa_id = a.empresa_id
) p;

-- 2 · La foto guarda también el aha, cada hora y con la fecha de acá.
alter table interno.activacion_foto add column aha boolean;

create or replace function interno.fotografiar_activacion() returns void
language sql security definer set search_path = '' as $$
  insert into interno.activacion_foto (empresa_id, fecha, score, t_campo, t_potreros, t_hacienda, t_tropas, t_recorrida, aha)
  select h.empresa_id, (now() at time zone 'America/Argentina/Buenos_Aires')::date,
         h.score, h.t_campo, h.t_potreros, h.t_hacienda, h.t_tropas, h.t_recorrida, a.aha
  from interno.v_activacion_hoy h
  join interno.v_aha_hoy a using (empresa_id)
  on conflict (empresa_id, fecha) do update set
    score = excluded.score,
    t_campo = excluded.t_campo,
    t_potreros = excluded.t_potreros,
    t_hacienda = excluded.t_hacienda,
    t_tropas = excluded.t_tropas,
    t_recorrida = excluded.t_recorrida,
    aha = excluded.aha
$$;

select cron.schedule('telemetria-foto-activacion', '0 * * * *', $$select interno.fotografiar_activacion()$$);
select interno.fotografiar_activacion();

-- 3 · Las etapas por productor.
create view interno.v_activacion_etapas as
with anotacion as (
  select empresa_id, created_at, 'Recorrida' as tipo from public.recorrida
  union all
  select empresa_id, created_at, 'Manga' from public.evento
  where tipo = any (array['sanidad', 'pesaje', 'servicio', 'tacto', 'destete', 'castracion', 'parto']::public.tipo_evento[])
  union all
  select empresa_id, created_at, 'Plata' from public.movimiento_financiero
  union all
  select empresa_id, created_at, 'Labor' from public.labor_potrero
),
base as (
  select
    r.empresa_id,
    r.nombre,
    r.registro,
    x.tiene_telemetria,
    x.dispositivo_registro,
    x.onboarding_fin,
    x.compu_desde,
    ah.potreros_alta,
    ah.potreros_alta_asignados,
    coalesce(fa.dia, case when ah.aha then (now() at time zone 'America/Argentina/Buenos_Aires')::date end) as aha_dia,
    pa.primera,
    pa.tipo_primera,
    sa.segunda,
    h.score as setup
  from interno.v_empresa_real r
  join interno.v_aha_hoy ah using (empresa_id)
  left join interno.v_activacion_hoy h using (empresa_id)
  cross join lateral (
    select
      count(*) > 0 as tiene_telemetria,
      (array_agg(e.dispositivo order by e.ts_cliente)
        filter (where e.nombre in ('registro_completado', 'onboarding_iniciado', 'paso_visto')))[1] as dispositivo_registro,
      min(e.ts_cliente) filter (where e.nombre = 'onboarding_completado') as onboarding_fin,
      min(e.ts_cliente) filter (where e.dispositivo = 'escritorio') as compu_desde
    from interno.v_evento_empresa e
    where e.empresa = r.empresa_id
  ) x
  left join lateral (
    select min(f.fecha) as dia from interno.activacion_foto f where f.empresa_id = r.empresa_id and f.aha
  ) fa on true
  left join lateral (
    select a.created_at as primera, a.tipo as tipo_primera
    from anotacion a where a.empresa_id = r.empresa_id
    order by a.created_at limit 1
  ) pa on true
  left join lateral (
    select min(a.created_at) as segunda
    from anotacion a
    where a.empresa_id = r.empresa_id
      and (a.created_at at time zone 'America/Argentina/Buenos_Aires')::date
        > (pa.primera at time zone 'America/Argentina/Buenos_Aires')::date
  ) sa on true
),
niveles as (
  select
    b.*,
    b.primera <= b.registro + interval '7 days' as anoto_7d,
    b.segunda <= b.registro + interval '14 days' as habito_14d,
    -- Hasta dónde llegó, en orden: cada etapa pide la anterior.
    case
      when b.onboarding_fin is null then 1
      when b.compu_desde is null then 2
      when b.aha_dia is null then 3
      when not coalesce(b.primera <= b.registro + interval '7 days', false) then 4
      when not coalesce(b.segunda <= b.registro + interval '14 days', false) then 5
      else 6
    end as nivel
  from base b
)
select
  n.*,
  (array['Se registró', 'Terminó el onboarding', 'Llegó a la compu', 'Aha', 'Primera anotación', 'Hábito'])[n.nivel] as etapa,
  round(extract(epoch from n.compu_desde - n.registro)::numeric / 86400, 1) as dias_hasta_compu,
  n.aha_dia - (n.registro at time zone 'America/Argentina/Buenos_Aires')::date as dias_hasta_aha,
  (now() at time zone 'America/Argentina/Buenos_Aires')::date
    - (n.registro at time zone 'America/Argentina/Buenos_Aires')::date as dias_desde_registro
from niveles n;

-- 4 · El embudo: uno solo, abierto por dispositivo de registro. Sólo quienes
--     se registraron con la telemetría puesta (los de antes no tienen el alta).
create view interno.v_activacion_embudo as
with c as (select * from interno.v_activacion_etapas where tiene_telemetria),
etapas (orden, etapa, referencia) as (
  values
    (1, 'Se registró', null),
    (2, 'Terminó el onboarding', null),
    (3, 'Llegó a la compu', null),
    (4, 'Aha: su campo y sus potreros', 'Setup → Aha: 50–70 %'),
    (5, 'Primera anotación (hasta el día 7)', null),
    (6, 'Hábito: otra anotación otro día (hasta el día 14)', 'Aha → Hábito: 30–50 %')
),
conteo as (
  select
    e.orden,
    e.etapa,
    e.referencia,
    count(c.empresa_id) filter (where c.nivel >= e.orden) as total,
    count(c.empresa_id) filter (where c.nivel >= e.orden and c.dispositivo_registro = 'escritorio') as compu,
    count(c.empresa_id) filter (where c.nivel >= e.orden and c.dispositivo_registro = 'movil') as celular
  from etapas e
  left join c on true
  group by e.orden, e.etapa, e.referencia
)
select
  orden,
  etapa,
  total,
  compu,
  celular,
  round(100.0 * total / nullif(first_value(total) over (order by orden), 0)) as pct_del_total,
  round(100.0 * total / nullif(lag(total) over (order by orden), 0)) as pct_de_la_anterior,
  round(100.0 * celular / nullif(first_value(celular) over (order by orden), 0)) as pct_celular,
  referencia
from conteo
order by orden;

-- 5 · Uso por día, últimos 30 días: productores distintos que abrieron la app.
create view interno.v_uso_diario as
with dias as (
  select d::date as dia
  from generate_series(
    (now() at time zone 'America/Argentina/Buenos_Aires')::date - 29,
    (now() at time zone 'America/Argentina/Buenos_Aires')::date,
    interval '1 day'
  ) d
),
aperturas as (
  select (e.ts_cliente at time zone 'America/Argentina/Buenos_Aires')::date as dia, e.empresa, e.dispositivo
  from interno.v_evento_empresa e
  join interno.v_empresa_real r on r.empresa_id = e.empresa
  where e.nombre = 'app_abierta'
)
select
  d.dia,
  count(distinct a.empresa) as productores,
  count(distinct a.empresa) filter (where a.dispositivo = 'escritorio') as en_compu,
  count(distinct a.empresa) filter (where a.dispositivo = 'movil') as en_celular
from dias d
left join aperturas a on a.dia = d.dia
group by d.dia
order by d.dia;

revoke all on all tables in schema interno from public, anon, authenticated;
grant select on all tables in schema interno to service_role;
