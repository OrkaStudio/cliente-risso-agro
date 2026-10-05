# CLAUDE.md — Risso Agro

> Instrucciones de navegación para Claude Code en este repo.

## Contexto del proyecto

- **Cliente:** Risso Agro (productor agropecuario — ganadería de cría + agricultura).
- **Vertical:** agropecuaria.
- **Producto:** app **única** agnóstica de dispositivo — web de escritorio (Modo Oficina) + iOS/Android nativo vía **Capacitor** (Modo Campo, offline-first). Hacienda por caravana RFID, recorridas por potrero, contable, planificación. Multi-cliente desde el día 1 (`empresa_id`). ~500 cabezas.
- **Cerebro:** `orka-brain/clientes/risso-agro/`.

## Stack — NO es el boilerplate Next.js de Orka

Este vertical usa un stack propio, decidido y documentado en `orka-brain/decisiones/agro-stack-vite-spa.md` (hard-to-revert — leerla antes de proponer cambios estructurales).

```
- Vite + React 19 + TypeScript strict
- @supabase/supabase-js (DB + Auth; publishable key en cliente)
- TanStack Query (capa de datos)
- React Router (routing SPA)
- Tailwind v4 + shadcn/ui
- Zod (validación de UX)
- Capacitor (shell nativo iOS/Android; webDir = dist)
- Deploy web: Vercel (estático)
```

**Por qué no Next.js:** Capacitor empaqueta un bundle estático (sin servidor Node) → `output:'export'` mataría Server Actions/SSR, todo el valor del boilerplate. Ver la decisión.

## Invariantes de seguridad — NO negociables

Al no haber servidor (Server Actions), el cliente habla directo con Postgres:

1. **RLS es LA seguridad.** Toda tabla con RLS habilitada, scopeada por `empresa_id` vía helper `SECURITY DEFINER` (`auth_empresa_ids()`). El **`service_role` key JAMÁS** en el bundle del cliente ni en ningún módulo de `src/`. Sólo en Edge Functions / scripts server-side.
2. **Las invariantes duras viven en Postgres, no en Zod.** Zod valida UX; un cliente buggy lo saltea. Duro = montos `numeric` + checks, aislamiento multi-tenant, append-only del historial de eventos, identidad de caravana al reemplazarla. **Advisory (nunca bloquea):** cruce de RENSPA, transición de categoría del animal, sugerencias de planificación (D12/D13: "sugiere, no impone").
3. **Tras cada migración:** regenerar tipos (`mcp Supabase generate_typescript_types`) → `src/lib/supabase/types.ts` → commitear junto a la migración.

## Reglas de este repo

- No aplicar migraciones SQL sin confirmación explícita del usuario.
- No tocar `src/lib/supabase/`, auth, ni RLS sin riesgo alto clasificado en `/intake`.
- No agregar deps fuera del stack de arriba sin justificar.
- Verificar con **`pnpm build`** (no sólo `tsc`) antes de pushear — el build real es el que manda.
- No commitear sin `/post` para registrar en el cerebro.
- **Cadena de altura (mordió cuatro veces):** `html/body/#root` son `height:100%` + `overflow:hidden`, así que el scroll vive SIEMPRE en un contenedor interno. Todo contenedor con `overflow-y-auto` dentro de `h-full` necesita la fila/ítem acotado — `grid-rows-[minmax(0,1fr)]` en grids, `min-h-0` en ítems flex que scrollean, `shrink-0` en los que no deben encogerse. Y verificar con `scrollHeight` vs `clientHeight` en Playwright, no a ojo: el contenido recortado en silencio se ve "bien". Lecciones: `2026-07-02-…scroll-mobile-shell-flexbox`, `2026-09-01-…flex-shrink-recorta-en-silencio`, TASK-059.

## Pendientes técnicos conocidos (no perder)

