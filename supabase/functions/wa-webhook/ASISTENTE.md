# Asistente de Troppero con herramientas

Publicado el 24/11/2026 como `wa-webhook v42 ACTIVE`, desde `fran/asistente-2026-11-23` (base `2670206`), con las banderas de cola/asistente habilitadas únicamente para **Orka Pruebas**. La publicación base pasó de v40 a v41 al actualizar la configuración; v42 agregó el ajuste de cierre y brevedad. Para otras cuentas la bandera sigue apagada.

Se aplicó la migración `20261123120000_whatsapp_asistente.sql` tras la aprobación explícita de Fran. Las políticas públicas se comprobaron sin cambios. El paquete compatible pasó 43/43 casos y la copia estructural descartable de 16 tablas. Se verificó además un saludo sintético firmado del usuario con el modelo publicado y envío real por Meta, sin propuestas ni cargas productivas. La aceptación de Meta no acreditó entrega: el callback devolvió 131047 por ventana de 24 horas cerrada. El usuario debe escribir por WhatsApp para abrirla. La prueba de audios reales desde el teléfono sigue pendiente.

La lectura de permisos es compatible con el esquema anterior: el dueño conserva acceso y un invitado sin niveles explícitos no los hereda. Sin RLS de cuenta, el asistente rechaza actores con varias membresías. No se aplicaron las migraciones globales del rediseño de Lau.
## Aislamiento e identidad

El motor es común. Cada ejecución, conversación, evidencia y propuesta pertenece al vínculo, a la persona y a la cuenta elegida. El modelo no recibe una herramienta para elegir `empresa_id`, `user_id`, teléfono, SQL, URL o ruta de archivo. Las referencias de animales y archivos se construyen dentro de cada ejecución.

- La firma de Meta y el vínculo se resuelven antes del asistente. La selección de cuenta sigue en código, con los permisos de la rama unificada de Lau.
- `guardarEntrante` fija `troppero_origen` desde la identidad del servidor. Sobrescribe cualquier valor que viniera en el payload. Una reasignación posterior del vínculo no transfiere la autoría del mensaje.
- `asistente-store.ts` exige en cada transacción vínculo activo, actor, cuenta y teléfono coherentes, además de membresía vigente. Las filas técnicas se filtran por vínculo, actor y empresa.
- Los datos productivos se consultan y modifican con el rol `authenticated`, los claims de la persona y `x-troppero-cuenta`. Las reglas de acceso y las invariantes de PostgreSQL siguen aplicándose.
- Las tablas del asistente están en `interno`, con RLS y sin permisos directos para `anon` o `authenticated`. La clave de servicio se usa sólo en el servidor para almacenar medios privados.
- El historial de otra persona no se recupera aunque pertenezca a la misma empresa. Compartir datos productivos entre colaboradores sigue dependiendo de los permisos explícitos de la cuenta.
- Un cambio de cuenta o de permisos invalida las lecturas y confirmaciones improcedentes. Antes de enviar una respuesta se vuelven a comprobar las secciones consultadas.

## Recorrido

1. Persistir el mensaje y su autoría. La cola actual conserva la recepción y coordina el vínculo.
2. Registrar el turno y archivar el original cuando lo hay. La transcripción se conserva antes de interpretar.
3. Preparar contexto propio con la charla pertinente, propuestas y archivos. No existe memoria global de productores.
4. Haiku 5.5 elige consultas con `tool_choice: auto`. Puede resolver lugares, buscar caravanas exactas, consultar registros, leer documentos y preparar cargas. Los resultados vienen del servidor.
5. Cada llamada y su resultado se conservan. Imágenes y PDF nativos pueden pasar al modelo sin duplicar el binario en las trazas.
6. Preparar propuestas con fuente y datos de revisión. Todavía no son registros confirmados.
7. Redactar una respuesta compacta para el turno completo, con presupuesto para el límite interactivo de WhatsApp y el nombre de la cuenta. Si atribuye un guardado no ejecutado, se permite una reformulación sólo de texto, sin volver a ejecutar herramientas.
8. Guardar la salida antes de enviarla. El texto reúne el turno; mapas y originales acompañan con su propia referencia. Los envíos ambiguos quedan para revisión y no se repiten a ciegas.

## Herramientas y consistencia

`asistente-herramientas.ts` valida los argumentos y rechaza propiedades ajenas al contrato. Las búsquedas no equiparan automáticamente `48`, `048` y `E048`. Una caravana con varias fichas no habilita elegir una arbitrariamente.

