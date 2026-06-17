-- Dimensión de actividad productiva para analizar rentabilidad por actividad.
-- ADITIVO: columna nullable; los movimientos existentes quedan sin clasificar.
create type actividad_movimiento as enum (
  'cria',
  'invernada',
  'agricultura',
  'estructura'
);

alter table movimiento_financiero
  add column actividad actividad_movimiento;

comment on column movimiento_financiero.actividad is
  'Actividad productiva a la que pertenece el movimiento (cría/invernada/agricultura) o estructura (costos generales). Null = sin clasificar.';
