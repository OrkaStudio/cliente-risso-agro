-- Piloto WhatsApp. Preparada para revisión; NO ejecutar sin confirmación explícita.
-- Aditiva: no aplica migraciones de Hacienda ni activa cron, plantillas o suscripciones.
begin;

create table interno.wa_cola (
  mensaje_id uuid primary key references public.wa_mensaje(id) on delete cascade,
  vinculo_id uuid not null references public.wa_vinculo(id) on delete cascade,
  secuencia bigint generated always as identity unique,
  estado text not null default 'pendiente' check(estado in ('pendiente','procesando','completo','revision')),
  token uuid, tomado_at timestamptz, terminado_at timestamptz
);
create index wa_cola_pendiente on interno.wa_cola(vinculo_id,secuencia) where estado<>'completo';
revoke all on interno.wa_cola from public,anon,authenticated;

create table interno.wa_propuesta_piloto (
  id uuid primary key default gen_random_uuid(),
  vinculo_id uuid not null references public.wa_vinculo(id) on delete cascade,
  mensaje_id uuid not null references public.wa_mensaje(id),
  accion jsonb not null,
  estado text not null default 'pendiente' check(estado in ('pendiente','ejecutando','completo','cancelada','revision')),
  created_at timestamptz not null default now(),
  unique(vinculo_id,mensaje_id)
);
revoke all on interno.wa_propuesta_piloto from public,anon,authenticated;

create table public.campo_incidencia (
  id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresa(id),
  campo_id uuid not null references public.campo(id), potrero_id uuid not null references public.potrero(id),
  infraestructura_id uuid references public.infraestructura(id),
  descripcion text not null check(length(trim(descripcion)) between 1 and 1000),
  estado text not null default 'abierta' check(estado in ('abierta','resuelta')),
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(), resuelta_at timestamptz,
  resuelta_por uuid references auth.users(id), version integer not null default 1,
  check((estado='abierta' and resuelta_at is null and resuelta_por is null) or
        (estado='resuelta' and resuelta_at is not null and resuelta_por is not null))
);
create index campo_incidencia_abiertas on public.campo_incidencia(empresa_id,campo_id,potrero_id) where estado='abierta';

create table public.campo_tarea (
  id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresa(id),
  campo_id uuid not null references public.campo(id), potrero_id uuid references public.potrero(id),
  descripcion text not null check(length(trim(descripcion)) between 1 and 1000),
  responsable_id uuid not null references auth.users(id), vence date not null,
  estado text not null default 'pendiente' check(estado in ('pendiente','aceptada','completa')),
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(), completada_at timestamptz,
  version integer not null default 1,
  check((estado='completa')=(completada_at is not null))
);
create index campo_tarea_pendientes on public.campo_tarea(empresa_id,vence) where estado<>'completa';

