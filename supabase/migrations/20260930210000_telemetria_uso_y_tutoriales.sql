-- Telemetría: uso de la app y tutoriales hasta que termina la puesta a punto.
-- Sigue a 20260926140000_telemetria_siembra. Spec (ampliada el 30/09):
-- clientes/risso-agro/especificaciones/2026-09-19-telemetria-onboarding-activacion.
--
-- Por qué:
--  · `sesion_iniciada` sólo sale con un login nuevo. Quien vuelve con la sesión
--    guardada no dejaba rastro (un productor real usó la app el 26/09 y quedó
--    en 0 eventos). `app_abierta` sale una vez por pestaña, con o sin login.
--  · Después del onboarding no se medía nada: bienvenida, misiones, puntitos,
--    asistente. Ahora sí, hasta `puesta_a_punto_completa`.
--
-- Orden de deploy: esta migración ANTES que el código. Si la app manda un
-- nombre que el check no acepta, se cae el lote entero.

-- 1 · Vocabulario (agregar uno = editar la spec y este check).
alter table public.evento_producto drop constraint evento_producto_nombre_check;
alter table public.evento_producto add constraint evento_producto_nombre_check check (nombre in (
  'registro_completado',
  'sesion_iniciada',
  'onboarding_iniciado',
  'paso_visto',
  'paso_completado',
  'paso_salteado',
  'paso_error',
  'onboarding_completado',
  'app_abierta',
  'pantalla_vista',
  'bienvenida_vista',
  'bienvenida_respondida',
  'mision_iniciada',
  'mision_paso',
  'mision_completada',
  'mision_abandonada',
  'puesta_a_punto_item',
  'puesta_a_punto_completa',
  'spot_tocado',
  'asistente_abierto',
  'asistente_pregunta',
  'soporte_whatsapp'
));

-- 2 · Eventos reales con la empresa resuelta: el evento puede venir sin
--     empresa_id (antes de crearla, o antes de que cargue la membresía), pero
--     el usuario pertenece a una sola empresa.
create view interno.v_evento_empresa as
select e.*, coalesce(e.empresa_id, m.empresa_id) as empresa
from interno.v_evento e
left join public.miembro_empresa m on m.user_id = e.user_id;

-- 3 · Uso: una fila por empresa real.
create view interno.v_uso as
select
  r.empresa_id,
  r.nombre,
  max(e.ts_cliente) filter (where e.nombre = 'app_abierta') as ultima_apertura,
  count(distinct e.ts_cliente::date) filter (
    where e.nombre = 'app_abierta' and e.ts_cliente > now() - interval '7 days'
  ) as dias_activos_7d,
  count(distinct e.ts_cliente::date) filter (
    where e.nombre = 'app_abierta' and e.ts_cliente > now() - interval '30 days'
  ) as dias_activos_30d,
  count(*) filter (where e.nombre = 'app_abierta') as aperturas,
  count(*) filter (where e.nombre = 'app_abierta' and e.dispositivo = 'movil') as aperturas_movil,
  count(*) filter (where e.nombre = 'app_abierta' and e.dispositivo = 'escritorio') as aperturas_escritorio,
  (
    select string_agg(x.pantalla || ' (' || x.n || ')', ', ' order by x.n desc)
    from (
      select e2.props ->> 'pantalla' as pantalla, count(*) as n
      from interno.v_evento_empresa e2
      where e2.empresa = r.empresa_id and e2.nombre = 'pantalla_vista'
      group by 1 order by 2 desc limit 5
    ) x
  ) as pantallas_mas_vistas
from interno.v_empresa_real r
left join interno.v_evento_empresa e on e.empresa = r.empresa_id
group by r.empresa_id, r.nombre;

