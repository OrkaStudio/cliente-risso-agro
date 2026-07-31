-- El nombre del potrero NO lo elige el productor: lo asigna el sistema y no se
-- puede cambiar. Letra = la del campo (por color_idx: A, B, C…); número =
-- el siguiente disponible en ese campo. Así el 1er campo tiene 1A,2A,3A; el 2º
-- 1B,2B,3B; etc. Se fuerza en la DB (BEFORE INSERT) para que ninguna pantalla
-- lo pueda sobrescribir. Mismo patrón que campo.color_idx.
create or replace function potrero_asignar_nombre()
returns trigger language plpgsql as $$
declare
  v_letra text;
  v_num int;
begin
  select chr(65 + coalesce(color_idx, 0)) into v_letra
  from campo where id = new.campo_id;

  select coalesce(max(nullif(regexp_replace(nombre, '\D', '', 'g'), '')::int), 0) + 1
  into v_num
  from potrero where campo_id = new.campo_id;

  new.nombre := v_num::text || v_letra;
  return new;
end $$;

drop trigger if exists trg_potrero_nombre on potrero;
create trigger trg_potrero_nombre
  before insert on potrero
  for each row execute function potrero_asignar_nombre();
