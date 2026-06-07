-- =====================================================================
--  animal.sexo derivado de categoria (columna GENERADA)
--
--  La categoría ya determina el sexo (vaquillona/ternera/vaca = hembra;
--  novillo/ternero/toro/capón = macho) → pedirlo es fricción innecesaria
--  (D10). Lo hacemos columna generada: el usuario NUNCA lo carga y es
--  imposible que quede inconsistente (invariante dura en Postgres).
--
--  Hay que dropear y recrear la vista v_animal_con_caravana porque hace
--  `select a.*` y depende de la columna sexo.
-- =====================================================================
drop view if exists v_animal_con_caravana;

alter table animal drop column sexo;

-- Cada rama castea al enum directamente (constantes → inmutables). El cast
-- externo de un CASE de texto NO es inmutable y Postgres lo rechaza.
alter table animal
  add column sexo sexo_animal
  generated always as (
    case categoria
      when 'vaca'       then 'hembra'::sexo_animal
      when 'vaquillona' then 'hembra'::sexo_animal
      when 'ternera'    then 'hembra'::sexo_animal
      when 'novillo'    then 'macho'::sexo_animal
      when 'ternero'    then 'macho'::sexo_animal
      when 'toro'       then 'macho'::sexo_animal
      when 'capon'      then 'macho'::sexo_animal
    end
  ) stored;

create view v_animal_con_caravana with (security_invoker = true) as
select a.*,
       c.numero_rfid   as caravana_rfid,
       c.numero_visual as caravana_visual
from animal a
left join caravana c on c.animal_id = a.id and c.vigente;
