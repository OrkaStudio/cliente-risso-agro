# Resumen semanal de Tropero

Sábados 09:00 Argentina. Informa los siete días completos anteriores (sábado a viernes): lluvia manual medida, recorridas/observaciones, novedades, gastos por devengo, hacienda al generar el informe y vencimientos pendientes hasta el viernes siguiente, incluyendo vencidos. Se incluyen registros de la app y WhatsApp visibles bajo RLS del usuario vinculado. No supone visitas físicas ni incidentes abiertos; ausencia de datos no equivale a ausencia de actividad.

Comandos explícitos, también después de transcribir audio: `resumen semanal`, `activar resumen semanal`, `desactivar resumen semanal`. Conservan la carga pendiente. Pedir un PDF es una lectura: no cambia datos de campo.

## Estado de activación

La migración `20261013010000_whatsapp_resumen_semanal.sql` está preparada y necesita autorización explícita antes de aplicarse en producción según CLAUDE.md. Agrega sólo dos tablas internas, sin suscripciones por defecto. Nadie queda suscripto por tener el número vinculado.

El webhook puede publicarse con el mapa y el código semanal preparado. Mientras `WA_WEEKLY_ENABLED` no sea `true`, todos los comandos semanales devuelven un aviso de función inactiva y conservan el pendiente; no consultan las tablas nuevas ni generan/envían un PDF. La presencia de esos archivos en el bundle no activa la función, el cron ni la suscripción.

Orden de activación:

1. Aplicar la migración aprobada y comprobar tablas/permisos.
2. Publicar `wa-resumen-semanal` y el webhook con verificación JWT desactivada, manteniendo sus verificaciones propias: token dedicado para cron y HMAC de Meta para webhook. Publicar desde el bundle previo preservando cambios ajenos.
3. Crear un token aleatorio dedicado como secret `WA_WEEKLY_JOB_TOKEN` y guardarlo también en Vault con nombre `wa_weekly_job_token`. No reutilizar ni imprimir claves de servicio.
4. Registrar `WA_BUSINESS_ACCOUNT_ID` y el nombre `WA_WEEKLY_TEMPLATE_NAME=tropero_resumen_semanal`; enviar a Meta `template.json` con un handle válido del PDF sintético, obtenido mediante su Resumable Upload API. Esperar aprobación de DOCUMENT/es_AR. La función automática comprueba aprobación antes de preparar/enviar. Nunca sustituye la plantilla por un documento de servicio fuera de la ventana de conversación.
5. Activar `WA_WEEKLY_ENABLED=true` y aplicar `cron.sql`: sábado 12:00 UTC (09:00 AR), con reintentos de preparación cada 10 minutos hasta 09:50. No se reenvían automáticamente resultados inciertos.
6. Sólo Fran en Orka Pruebas: activar desde su chat y probar un PDF solicitado. Antes de agregar otros destinatarios, cada uno debe activar su suscripción.

Las respuestas enviadas constan en `wa_mensaje` y reciben estados delivered/read/failed del webhook existente. `enviado` en la tabla interna significa aceptado por Meta, no leído. Si la red falla durante envío, se marca `incierto` y requiere revisión antes de repetir. Una falla de PDF/media se reintenta hasta tres veces; cada semana/vínculo tiene una clave única. Reintentar la preparación no duplica documentos entregados.

Para suspender: desactivar el cron y/o `WA_WEEKLY_ENABLED`, y dar de baja la configuración individual. El job requiere token dedicado y sólo opera en su horario. No acepta destinatarios/fechas arbitrarios en el body.

## Verificación local

```bash
pnpm exec vitest run supabase/functions/_shared/wa
python3 supabase/tests/wa/weekly/run.py
deno run --no-config --no-lock --node-modules-dir=none --allow-read --allow-write supabase/tests/wa/weekly/pdf.test.ts /tmp/Tropero-resumen-ejemplo.pdf
deno run --no-config --no-lock --node-modules-dir=none --allow-env --allow-read supabase/tests/wa/weekly/protocol.test.ts
```

El test PDF verifica documento válido y paginación con 150 observaciones y palabras largas. Renderizar también las páginas con `pdftoppm` para revisar márgenes y cortes. `pdf-lib@1.17.1` es una dependencia exclusiva de Edge Functions; no se agregó al cliente ni a package.json. El informe es determinista, no usa un modelo ni publica URLs de los datos del campo: se sube a Meta por bytes y se envía por media ID.

Las pruebas de base usan PostgreSQL descartable sin credenciales reales, con RLS y dos empresas. El cron y la plantilla quedan fuera del fixture: sólo se preparan para su activación autorizada.

`protocol.test.ts` ejecuta el handler real sin puerto ni permisos de red: cinco casos de método, token, piloto desactivado y horario real del servidor. Una fecha/destinatario arbitrarios en el body no fuerza envío. La prueba sustituye sólo `Deno.serve` y el reloj; no accede a Meta ni a bases reales.
