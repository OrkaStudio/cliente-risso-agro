import { execSync } from 'node:child_process'

// Primero el mapa (Lau, 30/10): un campo de «E2E Pruebas» sin borde o con un
// potrero sin dibujar traba toda la app. Los tests dejan la empresa completa:
// al arrancar se borran los campos a medias de corridas viejas, y cada test que
// crea uno pendiente lo borra al terminar. Sólo Supabase local.

const EMPRESA = 'e2e00000-0000-4000-8000-0000000000e1'
const BASE = 'e2e00000-0000-4000-8000-0000000000c1'

function sql(q: string): string {
  return execSync(`docker exec -i supabase_db_cliente-risso-agro psql -U postgres -tAq`, { input: q }).toString()
}

/** El borde y el 1A del campo base: un cuadrado de ~1 km y su mitad oeste (como en supabase/seed.sql). */
export function completarCampoBase() {
  sql(`
    update public.campo set contorno = '[[-35.9,-59.2],[-35.9,-59.189],[-35.909,-59.189],[-35.909,-59.2]]'::jsonb
      where id = '${BASE}' and contorno is null;
    update public.potrero set poligono = '[[-35.9,-59.2],[-35.9,-59.1945],[-35.909,-59.1945],[-35.909,-59.2]]'::jsonb
      where campo_id = '${BASE}' and nombre = '1A' and poligono is null;
  `)
}

/** Borra los campos de prueba que quedaron sin terminar (sus animales quedan sin potrero). */
export function borrarCamposPendientes() {
  sql(`
    delete from public.campo c
    where c.empresa_id = '${EMPRESA}' and c.id <> '${BASE}'
      and (c.contorno is null or not exists (select 1 from public.potrero p where p.campo_id = c.id)
           or exists (select 1 from public.potrero p where p.campo_id = c.id and p.poligono is null));
  `)
}

/** Borra un campo de prueba por su nombre exacto. */
export function borrarCampo(nombre: string) {
  sql(`delete from public.campo where empresa_id = '${EMPRESA}' and nombre = '${nombre.replace(/'/g, "''")}';`)
}

/**
 * Animales sin caravana en el 1A del campo base, para los tests que se la ponen
 * (planilla, ficha). Cada test se siembra los suyos: no dependen de que otro test
 * los haya dejado (con las corridas se agotaban y fallaban).
 */
export function sembrarSinCaravana(categoria: 'ternero' | 'toro', cuantos = 1) {
  sql(`
    insert into public.animal (empresa_id, categoria, estado, origen, potrero_id)
    select '${EMPRESA}', '${categoria}'::public.categoria_animal, 'activo', 'e2e', p.id
    from public.potrero p, generate_series(1, ${cuantos})
    where p.campo_id = '${BASE}' and p.nombre = '1A';
  `)
}
