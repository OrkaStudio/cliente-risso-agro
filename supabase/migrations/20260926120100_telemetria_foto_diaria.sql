-- Foto diaria del score de activación (ver 20260926120000_telemetria_evento_producto).
-- Sin ella, `interno.v_activacion.activada_7d` no se puede saber después del
-- día 7: el contorno y el polígono no guardan cuándo se dibujaron.
-- 06:00 UTC = 03:00 en Argentina.

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'telemetria-foto-activacion',
  '0 6 * * *',
  $$select interno.fotografiar_activacion()$$
);

-- La primera foto, ya: las empresas nuevas quedan cubiertas desde hoy.
select interno.fotografiar_activacion();
