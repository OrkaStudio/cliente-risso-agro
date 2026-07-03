-- =====================================================================
--  categoria_animal: agrega Ovino y Equino (antes solo bovino).
--
--  Va en migración APARTE de la que recrea la columna generada `sexo`
--  porque `ALTER TYPE ... ADD VALUE` no se puede USAR (referenciar el
--  valor nuevo) en la misma transacción donde se agrega. Acá solo se
--  agregan; el sexo se mapea en 20260703120100.
--
--  Aplicada a prod vía Supabase MCP el 2026-07-03.
-- =====================================================================
alter type categoria_animal add value if not exists 'oveja';
alter type categoria_animal add value if not exists 'carnero';
alter type categoria_animal add value if not exists 'cordero';
alter type categoria_animal add value if not exists 'cordera';
alter type categoria_animal add value if not exists 'yegua';
alter type categoria_animal add value if not exists 'padrillo';
alter type categoria_animal add value if not exists 'potrillo';
alter type categoria_animal add value if not exists 'potranca';