- **Persistencia de sesión en Capacitor:** hoy la sesión Supabase usa localStorage (web). En el shell nativo conviene un storage seguro nativo — pendiente al armar la PoC en device.
- **Code-splitting:** el bundle inicial supera 500 kB (warning de Vite). Dividir con `import()` dinámico cuando crezca.
- **Build iOS:** requiere macOS/Xcode o CI con runner Mac (Lau desarrolla en Windows). Las plataformas `ios/` y `android/` no están agregadas todavía (gitignoreadas).
- **Operaciones de Hacienda = RPCs transaccionales** (`SECURITY INVOKER`, RLS del usuario): `crear_animal`, `cambiar_caravana`, `dar_baja_animal`. Las multi-tabla (alta, cambio de caravana, baja) son atómicas. `registrar_evento` es un insert directo (append-only). Migración `hacienda_rpcs`.
- **Verificación E2E:** `pnpm test:e2e:todo` (Playwright) corre contra el **Supabase local**, nunca contra prod. La cuenta de prueba sale de `supabase/seed.sql` (empresa «E2E Pruebas», campo «E2E Campo base» con el 1A) y entra con el celular `+54 9 2240 00-0001` y el código fijo de `[auth.sms.test_otp]`, que sólo existe en local. Manga y sin señal corren contra `pnpm build:local` (build apuntado a la base local).
  > ⚠️ **Los tests NO corren contra "Risso Agro"** ni contra prod: desde el 06/08 esa empresa es del productor (`rissodaniel23@gmail.com`). Ver [[TASK-056]].
- **Acceso sin contraseñas (rediseño Tropero):** se entra con el celular y un código de 6 números. Supabase Auth genera el código (login por teléfono) y el hook «Send SMS» llama a `supabase/functions/enviar-codigo`, que lo manda por WhatsApp con la plantilla de autenticación de Meta. Para activarlo en prod hace falta: la plantilla aprobada en Meta, los secrets `SEND_SMS_HOOK_SECRETS`, `WA_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_PLANTILLA_CODIGO`, el hook en Auth → Hooks, el proveedor de teléfono prendido con «SMS OTP Expiry» en 600 s, y pasarle el celular a los usuarios que hoy entran con mail.
- **Auth — leaked password protection:** desactivado (advisor de Supabase). Activar en el dashboard (Auth → Password security, HaveIBeenPwned). Toggle de consola, no código.

## Desarrollo local (sin tocar prod)

Hace falta OrbStack (o Docker) y la CLI de Supabase (`brew install supabase/tap/supabase`).

```
supabase start          # base, login y funciones en la Mac; aplica las migraciones y seed.sql
pnpm dev                # la app apunta a la base local por .env.development.local
supabase db reset       # vuelve la base local a cero (migraciones + seed)
```

- `.env.development.local` y `.env.localdb.local` (ignorados) tienen `VITE_SUPABASE_URL=http://127.0.0.1:54321` y la clave pública local que imprime `supabase status`. `.env.local` sigue apuntando a prod para `pnpm build`.
- `supabase/.env` y `supabase/functions/.env` (ignorados) llevan `SEND_SMS_HOOK_SECRETS=v1,whsec_…` (cualquier secreto de 32 bytes en base64). Sin `WA_*`, el código para entrar se ve en `docker logs supabase_edge_runtime_cliente-risso-agro`.
- `/estilo` (sólo en dev) muestra los componentes de Tropero para compararlos con la página 34 del Figma.

## Flujo de trabajo

```
/intake (desde orka-brain) → trabajar → pnpm build → /post → commit repo → commit orka-brain
```

Cada tarea tiene su registro en `orka-brain/clientes/risso-agro/tareas/`.

## Commits

Formato: `[tipo]([scope]): descripción corta`

Ejemplos:
- `feat(hacienda): alta de animal con caravana manual`
- `feat(db): migración inicial multi-tenant + RLS`
- `fix(auth): persistir sesión tras refresh`
