-- Marcar una señal de recorrida como resuelta (o no).
--
-- El panel "Para atender en el campo" deriva avisos de la ÚLTIMA observación de
-- cada potrero (agua seca, pasto pelado, eléctrico cortado…). Hasta ahora un
-- aviso vivía hasta que otra recorrida lo pisara o caducara a los 30 días: seguía
-- gritando aunque el productor ya lo hubiera arreglado, y no había forma de
-- declararlo. Esta tabla le da esa forma.
--
-- EL ANCLAJE ES A LA OBSERVACIÓN, NO AL POTRERO. Es la decisión que hace que esto
-- funcione: si la marca colgara de (potrero, tipo), marcar "resuelto" apagaría la
-- alarma PARA SIEMPRE — una recorrida futura que vuelva a ver el agua seca no
-- levantaría nada. Anclada a `observacion_id`, la observación nueva tiene otro id,
-- no hay marca que la tape y el aviso REAPARECE solo.
-- (Es el anclaje opuesto al de los recordatorios del productor, a propósito: un
-- recordatorio tiene que sobrevivir a recorridas nuevas; una resolución no puede.)
--
-- Append-only, como `evento`: marcar de nuevo agrega una fila, no pisa la anterior.
-- Vale el historial "lo revisé el martes y el jueves y seguía igual".
--
-- Additiva: no toca ninguna tabla ni función existente.
-- Tarea: clientes/risso-agro/tareas/TASK-058-2026-08-19

-- ===== Tipos =====

-- Los siete que hoy produce el panel. Si mañana la recorrida observa algo nuevo,
-- se suma acá y en ACCION_POR_SENAL del front.
create type tipo_senal as enum (
  'agua',
  'pasto',
  'electrico',
  'cultivo',
  'conteo',
  'tratamiento',
  'novedad'
);

-- "sigue" no es lo mismo que no marcar nada: dice que el productor FUE, MIRÓ y
-- el problema continúa. Eso es información, y por eso se guarda.
create type estado_marca as enum ('resuelto', 'sigue');

-- ===== Tabla =====

create table marca_senal (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresa(id) on delete cascade,
  potrero_id     uuid not null references potrero(id) on delete cascade,

  -- La observación que estaba vigente cuando se marcó. Es el corazón de todo:
  -- ver el comentario de arriba.
  observacion_id uuid not null references observacion_potrero(id) on delete cascade,

  tipo_senal     tipo_senal not null,
  estado         estado_marca not null,
  nota           text,

  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

comment on table marca_senal is
  'Qué declaró el productor sobre una señal que vio la recorrida: resuelta o sigue igual. Anclada a la observación vigente, para que una recorrida posterior que vuelva a ver el problema levante el aviso de nuevo. La recorrida OBSERVA, las labores DECLARAN, esto RESUELVE.';

-- El panel pregunta "¿qué marcas hay para estas observaciones?" y la página del
-- potrero "¿qué se marcó acá?". Un índice para cada una.
create index marca_senal_observacion_idx on marca_senal (observacion_id, tipo_senal);
create index marca_senal_potrero_idx on marca_senal (potrero_id, created_at desc);

-- ===== RLS: mismo patrón uniforme que el resto =====

alter table marca_senal enable row level security;

create policy marca_senal_select on marca_senal for select
  using (empresa_id in (select auth_empresa_ids()));

create policy marca_senal_mod on marca_senal for all
  using (empresa_id in (select auth_empresa_ids()))
  with check (empresa_id in (select auth_empresa_ids()));

-- ===== Marcar una señal =====
--
-- SECURITY INVOKER (corre con la RLS del usuario, como el resto de las escrituras
-- del repo). Nace con TODOS los parámetros que va a necesitar: en Postgres la
-- identidad de una función incluye sus argumentos, así que sumarle uno después
-- crea una sobrecarga y PostgREST deja de poder elegir (PGRST203).
-- Ver lecciones/2026-07-30-risso-agro-rpc-sobrecarga-postgrest.

create function marcar_senal(
  p_empresa_id     uuid,
  p_potrero_id     uuid,
  p_observacion_id uuid,
  p_tipo           tipo_senal,
  p_estado         estado_marca,
  p_nota           text default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  -- Que la observación sea de ese potrero y de esa empresa. La RLS ya lo
  -- impediría al insertar, pero un mensaje claro vale más que un error de policy.
  if not exists (
    select 1
    from observacion_potrero o
    join potrero p on p.id = o.potrero_id
    where o.id = p_observacion_id
      and o.potrero_id = p_potrero_id
      and p.empresa_id = p_empresa_id
  ) then
    raise exception 'La observación no existe o no es de esta empresa';
  end if;

  insert into marca_senal (
    empresa_id, potrero_id, observacion_id, tipo_senal, estado, nota
  ) values (
    p_empresa_id, p_potrero_id, p_observacion_id, p_tipo, p_estado, nullif(btrim(p_nota), '')
  )
  returning id into v_id;

  return v_id;
end;
$function$;
