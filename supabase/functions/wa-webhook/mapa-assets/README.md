# Assets del mapa de WhatsApp

- `resvg.wasm`: @resvg/resvg-wasm 2.6.2, distribuido por https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm . Licencia MPL-2.0 en `LICENSE-resvg`; fuentes de la versión en https://github.com/thx/resvg-js/tree/v2.6.2 y motor resvg en https://github.com/linebender/resvg . Binario original sin modificaciones.
- `Inter.ttf`: familia Inter variable, https://github.com/google/fonts/tree/main/ofl/inter . Licencia SIL Open Font License 1.1 en `OFL-Inter.txt`.

Se incluyen mediante `static_files` en `supabase/config.toml`. El render usa archivos locales y no solicita mapas, fuentes o coordenadas a terceros. Verificar que el paquete de la función contenga los assets antes de publicar; la prueba Deno local no valida el empaquetado de Supabase.
