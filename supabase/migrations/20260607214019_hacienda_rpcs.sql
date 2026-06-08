-- =====================================================================
--  RPCs de Hacienda — operaciones multi-tabla ATÓMICAS
--
--  Sin servidor, el cliente no puede hacer transacciones multi-tabla. Estas
--  funciones SECURITY INVOKER corren con la RLS del usuario (todos los
--  insert/update se validan contra empresa_id IN auth_empresa_ids()), y todo
--  el cuerpo es atómico: si algo falla, se revierte entero.
--
--    · crear_animal      — alta de animal + caravana + evento 'alta'
--    · cambiar_caravana  — cierra la vigente + abre la nueva + evento
--    · dar_baja_animal   — estado vendido/muerto + evento 'baja'
-- =====================================================================

-- ---------------------------------------------------------------------
-- crear_animal: reemplaza la secuencia de inserts del cliente (sin el
-- workaround de "compensar borrando" si falla la caravana).
-- ---------------------------------------------------------------------
create or replace function crear_animal(
  p_empresa_id       uuid,
  p_categoria        categoria_animal,
  p_numero_rfid      text,
  p_numero_visual    text default null,
  p_potrero_id       uuid default null,
  p_origen           text default null,
  p_fecha_nacimiento date default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_animal_id uuid;
  v_rfid text := trim(p_numero_rfid);
begin
  insert into animal (empresa_id, categoria, potrero_id, origen, fecha_nacimiento)
  values (p_empresa_id, p_categoria, p_potrero_id, nullif(trim(p_origen), ''), p_fecha_nacimiento)
  returning id into v_animal_id;

  insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual, vigente)
  values (p_empresa_id, v_animal_id, v_rfid, nullif(trim(p_numero_visual), ''), true);

  insert into evento (empresa_id, animal_id, tipo, datos)
  values (p_empresa_id, v_animal_id, 'alta', jsonb_build_object('caravana', v_rfid));

  return v_animal_id;
exception
  when unique_violation then
    raise exception 'La caravana % ya está registrada', v_rfid;
end $$;


-- ---------------------------------------------------------------------
-- cambiar_caravana: conserva la identidad del animal (D15). La empresa se
-- deriva del animal (bajo RLS: si no es tuyo, no lo ve → "no encontrado").
-- ---------------------------------------------------------------------
create or replace function cambiar_caravana(
  p_animal_id     uuid,
  p_nuevo_rfid    text,
  p_nueva_visual  text default null,
  p_motivo        text default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_rfid text := trim(p_nuevo_rfid);
begin
  select empresa_id into v_empresa_id from animal where id = p_animal_id;
  if v_empresa_id is null then
    raise exception 'Animal no encontrado';
  end if;

  -- cerrar la vigente (si hay) antes de abrir la nueva (índice único de vigencia)
  update caravana
     set vigente = false, fecha_baja = current_date,
         motivo_baja = coalesce(nullif(trim(p_motivo), ''), 'cambio')
   where animal_id = p_animal_id and vigente;

  insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual, vigente)
  values (v_empresa_id, p_animal_id, v_rfid, nullif(trim(p_nueva_visual), ''), true);

  insert into evento (empresa_id, animal_id, tipo, nota, datos)
  values (v_empresa_id, p_animal_id, 'cambio_caravana',
          nullif(trim(p_motivo), ''), jsonb_build_object('nuevo', v_rfid));
exception
  when unique_violation then
    raise exception 'La caravana % ya está registrada', v_rfid;
end $$;


-- ---------------------------------------------------------------------
-- dar_baja_animal: archiva (vendido | muerto) + deja el evento en el historial.
-- ---------------------------------------------------------------------
create or replace function dar_baja_animal(
  p_animal_id uuid,
  p_estado    estado_animal,
  p_motivo    text default null,
  p_fecha     date default current_date
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id uuid;
begin
  if p_estado = 'activo' then
    raise exception 'Estado inválido para baja (usá vendido o muerto)';
  end if;

  select empresa_id into v_empresa_id from animal where id = p_animal_id;
  if v_empresa_id is null then
    raise exception 'Animal no encontrado';
  end if;

  update animal set estado = p_estado, updated_at = now() where id = p_animal_id;

  insert into evento (empresa_id, animal_id, tipo, fecha, nota, datos)
  values (v_empresa_id, p_animal_id, 'baja', p_fecha,
          nullif(trim(p_motivo), ''), jsonb_build_object('estado', p_estado));
end $$;
