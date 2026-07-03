-- =====================================================================
--  animal.sexo: extiende la columna GENERADA a ovino/equino.
--
--  El sexo se deriva de la categoría (invariante dura, el usuario nunca
--  lo carga). Al sumar categorías hay que recrear la columna generada
--  con las ramas nuevas — no se puede ALTERar la expresión de una
--  columna generada, hay que dropearla y volver a crearla. La vista
--  v_animal_con_caravana hace `select a.*` → depende de la columna, así
--  que se dropea y recrea también.
--
--  Sexos: ovejas/yeguas/potrancas/corderas = hembra; carneros/corderos/
--  padrillos/potrillos = macho.
--
--  Aplicada a prod vía Supabase MCP el 2026-07-03.
-- =====================================================================
drop view if exists v_animal_con_caravana;

alter table animal drop column sexo;

-- Cada rama castea al enum directamente (constantes → inmutables).
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
      when 'oveja'      then 'hembra'::sexo_animal
      when 'carnero'    then 'macho'::sexo_animal
      when 'cordero'    then 'macho'::sexo_animal
      when 'cordera'    then 'hembra'::sexo_animal
      when 'yegua'      then 'hembra'::sexo_animal
      when 'padrillo'   then 'macho'::sexo_animal
      when 'potrillo'   then 'macho'::sexo_animal
      when 'potranca'   then 'hembra'::sexo_animal
    end
  ) stored;

create view v_animal_con_caravana with (security_invoker = true) as
select a.*,
       c.numero_rfid   as caravana_rfid,
       c.numero_visual as caravana_visual
from animal a
left join caravana c on c.animal_id = a.id and c.vigente;
