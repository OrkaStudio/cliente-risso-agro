-- Lo que pasa en la landing (troppero.com), para el tramo de arriba del embudo en la planilla
-- viva: visitas → tocaron WhatsApp → eligieron un horario → se registraron.
--
-- Anónimo a propósito: sin cookies, sin IP, sin identificadores. Cada fila dice sólo cuándo,
-- qué pasó, en qué parte de la página, de dónde vino (utm_source o el sitio que la mandó) y
-- si fue celular o compu. Lo escribe la edge function `landing-evento` con la conexión directa;
-- `interno` no está expuesto por la API.

create table interno.landing_evento (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  tipo text not null check (tipo in ('visita', 'whatsapp', 'horario')),
  donde text check (char_length(donde) <= 40),
  origen text check (char_length(origen) <= 60),
  dispositivo text check (dispositivo in ('movil', 'escritorio'))
);

create index landing_evento_ts on interno.landing_evento (ts);

revoke all on interno.landing_evento from public, anon, authenticated;

-- Un día por fila (hora argentina). «whatsapp» cuenta todos los que abrieron WhatsApp, también
-- los que lo hicieron eligiendo un horario; «horario» es el subconjunto que eligió uno.
create view interno.v_landing_dia as
select
  (ts at time zone 'America/Argentina/Buenos_Aires')::date as dia,
  count(*) filter (where tipo = 'visita') as visitas,
  count(*) filter (where tipo in ('whatsapp', 'horario')) as whatsapp,
  count(*) filter (where tipo = 'horario') as horario
from interno.landing_evento
group by 1;

revoke all on interno.v_landing_dia from public, anon, authenticated;
