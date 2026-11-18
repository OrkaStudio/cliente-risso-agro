# Evaluación inicial de PDF de Troppero

El 13/11/2026 se evaluó el lector local de la rama de WhatsApp con 16 PDF. Dos son controles y 14 son casos de evaluación. Las facturas de insumos, flete y honorarios, la visita y el resto de los casos generados usan datos ficticios. La factura pública de Arca SDK es un control de regresión porque ya se usó al desarrollar el lector. La muestra de PyAfipWs es de homologación y se agregó como formato independiente. Los escaneos de 250 y 125 dpi derivan de dos facturas digitales del conjunto. Esa relación se conserva al dividir futuras muestras por proveedor.

## Repetir la prueba

Requiere Python, ReportLab 4.4.10, Poppler (`pdftoppm`) y Deno 2. Para repetir OCR hace falta Tesseract 5 con el idioma `spa`. El script genera los PDF ficticios en un directorio temporal y verifica por SHA-256 los dos PDF públicos. Para correr con copias locales se pueden pasar `--arca-pdf` y `--pyafip-pdf`. La salida es JSONL con campos esperados y obtenidos. La columna `ms` mide solo la lectura de cada PDF en Deno. La evaluación se ejecuta sin credenciales y sin acceder a WhatsApp o a una base de datos.

```sh
python3 supabase/tests/wa/evaluacion-pdf/evaluar.py --tesseract "$(command -v tesseract)"
```

En cada factura se cotejan tipo, emisor, CUIT, número, fecha y total en centavos. La comparación del nombre es exacta, incluidas las tildes. Los documentos ambiguos o fuera del alcance del lector actual deben quedar sin propuesta. El estado `aceptacion_indebida` registra el tipo y el total que el lector devolvió en esos casos.

## Lectura de referencia

| Caso | PDF directo | PDF con capa OCR |
| --- | --- | --- |
| Factura A de insumos | 5/6. El emisor pierde la tilde. | |
| Factura B de transporte | Rechazada. Trae «Subtotal» como base impresa. | |
| Factura C de honorarios | 5/6. El emisor pierde la tilde. | |
| Factura A con otras etiquetas | Rechazada. Usa «Subtotal neto» y «Total a pagar». | |
| Factura A de PyAfipWs | Rechazada. Usa otro encabezado y rotulado de importes. | |
| Parte veterinario y constancia | 2/2 correctos. | |
| Nota de crédito, remito, PDF con dos facturas y factura en USD | 4/4 rechazados como correspondía para el flujo actual. | |
| Factura con dos totales distintos | Aceptación indebida. Tomó $116.765,00 e ignoró $168.765,00. | |
| Copia escaneada de la factura A a 250 dpi | Rechazada. | 5/6. El emisor pierde la tilde. |
| Copia escaneada de la factura C a 125 dpi | Rechazada. | 5/6. El emisor pierde la tilde. |
| Control de Arca SDK | 6/6. | |
| Control de original, duplicado y triplicado | 5/6. El emisor pierde la tilde. | |

La lectura directa acertó 20 de 52 campos en los casos de evaluación y rechazó correctamente 4 de 5 documentos fuera de alcance o ambiguos. En los dos escaneos, la capa OCR permitió recuperar 10 de 12 campos. La pérdida de tildes también se observa en los PDF digitales. Los resultados corresponden a este conjunto pequeño y a las versiones locales de Tesseract 5.3.4 y ReportLab 4.4.10.

La prioridad que surge de esta corrida es rechazar totales contradictorios. Para medir generalización después de ampliar etiquetas, hacen falta más facturas de emisores y sistemas independientes, incluidos escaneos de campo. El ajuste fino queda para evaluar si la extracción estructurada con OCR y validaciones sigue fallando sobre ese conjunto.

Fuentes de muestras públicas y OCR. [Arca SDK](https://www.afipts.com/packages/pdf.html), [PDF de PyAfipWs](https://www.sistemasagiles.com.ar/trac/raw-attachment/wiki/HerramientaFacturaElectronica/FacturaA0002-00000136.pdf), [Tesseract](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage).
