-- Campaña agrícola actual del potrero (carga manual). ADITIVO: solo agrega
-- columnas nullable a `potrero`, no toca datos existentes. Cuando el potrero
-- vuelve a ganadero/descanso, se dejan en null.
alter table potrero
  add column cultivo text,
  add column variedad text,
  add column fecha_siembra date,
  add column fecha_cosecha_estimada date;
