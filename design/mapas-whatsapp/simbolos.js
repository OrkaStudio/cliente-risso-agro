// Molino, tanque y bebederos se basan en https://troppero.com/assets/campo-mapa.js.
// Los demás símbolos son propuestas nuevas con la misma paleta y trazo.
export const simbolos = {
  "Molino": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20.9 53 30 13.8 39.1 53M23.63 41.24h12.74M26.36 29.48h7.28\" stroke-width=\"1.7\"/><path d=\"m30 17 18.2-5.6v9.8Z\" fill=\"#b85c2e\" stroke=\"none\"/><polygon points=\"33.344,18.034 45.249,19.149 44.184,22.997\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"32.379,19.567 42.134,26.482 39.289,29.283\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"30.778,20.412 35.771,31.278 31.907,32.282\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"28.968,20.345 27.863,32.251 24.014,31.189\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"27.435,19.381 20.527,29.142 17.724,26.299\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"26.588,17.781 15.727,22.783 14.720,18.919\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"26.655,15.971 14.747,14.875 15.806,11.026\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"27.617,14.437 17.851,7.537 20.692,4.732\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"29.217,13.589 24.206,2.731 28.069,1.722\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"31.026,13.654 32.113,1.746 35.963,2.801\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"32.561,14.615 39.453,4.843 42.261,7.682\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><polygon points=\"33.411,16.214 44.264,11.195 45.277,15.057\" fill=\"#fffaf2\" stroke-width=\"1.1\"/><circle cx=\"30\" cy=\"17\" r=\"2.8\" fill=\"#33261a\"/><ellipse cx=\"33\" cy=\"55\" rx=\"14.7\" ry=\"8.4\" fill=\"#d9d2c4\"/><ellipse cx=\"33\" cy=\"55\" rx=\"11.2\" ry=\"6.02\" fill=\"#b9d4ea\" stroke=\"none\"/></svg>",
    "description": "Torre y doce aspas reconstruidas desde campo-mapa.js de la landing."
  },
  "Tanque": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><ellipse cx=\"32\" cy=\"36\" rx=\"24\" ry=\"14\" fill=\"#d9d2c4\"/><ellipse cx=\"32\" cy=\"35\" rx=\"19\" ry=\"10\" fill=\"#b9d4ea\" stroke=\"#5f8fb8\" stroke-width=\"1.4\"/></svg>",
    "description": "Tanque australiano ovalado, igual criterio que la landing."
  },
  "Bebedero": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"7\" y=\"23\" width=\"50\" height=\"18\" rx=\"9\" fill=\"#b9d4ea\" stroke=\"#5f8fb8\" stroke-width=\"3.5\"/><path d=\"M17 30h18\" stroke=\"#fffaf2\" stroke-width=\"2.6\"/></svg>",
    "description": "Bebedero celeste de la landing."
  },
  "Bebedero roto": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"7\" y=\"23\" width=\"50\" height=\"18\" rx=\"9\" fill=\"#f3c9bd\" stroke=\"#c4442f\" stroke-width=\"3.5\"/><path d=\"m28 18 7 11-6 6 7 12\" stroke=\"#c4442f\" stroke-width=\"3\"/></svg>",
    "description": "Versión rota con la grieta roja de la landing."
  },
  "Eléctrico": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 48V14m44 34V14M10 23h17m11 0h16M10 39h44\" stroke-width=\"2.4\"/><path d=\"m33 12-9 18h9l-3 15 13-22h-9l4-11Z\" fill=\"#ecc46a\" stroke-width=\"1.4\"/></svg>",
    "description": "Cerco y energización. Se identifica el tramo mediante texto."
  },
  "Vaca": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14 22c8-5 23-4 29 0l5 10v13h-6l-2-10H22l-2 10h-6V28l-5-2-2 10\" fill=\"#fffaf2\"/><path d=\"M14 22c4-3 10-4 13-3l-2 8-8 3-3-2ZM35 20l8 2 3 7-9 1-5-5Z\" fill=\"#b85c2e\" stroke=\"none\"/><path d=\"m43 20 3-7 3 5m10 0 2-5 1 8\" fill=\"#fffaf2\"/><path d=\"m46 18-6 1 4 5 4-1m10-5 6 1-4 5-3-1\" fill=\"#b85c2e\"/><path d=\"M48 17h9l3 13-5 7h-6l-5-7Z\" fill=\"#fffaf2\"/><path d=\"M46 29h12l1 4-4 4h-6l-4-4Z\" fill=\"#d9d2c4\"/><circle cx=\"49\" cy=\"24\" r=\"1.2\" fill=\"#33261a\" stroke=\"none\"/><circle cx=\"55\" cy=\"24\" r=\"1.2\" fill=\"#33261a\" stroke=\"none\"/><path d=\"M49 32h1m5 0h1\"/></svg>",
    "description": "Nueva ilustración de cuerpo entero, basada en la paleta y el trazo de la landing."
  },
  "Ternero": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 29c6-4 17-4 23-1l4 8v12h-5l-2-9H17l-2 9h-5V33l-5 5\" fill=\"#fffaf2\"/><path d=\"m13 28 7-1-1 7-8 3M26 27l6 1 2 6-7-1\" fill=\"#b85c2e\" stroke=\"none\"/><path d=\"m35 25-7-4 2 8 7 1m10-5 7-4-2 8-7 1\" fill=\"#b85c2e\"/><path d=\"M36 24h10l3 10-5 7h-7l-5-7Z\" fill=\"#fffaf2\"/><path d=\"M34 34h13l-3 7h-7Z\" fill=\"#d9d2c4\"/><circle cx=\"37\" cy=\"30\" r=\"1\" fill=\"#33261a\" stroke=\"none\"/><circle cx=\"44\" cy=\"30\" r=\"1\" fill=\"#33261a\" stroke=\"none\"/><path d=\"M54 7v10m-5-5h10\" stroke=\"#2f7d6b\" stroke-width=\"2.5\"/></svg>",
    "description": "Nacimiento acompañado por cantidad y sexo en el texto."
  },
  "Vacunación": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m15 46 7-7m-4-4 12 12M25 17l22 22M30 12l22 22M35 7l22 22M38 10l-6 6m20 4-6 6M20 40l8 8 23-23-8-8Z\" fill=\"#fffaf2\"/><path d=\"m22 38 8 8 13-13-8-8Z\" fill=\"#b9d4ea\" stroke=\"none\"/><path d=\"m29 36 4 4m2-10 4 4\" stroke=\"#5f8fb8\"/></svg>",
    "description": "Aplicación sanitaria, vacuna o tratamiento. Se acompaña por el detalle."
  },
  "Análisis": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M23 9h18m-16 0v22L13 48q-3 6 4 6h30q7 0 4-6L39 31V9\" fill=\"#fffaf2\"/><path d=\"M21 39h22l7 11q1 2-3 2H17q-4 0-3-2Z\" fill=\"#b9d4ea\" stroke=\"none\"/><circle cx=\"29\" cy=\"44\" r=\"2\" fill=\"#5f8fb8\" stroke=\"none\"/><circle cx=\"37\" cy=\"48\" r=\"1.5\" fill=\"#5f8fb8\" stroke=\"none\"/></svg>",
    "description": "Análisis de laboratorio, como brucelosis en la historia del veterinario."
  },
  "Comprobante": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17 7h23l9 9v40l-5-3-5 3-5-3-5 3-5-3-7 3Z\" fill=\"#fffaf2\"/><path d=\"M40 7v11h9M24 26h18M24 33h18M24 40h10\"/><path d=\"M24 16h9\" stroke=\"#b85c2e\" stroke-width=\"3\"/></svg>",
    "description": "Archivo, factura o recibo asociado al registro."
  },
  "Movimiento": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 17h31l-7-7m7 7-7 7M56 47H25l7 7m-7-7 7-7\" stroke=\"#b85c2e\" stroke-width=\"3\"/><path d=\"M11 31h13v13H11Zm29-11h13v13H40Z\" fill=\"#fffaf2\"/></svg>",
    "description": "Traslado entre potreros. El resumen indica origen, destino y cabezas."
  },
  "Malezas": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M32 55V20m0 22C14 43 11 35 12 25c12 0 20 6 20 17Zm0-10C48 32 53 24 51 15c-13 0-19 5-19 17ZM32 24C18 23 18 12 21 7c10 3 12 8 11 17Z\" fill=\"#6f8a3a\"/><path d=\"M23 55h19\" stroke-width=\"2\"/></svg>",
    "description": "Malezas o novedad del cultivo, a partir de la historia del ingeniero."
  },
  "Aplicación": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M7 36h34v12H7ZM13 22h16v14H13Z\" fill=\"#fffaf2\"/><circle cx=\"16\" cy=\"49\" r=\"7\" fill=\"#d9d2c4\"/><circle cx=\"35\" cy=\"49\" r=\"7\" fill=\"#d9d2c4\"/><path d=\"M41 32h17M44 32v8m7-8v8m7-8v8\" stroke=\"#6f8a3a\" stroke-width=\"2.5\"/><path d=\"m42 45 2-3 2 3m3 0 2-3 2 3m3 0 2-3 2 3\" stroke=\"#5f8fb8\"/></svg>",
    "description": "Tarea de fumigación o aplicación, con producto y fecha en el registro."
  },
  "Lluvia": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M15 33C3 30 9 15 20 17c3-14 23-14 27 0 13-1 17 16 3 18H16Z\" fill=\"#fffaf2\"/><path d=\"m20 42-4 8m18-8-4 8m18-8-4 8\" stroke=\"#5f8fb8\" stroke-width=\"3\"/></svg>",
    "description": "Medición de lluvia. Distinguir manual y estimada en el texto."
  },
  "Nota": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"#33261a\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 7h31v42L36 59H16Z\" fill=\"#fffaf2\"/><path d=\"M36 59V49h11M23 20h17M23 28h17M23 36h11\"/><path d=\"m43 13 5-5 8 8-5 5Z\" fill=\"#ecc46a\"/></svg>",
    "description": "Registro libre cuando la novedad no tiene un símbolo específico."
  }
};