Los lugares resueltos y las observaciones reciben stock verificado cuando la persona tiene lectura de Hacienda. El servidor calcula las cantidades por categoría y los contrastes disponibles. Ese contexto se entrega al modelo sin incorporarlo a una propuesta de Campos que después pudiera reaparecer con otro permiso. Una observación o especie fuera del rodeo se conserva sin inventar una baja de stock. Las cantidades de un hecho se mantienen separadas del conteo vivo; el argumento `cabezas_vivas` sólo actualiza ese conteo explícito.

Al corregir propuestas de animales se exige volver a verificar las referencias. Las referencias de otro turno no se reutilizan como si apuntaran al mismo animal. Una identidad diferente necesita una propuesta nueva.

## Confirmación

Al activar este recorrido, un «sí» de texto no confirma pendientes del recorrido anterior; esos pendientes se preservan para la revisión o reversión. Los botones `waas` contienen ID y revisión. El servidor comprueba actor, vínculo, empresa, permiso actual, estado y versión. Bloquea la propuesta y ejecuta la operación productiva junto con su confirmación en una transacción.

Las fichas se vuelven a comprobar por identidad, caravana, estado y ubicación. Las funciones de Hacienda reutilizadas son `dar_baja_animal`, `mover_animales` y `crear_animales_masivo`. Las vacunaciones registran eventos sanitarios y evitan repetir una aplicación coincidente. Una confirmación repetida no repite la operación.

## Alcance del piloto

- Consultas de animales, stock, lluvia, novedades, recorridas, gastos, vencimientos y cargas.
- Observaciones, notas, lluvia y gastos propuestos.
- Muerte de un animal identificado, movimiento de animales identificados, alta masiva sin caravana y vacunación de animales verificados.
- Lectura general de CSV/XLSX sin exigir encabezados de una plantilla, lectura de PDF y entrada visual para imágenes o PDF escaneados dentro del alcance.
- Archivo privado y recuperación de PDF, XLSX, texto/CSV y fotos JPEG/PNG (hasta 5 MB). Otros originales quedan conservados sin prometer un reenvío que el adaptador no admite.

Límites explícitos:

- Las altas y los movimientos disponibles usan la fecha actual. Los históricos se conservan para revisión, sin atribuirles una fecha que la operación no admite.
- La muerte o el movimiento por cantidad sin identidad no se ejecutan con estas herramientas. El relato puede quedar como observación o nota.
- Asignar o reemplazar caravanas desde una planilla no está habilitado por este piloto. No confundir una lista de números con animales nuevos.
- Los originales quedan en el archivo privado del bot. No se agregó un visor o sección nueva de archivos en la app rediseñada.
- Los importes y el estado de pago se proponen para confirmar. La captura fiscal detallada de IVA del flujo anterior no se amplió en este recorrido.
- La lectura por turno admite hasta 5 MB; el archivo de originales, hasta 25 MB. Se acotan hojas, filas, páginas, texto y consultas. Las planillas se pueden leer por partes.
- La búsqueda de archivos disponible usa nombre y texto extraído conservado; todavía no hay un índice semántico completo de todos los documentos. Las consultas temporales usan los períodos que admite el consultor existente; no se promete cualquier intervalo histórico.
- El contexto inicial es una selección, y la búsqueda de conversación cubre 90 días. Los originales nuevos se conservan independientemente de la ventana temporal de Meta.
- La prueba de notas de voz usa transcripciones reales de los casos como entrada al modelo, con ASR y Meta simulados. No acredita todavía el transporte productivo ni la calidad de la transcripción con ruido del campo.

## Archivos

- `_shared/wa/asistente.ts`: bucle independiente, presupuestos y cierre.
- `asistente.ts`: adaptador del webhook, modelo, propuestas y entrega.
- `asistente-store.ts`: persistencia privada y transacciones.
- `asistente-herramientas.ts`: contratos, referencias y validaciones.
- `asistente-operaciones.ts`: ejecución después de la confirmación.
- `asistente-archivos.ts`: originales y lectores.
- `20261123120000_whatsapp_asistente.sql`: migración aplicada el 24/11/2026. Incluye la cola privada y las cinco columnas de procedencia `canal`; no adelanta las RLS ni las pantallas del rediseño.

## Activación y reversión

Sólo después de revisar la migración y los resultados, la cuenta de pruebas se incluye en `WA_ASISTENTE_EMPRESAS`. También necesita la cola durable habilitada (`WA_QUEUE_ENABLED` y `WA_PILOT_TENANTS`). No se acepta un comodín para todas las cuentas.

Quitar una cuenta de la bandera devuelve los mensajes nuevos al recorrido anterior. Los botones del asistente siguen comprobándose contra su propuesta para que una revisión pendiente no se convierta en una confirmación distinta.

## Verificación

