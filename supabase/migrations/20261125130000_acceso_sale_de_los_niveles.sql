-- =====================================================================
--  Un solo ingreso: cómo entra cada persona sale de sus niveles (Lau, 25/11)
--
--  Antes el dueño elegía al invitar «en la app» o «sólo por WhatsApp», y eso no
--  se podía cambiar después: a Vera (sólo WhatsApp) no se le podía dar «Mira».
--  Ahora se decide todo en la tabla de niveles y la base deduce cómo entra:
--    · alguna sección en «Mira» o «Anota»  → usa la app (acceso = 'app');
--    · todas en «No ve» o «Avisa»          → sólo WhatsApp (acceso = 'whatsapp').
--  Así no puede quedar desparejo (alguien con «Anota» sin poder abrir la app).
--  La columna `acceso` sigue: la leen la app (la pantalla «lo tuyo va por
--  WhatsApp») y el bot (qué invitaciones reconoce al escribir). Sólo cambia
--  quién la escribe: la base, nunca el dueño. `p_acceso` queda en la firma
--  para no romper a quien la llame, pero no se usa.
--  Un cambio de acceso le llega al instante a la app abierta (tiempo real de
--  miembro_empresa, 20261120120000).
-- =====================================================================

create or replace function public.acceso_de_niveles(p_niveles jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when exists (select 1 from jsonb_each_text(coalesce(p_niveles, '{}')) e where e.value in ('ve', 'carga'))
              then 'app' else 'whatsapp' end
$$;
comment on function public.acceso_de_niveles(jsonb) is 'Cómo entra una persona según sus niveles: app si mira o anota algo; si no, sólo WhatsApp.';

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
  if not public.niveles_validos(coalesce(p_niveles, '{}')) or not public.niveles_alcanzan(coalesce(p_niveles, '{}')) then
    raise exception 'Elegí al menos una sección que va a ver o cargar.';
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
  values (v_empresa, v_celular, btrim(p_nombre), p_rol, p_niveles, public.acceso_de_niveles(p_niveles), auth.uid())
  returning token into v_token;
  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_niveles(p_user uuid, p_niveles jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_empresa uuid;
begin
  v_empresa := public.empresa_propia();
  if v_empresa is null then
    raise exception 'Sólo el dueño puede cambiar lo que ve cada uno.';
  end if;
  if not public.niveles_validos(coalesce(p_niveles, '{}')) or not public.niveles_alcanzan(coalesce(p_niveles, '{}')) then
    raise exception 'Tiene que ver o cargar al menos una sección. Para que no entre más, sacale el acceso.';
  end if;
  if not exists (select 1 from public.miembro_empresa where user_id = p_user and empresa_id = v_empresa and rol <> 'dueno') then
    raise exception 'Esa persona no está en tu empresa.';
  end if;
  -- Los niveles y cómo entra, juntos: la app abierta de esa persona se entera al instante.
  update public.miembro_empresa
     set niveles = p_niveles, acceso = public.acceso_de_niveles(p_niveles)
   where user_id = p_user and empresa_id = v_empresa;
end;
$function$;

-- Lo que ya había queda con la regla: quien tenía sólo «Avisa» en la app pasa a WhatsApp.
update public.miembro_empresa set acceso = public.acceso_de_niveles(niveles)
 where rol <> 'dueno' and niveles is not null and acceso <> public.acceso_de_niveles(niveles);
update public.invitacion set acceso = public.acceso_de_niveles(niveles)
 where aceptada_at is null and niveles is not null and acceso <> public.acceso_de_niveles(niveles);
