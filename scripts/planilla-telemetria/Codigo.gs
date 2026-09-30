/**
 * Planilla viva de telemetría de Tropero. Se pega en Extensiones → Apps Script
 * de la planilla. Cada hora trae los datos de la edge function
 * `planilla-telemetria` y dibuja el Resumen y una hoja por tema.
 *
 * Qué tablas y gráficos hay, cómo se llaman las columnas y qué muestra cada
 * hoja lo decide la función; este script sólo dibuja. Agregar una columna o
 * una tabla no requiere tocarlo.
 *
 * La clave NO va en este archivo: se carga una vez desde el menú Orka →
 * Configurar clave y queda en las propiedades del script.
 */

var URL_FUNCION = 'https://voippiczkxbxsreiqiqu.supabase.co/functions/v1/planilla-telemetria'
var HUSO = 'America/Argentina/Buenos_Aires'

var VERDE = '#178a55'
var VERDE_SUAVE = '#eef6f1'
var TINTA = '#1f2a24'
var GRIS = '#6b7570'
var ROJO_SUAVE = '#fbe4e0'
var ROJO = '#b3261e'
var FUENTE = 'Inter'
var BORDE = '#e3e8e5'

// Estado de cada etapa del tablero: fondo y color del texto.
var ESTADOS = {
  bien: { fondo: '#e3f2e9', tinta: '#1e7a4c', texto: 'En meta' },
  atencion: { fondo: '#fdf3dc', tinta: '#8a6100', texto: 'Atención' },
  mal: { fondo: '#fbe6e2', tinta: '#b3261e', texto: 'Lejos de la meta' },
  pocos: { fondo: '#f1f3f2', tinta: '#6b7570', texto: 'Pocos datos' },
  base: { fondo: '#eef3f8', tinta: '#2f6f9f', texto: '' },
}

/** El color de la hoja, aclarado: para encabezados suaves. */
function tinte(hex, cuanto) {
  var n = parseInt(hex.slice(1), 16)
  var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
    return Math.round(v + (255 - v) * cuanto)
  })
  return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2) }).join('')
}

// Un gráfico ocupa este alto en filas vacías debajo de su tabla.
var FILAS_GRAFICO = 16
var ALTO_GRAFICO = 320
var ANCHO_GRAFICO = 720

var ANCHOS = {
  texto: 160, largo: 300, email: 220, entero: 124, decimal: 124, pct: 124,
  fecha: 116, fechahora: 144, sino: 116, puntaje: 124, dispositivo: 124, activo: 124,
}
var FORMATOS = {
  entero: '#,##0', decimal: '#,##0.0', pct: '0"%"', fecha: 'dd/mm/yyyy',
  fechahora: 'dd/mm/yyyy hh:mm', puntaje: '0" de 5"', activo: '0',
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Orka')
    .addItem('Actualizar ahora', 'actualizar')
    .addItem('Configurar clave', 'configurarClave')
    .addItem('Activar actualización cada hora', 'activarCadaHora')
    .addToUi()
}

function configurarClave() {
  var ui = SpreadsheetApp.getUi()
  var r = ui.prompt('Clave de la planilla', 'Pegá la clave que te pasó Claude.', ui.ButtonSet.OK_CANCEL)
  if (r.getSelectedButton() !== ui.Button.OK) return
  PropertiesService.getScriptProperties().setProperty('CLAVE', r.getResponseText().trim())
  actualizar()
}

function activarCadaHora() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'actualizar') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('actualizar').timeBased().everyHours(1).create()
  SpreadsheetApp.getActive().toast('Se actualiza sola cada hora.')
}

