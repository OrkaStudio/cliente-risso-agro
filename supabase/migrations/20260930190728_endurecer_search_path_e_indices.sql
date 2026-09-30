-- Endurecimiento que marcó el asesor de Supabase (30/09). Nada cambia de
-- comportamiento: sólo fija el search_path y agrega índices que faltaban.

-- 1 · search_path fijo en los dos triggers que no lo tenían. Sin esto, quien
--     pueda crear objetos en otro schema del search_path podría interceptar
--     `campo` / `potrero`. Ambos sólo usan tablas de public y funciones nativas.
alter function public.campo_asignar_color_idx() set search_path = public;
alter function public.potrero_asignar_nombre() set search_path = public;

-- 2 · Índices de claves foráneas sin cubrir (RLS filtra por empresa_id en
--     cada consulta, y borrar un movimiento recorre labor_potrero).
create index if not exists infraestructura_empresa_id_idx on public.infraestructura (empresa_id);
create index if not exists labor_potrero_movimiento_id_idx on public.labor_potrero (movimiento_id);
create index if not exists lote_empresa_id_idx on public.lote (empresa_id);
create index if not exists lote_potrero_empresa_id_idx on public.lote_potrero (empresa_id);
create index if not exists marca_senal_empresa_id_idx on public.marca_senal (empresa_id);
