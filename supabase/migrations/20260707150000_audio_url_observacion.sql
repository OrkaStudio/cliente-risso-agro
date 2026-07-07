-- Nota de voz en la observación de la recorrida: en la camioneta se habla,
-- no se tipea. El audio se graba OFFLINE (MediaRecorder), viaja por el outbox
-- y sube al bucket privado `comprobantes` bajo el prefijo de la empresa
-- ({empresa_id}/rec-{recorrida_id}-{potrero_id}.<ext>) — mismas policies RLS.
alter table observacion_potrero
  add column if not exists audio_url text;

comment on column observacion_potrero.audio_url is
  'Path en storage (bucket comprobantes) de la nota de voz de la observación.';
