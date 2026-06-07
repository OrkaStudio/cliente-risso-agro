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
| `pnpm test:e2e` | E2E con Playwright (golden path Hacienda en navegador real). |

### Tests E2E

`pnpm test:e2e` corre el golden path (login → alta de animal → ficha → stock) en un navegador real contra Supabase. Necesita credenciales seed por env (no se hardcodean):

```bash
E2E_EMAIL="orka.arg@gmail.com" E2E_PASSWORD="..." pnpm test:e2e
```

El test usa caravanas con prefijo `E2E` para poder limpiarlas sin tocar datos reales.

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
