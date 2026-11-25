-- Infraestructura cargable desde WhatsApp (15/10/2026): tipos nuevos, apodo y línea de eléctricos.
-- Aditiva. En producción la tabla estaba vacía y la app (campo-vista.tsx) saltea los tipos que
-- no conoce, así que los nuevos no se ven en el croquis hasta sumarlos ahí.

alter type public.tipo_infraestructura add value if not exists 'tanque';
alter type public.tipo_infraestructura add value if not exists 'bebedero';
alter type public.tipo_infraestructura add value if not exists 'energizador';
alter type public.tipo_infraestructura add value if not exists 'electrico';

alter table public.infraestructura
  add column if not exists apodo text,
  add column if not exists linea jsonb,
  add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

comment on column public.infraestructura.apodo is
  'Distingue dos iguales o describe el elemento: «australiano», «viejo», «del casco». En la imagen va junto al tipo.';
comment on column public.infraestructura.linea is
  'Sólo eléctricos: [[lat,lng], ...] del tramo. lat/lng guardan un punto del medio, para quien sólo lee puntos.';

-- Una línea es una lista de 2 a 2000 pares [lat, lng] numéricos y en rango.
create or replace function public.infraestructura_linea_valida(l jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(l) is distinct from 'array' then false
    when jsonb_array_length(l) not between 2 and 2000 then false
    else not exists (
      select 1 from jsonb_array_elements(l) as p(v)
      where case
        when jsonb_typeof(v) <> 'array' then true
        when jsonb_array_length(v) <> 2 then true
        when jsonb_typeof(v -> 0) <> 'number' or jsonb_typeof(v -> 1) <> 'number' then true
        else abs((v ->> 0)::float8) > 90 or abs((v ->> 1)::float8) > 180
      end)
  end
$$;

alter table public.infraestructura
  add constraint infraestructura_apodo_largo
    check (apodo is null or char_length(btrim(apodo)) between 1 and 40),
  add constraint infraestructura_linea_forma
    check (linea is null or public.infraestructura_linea_valida(linea)),
  -- Comparar como texto: un valor de enum recién agregado no se puede usar en la misma transacción.
  add constraint infraestructura_linea_solo_electrico
    check (linea is null or tipo::text = 'electrico'),
  add constraint infraestructura_coordenadas
    check (lat between -90 and 90 and lng between -180 and 180);

-- RLS filtra por empresa, pero no impedía apuntar a un campo de otra empresa.
create or replace function public.infraestructura_campo_de_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.campo c where c.id = new.campo_id and c.empresa_id = new.empresa_id) then
    raise exception 'El campo no pertenece a la empresa del elemento' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger infraestructura_campo_de_empresa
  before insert or update of campo_id, empresa_id on public.infraestructura
  for each row execute function public.infraestructura_campo_de_empresa();