function actualizar() {
  var libro = SpreadsheetApp.getActive()
  libro.setSpreadsheetTimeZone(HUSO)
  var clave = PropertiesService.getScriptProperties().getProperty('CLAVE')
  if (!clave) throw new Error('Falta la clave: menú Orka → Configurar clave.')

  var res = UrlFetchApp.fetch(URL_FUNCION, {
    method: 'post',
    headers: { 'x-clave-planilla': clave },
    muteHttpExceptions: true,
  })
  var resumen = hoja(libro, 'Resumen')
  if (res.getResponseCode() !== 200) {
    // Se deja lo último que se trajo y se avisa arriba del resumen.
    resumen.getRange('B3')
      .setValue('No se pudo actualizar (' + res.getResponseCode() + '). Los datos son de la última vez que funcionó.')
      .setFontColor(ROJO).setFontWeight('bold')
    throw new Error('La función respondió ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200))
  }

  var datos = JSON.parse(res.getContentText())

  // Primero las hojas de datos: el Resumen usa el embudo que queda dibujado.
  var dibujadas = {}
  datos.hojas.forEach(function (d) {
    dibujadas[d.nombre] = dibujarHoja(hoja(libro, d.nombre), d)
  })
  dibujarResumen(libro, resumen, datos, dibujadas)

  // Se borran las hojas viejas y se ordenan: Resumen primero.
  var viejas = ['Estado', 'Untitled', 'Hoja 1', 'Sheet1']
  viejas.forEach(function (n) {
    var vieja = libro.getSheetByName(n)
    if (vieja && libro.getSheets().length > 1) libro.deleteSheet(vieja)
  })
  var orden = ['Resumen'].concat(datos.hojas.map(function (d) { return d.nombre }))
  orden.forEach(function (n, i) {
    libro.setActiveSheet(libro.getSheetByName(n))
    libro.moveActiveSheet(i + 1)
  })
  libro.setActiveSheet(resumen)
}

function hoja(libro, nombre) {
  return libro.getSheetByName(nombre) || libro.insertSheet(nombre)
}

/** Deja la hoja en blanco: contenido, formatos, filtros, bandas, reglas y gráficos. */
function limpiar(h, filas, cols) {
  h.getCharts().forEach(function (c) { h.removeChart(c) })
  if (h.getFilter()) h.getFilter().remove()
  h.getBandings().forEach(function (b) { b.remove() })
  h.setConditionalFormatRules([])
  h.setFrozenRows(0)
  h.setFrozenColumns(0)
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).breakApart()
  h.clear()
  tamano(h, filas, cols)
  h.setRowHeights(1, h.getMaxRows(), 21)
}

/** Recorta o agranda la grilla para que no queden cientos de filas vacías. */
function tamano(h, filas, cols) {
  if (h.getMaxRows() < filas) h.insertRowsAfter(h.getMaxRows(), filas - h.getMaxRows())
  if (h.getMaxRows() > filas) h.deleteRows(filas + 1, h.getMaxRows() - filas)
  if (h.getMaxColumns() < cols) h.insertColumnsAfter(h.getMaxColumns(), cols - h.getMaxColumns())
  if (h.getMaxColumns() > cols) h.deleteColumns(cols + 1, h.getMaxColumns() - cols)
}

function aValor(v, tipo) {
  if (v === null || v === undefined || v === '') return ''
  if (tipo === 'fecha') {
    var p = String(v).split('-')
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
  }
  if (tipo === 'fechahora') return new Date(v)
  return v
}

function esNumero(tipo) {
  return ['entero', 'decimal', 'pct', 'puntaje', 'activo'].indexOf(tipo) !== -1
}

// ── Hojas de datos ─────────────────────────────────────────────────────────

/** Filas que ocupa una tabla: subtítulo, descripción, encabezado, datos, gráfico. */
function filasDeTabla(t) {
  return (t.subtitulo ? 1 : 0) + (t.descripcion ? 1 : 0) + 1 + Math.max(t.filas.length, 1) +
    (t.grafico && t.filas.length > 0 ? FILAS_GRAFICO + 1 : 0) + 2
}

