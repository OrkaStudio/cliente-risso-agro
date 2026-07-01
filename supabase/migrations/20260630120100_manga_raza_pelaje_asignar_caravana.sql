-- =====================================================================
--  Manga v1 — raza/pelaje + RPC asignar_caravana (primera asignación)
--
--  La carga masiva (crear_animales_masivo) deja animales SIN caravana. La
--  manga los individualiza de a uno: les pone la caravana vigente y datos
--  del animal. Mismo patrón que el resto de Hacienda: SECURITY INVOKER
--  (todo bajo la RLS del usuario), cuerpo atómico.
--
--  Invariantes (duras, ya en el schema):
--    · una sola caravana vigente por animal (uq_caravana_vigente_por_animal)
--    · RFID único por empresa            (uq_caravana_rfid_empresa)
--  El sexo es columna GENERADA desde categoria → confirmar/ajustar la
--  categoría reacomoda el sexo solo (no se setea aparte).
-- =====================================================================

-- Datos individuales que se capturan en la manga (additivo, nullable).
alter table animal add column if not exists raza   text;
alter table animal add column if not exists pelaje text;

-- ---------------------------------------------------------------------
-- asignar_caravana: PRIMERA caravana de un animal sin vigente + datos.
-- (El re-taggeo de un animal ya caravaneado es cambiar_caravana.)
-- ---------------------------------------------------------------------
create or replace function asignar_caravana(
  p_animal_id     uuid,
  p_numero_rfid   text,
  p_numero_visual text             default null,
  p_categoria     categoria_animal default null,
  p_raza          text             default null,
  p_pelaje        text             default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_rfid       text := trim(p_numero_rfid);
begin
  if v_rfid is null or v_rfid = '' then
    raise exception 'Falta el RFID';
  end if;

  -- empresa derivada del animal (bajo RLS: si no es tuyo, no lo ve → null)
  select empresa_id into v_empresa_id from animal where id = p_animal_id;
  if v_empresa_id is null then
    raise exception 'Animal no encontrado';
  end if;

  -- primera asignación: no debe existir ya una caravana vigente
  if exists (select 1 from caravana where animal_id = p_animal_id and vigente) then
    raise exception 'El animal ya tiene una caravana vigente (usá cambiar caravana)';
  end if;

  insert into caravana (empresa_id, animal_id, numero_rfid, numero_visual, vigente)
  values (v_empresa_id, p_animal_id, v_rfid, nullif(trim(p_numero_visual), ''), true);

  -- datos del animal: categoría (→ sexo generado) + raza/pelaje si vinieron
  update animal set
    categoria  = coalesce(p_categoria, categoria),
    raza       = coalesce(nullif(trim(p_raza), ''),   raza),
    pelaje     = coalesce(nullif(trim(p_pelaje), ''), pelaje),
    updated_at = now()
  where id = p_animal_id;

  insert into evento (empresa_id, animal_id, tipo, datos)
  values (v_empresa_id, p_animal_id, 'caravana_asignada',
          jsonb_build_object(
            'rfid',   v_rfid,
            'visual', nullif(trim(p_numero_visual), ''),
            'raza',   nullif(trim(p_raza), ''),
            'pelaje', nullif(trim(p_pelaje), '')
          ));
exception
  when unique_violation then
    -- choca uq_caravana_rfid_empresa (RFID ya usado en la empresa)
    raise exception 'La caravana % ya está registrada', v_rfid;
end $$;
