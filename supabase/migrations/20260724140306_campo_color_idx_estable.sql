-- color_idx: color IDENTIDAD estable por campo, asignado por orden de creación
-- dentro de la empresa (0-based). Antes el color se derivaba del orden
-- alfabético en la app y se "recorría" al agregar campos. Ahora es explícito,
-- no se mueve, y cada campo nuevo toma el siguiente color automáticamente.
alter table campo add column if not exists color_idx smallint;

-- Backfill de los campos existentes por orden de creación por empresa.
update campo c set color_idx = s.rn
from (
  select id,
         (row_number() over (partition by empresa_id order by created_at) - 1)::smallint as rn
  from campo
) s
where c.id = s.id and c.color_idx is null;

-- Trigger: al INSERTAR un campo, si no trae color_idx, toma el siguiente de la
-- empresa. Así el "automático para nuevos usuarios" no depende de la app.
create or replace function campo_asignar_color_idx()
returns trigger language plpgsql as $$
begin
  if new.color_idx is null then
    select coalesce(max(color_idx) + 1, 0) into new.color_idx
    from campo where empresa_id = new.empresa_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_campo_color_idx on campo;
create trigger trg_campo_color_idx
  before insert on campo
  for each row execute function campo_asignar_color_idx();