/** Dibuja la hoja y devuelve dónde quedó cada tabla (para los gráficos). */
function dibujarHoja(h, d) {
  var cols = Math.max.apply(null, d.tablas.map(function (t) { return t.columnas.length }))
  var filas = 3 + d.tablas.reduce(function (s, t) { return s + filasDeTabla(t) }, 0)
  limpiar(h, filas + 3, Math.max(cols + 1, 6))
  h.setTabColor(d.color)
  h.setHiddenGridlines(true)
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns())
    .setFontFamily(FUENTE).setFontColor(TINTA).setFontSize(10).setVerticalAlignment('middle')

  h.getRange(1, 1).setValue(d.titulo).setFontSize(16).setFontWeight('bold').setFontColor(d.color)
  h.getRange(2, 1).setValue(d.descripcion).setFontColor(GRIS)
  h.setRowHeight(1, 34)
  h.setRowHeight(2, 22)

  // Anchos: el mayor que pida cada columna en cualquiera de las tablas.
  for (var c = 0; c < cols; c++) {
    var ancho = 0
    d.tablas.forEach(function (t) {
      var col = t.columnas[c]
      if (!col) return
      ancho = Math.max(ancho, col.etiqueta === 'Nº' ? 48 : ANCHOS[col.tipo] || 140)
    })
    h.setColumnWidth(c + 1, ancho)
  }

  var fila = 4
  var reglas = []
  var posiciones = []
  var unaSola = d.tablas.length === 1
  d.tablas.forEach(function (t, i) {
    var ultima = i === d.tablas.length - 1
    var pos = dibujarTabla(h, t, fila, d.color, reglas, unaSola || ultima)
    posiciones.push(pos)
    fila = pos.siguiente
  })
  h.setConditionalFormatRules(reglas)

  // Sin columna fija: cortaría la descripción, que se extiende a lo ancho.
  if (unaSola && posiciones[0].nFilas > 0) h.setFrozenRows(posiciones[0].filaEncabezado)
  return { hoja: h, tablas: posiciones, datos: d }
}

