-- Nota de voz en el movimiento (Plata, Modo Campo): "gasoil de la chata en
-- lo de Juárez" hablado en vez de tipeado. Mismo bucket privado
-- `comprobantes` ({empresa_id}/mov-{movimiento_id}.<ext>). La transcripción
-- (AI Ingeniero) llega después sobre estos mismos paths.
alter table movimiento_financiero
  add column if not exists audio_url text;

comment on column movimiento_financiero.audio_url is
  'Path en storage (bucket comprobantes) de la nota de voz del movimiento.';
