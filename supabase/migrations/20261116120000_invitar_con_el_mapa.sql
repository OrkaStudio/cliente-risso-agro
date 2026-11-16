-- Primero el mapa, también para invitar (Lau, 16/11). El aha del onboarding y
-- del tutorial es ver el campo con sus potreros: hasta que el dueño no los
-- dibuja, no suma gente (encargados, veterinarios) que llegaría a una cuenta
-- sin mapa. La app lo dice antes (Configuración → Personas); la base lo hace
-- cumplir. Necesario, no suficiente: que cada potrero caiga adentro del borde
-- lo revisa la app.

CREATE OR REPLACE FUNCTION public.crear_invitacion(p_celular text, p_nombre text, p_rol text, p_niveles jsonb, p_acceso text DEFAULT 'app'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
  v_celular text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_token   text;
begin
  v_empresa := public.empresa_propia();
  if v_empresa is null then
    raise exception 'Sólo el dueño de la empresa puede invitar.';
  end if;
  -- Primero el mapa (Lau, 16/11): sin el campo y sus potreros dibujados no se suma gente.
  if not exists (select 1 from public.campo where empresa_id = v_empresa)
     or exists (select 1 from public.campo where empresa_id = v_empresa and contorno is null)
     or exists (select 1 from public.potrero where empresa_id = v_empresa and poligono is null) then
    raise exception 'Primero terminá el mapa: el borde de tus campos y sus potreros. Después sumás a tu gente.';
  end if;
  if coalesce(p_acceso, '') not in ('app', 'whatsapp') then
    raise exception 'Elegí cómo va a usar Troppero: en la app o sólo por WhatsApp.';
  end if;
  if not public.niveles_validos(coalesce(p_niveles, '{}')) or not public.niveles_alcanzan(coalesce(p_niveles, '{}')) then
    raise exception 'Elegí al menos una sección que va a ver o cargar.';
  end if;
  if not public.niveles_para_acceso(p_niveles, p_acceso) then
    raise exception 'Por WhatsApp sólo se manda: en cada sección, «No ve» o «Solo manda».';
  end if;
  -- Acepta el número local (10 dígitos) o con 54 / 549 adelante.
  if v_celular ~ '^\d{10}$' then v_celular := '549' || v_celular;
  elsif v_celular ~ '^54\d{10}$' then v_celular := '549' || right(v_celular, 10);
  end if;
  if v_celular !~ '^549\d{10}$' then
    raise exception 'El celular tiene que ser argentino, con la característica.';
  end if;
  -- Ya está en la cuenta (también el dueño mismo): no se lo invita de nuevo.
  if exists (select 1 from public.miembro_empresa m join auth.users u on u.id = m.user_id
             where m.empresa_id = v_empresa and u.phone = v_celular) then
    raise exception 'Esa persona ya está en tu cuenta. Para cambiar lo que ve, tocala en la lista.';
  end if;
  insert into public.invitacion (empresa_id, celular, nombre, rol, niveles, acceso, invitado_por)
  values (v_empresa, v_celular, btrim(p_nombre), p_rol, p_niveles, p_acceso, auth.uid())
  returning token into v_token;
  return v_token;
end;
$function$;