function dibujarTabla(h, t, fila, color, reglas, conFiltro) {
  var cols = t.columnas.length
  if (t.subtitulo) {
    h.getRange(fila, 1).setValue(t.subtitulo).setFontSize(12).setFontWeight('bold').setFontColor(color)
    h.setRowHeight(fila, 28)
    fila++
  }
  if (t.descripcion) {
    h.getRange(fila, 1).setValue(t.descripcion).setFontColor(GRIS).setFontSize(9)
    fila++
  }

  var filaEnc = fila
  h.getRange(filaEnc, 1, 1, cols)
    .setValues([t.columnas.map(function (c) { return c.etiqueta })])
    .setBackground(tinte(color, 0.86)).setFontColor(color).setFontWeight('bold')
    .setWrap(true).setVerticalAlignment('middle')
    .setBorder(null, null, true, null, null, null, color, SpreadsheetApp.BorderStyle.SOLID)
  h.setRowHeight(filaEnc, 40)
  t.columnas.forEach(function (c, i) {
    if (esNumero(c.tipo)) h.getRange(filaEnc, i + 1).setHorizontalAlignment('right')
  })

  var nFilas = t.filas.length
  if (nFilas === 0) {
    h.getRange(filaEnc + 1, 1).setValue(t.vacia).setFontColor(GRIS).setFontStyle('italic')
    return { filaEncabezado: filaEnc, nFilas: 0, tabla: t, siguiente: filaEnc + 4 }
  }

  var valores = t.filas.map(function (f) {
    return f.map(function (v, i) { return aValor(v, t.columnas[i].tipo) })
  })
  h.getRange(filaEnc + 1, 1, nFilas, cols).setValues(valores)

  t.columnas.forEach(function (c, i) {
    var col = h.getRange(filaEnc + 1, i + 1, nFilas, 1)
    if (FORMATOS[c.tipo]) col.setNumberFormat(FORMATOS[c.tipo])
    if (esNumero(c.tipo)) col.setHorizontalAlignment('right')
    if (c.tipo === 'sino' || c.tipo === 'dispositivo') col.setHorizontalAlignment('center')
    if (c.tipo === 'largo') col.setWrap(true)
    if (c.tipo === 'texto' && i === 0) col.setFontWeight('bold')

    if (c.tipo === 'puntaje') {
      reglas.push(SpreadsheetApp.newConditionalFormatRule().setRanges([col])
        .setGradientMinpointWithValue('#f4c7bd', SpreadsheetApp.InterpolationType.NUMBER, '0')
        .setGradientMidpointWithValue('#fbe9b7', SpreadsheetApp.InterpolationType.NUMBER, '3')
        .setGradientMaxpointWithValue('#bfe3cd', SpreadsheetApp.InterpolationType.NUMBER, '5')
        .build())
    }
    if (c.tipo === 'activo') {
      reglas.push(SpreadsheetApp.newConditionalFormatRule().setRanges([col])
        .whenNumberEqualTo(0).setBackground(ROJO_SUAVE).setFontColor(ROJO).build())
    }
    if (c.tipo === 'sino') {
      reglas.push(SpreadsheetApp.newConditionalFormatRule().setRanges([col])
        .whenTextEqualTo('Sí').setFontColor(VERDE).setBold(true).build())
      reglas.push(SpreadsheetApp.newConditionalFormatRule().setRanges([col])
        .whenTextEqualTo('No').setFontColor(ROJO).build())
    }
  })

  var tabla = h.getRange(filaEnc, 1, nFilas + 1, cols)
  tabla.applyRowBanding(SpreadsheetApp.BandingTheme.GREEN, true, false)
    .setHeaderRowColor(tinte(color, 0.86)).setFirstRowColor('#ffffff').setSecondRowColor('#f8faf9')
  if (conFiltro) tabla.createFilter()

  var pos = { filaEncabezado: filaEnc, nFilas: nFilas, tabla: t, siguiente: filaEnc + nFilas + 3 }
  if (t.grafico) {
    grafico(h, h, pos, filaEnc + nFilas + 2, 1)
    pos.siguiente = filaEnc + nFilas + 2 + FILAS_GRAFICO + 2
  }
  return pos
}

/** Inserta en `destino` el gráfico de la tabla que está en `origen`. */
function grafico(destino, origen, pos, fila, col, datosOcultos) {
  var g = pos.tabla.grafico
  var alto = pos.nFilas + 1
  var b = destino.newChart()
    .setChartType(g.tipo === 'barras' ? Charts.ChartType.BAR : Charts.ChartType.COLUMN)
    .addRange(origen.getRange(pos.filaEncabezado, g.x + 1, alto, 1))
  g.series.forEach(function (s) { b.addRange(origen.getRange(pos.filaEncabezado, s + 1, alto, 1)) })
  if (datosOcultos) b.setHiddenDimensionStrategy(Charts.ChartHiddenDimensionStrategy.SHOW_BOTH)

  // El eje de los números arranca en 0 y va de a enteros; sin datos, hasta 5
  // (si no, Sheets dibuja -1…1).
  var maximo = 0
  pos.tabla.filas.forEach(function (f) {
    var suma = 0
    g.series.forEach(function (s) {
      var v = Number(f[s]) || 0
      suma = g.apilado ? suma + v : Math.max(suma, v)
    })
    maximo = Math.max(maximo, suma)
  })
  var texto = { fontName: FUENTE, fontSize: 10, color: GRIS }
  var numeros = { textStyle: texto, format: '#,##0', minValue: 0, viewWindow: { min: 0 }, gridlines: { color: '#eceff0' } }
  if (maximo === 0) numeros.viewWindow.max = 5
  var categorias = { textStyle: texto }
  if (g.tipo === 'columnas') categorias.format = 'dd/MM'

  b.setMergeStrategy(Charts.ChartMergeStrategy.MERGE_COLUMNS)
    .setNumHeaders(1)
    .setOption('title', g.titulo)
    .setOption('titleTextStyle', { fontName: FUENTE, fontSize: 13, bold: true, color: TINTA })
    .setOption('colors', g.colores)
    .setOption('isStacked', g.apilado)
    .setOption('legend', { position: g.series.length > 1 ? 'top' : 'none', textStyle: { fontName: FUENTE } })
    .setOption('hAxis', g.tipo === 'barras' ? numeros : categorias)
    .setOption('vAxis', g.tipo === 'barras' ? categorias : numeros)
    .setOption('backgroundColor', '#ffffff')
    .setOption('width', ANCHO_GRAFICO)
    .setOption('height', ALTO_GRAFICO)
    .setPosition(fila, col, 0, 0)
  destino.insertChart(b.build())
}

