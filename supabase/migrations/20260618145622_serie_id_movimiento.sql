-- Agrupa las cuotas de un gasto/ingreso recurrente o en cuotas. ADITIVO.
alter table movimiento_financiero
  add column serie_id uuid;

create index movimiento_financiero_serie_id_idx
  on movimiento_financiero (serie_id)
  where serie_id is not null;

comment on column movimiento_financiero.serie_id is
  'Identifica las cuotas de una misma serie (gasto recurrente / en cuotas). Null = movimiento suelto.';
