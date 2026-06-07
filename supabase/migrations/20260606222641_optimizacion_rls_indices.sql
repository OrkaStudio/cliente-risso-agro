-- =====================================================================
--  OPTIMIZACIÓN (auditoría — advisors de performance)
--
--  (a) initplan: en miembro_empresa, auth.uid() se re-evaluaba por fila.
--      Envolver en (select auth.uid()) → una vez por query.
--  (b) multiple_permissive_policies: las tablas uniformes tenían _select
--      (FOR SELECT) + _mod (FOR ALL) con CONDICIÓN IDÉNTICA → la FOR ALL ya
--      cubre el SELECT vía USING. Se elimina la _select redundante.
--      (categoria_movimiento NO entra: sus policies son distintas a
--       propósito —leer globales+propias vs modificar solo propias—.)
--  (c) índices de covering para FKs. La RLS filtra por empresa_id en TODA
--      consulta → indexarla ayuda a medida que crece y con multi-tenant.
--
--  Nota: los avisos `unused_index` se ignoran a propósito (la base no tiene
--  tráfico todavía; esos índices se usarán en producción).
-- =====================================================================

-- (a) initplan
drop policy miembro_select on miembro_empresa;
create policy miembro_select on miembro_empresa for select
  using (user_id = (select auth.uid()));

-- (b) consolidar policies en las 9 tablas uniformes (drop de la _select redundante)
do $$
declare t text;
begin
  foreach t in array array[
    'campo','establecimiento','potrero','animal','caravana',
    'recorrida','observacion_potrero','lluvia','movimiento_financiero'
  ] loop
    execute format('drop policy %1$s_select on %1$s;', t);
  end loop;
end $$;

-- (c) índices de covering para FKs (empresa_id + otros FKs señalados)
create index idx_categoria_mov_empresa   on categoria_movimiento (empresa_id);
create index idx_establecimiento_empresa on establecimiento (empresa_id);
create index idx_evento_empresa          on evento (empresa_id);
create index idx_lluvia_empresa          on lluvia (empresa_id);
create index idx_miembro_empresa_empresa on miembro_empresa (empresa_id);
create index idx_mov_empresa             on movimiento_financiero (empresa_id);
create index idx_mov_animal              on movimiento_financiero (animal_id);
create index idx_mov_potrero             on movimiento_financiero (potrero_id);
create index idx_obs_empresa             on observacion_potrero (empresa_id);
create index idx_obs_potrero             on observacion_potrero (potrero_id);
create index idx_potrero_empresa         on potrero (empresa_id);
create index idx_potrero_establecimiento on potrero (establecimiento_id);
create index idx_recorrida_empresa       on recorrida (empresa_id);
