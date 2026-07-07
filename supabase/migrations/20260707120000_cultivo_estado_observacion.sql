-- Observación de potreros AGRÍCOLAS en la recorrida: estado del cultivo.
-- El flujo del Modo Campo se adapta por estado_ciclo del potrero: en los
-- agrícolas (preparación/siembra/cultivo/cosecha) no tiene sentido preguntar
-- por pasto — se observa el cultivo. Enum propio (no ADD VALUE → puede ir en
-- la misma migración que la columna).
create type cultivo_obs_estado as enum ('bien', 'regular', 'mal');

alter table observacion_potrero
  add column if not exists cultivo cultivo_obs_estado;

comment on column observacion_potrero.cultivo is
  'Estado del cultivo observado (potreros agrícolas). NULL en ganaderos.';
