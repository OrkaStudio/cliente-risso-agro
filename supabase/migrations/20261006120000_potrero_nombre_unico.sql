-- ---------------------------------------------------------------------
-- El nombre del potrero (número + letra del campo) no se repite dentro de un
-- campo. Hasta ahora nada lo impedía: el onboarding dejaba guardar tres «1A».
-- En prod no hay repetidos (verificado el 06/10), así que no hay nada que migrar.
-- ---------------------------------------------------------------------
create unique index uq_potrero_nombre_por_campo on public.potrero (campo_id, nombre);
