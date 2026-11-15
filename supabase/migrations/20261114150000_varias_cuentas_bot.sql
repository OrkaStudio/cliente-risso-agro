-- El bot con una persona en varias cuentas (Lau, 14/11; spec del cerebro
-- clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona, «Una
-- persona en varios campos»). Depende de 20261114140000_varias_cuentas (app).
--
-- · wa_vinculo.empresa_id pasa a ser la cuenta de la conversación (lo que está
--   abierto). Si esa cuenta se borra, el número no pierde el vínculo con las
--   otras: queda sin cuenta y el bot la repone con una suya.
-- · Un mensaje de quien está en varias cuentas se registra sin cuenta hasta que
--   dice de cuál es (wa_mensaje.empresa_id ya admite null).
-- · El resumen semanal es por cuenta: quien atiende varios campos lo activa en
--   cada uno y cada envío es de una sola.
-- · Las invitaciones «Sólo por WhatsApp» a quien ya usa el bot se ofrecen en el
--   chat como mucho una vez por día (preguntada_at).

alter table public.wa_vinculo alter column empresa_id drop not null;
alter table public.wa_vinculo drop constraint wa_vinculo_empresa_id_fkey;
alter table public.wa_vinculo add constraint wa_vinculo_empresa_id_fkey
  foreign key (empresa_id) references public.empresa(id) on delete set null;

alter table interno.wa_resumen_config add column empresa_id uuid references public.empresa(id) on delete cascade;
update interno.wa_resumen_config c set empresa_id = v.empresa_id from public.wa_vinculo v where v.id = c.vinculo_id;
delete from interno.wa_resumen_config where empresa_id is null;
alter table interno.wa_resumen_config alter column empresa_id set not null;
alter table interno.wa_resumen_config drop constraint wa_resumen_config_pkey;
alter table interno.wa_resumen_config add primary key (vinculo_id, empresa_id);

alter table interno.wa_resumen_envio drop constraint wa_resumen_envio_vinculo_id_desde_hasta_key;
alter table interno.wa_resumen_envio add constraint wa_resumen_envio_un_envio_por_cuenta unique (vinculo_id, empresa_id, desde, hasta);

alter table public.invitacion add column if not exists preguntada_at timestamptz;
