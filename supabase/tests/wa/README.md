# QA del bot de WhatsApp

## Pruebas locales

En WSL, desde el repo:

```bash
pnpm exec vitest run supabase/functions/_shared/wa
python3 supabase/tests/wa/run.py
```

`run.py` crea un contenedor PostgreSQL 16 descartable, ejecuta el `db.ts` real con RLS y lo elimina al terminar. Usa solamente `127.0.0.1:55439`; aborta si ya existe su contenedor. El fixture retoma los doce casos de recorrida preparados con Claude y agrega consultas/concurrencia. No aplica migraciones ni usa credenciales de producción.

### Mapa de recorrida

`mapa.test.ts` verifica comandos, selección autorizada, conservación del borrador, varias observaciones sin potrero, fallback de geometrías y payload de imagen. El bloque nuevo de `db.integration.ts` prueba con `db.ts` real el acceso entre empresas, membresía revocada, referencias recientes y deduplicación de imagen por captura/campo.

```bash
deno test --no-config --node-modules-dir=none --allow-read --allow-write=output/wa-mapa supabase/tests/wa/mapa-render.test.ts
```

Genera PNG/SVG de ejemplo y comprueba cache/invalidation usando WASM/fuente locales, sin permisos de red ni credenciales. Usa polígonos ficticios claramente identificados. Antes de publicar, validar que `static_files` incluya los assets de `wa-webhook/mapa-assets/` en el paquete Edge y aislar el mapa del resumen semanal local, todavía sin activar. Esta prueba no equivale a enviar la imagen a Meta ni revisarla en teléfono.

El QA del mapa publicado se ejecuta por separado con autorización de la sesión:

```bash
python3 supabase/tests/wa/mapa.live.py --qa-authorized --expected-version NUMERO_PUBLICADO
```

Usa exclusivamente el vínculo propio de Fran en Orka Pruebas, comprueba una entrada genuina de menos de 23 horas y aborta ante otra versión. Simula entradas firmadas; render, media y respuestas son reales. Descarga el PNG privado recibido por Meta, comprueba que pedir mapa/resumen no cambie el pendiente y prueba una recorrida incompleta que termina cancelada. Si existe una carga genuina pendiente, conserva esa carga y omite la recorrida sintética. Nunca confirma ni registra datos de campo.

## Pruebas firmadas contra el webhook publicado

Estos casos simulan entradas de Meta con HMAC. El webhook, modelo, base y envíos de respuesta son reales. No prueban que Meta haya entregado el mensaje inicial ni el renderizado de los botones en el teléfono.

Requieren las credenciales locales de WSL en `~/.config/orka/meta.env` y `~/.supabase/access-token`. Nunca se imprimen ni copian a los resultados. Sólo aceptan el número y vínculo de Fran en **Orka Pruebas**; otro tenant, usuario, número o versión aborta la ejecución. Escribir datos de prueba y enviar respuestas a ese número requiere autorización de la sesión: el flag hace explícito ese efecto.

```bash
python3 supabase/tests/wa/live.py queries --qa-authorized --expected-version 16
python3 supabase/tests/wa/live.py flows --qa-authorized --expected-version 16
python3 supabase/tests/wa/live.py recorrida --qa-authorized --expected-version 16
python3 supabase/tests/wa/live.py photo --qa-authorized --expected-version 16
```

- `queries`: cinco consultas nuevas; comprueba que no cambien datos de campo.
- `flows`: ayuda sin perder pendiente, cancelar, monto cero/negativo, fecha futura/corrección, gasto con campo, confirmación repetida y lluvia al elegir campo.
- `recorrida`: contexto de campo, ubicación, ambigüedad, potrero inexistente, corrección por texto y novedad de muerte sin alterar animales. Incluye además un caso de audio real propio de gasto: transcripción, corrección de monto y cancelación sin escribir. Los audios reales conservados pertenecen a gastos; no se inventa evidencia de un audio de recorrida.
- `photo`: genera un comprobante **sintético y sin valor fiscal**, lo sube a Meta, prueba OCR, confirma un gasto de QA y comprueba que referencia la foto guardada. Requiere Pillow, ya disponible en este entorno.

Los resultados quedan en una carpeta temporal indicada al arrancar. No se borran automáticamente registros de QA. Los casos de guardado pueden agregar lluvia/gastos y completar observaciones existentes: revisar las diferencias antes/después. Ejecutar los bloques secuencialmente; todos requieren que no haya otra carga pendiente. El caso de campo actual se adapta a si el usuario ya recorrió uno o varios campos.

Las entradas simuladas no abren la ventana de respuesta de Meta. Antes de un bloque real tiene que haber un mensaje genuino reciente de Fran en WhatsApp: el script comprueba que el último entrante sin marca de QA tenga menos de 23 horas, dejando margen para terminar el bloque.

El bloqueo de concurrencia serializa confirmaciones **del bot** por empresa/campo/día. La app aún no usa ese bloqueo: una escritura simultánea app/bot requiere una verificación adicional y, para garantizar unicidad en toda la plataforma, un cambio específico en la base autorizado por separado.
