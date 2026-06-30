-- =====================================================================
--  Regla "todo movimiento cae en la agenda": cada movimiento debe tener
--  una fecha que lo ubique en el calendario de vencimientos — fecha de
--  vencimiento (pendiente) o fecha de cobro/pago (ya liquidado).
--  Se agrega como CHECK NOT VALID: aplica a lo NUEVO sin validar (ni
--  romper) las filas viejas que pudieran no tener fecha. La validación
--  real vive además en los diálogos de carga.
--  Los anulados quedan exentos (no son agenda).
-- =====================================================================
alter table movimiento_financiero
  add constraint movimiento_tiene_fecha_agenda
  check (
    estado = 'anulado'
    or fecha_vencimiento is not null
    or fecha_cobro_pago is not null
  )
  not valid;
