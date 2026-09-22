-- Guía vista: qué momentos del asistente ya vio cada usuario (TASK-063, la
-- llegada después del onboarding).
--
-- Additiva: tabla nueva, nada existente cambia.
--
-- Por qué en la DB y no en localStorage (como venía desde TASK-043): el
-- recibimiento tiene que aparecer UNA vez por persona, no una vez por
-- navegador — el productor se registra en el teléfono y abre la compu al
-- otro día. Y "quién vio qué y cuándo" queda consultable (se cruza con la
-- telemetría de onboarding cuando exista).
--
-- Por qué filas (user_id, clave) y no un jsonb por usuario: cada marca es un
-- upsert sin leer-modificar-escribir, y una query responde "cuántos vieron
-- el recorrido de Hacienda".
--
-- Es del USUARIO, no de la empresa: no lleva empresa_id ni pasa por
-- auth_empresa_ids(). Misma forma que miembro_empresa (FK a auth.users,
-- policy con (select auth.uid()) para que el planner la evalúe una vez).

create table guia_vista (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  -- 'recibimiento' | 'recorrido.inicio' | 'recorrido.hacienda' |
  -- 'recorrido.campos' | 'recorrido.agenda' | 'recorrido.analitica'
  clave        text        not null,
  visto_at     timestamptz not null default now(),
  -- Del gate por viewport que ya existe en la app (use-is-mobile).
  dispositivo  text        check (dispositivo in ('movil', 'escritorio')),
  primary key (user_id, clave)
);

comment on table guia_vista is
  'Momentos del asistente ya vistos por cada usuario (recibimiento, recorridos por sección). Una fila por usuario y clave; ver src/features/guia/guia-store.ts.';
comment on column guia_vista.clave is
  'recibimiento | recorrido.<sección de Oficina>. Vocabulario cerrado en guia-store.ts.';

alter table guia_vista enable row level security;

-- Cada usuario ve y escribe sólo lo suyo. Sin policy para anon.
create policy guia_vista_own on guia_vista for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Backfill: quien ya tenía una empresa antes de esta migración no recibe la
-- bienvenida (Daniel, Lau, Fran, Orka Pruebas): el recibimiento habla de "lo
-- que acabás de cargar" y para ellos no aplica. Los recorridos no se
-- backfillean — se ofrecen con un chip, sin velo encima, y es inofensivo.
insert into guia_vista (user_id, clave, visto_at)
select distinct user_id, 'recibimiento', now()
from miembro_empresa
on conflict do nothing;
