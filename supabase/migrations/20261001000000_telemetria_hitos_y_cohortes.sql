-- Eficiencia y eficacia del onboarding y del Setup, por día de registro.
-- Sigue a 20260930233000_telemetria_aha_y_activacion. Spec:
-- clientes/risso-agro/especificaciones/2026-09-19-telemetria-onboarding-activacion
--
-- Pregunta que responde (Lau, 01/10): los que se registran ahora, ¿llegan más
-- rápido y en mayor proporción que los de antes? Sirve para ver si un cambio
-- en el alta o en el tutorial funcionó.
--
-- El aha y el Setup se derivan de la base, que no guarda cuándo se dibujó un
-- contorno o un polígono. `interno.hito` guarda la hora en que la revisión
-- horaria los vio por primera vez: precisión de una hora.

-- 1 · Hitos: la primera vez que se alcanzaron.
create table interno.hito (
  empresa_id uuid not null,
  hito text not null check (hito in ('aha', 'setup')),
  alcanzado timestamptz not null,
  primary key (empresa_id, hito)
);
revoke all on interno.hito from public, anon, authenticated;

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
    aha = excluded.aha;

  insert into interno.hito (empresa_id, hito, alcanzado)
  select empresa_id, 'aha', now() from interno.v_aha_hoy where aha
  on conflict do nothing;

  insert into interno.hito (empresa_id, hito, alcanzado)
  select empresa_id, 'setup', now() from interno.v_activacion_hoy where score = 5
  on conflict do nothing;
$$;

-- 2 · Cuánto tardó cada productor en cada hito, desde el registro.
--     El Setup toma el evento `puesta_a_punto_completa` si lo hay (exacto).
create view interno.v_tiempos as
select
  e.empresa_id,
  e.nombre,
  e.registro,
  (e.registro at time zone 'America/Argentina/Buenos_Aires')::date as cohorte,
  e.tiene_telemetria,
  e.dispositivo_registro,
  e.onboarding_fin is not null as alta_ok,
  round(extract(epoch from o.fin - o.ini)::numeric / 60, 1) as alta_min,
  ha.alcanzado is not null as aha_ok,
  round(extract(epoch from ha.alcanzado - e.registro)::numeric / 3600, 1) as aha_horas,
  least(hs.alcanzado, o.setup_ev) is not null as setup_ok,
  round(extract(epoch from least(hs.alcanzado, o.setup_ev) - e.registro)::numeric / 3600, 1) as setup_horas,
  coalesce(e.primera <= e.registro + interval '7 days', false) as anoto_7d,
  round(extract(epoch from e.primera - e.registro)::numeric / 86400, 1) as anotacion_dias
from interno.v_activacion_etapas e
left join lateral (
  select
    min(v.ts_cliente) filter (where v.nombre = 'onboarding_iniciado') as ini,
    min(v.ts_cliente) filter (where v.nombre = 'onboarding_completado') as fin,
    min(v.ts_cliente) filter (where v.nombre = 'puesta_a_punto_completa') as setup_ev
  from interno.v_evento_empresa v
  where v.empresa = e.empresa_id
) o on true
left join interno.hito ha on ha.empresa_id = e.empresa_id and ha.hito = 'aha'
left join interno.hito hs on hs.empresa_id = e.empresa_id and hs.hito = 'setup';

-- 3 · Por día de registro (últimos 30 días): eficacia (%) y eficiencia
--     (mediana). `dias` = cuántos días pasaron: con menos de 7, la cohorte
--     todavía está en curso.
create view interno.v_cohortes as
select
  t.cohorte as dia,
  (now() at time zone 'America/Argentina/Buenos_Aires')::date - t.cohorte as dias,
  count(*) as registrados,
  round(100.0 * avg(t.alta_ok::int)) as alta_pct,
  round((percentile_cont(0.5) within group (order by t.alta_min))::numeric, 1) as alta_min,
  round(100.0 * avg(t.aha_ok::int)) as aha_pct,
  round((percentile_cont(0.5) within group (order by t.aha_horas))::numeric, 1) as aha_horas,
  round(100.0 * avg(t.setup_ok::int)) as setup_pct,
  round((percentile_cont(0.5) within group (order by t.setup_horas))::numeric, 1) as setup_horas,
  round(100.0 * avg(t.anoto_7d::int)) as anoto_pct
from interno.v_tiempos t
where t.tiene_telemetria
  and t.cohorte >= (now() at time zone 'America/Argentina/Buenos_Aires')::date - 29
group by t.cohorte
order by t.cohorte desc;

revoke all on all tables in schema interno from public, anon, authenticated;
grant select on all tables in schema interno to service_role;
