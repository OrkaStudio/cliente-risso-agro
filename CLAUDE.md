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

## Pendientes técnicos conocidos (no perder)

- **Persistencia de sesión en Capacitor:** hoy la sesión Supabase usa localStorage (web). En el shell nativo conviene un storage seguro nativo — pendiente al armar la PoC en device.
- **Code-splitting:** el bundle inicial supera 500 kB (warning de Vite). Dividir con `import()` dinámico cuando crezca.
- **Build iOS:** requiere macOS/Xcode o CI con runner Mac (Lau desarrolla en Windows). Las plataformas `ios/` y `android/` no están agregadas todavía (gitignoreadas).
- **Alta de animal transaccional:** hoy `crearAnimal` (`src/features/hacienda/api.ts`) hace inserts secuenciales (animal → caravana → evento) con pre-check de RFID + compensación si la caravana falla. Aceptable para single-user. Hardening para multi-usuario: mover a una RPC Postgres `crear_animal` (SECURITY INVOKER) que lo haga en una transacción.
- **Verificación E2E:** golden path verificado a nivel datos (RLS + vistas) **y** en navegador real (`pnpm test:e2e`, Playwright — login → alta → ficha → stock). Credenciales seed: `orka.arg@gmail.com` / `RissoAgro.2026` (empresa "Risso Agro", campo "Don Gilberto" con 3 potreros). El test toma las credenciales de `E2E_EMAIL`/`E2E_PASSWORD`.
- **Auth — leaked password protection:** desactivado (advisor de Supabase). Activar en el dashboard (Auth → Password security, HaveIBeenPwned). Toggle de consola, no código.

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
