# Video comercial de Tropero

Artefactos del cerebro: `D:/orka-brain/clientes/risso-agro/assets/tropero-whatsapp-video/`.

- `index.html`: presentación con reproductor, descarga y estado de la función semanal.
- `demo.html`: composición editable, 1080x1920; 13 escenas, conversaciones recreadas, controles y locución. `window.demo.render(t)` permite posicionar la composición en un segundo concreto. Agregar `?capture` oculta controles.
- `Tropero-WhatsApp-promocional.mp4`: 85 segundos, H.264/AAC, 30fps; datos de ejemplo identificados en pantalla.
- `Tropero-resumen-ejemplo.pdf`: documento sintético generado por `pdfSemana` del servidor.
- `simulacion.json`: 16 escenarios locales usando los módulos reales de conversación, con modelo e IO simulados.
- `produccion.json`: resolución, duración, cantidad de frames y tamaño del MP4 verificados.
- Logo, paleta, Inter/Archivo y foto aérea tomados del trabajo Tropero de `D:/dev/risso-tropero-lau`; voz Agustin de HeyGen; música original sintetizada, sin samples externos.

La demostración no es una conversación entrante de Meta ni prueba el audio real de recorrida. El envío semanal mostrado requiere activación en Supabase y aprobación de la plantilla; la presentación mantiene ese estado explícito.

Para editar y exportar:

1. Ajustar escenas/textos en `demo.html`, preservando la marca y la precisión de cada flujo.
2. Ejecutar `promo.simulation.ts` y las suites del bot/resumen. El simulador comprueba confirmación de lluvia al elegir campo, gasto/campo, recorrida múltiple, ubicación, corrección/cancelación y consultas.
3. Servir la carpeta local con `python3 -m http.server` y usar Playwright con viewport 1080x1920. Revisar cada escena antes de exportar.
4. Exportar frames deterministas: 1275 imágenes a 15fps para 85 segundos. Posicionar con `window.demo.render(frame/15)` y desactivar animaciones de reloj; aplicar la escala de foto, ondas y opacidad según ese tiempo. Las grabaciones de navegador revisadas dieron tamaño/duración inconsistentes, por lo que la versión entregada usa frames completos.
5. Ensamblar con FFmpeg a 30fps, H.264 yuv420p/AAC y faststart; mezclar locución con música discreta. Decodificar el stream de video para comprobar **2550 frames** y revisar fotogramas de lluvia/gasto/recorrida/ubicación/consultas/documento/cierre. No validar sólo la duración del contenedor: el audio puede prolongar un video incompleto.

Scripts de exportación de esta sesión conservados en `C:/Users/franc/AppData/Local/Temp/finish-wa-video.py` y las trazas de Playwright. No incluyen credenciales. La composición, assets y MP4 quedan en la carpeta estable del cerebro.