`supabase/tests/wa/asistente/run.py` crea una base PostgreSQL descartable en `127.0.0.1:55443`, carga RLS y las funciones reales de Hacienda, simula Meta/Storage/ASR y elimina únicamente el contenedor que creó. La base de QA contiene un esquema mínimo con RLS para estos casos; no reemplaza una validación de compatibilidad con el esquema productivo completo. Nunca utiliza la base productiva. Rechaza un contenedor preexistente con el mismo nombre.

El modo `--modelo-real --repeticiones 3` evalúa conversaciones completas con la clave de QA en `ANTHROPIC_API_KEY`. El registro distingue esas llamadas de las simuladas. `--caso` acota diagnósticos; una corrida filtrada no acredita la batería completa.

Cada corrida registra la huella del código y comprueba que no haya cambiado durante la ejecución. Los resultados y las charlas ficticias quedan en `output/wa-asistente/`. No incluir claves ni conversaciones productivas en fixtures o informes compartidos.
## Revisión de respuestas del 24/11 (v42, comprobada el 25/11)

La longitud deseada y el límite de transporte son controles separados. El objetivo editorial por defecto es 420 caracteres, ampliable al pedir detalle; las consultas pueden conservar una respuesta válida más extensa tras la compactación. Los controles interactivos mantienen su límite de 950 y el texto simple, 3500, descontando etiquetas y avisos. La reformulación no ejecuta otra vez herramientas.

Los cierres rechazados conservan motivo y longitudes en `pasos.cierre`, sin guardar el texto rechazado ni bloques de razonamiento. Un fallo de respuesta no se describe como una carga guardada. El paquete pasó 45 casos y 663 unitarias. La consulta real de estado produjo 453 caracteres, cero propuestas y un callback de entrega exitoso. La precisión del resumen y las preguntas proactivas siguen sujetas a revisión humana con conversaciones reales.

## 25/11 — Assets del mapa publicado (v43)

El paquete multipart de v42 subió los archivos pero no conservó sus entradas estáticas en el ESZIP. Faltaban `static:functions/wa-webhook/mapa-assets/Inter.ttf` y `resvg.wasm`; el render fallaba antes de enviar la imagen. La prueba local del renderer y los mocks de mapas no cubrían este defecto de publicación.

Se volvió a compilar con `supabase/edge-runtime:v1.78.1 bundle`, entrada `/work/supabase/functions/wa-webhook/index.ts` y `--static /work/supabase/functions/wa-webhook/mapa-assets/*`. Se publicó el ESZIP mediante el formato binario oficial, manteniendo el mismo código y sin SQL ni secretos nuevos. No reutilizar el helper multipart de `output/ajuste-breve-2026-11-24/` como procedimiento acreditado para mapas.

Control obligatorio antes de activar y después de descargar el bundle publicado:

```sh
python3 supabase/tests/wa/verificar-paquete-mapa.py /ruta/al/paquete.eszip
```

El verificador exige las entradas estáticas y el contenido binario exacto de ambos assets. Aceptó v43 y rechazó v42. Se descargó v43 y se contrastó el mismo SHA del ESZIP local. La prueba firmada desde el propio número de QA generó un mapa de La Porteña, cero propuestas y una imagen satelital; Meta confirmó `read` para texto e imagen. Esto acredita ese pedido, no todos los campos ni la captura de ubicación del teléfono.

El mapa de WhatsApp es una imagen para consulta con conexión. No recibe automáticamente la ubicación del productor. Para recorridas sin señal, el croquis/GPS del modo Campo es una base existente a probar en dispositivo; la instalación por sí sola no garantiza el funcionamiento offline ni la disponibilidad del satélite.


## Avisos sin potrero y puntos compartidos (25/11)

Un aviso puede permanecer como observación incompleta sin perder relato/fecha y completarse en la misma propuesta cuando se identifique el lugar. Una ubicación de WhatsApp pasa al nuevo asistente y se consulta sólo con `ubicar_punto_compartido`: coordenadas recibidas, lectura autorizada y geometría existente. No es GPS en vivo ni prueba del lugar del hecho. El mapa también devuelve sus referencias disponibles al modelo.

La corrección conserva el tipo de operación; las operaciones por identidad requieren referencias verificadas de animales. Los contrastes de stock explicitan su alcance por potrero. La lista completa de pendientes deja de inyectarse en el contexto inicial. Para cargas se compone el cierre con el mensaje y resultados del turno, sin herramientas ni historial completo, incluso al compactarlo. Se contabilizan ambas llamadas al proveedor y se conserva el presupuesto de tiempo vigente.

Validación final: 53 casos distintos (40 controles y 13 recorridos con modelo real; transporte/ASR simulados) y 138 unitarias pertinentes. Publicación del piloto identificada por hash en TASK-074. No se amplió el alcance a otras cuentas ni se cambió el esquema.
