-- El nombre del potrero = NÚMERO (lo elige el productor) + LETRA (fija, la del
-- campo por color_idx). La letra NUNCA se cambia; el número sí — hay quien ya
-- tiene sus potreros numerados de una forma específica. Se fuerza la letra en
-- la DB (INSERT y UPDATE) para que ninguna pantalla la pueda cambiar. El número
-- se toma de lo que manda la pantalla; si viene vacío, el siguiente del campo.
create or replace function potrero_asignar_nombre()
returns trigger language plpgsql as $$
declare
  v_letra text;
  v_num text;
begin
  select chr(65 + coalesce(color_idx, 0)) into v_letra
  from campo where id = new.campo_id;

  -- Número que puso el usuario (parte numérica del nombre enviado).
  v_num := nullif(regexp_replace(coalesce(new.nombre, ''), '\D', '', 'g'), '');

  -- Sin número → el siguiente disponible del campo (para el alta rápida).
  if v_num is null then
    select (coalesce(max(nullif(regexp_replace(nombre, '\D', '', 'g'), '')::int), 0) + 1)::text
    into v_num
    from potrero where campo_id = new.campo_id;
  end if;

  new.nombre := v_num || v_letra;
  return new;
end $$;

drop trigger if exists trg_potrero_nombre on potrero;
create trigger trg_potrero_nombre
  before insert or update on potrero
  for each row execute function potrero_asignar_nombre();
