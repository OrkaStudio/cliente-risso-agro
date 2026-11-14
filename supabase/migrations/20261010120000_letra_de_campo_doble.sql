-- La letra del campo (y de sus potreros) por color_idx: A…Z y después AA, AB…
-- Antes la base usaba chr(65 + color_idx): desde el campo 27 daba símbolos y
-- minúsculas ([, \, …, a, b) mientras la app mostraba AA, AB. El nombre
-- guardado del potrero no coincidía con lo que se veía.

create or replace function public.letra_de_campo(i integer)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  n integer := greatest(coalesce(i, 0), 0);
  s text := '';
begin
  loop
    s := chr(65 + (n % 26)) || s;
    n := n / 26 - 1;
    exit when n < 0;
  end loop;
  return s;
end $$;

create or replace function public.potrero_asignar_nombre()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_letra text;
  v_num text;
begin
  select public.letra_de_campo(color_idx) into v_letra
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
end $function$;

-- Los potreros de campos 27+ que quedaron con la letra mal: el trigger los
-- renombra al tocarlos (mismo número, letra correcta; no choca con el índice
-- único porque los números ya eran únicos dentro del campo).
update potrero p
set nombre = p.nombre
from campo c
where c.id = p.campo_id and c.color_idx >= 26;
