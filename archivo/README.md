# archivo/

Código que salió de la app y se guarda por las dudas. **No es parte de Troppero**: no entra al
build ni al precache del celular, no se revisa con `tsc` (sólo mira `src/`), está fuera del lint
(`eslint.config.js`), de las pruebas (`vitest` mira `src/`, Playwright mira `e2e/`) y de Tailwind
(`@source not "../archivo"` en `src/index.css`).

Cada archivo está en la misma ruta que tenía en el repo (`archivo/src/...`, `archivo/e2e/...`).

## Qué hay y por qué salió (18/11/2026)

**Modo Campo viejo: recorrida, manga, lector e historial.** Lau decidió que en la versión que se
lanza la recorrida y la manga se hacen por WhatsApp con el bot, no desde la app. El celular
rediseñado (17/11: Hoy, Campos, Hacienda, Plata) ya no llevaba a estas pantallas.

- `src/features/campo/recorrida-page.tsx` + `recorrida/` — la recorrida potrero por potrero, con
  su croquis y su cola en el teléfono (Dexie `risso-recorrida`).
- `src/features/campo/ops/` — nacimientos y movimientos anotados en la recorrida (Dexie `risso-ops`).
- `src/features/campo/manga-page.tsx` + `manga/` — la manga: caravanear, vacunar, apartar,
  destetar, tacto, con el bastón RFID (Dexie `risso-manga`).
- `src/features/campo/lector-page.tsx` — laboratorio para probar un bastón RFID.
- `src/features/campo/historial-page.tsx` + `historial/` — el historial (ya se había reemplazado
  por «Lo que cargaste» en Hoy, 16/11).
- `e2e/manga.spec.ts` — sus pruebas de punta a punta.

**Código que ya no usaba ninguna pantalla:** `src/features/guia/orbe.tsx`,
`src/features/hacienda/carga-animal.ts`, `src/features/inicio/para-atender-ui.ts`,
`src/features/lotes/potrero-features.ts`, `src/features/lotes/potrero-feature-icons.tsx`,
`src/components/ui/card.tsx`, `label.tsx`, `textarea.tsx`.

## Qué cambió en la app al sacarlas

- Las direcciones `/campo/recorrida`, `/campo/manga` y `/campo/lector` llevan a Hoy (`/campo`).
- Al abrir la app ya no se bajan al teléfono los datos de recorrida y manga, ni se suben sus colas,
  ni se precargan sus pantallas: sólo Plata (`seed-offline.ts`, `drenar-offline.ts`,
  `cuenta-del-equipo.ts`, `lib/prefetch.ts`).
- Las bases viejas del teléfono (`risso-recorrida`, `risso-manga`, `risso-ops`) se borran una vez
  (`limpiar-bases-viejas.ts`). Lau confirmó que lo que pudiera quedar ahí no importa.
- Hoy ya no muestra «observaciones sin subir» ni «Descartarlas»; sigue el aviso de «Sin señal».
- La guía ya no propone «Probá la Recorrida» (`guia/estado.ts`).

## Cómo volver alguna

1. Mover sus archivos de `archivo/` a la misma ruta sin el prefijo.
2. Volver su ruta en `src/app/router.tsx` (y en `lib/prefetch.ts` si se precarga).
3. Si tiene cola o datos en el teléfono: volver su sembrado y su drenado en `seed-offline.ts`,
   `drenar-offline.ts` y `cuenta-del-equipo.ts`, y sacar su base de `limpiar-bases-viejas.ts`.
4. `pnpm exec tsc -p tsconfig.app.json --noEmit`: lo que se haya cambiado en la app desde el 18/11
   puede pedir ajustes.

El estado completo de antes también queda en git: el commit anterior a esta salida.
