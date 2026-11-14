-- Telemetría de onboarding y activación.
-- Spec: orka-brain/clientes/risso-agro/especificaciones/2026-09-19-telemetria-onboarding-activacion.md
--
-- Dos mitades:
--   1. public.evento_producto — lo que el cliente EMITE (sólo onboarding + sesión).
--      Insert-only: desde la app nadie lee, edita ni borra telemetría, ni la propia.
--   2. schema `interno` — lo que Orka LEE. No se expone por PostgREST y no tiene
--      grants para anon/authenticated: sólo SQL editor / MCP / service_role.
--      Una vista en `public` correría como su dueño y saltearía la RLS.
--
-- La activación NO se emite: se deriva de la base replicando
-- src/features/guia/estado.ts (`itemsDe`). Si cambian los ticks allá, cambiar acá.
--
-- No toca tablas, policies ni RPCs existentes.

-- ---------------------------------------------------------------------------
-- 1. Tabla de eventos
-- ---------------------------------------------------------------------------

create table public.evento_producto (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Nula en los primeros pasos (la empresa se crea en el primero). ON DELETE SET
  -- NULL: el reset de la empresa de prueba no se lleva la telemetría.
  empresa_id uuid references public.empresa (id) on delete set null,
  sesion_id uuid not null,
  -- Vocabulario cerrado: agregar uno = editar la spec y este check.
  nombre text not null check (nombre in (
    'registro_completado',
    'sesion_iniciada',
    'onboarding_iniciado',
    'paso_visto',
    'paso_completado',
    'paso_salteado',
    'paso_error',
    'onboarding_completado'
  )),
  -- Tope de tamaño: el cliente puede insertar a mano; que no pueda llenar la base.
  props jsonb not null default '{}'::jsonb
    check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 2048),
  dispositivo text check (dispositivo in ('movil', 'escritorio')),
  -- Reloj del dispositivo: para tiempos entre pasos. created_at (servidor) para
  -- ordenar y detectar relojes corridos.
  ts_cliente timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.evento_producto is
  'Telemetría de producto (onboarding). Insert-only desde la app; se lee por el schema interno.';

create index evento_producto_sesion_ts_idx on public.evento_producto (sesion_id, ts_cliente);
create index evento_producto_nombre_created_idx on public.evento_producto (nombre, created_at);
create index evento_producto_user_idx on public.evento_producto (user_id);
create index evento_producto_empresa_idx on public.evento_producto (empresa_id);

alter table public.evento_producto enable row level security;

-- Una sola policy. Sin select/update/delete: nadie lee telemetría desde la app.
-- empresa_id sólo puede ser una empresa propia (o nula): que nadie atribuya
-- eventos a otro tenant.
create policy evento_producto_insert_propio on public.evento_producto
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (empresa_id is null or empresa_id in (select auth_empresa_ids()))
  );

revoke all on public.evento_producto from anon, authenticated;
grant insert on public.evento_producto to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Schema interno (lectura de Orka)
-- ---------------------------------------------------------------------------

-- if not exists: la migración del bot de WhatsApp (TASK-063) también lo crea.
create schema if not exists interno;
revoke all on schema interno from public, anon, authenticated;
grant usage on schema interno to service_role;
comment on schema interno is
  'Lectura interna de Orka (telemetría, activación). NO agregar a Exposed schemas de la API.';

-- Cuentas de Orka y de prueba: fuera de toda métrica. Lista explícita (misma
-- que usará la consola de soporte como orka_staff) + el dominio de prueba.
create table interno.cuenta_orka (
  email text primary key,
  nota text
);

insert into interno.cuenta_orka (email, nota) values
  ('orka.arg@gmail.com', 'cuenta compartida de Orka / E2E'),
  ('franlerra23@gmail.com', 'Fran'),
  ('lautirissob@gmail.com', 'Lau');

