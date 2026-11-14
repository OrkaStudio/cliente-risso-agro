-- La pantalla de la invitación muestra qué secciones habilitó el dueño (Lau, 12/11):
-- desde el 05/11 el dueño elige sección por sección, así que ya no se puede
-- decir de antemano que «la plata no la ves».

drop function public.invitacion_por_token(text);

create function public.invitacion_por_token(p_token text)
returns table (
  empresa text,
  invita text,
  nombre text,
  rol text,
  celular text,
  vencida boolean,
  usada boolean,
  secciones text[]
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    e.nombre,
    coalesce(nullif(u.raw_user_meta_data ->> 'nombre', ''), 'El dueño'),
    i.nombre,
    i.rol,
    i.celular,
    i.vence_at <= now(),
    i.aceptada_at is not null,
    i.secciones
  from public.invitacion i
  join public.empresa e on e.id = i.empresa_id
  left join auth.users u on u.id = i.invitado_por
  where i.token = p_token
$$;
revoke execute on function public.invitacion_por_token(text) from public;
grant execute on function public.invitacion_por_token(text) to anon, authenticated;