create table public.wa_recorrida_sesion (
  id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresa(id),
  user_id uuid not null references auth.users(id) default auth.uid(), campo_id uuid not null references public.campo(id),
  fecha date not null, estado text not null default 'abierta' check(estado in ('abierta','pausada','cerrada')),
  borrador jsonb not null default '{"tipo":"recorrida","observaciones":[]}',
  mensajes uuid[] not null default '{}', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index wa_recorrida_una_abierta on public.wa_recorrida_sesion(user_id,empresa_id) where estado='abierta';

create table public.wa_piloto_evento (
  operacion_id uuid primary key, empresa_id uuid not null references public.empresa(id),
  actor_id uuid not null references auth.users(id) default auth.uid(),
  tipo text not null, objeto_id uuid not null, antes jsonb, despues jsonb,
  created_at timestamptz not null default now()
);
comment on table public.wa_piloto_evento is 'Auditoría append-only de correcciones, anulaciones, tareas e incidencias del piloto.';

-- Las relaciones se validan en la base además de RLS: ser miembro de dos empresas
-- no permite cruzar campo, potrero, equipo o responsable entre ellas.
create function public.wa_piloto_integridad() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare obs jsonb;
begin
  if tg_op='UPDATE' and (new.empresa_id<>old.empresa_id or new.campo_id<>old.campo_id) then
    raise exception 'No se puede cambiar la pertenencia del registro' using errcode='23514';
  end if;
  if not exists(select 1 from campo where id=new.campo_id and empresa_id=new.empresa_id) then
    raise exception 'Campo ajeno a la empresa' using errcode='23514';
  end if;
  if tg_table_name in ('campo_incidencia','campo_tarea') then
    if new.potrero_id is not null and not exists(select 1 from potrero where id=new.potrero_id and campo_id=new.campo_id and empresa_id=new.empresa_id) then
      raise exception 'Potrero ajeno al campo' using errcode='23514';
    end if;
  end if;
  if tg_table_name='campo_incidencia' then
    if tg_op='UPDATE' and (old.estado<>'abierta' or new.estado<>'resuelta' or new.resuelta_por<>auth.uid() or new.version<>old.version+1) then
      raise exception 'Transición de incidencia inválida' using errcode='23514';
    end if;
    if new.infraestructura_id is not null and not exists(select 1 from infraestructura where id=new.infraestructura_id and campo_id=new.campo_id and empresa_id=new.empresa_id) then
      raise exception 'Equipo ajeno al campo' using errcode='23514';
    end if;
  elsif tg_table_name='campo_tarea' then
    if tg_op='UPDATE' and (old.estado='completa' or new.estado not in ('aceptada','completa') or new.version<>old.version+1 or
      (new.estado='aceptada' and (old.estado<>'pendiente' or old.responsable_id<>auth.uid()))) then
      raise exception 'Transición de tarea inválida' using errcode='23514';
    end if;
    if not exists(select 1 from miembro_empresa where user_id=new.responsable_id and empresa_id=new.empresa_id) then
      raise exception 'Responsable ajeno a la empresa' using errcode='23514';
    end if;
  elsif tg_table_name='wa_recorrida_sesion' then
    if not (new.borrador @> '{"tipo":"recorrida"}'::jsonb) or
      new.borrador->>'cerrarSesion'='true' or
      (new.borrador->>'campoId') is distinct from new.campo_id::text or
      (new.borrador->>'fecha') is distinct from new.fecha::text or
      jsonb_typeof(new.borrador->'observaciones') is distinct from 'array' then
      raise exception 'Borrador de sesión inválido' using errcode='23514';
    end if;
    if jsonb_array_length(new.borrador->'observaciones')>60 then raise exception 'Demasiadas observaciones' using errcode='23514';end if;
    for obs in select jsonb_array_elements(new.borrador->'observaciones') loop
      if jsonb_typeof(obs)<>'object' or ((obs->>'campoId') is not null and obs->>'campoId'<>new.campo_id::text) then
        raise exception 'Observación de otro campo' using errcode='23514';
      end if;
      if obs->>'potreroId' is not null and not exists(select 1 from potrero where id::text=obs->>'potreroId' and campo_id=new.campo_id and empresa_id=new.empresa_id) then
        raise exception 'Potrero ajeno a la sesión' using errcode='23514';
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger wa_incidencia_integridad before insert or update on public.campo_incidencia for each row execute function public.wa_piloto_integridad();
create trigger wa_tarea_integridad before insert or update on public.campo_tarea for each row execute function public.wa_piloto_integridad();
create trigger wa_sesion_integridad before insert or update on public.wa_recorrida_sesion for each row execute function public.wa_piloto_integridad();

alter table public.campo_incidencia enable row level security;
alter table public.campo_tarea enable row level security;
alter table public.wa_recorrida_sesion enable row level security;
alter table public.wa_piloto_evento enable row level security;
create policy incidencia_leer on public.campo_incidencia for select to authenticated using(empresa_id in(select public.auth_empresa_ids()));
create policy incidencia_crear on public.campo_incidencia for insert to authenticated with check(empresa_id in(select public.auth_empresa_ids()) and created_by=auth.uid());
create policy incidencia_actualizar on public.campo_incidencia for update to authenticated using(empresa_id in(select public.auth_empresa_ids())) with check(empresa_id in(select public.auth_empresa_ids()));
create policy tarea_leer on public.campo_tarea for select to authenticated using(empresa_id in(select public.auth_empresa_ids()));
create policy tarea_crear on public.campo_tarea for insert to authenticated with check(empresa_id in(select public.auth_empresa_ids()) and created_by=auth.uid());
create policy tarea_actualizar on public.campo_tarea for update to authenticated using(empresa_id in(select public.auth_empresa_ids()) and (created_by=auth.uid() or responsable_id=auth.uid())) with check(empresa_id in(select public.auth_empresa_ids()) and (created_by=auth.uid() or responsable_id=auth.uid()));
create policy sesion_propia on public.wa_recorrida_sesion for all to authenticated using(user_id=auth.uid() and empresa_id in(select public.auth_empresa_ids())) with check(user_id=auth.uid() and empresa_id in(select public.auth_empresa_ids()));
create policy evento_leer on public.wa_piloto_evento for select to authenticated using(empresa_id in(select public.auth_empresa_ids()));
revoke all on public.campo_incidencia,public.campo_tarea,public.wa_recorrida_sesion,public.wa_piloto_evento from public,anon,authenticated;
grant select,insert on public.campo_incidencia,public.campo_tarea to authenticated;
grant update(estado,resuelta_at,resuelta_por,version) on public.campo_incidencia to authenticated;
grant update(estado,completada_at,version) on public.campo_tarea to authenticated;
grant select,insert,update on public.wa_recorrida_sesion to authenticated;
grant select on public.wa_piloto_evento to authenticated;
-- Un cliente no puede falsificar el historial. Las nuevas tablas auditan cada
-- cambio real; el servidor registra lluvia/gastos en su misma transacción.
create function public.wa_piloto_auditar() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare op uuid; accion text;
begin
  op:=coalesce(nullif(current_setting('app.wa_operacion',true),'')::uuid,gen_random_uuid());
  accion:=case when tg_table_name='campo_incidencia' then case when tg_op='INSERT' then 'incidencia' else 'resolver' end
               else case when tg_op='INSERT' then 'tarea' else 'tarea_estado' end end;
  insert into wa_piloto_evento(operacion_id,empresa_id,actor_id,tipo,objeto_id,antes,despues)
    values(op,new.empresa_id,auth.uid(),accion,new.id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;
create trigger wa_incidencia_auditar after insert or update on public.campo_incidencia for each row execute function public.wa_piloto_auditar();
create trigger wa_tarea_auditar after insert or update on public.campo_tarea for each row execute function public.wa_piloto_auditar();
revoke all on function public.wa_piloto_integridad(),public.wa_piloto_auditar() from public,anon,authenticated;

commit;
