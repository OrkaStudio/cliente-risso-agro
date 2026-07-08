-- Nota de voz POR ANIMAL (manga): el evento `nota` puede llevar un audio
-- grabado offline. Mismo bucket privado `comprobantes` bajo el prefijo de la
-- empresa ({empresa_id}/evento-{uuid}.<ext>). Es la semilla de la ficha del
-- animal: historial + características + notas (texto y voz) + gastos +
-- comprobantes + fotos van a converger ahí.
alter table evento
  add column if not exists audio_url text;

comment on column evento.audio_url is
  'Path en storage (bucket comprobantes) de la nota de voz del evento.';
