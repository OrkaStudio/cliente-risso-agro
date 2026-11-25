# Piloto de productores: pruebas y activación

La migración `20261015120000_whatsapp_piloto_productores.sql` está preparada para revisión. Aplicarla en la base compartida requiere confirmación explícita. No ejecutar `supabase db push`: arrastraría migraciones ajenas pendientes, incluida Hacienda de Lau y el resumen semanal.

## Pruebas locales

En WSL/Linux con Docker, Python 3 y Deno 2:

```sh
python3 supabase/tests/wa/piloto/run.py
pnpm exec vitest run supabase/functions/_shared/wa
pnpm build
```

El runner crea un PostgreSQL 16 descartable en `127.0.0.1:55441`, carga el fixture y aplica **sólo** la migración nueva. Aborta si existe su contenedor. No lee credenciales de Supabase o Meta y elimina exclusivamente su propio contenedor al terminar. `DENO_BIN` permite elegir el ejecutable.

Se prueban propuestas y confirmaciones, duplicados, permisos entre empresas y doble membresía, equipos e incidencias, responsables de tareas, corrección/anulación atómica, defensa de la auditoría, sesiones reanudables, comparación y cola concurrente. Incluye webhook completo con HMAC y PostgreSQL reales y proveedores de voz/IA/Meta simulados. No acredita calidad de ASR ni entrega real a WhatsApp.

Resultados: `output/wa-mapa/mejoras-2026-10-15/piloto-db.json`. Los tests en vivo del mapa se adaptaron para **cancelar antes de elegir potrero**: esa elección ahora puede guardar una observación.

## Activación revisable

1. Verificar release, esquema actual, copia de seguridad disponible y ausencia de cambios simultáneos de Lau. Obtener confirmación para esta migración concreta. No aplicar otras migraciones.
2. Aplicar únicamente `20261015120000_whatsapp_piloto_productores.sql`, registrar su versión y regenerar los tipos. Agrega seis tablas y funciones/triggers de integridad/auditoría; no modifica stock ni políticas existentes.
3. Publicar el código compatible con `WA_PILOT_ENABLED` y `WA_QUEUE_ENABLED` apagados. Comprobar mapa/JPEG/consultas sin tocar datos de productores.
4. Preparar un token aleatorio dedicado de 32+ caracteres: secret `WA_QUEUE_JOB_TOKEN` y Vault `wa_queue_job_token`. No usar una clave de servicio ni imprimirlo. Aplicar **por separado** `cron.sql`: requiere `pg_cron`, `pg_net` y Vault existentes. No crea suscripciones o plantillas.
5. Configurar `WA_PILOT_TENANTS` con Orka Pruebas y activar `WA_QUEUE_ENABLED=true`, `WA_PILOT_ENABLED=true`. Un ID omitido no habilita funciones. Incorporar otra empresa sólo después de verificar sus accesos y consentimiento.
6. Ensayar alta, permisos, audio, consulta y corrección con cuentas propias. Los estados `revision` requieren comprobar captura/datos antes de reanudar; nunca repetir automáticamente un mensaje que pudo escribir.

La cola guarda entrada y trabajo en una transacción, reclama un trabajo por vínculo y procesa en orden de recepción. Una caída durante el procesamiento o un pendiente de más de 23 horas detiene el canal para revisión; evita reinterpretar «ayer» con otro día y repetir escrituras inciertas. El cron retoma pendientes, nunca estados inciertos.

Para suspender las funciones, apagar primero `WA_PILOT_ENABLED`. Mantener la cola hasta vaciar o revisar sus trabajos. Antes de apagar `WA_QUEUE_ENABLED` o volver a código que no conoce la cola, comprobar que no quedan pendientes/procesando/revisión. Conservar tablas e historial; no borrar datos como rollback.

## Alcance de las cinco funciones

- Corrección/anulación: última lluvia o gasto propio de WhatsApp, con confirmación y rechazo de cambios concurrentes. Gastos con comprobante/IVA y recorridas completas se corrigen en la app. La lluvia anulada sale de la tabla operativa y queda en auditoría; el gasto pasa a `anulado`.
- Incidencias: por potrero; equipo vinculado sólo si hay uno inequívoco de ese tipo dentro del dibujo. Si no, informa equipo sin identificar. Borde rojo y marcador sólo para posición existente. Resolución con confirmación e historial. Fotos de incidencias no incluidas: las fotos entrantes siguen siendo comprobantes.
- Recorridas: empezar, sumar audios, pausar/retomar y cerrar con confirmación conjunta. Antes del cierre son borradores. WhatsApp entrega al recuperar señal; no hay procesamiento sin conexión.
- Tareas: responsables de la misma empresa, vencimiento, aceptación y cierre. Sin mensajes a terceros ni recordatorios automáticos. Falta una vista de app que consuma estas tablas: actualmente se consultan por el bot; el mapa de WhatsApp sí las usa.
- Comparación: dos fechas distintas por potrero, estados observados y ausencia explícita de datos.

Ejemplos: `Se rompió el molino del 7B`, `Ya arreglé el molino del 7B`, `Que Juan revise la bomba mañana`, `crear tarea en 7B para mí mañana: revisar bomba`, `problemas página 2`, `empezar recorrida en La Porteña ayer`, `cerrar recorrida`, `comparar recorridas`, `corregir última carga a 25 mil`, `deshacer última carga`.

Protección de contraseñas filtradas, rotación pendiente, prueba real de Lau y alta externa siguen siendo condiciones adicionales. El resumen semanal y Hacienda mantienen su propia activación pendiente.