-- 4 · Tutoriales: una fila por empresa real, de la bienvenida al final de la
--     puesta a punto. Los tiempos son desde el registro (horas).
create view interno.v_tutoriales as
with ev as (
  select e.*, r.registro
  from interno.v_evento_empresa e
  join interno.v_empresa_real r on r.empresa_id = e.empresa
)
select
  r.empresa_id,
  r.nombre,
  (select props ->> 'respuesta' from ev where ev.empresa = r.empresa_id and nombre = 'bienvenida_respondida' order by ts_cliente limit 1) as bienvenida,
  (select count(*) from ev where ev.empresa = r.empresa_id and nombre = 'mision_iniciada') as misiones_iniciadas,
  (select count(distinct props ->> 'mision') from ev where ev.empresa = r.empresa_id and nombre = 'mision_completada') as misiones_completadas,
  (select count(*) from ev where ev.empresa = r.empresa_id and nombre = 'mision_abandonada') as misiones_abandonadas,
  (select string_agg(distinct props ->> 'mision', ', ') from ev where ev.empresa = r.empresa_id and nombre = 'mision_completada') as cuales_completo,
  (select count(*) from ev where ev.empresa = r.empresa_id and nombre = 'spot_tocado') as puntitos_tocados,
  (select count(*) from ev where ev.empresa = r.empresa_id and nombre = 'asistente_abierto') as asistente_abierto,
  (select count(*) from ev where ev.empresa = r.empresa_id and nombre = 'asistente_pregunta') as preguntas,
  (select count(*) from ev where ev.empresa = r.empresa_id and nombre = 'soporte_whatsapp') as whatsapp,
  (select string_agg(props ->> 'item', ' → ' order by ts_cliente) from ev where ev.empresa = r.empresa_id and nombre = 'puesta_a_punto_item') as orden_puesta_a_punto,
  (select round(extract(epoch from min(ts_cliente) - min(ev.registro)) / 3600, 1) from ev where ev.empresa = r.empresa_id and nombre = 'puesta_a_punto_completa') as horas_hasta_completa,
  a.score as puesta_a_punto_hoy
from interno.v_empresa_real r
left join interno.v_activacion_hoy a on a.empresa_id = r.empresa_id;

-- 5 · Misiones: cuántas se empiezan, se terminan y dónde se abandonan.
create view interno.v_misiones as
with ev as (select * from interno.v_evento_empresa where nombre like 'mision_%')
select
  props ->> 'mision' as mision,
  count(*) filter (where nombre = 'mision_iniciada') as iniciadas,
  count(*) filter (where nombre = 'mision_completada') as completadas,
  count(*) filter (where nombre = 'mision_abandonada') as abandonadas,
  round(100.0 * count(*) filter (where nombre = 'mision_completada')
        / nullif(count(*) filter (where nombre = 'mision_iniciada'), 0)) as pct_completadas,
  round((percentile_cont(0.5) within group (order by (props ->> 'duracion_ms')::numeric)
         filter (where nombre = 'mision_completada')) / 60000, 1) as mediana_min,
  mode() within group (order by (props ->> 'indice')::int) filter (where nombre = 'mision_abandonada') as paso_mas_abandonado,
  count(*) filter (where nombre = 'mision_iniciada' and props ->> 'origen' = 'bienvenida') as desde_bienvenida,
  count(*) filter (where nombre = 'mision_iniciada' and props ->> 'origen' = 'pastilla') as desde_pastilla,
  count(*) filter (where nombre = 'mision_iniciada' and props ->> 'origen' = 'asistente') as desde_asistente
from ev
group by 1;

-- 6 · Productores: la hoja principal. Una fila por empresa real con todo.
create view interno.v_productores as
select
  x.nombre,
  x.emails,
  x.registro::date as registro,
  x.dias_desde_registro,
  x.perfil,
  x.salida_onboarding,
  x.dispositivo as dispositivo_alta,
  x.score as puesta_a_punto,
  x.activada_7d,
  u.ultima_apertura,
  u.dias_activos_7d,
  u.dias_activos_30d,
  u.aperturas_movil,
  u.aperturas_escritorio,
  t.bienvenida,
  t.misiones_completadas,
  t.misiones_abandonadas,
  t.whatsapp as pidio_ayuda,
  x.cabezas,
  x.potreros,
  x.potreros_dibujados,
  x.recorridas,
  x.trabajos_manga,
  x.movimientos_plata,
  x.labores,
  u.pantallas_mas_vistas,
  x.empresa_id
from interno.v_onboarding_x_activacion x
left join interno.v_uso u on u.empresa_id = x.empresa_id
left join interno.v_tutoriales t on t.empresa_id = x.empresa_id;

-- 7 · Eventos crudos recientes (reales) y un resumen de las cuentas de prueba,
--     para verificar que llega lo que tiene que llegar.
create view interno.v_eventos_recientes as
select e.ts_cliente, r.nombre as empresa, e.email, e.nombre as evento, e.props::text as detalle, e.dispositivo
from interno.v_evento_empresa e
left join interno.v_empresa_real r on r.empresa_id = e.empresa
order by e.ts_cliente desc
limit 1000;

create view interno.v_pruebas as
select u.email, count(*) as eventos, max(e.ts_cliente) as ultimo,
       string_agg(distinct e.nombre, ', ') as tipos
from public.evento_producto e
join auth.users u on u.id = e.user_id
where interno.es_cuenta_orka(u.email::text)
group by u.email;

revoke all on all tables in schema interno from public, anon, authenticated;
grant select on all tables in schema interno to service_role;
