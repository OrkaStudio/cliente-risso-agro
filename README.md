# Risso Agro — Plataforma de gestión de campo

App **única** agnóstica de dispositivo (web de escritorio + iOS/Android vía Capacitor) para gestión agropecuaria: hacienda por caravana RFID, recorridas por potrero, contable y planificación. Multi-cliente desde el día 1.

Cliente del vertical **agropecuaria** de Orka. Contexto de producto y decisiones (D1–D16) en el cerebro: `orka-brain/clientes/risso-agro/`.

## Stack

Vite · React 19 · TypeScript strict · Supabase (DB + Auth) · TanStack Query · React Router · Tailwind v4 · shadcn/ui · Zod · Capacitor.

> **No** usa el boilerplate Next.js de Orka — el porqué está en `orka-brain/decisiones/agro-stack-vite-spa.md`. Leé también el `CLAUDE.md` de este repo (invariantes de seguridad de RLS).

## Requisitos

- Node.js 24+ y pnpm 10+.

## Setup

```bash
pnpm install
cp .env.example .env.local   # completar con los valores reales del proyecto Supabase
pnpm dev                     # http://localhost:5173
```

Variables de entorno (ver `.env.example`):

| Variable | Qué es |
|----------|--------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key (pública; la protege la RLS). **Nunca** poner el `service_role` key. |

## Scripts

| Script | Acción |
|--------|--------|
| `pnpm dev` | Servidor de desarrollo (Vite + HMR). |
| `pnpm build` | Build de producción (`tsc -b && vite build` → `dist/`). Es el build que manda. |
| `pnpm typecheck` | Sólo chequeo de tipos. |
| `pnpm lint` | ESLint. |
| `pnpm preview` | Sirve el build de `dist/` localmente. |
| `pnpm test:e2e` | E2E con login real (hacienda, campos, analítica) contra el dev server. |
| `pnpm test:e2e:offline` | E2E de manga y offline contra el build de producción (sin credenciales). |
| `pnpm test:e2e:todo` | Las dos suites. |

### Tests E2E

Los tests con login usan una cuenta **exclusiva para tests** (`e2e@orkastudio.test`, empresa "E2E Pruebas"), porque escriben datos: nunca la de un productor. Las credenciales van en `.env.e2e.local` (ignorado por git), que `playwright.config.ts` carga solo:

```bash
E2E_EMAIL=e2e@orkastudio.test
E2E_PASSWORD=...
```

Las caravanas y los campos que crean llevan el prefijo `E2E`.

## Capacitor (móvil)

El shell nativo envuelve el build estático de `dist/` (`capacitor.config.ts`). Las plataformas nativas todavía no están agregadas:

```bash
pnpm build
pnpm cap add android        # requiere Android Studio
pnpm cap add ios            # requiere macOS + Xcode
pnpm cap sync
```

> El build de iOS para TestFlight necesita macOS/Xcode o CI con runner Mac.

## Estructura

```
src/
  app/            # router, shell del área autenticada, páginas raíz
  components/ui/  # shadcn/ui
  features/
    auth/         # provider de sesión, login, guard de rutas
  lib/
    supabase/     # cliente + tipos generados
    env.ts        # acceso tipado a env vars
    query-client.ts
```
