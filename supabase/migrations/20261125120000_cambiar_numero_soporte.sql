-- =====================================================================
--  Cambiar el número de alguien: lo hace el equipo, no la persona (Lau, 25/11)
--
--  El número es quién sos en la app y en el bot. Cambiarlo desde adentro dejaba
--  el número viejo hablando con el bot como esa persona (wa_vinculo no se
--  enteraba) y el nuevo sin poder vincularse. Ahora la persona escribe al
--  WhatsApp de soporte, alguien del equipo confirma que es ella y corre:
--
--    select interno.cambiar_numero_de('+54 9 2240 00-0004', '+54 9 2241 55-8820');
--
--  (el viejo es el que dice su mensaje; el nuevo, desde el que escribió). Con el
--  id de la cuenta: select interno.cambiar_numero('<user_id>', '5492241558820');
--
--  Cambia, en una transacción: el número de la cuenta (con el que entra), su
--  identidad de teléfono, el celular de sus datos y el número del bot. Lo que
--  estaba esperando respuesta en el chat viejo se descarta.
--  Sólo lo corre el rol de servicio (psql como postgres): no es de la app.
-- =====================================================================

create or replace function interno.cambiar_numero(p_user uuid, p_nuevo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nuevo text := regexp_replace(coalesce(p_nuevo, ''), '\D', '', 'g');
  v_viejo text;
begin
  -- Celular argentino como lo guarda Auth: 549 + característica + número, sin el «+».
  if v_nuevo !~ '^549[1-9][0-9]{9}$' then
    raise exception 'El número tiene que ser 549 + característica + número (13 dígitos), sin el 0 ni el 15: %', p_nuevo;
  end if;

  select phone into v_viejo from auth.users where id = p_user for update;
  if not found then
    raise exception 'No hay ninguna cuenta con id %', p_user;
  end if;
  if v_viejo = v_nuevo then
    raise exception 'Ya entra con el %', v_nuevo;
  end if;
  if exists (select 1 from auth.users where phone = v_nuevo and id <> p_user) then
    raise exception 'El % ya es de otra cuenta', v_nuevo;
  end if;

  update auth.users
     set phone = v_nuevo,
         phone_confirmed_at = now(),
         phone_change = '',
         phone_change_token = '',
         phone_change_sent_at = null,
         raw_user_meta_data = case when raw_user_meta_data ? 'celular'
                                   then jsonb_set(raw_user_meta_data, '{celular}', to_jsonb('+' || v_nuevo))
                                   else raw_user_meta_data end,
         updated_at = now()
   where id = p_user;

  update auth.identities
     set identity_data = jsonb_set(identity_data, '{phone}', to_jsonb(v_nuevo))
                         || case when identity_data ? 'celular' then jsonb_build_object('celular', '+' || v_nuevo) else '{}'::jsonb end,
         updated_at = now()
   where user_id = p_user and provider = 'phone';

  -- El bot (wa_vinculo vive en la base del bot; si no está, no hay nada que mover).
  if to_regclass('public.wa_vinculo') is not null then
    if exists (select 1 from public.wa_vinculo where telefono = v_nuevo and user_id <> p_user) then
      raise exception 'El % ya está vinculado al bot con otra cuenta', v_nuevo;
    end if;
    -- Un vínculo viejo e inactivo de esta persona con el número nuevo ocuparía el único.
    delete from public.wa_vinculo where telefono = v_nuevo and user_id = p_user and not activo;
    update public.wa_vinculo
       set telefono = v_nuevo, pendiente = null, pendiente_at = null
     where user_id = p_user and activo;
  end if;

  return format('Listo: %s entra con el %s (antes %s)', p_user, v_nuevo, coalesce(v_viejo, 'sin número'));
end;
$$;

revoke all on function interno.cambiar_numero(uuid, text) from public, anon, authenticated;
comment on function interno.cambiar_numero(uuid, text) is
  'Soporte: cambia el número de una persona en la cuenta y en el bot, junto. Sólo rol de servicio.';

-- Lo que tiene a mano quien atiende: el número viejo (lo dice el mensaje) y el nuevo.
create or replace function interno.cambiar_numero_de(p_viejo text, p_nuevo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where phone = regexp_replace(coalesce(p_viejo, ''), '\D', '', 'g');
  if not found then
    raise exception 'Nadie entra con el %', p_viejo;
  end if;
  return interno.cambiar_numero(v_user, p_nuevo);
end;
$$;

revoke all on function interno.cambiar_numero_de(text, text) from public, anon, authenticated;
comment on function interno.cambiar_numero_de(text, text) is
  'Soporte: como cambiar_numero, pero con el número viejo en vez del id. Sólo rol de servicio.';