// ── Tablero ────────────────────────────────────────────────────────────────
// La primera hoja responde, sin recorrer las demás: ¿funciona el onboarding?,
// ¿dónde se pierde?, ¿a quién hay que escribirle hoy?

function dibujarResumen(libro, h, datos, dibujadas) {
  var t = datos.tablero
  var nFrases = t.frases.length
  var nTrabados = Math.max(t.trabados.length, 1)
  var total = 12 + 6 + nFrases + 4 + nTrabados + 4 + datos.hojas.length + 4
  limpiar(h, total, 8)
  h.setHiddenGridlines(true)
  h.setTabColor(VERDE)
  h.setColumnWidth(1, 24)
  for (var c = 2; c <= 7; c++) h.setColumnWidth(c, 158)
  h.setColumnWidth(8, 24)
  h.getRange(1, 1, total, 8).setFontFamily(FUENTE).setFontColor(TINTA).setFontSize(10)
    .setVerticalAlignment('middle')

  h.getRange('B2').setValue('¿Funciona el onboarding?').setFontSize(20).setFontWeight('bold').setFontColor(VERDE)
  h.getRange('B3')
    .setValue('Tropero · actualizado el ' + Utilities.formatDate(new Date(datos.generado), HUSO, "dd/MM/yyyy 'a las' HH:mm") +
      ' · se actualiza sola cada hora')
    .setFontColor(GRIS)
  h.setRowHeight(2, 40)

  // Estado general: tres tarjetas de dos columnas.
  t.estado.forEach(function (k, i) {
    var col = 2 + i * 2
    h.getRange(5, col, 1, 2).merge().setValue(k.valor).setNumberFormat('#,##0')
      .setFontSize(22).setFontWeight('bold').setFontColor(TINTA).setHorizontalAlignment('left')
    h.getRange(6, col, 1, 2).merge().setValue(k.etiqueta).setFontWeight('bold')
    h.getRange(7, col, 1, 2).merge().setValue(k.detalle).setFontColor(GRIS).setFontSize(9).setWrap(true)
    tarjeta(h.getRange(5, col, 3, 2), '#f5f7f6')
  })
  h.setRowHeight(5, 40)
  h.setRowHeight(7, 30)

  // El camino: seis tarjetas, una por etapa, con su color según la meta.
  seccion(h, 9, 'El camino del productor',
    'Qué porcentaje pasa de cada etapa a la siguiente, contra su meta. En gris, menos de 5 personas: todavía no se puede concluir.')
  t.etapas.forEach(function (e, i) {
    var col = 2 + i
    var est = ESTADOS[e.estado] || ESTADOS.pocos
    h.getRange(12, col).setValue(e.etapa).setFontWeight('bold').setFontSize(9).setWrap(true)
    var valor = h.getRange(13, col)
    if (e.pct === null && e.estado === 'base') valor.setValue(e.cantidad).setNumberFormat('#,##0')
    else if (e.pct === null) valor.setValue('—')
    else valor.setValue(e.pct / 100).setNumberFormat('0%')
    valor.setFontSize(24).setFontWeight('bold').setFontColor(est.tinta).setHorizontalAlignment('left')
    h.getRange(14, col).setValue(e.detalle).setFontColor(GRIS).setFontSize(9).setWrap(true)
      .setVerticalAlignment('top')
    h.getRange(15, col).setValue(est.texto).setFontColor(est.tinta).setFontSize(9).setFontWeight('bold')
    tarjeta(h.getRange(12, col, 4, 1), est.fondo)
  })
  h.setRowHeight(12, 34)
  h.setRowHeight(13, 44)
  h.setRowHeight(14, 34)

  // Lo que hay que mirar: frases armadas con los datos.
  var f = 17
  seccion(h, f, 'Lo que hay que mirar', null)
  t.frases.forEach(function (frase, i) {
    h.getRange(f + 1 + i, 2, 1, 6).merge().setValue('•  ' + frase).setWrap(true)
    h.setRowHeight(f + 1 + i, 30)
  })

  // A quién escribirle: los trabados, con qué hacer.
  f = f + 1 + nFrases + 1
  seccion(h, f, 'A quién escribirle',
    'Productores trabados: dónde quedaron y qué hacer. Se arma solo según los días que pasaron desde el registro.')
  var enc = f + 2
  var titulos = ['Productor', 'Email', 'Días desde el registro', 'Dónde quedó', 'Qué hacer']
  titulos.forEach(function (x, i) { h.getRange(enc, 2 + i).setValue(x) })
  h.getRange(enc, 6, 1, 2).merge()
  h.getRange(enc, 2, 1, 6).setFontWeight('bold').setFontColor(VERDE).setBackground(tinte(VERDE, 0.86))
    .setBorder(null, null, true, null, null, null, VERDE, SpreadsheetApp.BorderStyle.SOLID)
  h.setRowHeight(enc, 30)
  if (t.trabados.length === 0) {
    h.getRange(enc + 1, 2, 1, 6).merge().setValue('Nadie trabado por ahora.').setFontColor(GRIS).setFontStyle('italic')
  }
  t.trabados.forEach(function (fila, i) {
    var r = enc + 1 + i
    h.getRange(r, 2, 1, 4).setValues([fila.slice(0, 4)])
    h.getRange(r, 6, 1, 2).merge().setValue(fila[4]).setWrap(true)
    h.getRange(r, 2).setFontWeight('bold')
    h.getRange(r, 4).setHorizontalAlignment('center')
    h.getRange(r, 2, 1, 6).setBorder(null, null, true, null, null, null, BORDE, SpreadsheetApp.BorderStyle.SOLID)
    h.setRowHeight(r, 32)
  })

  // Para ver el detalle: las demás hojas, con link.
  f = enc + 1 + nTrabados + 1
  seccion(h, f, 'Para ver el detalle', null)
  datos.hojas.forEach(function (d, i) {
    var gid = dibujadas[d.nombre].hoja.getSheetId()
    var r = f + 1 + i
    h.getRange(r, 2)
      .setRichTextValue(SpreadsheetApp.newRichTextValue().setText(d.titulo).setLinkUrl('#gid=' + gid).build())
    h.getRange(r, 3, 1, 5).merge().setValue(d.descripcion).setFontColor(GRIS).setFontSize(9).setWrap(true)
    h.setRowHeight(r, 30)
  })
}

function seccion(h, fila, titulo, texto) {
  h.getRange(fila, 2).setValue(titulo).setFontSize(13).setFontWeight('bold').setFontColor(TINTA)
  h.setRowHeight(fila, 30)
  if (texto) h.getRange(fila + 1, 2, 1, 6).merge().setValue(texto).setFontColor(GRIS).setFontSize(9)
}

function tarjeta(rango, fondo) {
  rango.setBackground(fondo)
    .setBorder(true, true, true, true, false, false, '#ffffff', SpreadsheetApp.BorderStyle.SOLID_THICK)
}
