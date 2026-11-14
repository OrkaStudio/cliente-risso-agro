-- Darse de baja desde la app (Lau, 13/11; lo exige la ley de defensa del consumidor):
-- el dueño la pide en Configuración → Plan. Corre desde ese momento (no se cobra
-- más); durante 30 días todo sigue igual, por si se arrepiente o quiere su copia,
-- y después se borran los datos de la empresa. El borrado lo hace Orka a mano
-- hasta que haya una tarea programada.

create table public.baja (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresa (id) on delete cascade,
  pedida_por uuid not null references auth.users (id),
  pedida_at timestamptz not null default now(),
  borrar_desde timestamptz not null default now() + interval '30 days',
  deshecha_at timestamptz
);

-- Una sola baja en curso por empresa.
create unique index baja_en_curso on public.baja (empresa_id) where deshecha_at is null;

alter table public.baja enable row level security;

-- La ve el dueño de la empresa. Se escribe sólo por las funciones.
create policy baja_del_dueno on public.baja
  for select to authenticated
  using (exists (select 1 from public.miembro_empresa m where m.empresa_id = baja.empresa_id and m.user_id = auth.uid() and m.rol = 'dueno'));

create or replace function public.pedir_baja()
returns public.baja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_baja public.baja;
begin
  select empresa_id into v_empresa from public.miembro_empresa where user_id = auth.uid() and rol = 'dueno';
  if v_empresa is null then
    raise exception 'Sólo el dueño puede dar de baja Troppero.';
  end if;
  select * into v_baja from public.baja where empresa_id = v_empresa and deshecha_at is null;
  if v_baja.id is not null then
    return v_baja;
  end if;
  insert into public.baja (empresa_id, pedida_por) values (v_empresa, auth.uid()) returning * into v_baja;
  return v_baja;
end;
$$;

create or replace function public.deshacer_baja()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.miembro_empresa where user_id = auth.uid() and rol = 'dueno';
  if v_empresa is null then
    raise exception 'Sólo el dueño puede deshacer la baja.';
  end if;
  update public.baja set deshecha_at = now()
  where empresa_id = v_empresa and deshecha_at is null and borrar_desde > now();
end;
$$;

revoke all on function public.pedir_baja() from public, anon;
revoke all on function public.deshacer_baja() from public, anon;
grant execute on function public.pedir_baja() to authenticated;
grant execute on function public.deshacer_baja() to authenticated;
