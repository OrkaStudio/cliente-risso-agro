-- Campo: actividad y ubicación (TASK-060, onboarding completo).
--
-- Additiva: sólo columnas nuevas, todo nullable, nada existente cambia.
--
-- Por qué:
--  · actividad  → los potreros nacen con el estado correcto y la Recorrida
--                 pregunta lo correcto (ganadera/mixta: pasto y agua;
--                 agrícola: cultivo). Es POR CAMPO: un productor tiene un
--                 campo ganadero y otro agrícola.
--  · provincia / localidad → dónde ESTÁ el campo (no dónde vive el dueño).
--                 De la provincia sale qué catastro aplica; de la localidad,
--                 el clima.
--  · lat / lon  → centro del campo para el pronóstico. Hasta hoy el clima
--                 usaba coordenadas fijas del campo de Daniel para TODOS los
--                 usuarios (CAMPO_PRINCIPAL en cotizaciones/api.ts). Se
--                 llena desde la localidad (geocodificada) o, si hay
--                 contorno, desde su centroide — que es más exacto y manda.

create type actividad_campo as enum ('ganadera', 'agricola', 'mixta');

alter table campo
  add column if not exists actividad  actividad_campo,
  add column if not exists provincia  text,
  add column if not exists localidad  text,
  add column if not exists lat        double precision
    check (lat is null or (lat between -90 and 90)),
  add column if not exists lon        double precision
    check (lon is null or (lon between -180 and 180));

comment on column campo.actividad is 'ganadera | agricola | mixta — define el estado inicial de los potreros y las preguntas de la Recorrida';
comment on column campo.provincia is 'Provincia donde está el campo (no el domicilio del dueño). Llave para el catastro.';
comment on column campo.localidad is 'Localidad más cercana al campo. De acá sale lat/lon si no hay contorno.';
comment on column campo.lat is 'Centro del campo para el clima. Con contorno, su centroide; si no, la localidad geocodificada.';
comment on column campo.lon is 'Ver campo.lat';

-- Backfill: los campos que ya tienen contorno reciben su centroide (promedio
-- de vértices; alcanza para un pronóstico). contorno es jsonb [[lat, lon], …].
update campo c
set lat = sub.lat, lon = sub.lon
from (
  select id,
         avg((p->>0)::double precision) as lat,
         avg((p->>1)::double precision) as lon
  from campo, jsonb_array_elements(contorno) p
  where jsonb_typeof(contorno) = 'array'
  group by id
) sub
where c.id = sub.id and c.lat is null;
