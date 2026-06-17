-- Destino de la campaña del potrero: si se cosecha para vender (centro de
-- ganancia) o se siembra para consumo animal (centro de costo). ADITIVO.
create type destino_campania as enum ('venta', 'consumo');
create type aprovechamiento_forraje as enum (
  'pastoreo',
  'rollo',
  'silo',
  'fardo',
  'diferido'
);

alter table potrero
  add column destino destino_campania,
  add column aprovechamiento aprovechamiento_forraje;

comment on column potrero.destino is
  'Destino de la campaña: venta (cosecha para vender) o consumo (forraje para los animales). Null = sin definir.';
comment on column potrero.aprovechamiento is
  'Cómo se aprovecha el forraje cuando destino=consumo: pastoreo/rollo/silo/fardo/diferido.';