create function interno.es_cuenta_orka(p_email text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_email is null
    or p_email ilike '%@orkastudio.test%'
    or exists (select 1 from interno.cuenta_orka c where lower(c.email) = lower(p_email))
$$;

-- Eventos de productores reales, con el email a mano para leer.
create view interno.v_evento as
select e.*, u.email
from public.evento_producto e
join auth.users u on u.id = e.user_id
where not interno.es_cuenta_orka(u.email);

-- Empresas reales: ningún miembro es cuenta de Orka. Registro = alta del dueño.
create view interno.v_empresa_real as
select
  e.id as empresa_id,
  e.nombre,
  e.created_at as empresa_creada,
  min(u.created_at) as registro,
  string_agg(u.email, ', ' order by u.created_at) as emails
from public.empresa e
join public.miembro_empresa m on m.empresa_id = e.id
join auth.users u on u.id = m.user_id
group by e.id, e.nombre, e.created_at
having not bool_or(interno.es_cuenta_orka(u.email));

-- Pasos del funnel, en orden. 'otro' = "¿Tenés otro campo?".
create view interno.paso_onboarding (paso, orden) as
values ('empresa', 1), ('campo', 2), ('potreros', 3), ('hacienda', 4), ('otro', 5);

-- Una fila por sesión con onboarding.
create view interno.v_onboarding_sesiones as
with ev as (
  select * from interno.v_evento
  where nombre in ('onboarding_iniciado', 'paso_visto', 'paso_completado', 'paso_salteado', 'paso_error', 'onboarding_completado')
)
select
  sesion_id,
  user_id,
  email,
  max(empresa_id::text)::uuid as empresa_id,
  (array_agg(dispositivo order by ts_cliente, id))[1] as dispositivo,
  min(ts_cliente) as inicio,
  max(ts_cliente) as ultimo_evento,
  (array_agg(props ->> 'paso' order by ts_cliente desc, id desc) filter (where nombre = 'paso_visto'))[1] as ultimo_paso_visto,
  bool_or(nombre = 'onboarding_iniciado') as arranco_aca,
  bool_or(nombre = 'onboarding_completado') as completado,
  array_agg(distinct props ->> 'paso') filter (where nombre = 'paso_salteado') as salteados,
  count(*) filter (where nombre = 'paso_error') as errores,
  round(extract(epoch from max(ts_cliente) - min(ts_cliente)))::int as duracion_s
from ev
group by sesion_id, user_id, email;

-- Funnel por PRODUCTOR (no por sesión: el que recarga o vuelve otro día sigue
-- siendo el mismo). Base = quienes emitieron onboarding_iniciado. Una fila por
-- paso × dispositivo, más el total (dispositivo = 'todos').
create view interno.v_onboarding_funnel as
with ini as (
  select distinct on (user_id) user_id, coalesce(dispositivo, '?') as dispositivo
  from interno.v_evento
  where nombre = 'onboarding_iniciado'
  order by user_id, ts_cliente
),
por_user as (
  select
    i.user_id,
    i.dispositivo,
    p.paso,
    p.orden,
    exists (select 1 from interno.v_evento e where e.user_id = i.user_id and e.nombre = 'paso_visto' and e.props ->> 'paso' = p.paso) as vio,
    exists (select 1 from interno.v_evento e where e.user_id = i.user_id and e.nombre = 'paso_completado' and e.props ->> 'paso' = p.paso) as completo,
    exists (select 1 from interno.v_evento e where e.user_id = i.user_id and e.nombre = 'paso_salteado' and e.props ->> 'paso' = p.paso) as salteo
  from ini i
  cross join interno.paso_onboarding p
  union all
  select
    i.user_id, i.dispositivo, 'fin', 6,
    exists (select 1 from interno.v_evento e where e.user_id = i.user_id and e.nombre = 'onboarding_completado'),
    exists (select 1 from interno.v_evento e where e.user_id = i.user_id and e.nombre = 'onboarding_completado'),
    false
  from ini i
)
select
  orden,
  paso,
  coalesce(dispositivo, 'todos') as dispositivo,
  count(*) as iniciaron,
  count(*) filter (where vio) as vieron,
  count(*) filter (where completo) as completaron,
  count(*) filter (where salteo) as saltearon,
  count(*) filter (where vio and not completo and not salteo) as se_cayeron_aca,
  round(100.0 * count(*) filter (where vio) / nullif(count(*), 0), 1) as pct_vieron,
  round(100.0 * count(*) filter (where completo or salteo) / nullif(count(*), 0), 1) as pct_pasaron
from por_user
group by grouping sets ((orden, paso, dispositivo), (orden, paso))
order by orden, dispositivo nulls first;

-- Mediana y p75 por paso × dispositivo × resultado, y del total.
create view interno.v_onboarding_tiempos as
with d as (
  select
    props ->> 'paso' as paso,
    case nombre when 'paso_completado' then 'completado' else 'salteado' end as resultado,
    coalesce(dispositivo, '?') as dispositivo,
    (props ->> 'duracion_ms')::numeric as ms
  from interno.v_evento
  where nombre in ('paso_completado', 'paso_salteado') and props ->> 'duracion_ms' is not null
  union all
  select 'TOTAL', 'completado', coalesce(dispositivo, '?'), (props ->> 'duracion_total_ms')::numeric
  from interno.v_evento
  where nombre = 'onboarding_completado' and props ->> 'duracion_total_ms' is not null
)
select
  coalesce(o.orden, 99) as orden,
  d.paso,
  d.resultado,
  coalesce(d.dispositivo, 'todos') as dispositivo,
  count(*) as n,
  round(percentile_cont(0.5) within group (order by d.ms)::numeric / 1000, 1) as mediana_s,
  round(percentile_cont(0.75) within group (order by d.ms)::numeric / 1000, 1) as p75_s
from d
left join interno.paso_onboarding o on o.paso = d.paso
group by grouping sets ((o.orden, d.paso, d.resultado, d.dispositivo), (o.orden, d.paso, d.resultado))
order by 1, d.resultado, 4;

-- Activación hoy, por empresa real. Replica `itemsDe` de src/features/guia/estado.ts:
--   campo     = ≥1 campo y ninguno sin contorno
--   potreros  = ≥2 potreros con polígono
--   hacienda  = ≥1 animal activo
--   tropas    = ≥1 animal activo y ninguno activo sin potrero
--   recorrida = ≥1 recorrida
-- El alquiler (sólo si hay campos alquilados) va aparte: no entra al score 0–5.
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
  -- Extras baratos: uso real más allá del checklist.
  mf.movimientos as movimientos_plata,
  ev.trabajos as trabajos_manga
from interno.v_empresa_real r
cross join lateral (
  select count(*) as campos,
         count(*) filter (where contorno is null) as campos_sin_contorno,
         count(*) filter (where tipo = 'alquilado') as alquilados
  from public.campo where empresa_id = r.empresa_id
) c
cross join lateral (
  select count(*) as potreros, count(*) filter (where poligono is not null) as potreros_dibujados
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
  -- Trabajo de manga = evento de rodeo sobre el animal (no alta/baja/nota/caravana).
  select count(*) as trabajos from public.evento
  where empresa_id = r.empresa_id
    and tipo in ('sanidad', 'pesaje', 'servicio', 'tacto', 'destete', 'castracion', 'parto')
) ev;

-- Foto diaria del score. El contorno y el polígono no guardan fecha, así que
-- "activada a los 7 días" no se puede reconstruir hacia atrás: se fotografía.
-- La agenda diaria (pg_cron) va en una migración aparte: habilitar la
-- extensión es una decisión propia. Sin agenda, se corre a mano.
create table interno.activacion_foto (
  empresa_id uuid not null,
  fecha date not null,
  score smallint not null,
  t_campo boolean not null,
  t_potreros boolean not null,
  t_hacienda boolean not null,
  t_tropas boolean not null,
  t_recorrida boolean not null,
  primary key (empresa_id, fecha)
);

create function interno.fotografiar_activacion()
returns void
language sql
-- Escribe en interno.activacion_foto; la ejecuta sólo service_role (o pg_cron).
security definer
set search_path = ''
as $$
  insert into interno.activacion_foto (empresa_id, fecha, score, t_campo, t_potreros, t_hacienda, t_tropas, t_recorrida)
  select empresa_id, current_date, score, t_campo, t_potreros, t_hacienda, t_tropas, t_recorrida
  from interno.v_activacion_hoy
  on conflict (empresa_id, fecha) do update set
    score = excluded.score,
    t_campo = excluded.t_campo,
    t_potreros = excluded.t_potreros,
    t_hacienda = excluded.t_hacienda,
    t_tropas = excluded.t_tropas,
    t_recorrida = excluded.t_recorrida
$$;

-- activada_7d:
--   true  = llegó a 5/5 dentro de los 7 días del registro (foto o hoy);
--   false = pasaron los 7 días, hay fotos que cubren la ventana y ninguna 5/5;
--   null  = todavía no se sabe (menos de 7 días) o no hay fotos de esa ventana
--           (empresas anteriores a esta migración).
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

-- El cruce: cómo salió del onboarding vs qué tan activada está.
create view interno.v_onboarding_x_activacion as
with por_user as (
  select
    user_id,
    (array_agg(dispositivo order by ts_cliente, id) filter (where nombre = 'onboarding_iniciado'))[1] as dispositivo,
    bool_or(nombre = 'onboarding_completado') as completo,
    bool_or(nombre = 'paso_salteado' and props ->> 'paso' = 'potreros') as salteo_potreros,
    bool_or(nombre = 'paso_salteado' and props ->> 'paso' = 'hacienda') as salteo_hacienda,
    (array_agg(props ->> 'paso' order by ts_cliente desc, id desc) filter (where nombre = 'paso_visto'))[1] as ultimo_paso
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
  a.score,
  a.activada_7d,
  a.t_campo, a.t_potreros, a.t_hacienda, a.t_tropas, a.t_recorrida,
  a.potreros, a.potreros_dibujados, a.cabezas, a.recorridas,
  a.movimientos_plata, a.trabajos_manga
from interno.v_activacion a
-- Por membresía, no por el empresa_id de los eventos: los primeros pasos no lo tienen.
left join lateral (
  select pu.* from por_user pu
  join public.miembro_empresa m on m.user_id = pu.user_id and m.empresa_id = a.empresa_id
  order by pu.completo desc
  limit 1
) o on true;

revoke all on all tables in schema interno from public, anon, authenticated;
revoke all on all functions in schema interno from public, anon, authenticated;
grant select on all tables in schema interno to service_role;
grant execute on function interno.es_cuenta_orka(text), interno.fotografiar_activacion() to service_role;
