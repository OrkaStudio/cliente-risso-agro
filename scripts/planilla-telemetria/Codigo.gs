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

// Un gráfico ocupa este alto en filas vacías debajo de su tabla.
var FILAS_GRAFICO = 16
var ALTO_GRAFICO = 320
var ANCHO_GRAFICO = 720

var ANCHOS = {
  texto: 150, largo: 300, email: 220, entero: 104, decimal: 104, pct: 104,
  fecha: 104, fechahora: 138, sino: 96, puntaje: 112, dispositivo: 104, activo: 104,
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
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns())
    .setFontFamily(FUENTE).setFontColor(TINTA).setFontSize(10).setVerticalAlignment('middle')

  h.getRange(1, 1).setValue(d.titulo).setFontSize(16).setFontWeight('bold').setFontColor(d.color)
  h.getRange(2, 1).setValue(d.descripcion).setFontColor(GRIS)
  h.setRowHeight(1, 34)
  h.setRowHeight(2, 22)
  h.setRowHeight(3, 10)

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
    .setBackground(color).setFontColor('#ffffff').setFontWeight('bold')
    .setWrap(true).setVerticalAlignment('middle')
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
    .setHeaderRowColor(color).setFirstRowColor('#ffffff').setSecondRowColor('#f6f8f7')
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

// ── Resumen ────────────────────────────────────────────────────────────────

function dibujarResumen(libro, h, datos, dibujadas) {
  var filasTarjetas = Math.ceil(datos.resumen.length / 4)
  var filaGrafico = 5 + filasTarjetas * 4 + 1
  var filaIndice = filaGrafico + FILAS_GRAFICO + 2
  var total = filaIndice + datos.hojas.length + 4
  limpiar(h, total, 6)
  h.setHiddenGridlines(true)
  h.setTabColor(VERDE)
  h.setColumnWidth(1, 24)
  for (var c = 2; c <= 5; c++) h.setColumnWidth(c, 230)
  h.setColumnWidth(6, 24)
  h.getRange(1, 1, total, 6).setFontFamily(FUENTE).setFontColor(TINTA).setVerticalAlignment('middle')

  h.setRowHeight(1, 16)
  h.getRange('B2').setValue('Tropero · Telemetría').setFontSize(20).setFontWeight('bold').setFontColor(VERDE)
  h.getRange('B3')
    .setValue('Actualizado el ' + Utilities.formatDate(new Date(datos.generado), HUSO, "dd/MM/yyyy 'a las' HH:mm") +
      ' · se actualiza sola cada hora · menú Orka → Actualizar ahora')
    .setFontColor(GRIS).setFontSize(10)

  // Tarjetas: 4 por fila, cada una en 3 filas (número, qué es, aclaración).
  datos.resumen.forEach(function (k, i) {
    var f = 5 + Math.floor(i / 4) * 4
    var col = 2 + (i % 4)
    var v = aValor(k.valor, k.tipo)
    var celda = h.getRange(f, col)
    celda.setValue(v === '' ? 'Nunca' : v)
      .setFontSize(k.tipo === 'fechahora' ? 16 : 28).setFontWeight('bold').setFontColor(VERDE)
      .setHorizontalAlignment('left')
    if (FORMATOS[k.tipo]) celda.setNumberFormat(FORMATOS[k.tipo])
    h.getRange(f + 1, col).setValue(k.etiqueta).setFontWeight('bold').setWrap(true)
    h.getRange(f + 2, col).setValue(k.detalle).setFontColor(GRIS).setFontSize(9).setWrap(true)
      .setVerticalAlignment('top')
    h.getRange(f, col, 3, 1).setBackground(VERDE_SUAVE)
      .setBorder(true, true, true, true, false, false, '#ffffff', SpreadsheetApp.BorderStyle.SOLID_THICK)
  })
  for (var t = 0; t < filasTarjetas; t++) {
    h.setRowHeight(5 + t * 4, 52)
    h.setRowHeight(6 + t * 4, 24)
    h.setRowHeight(7 + t * 4, 34)
    h.setRowHeight(8 + t * 4, 14)
  }

  // El embudo de activación. Graficar desde otra pestaña confunde a Sheets
  // (toma la primera fila de datos como encabezado), así que los datos se
  // copian acá, en columnas ocultas a la derecha.
  var ref = datos.graficoResumen
  var origen = ref && dibujadas[ref.hoja]
  var pos = origen && origen.tablas[ref.tabla]
  if (pos && pos.nFilas > 0 && pos.tabla.grafico) {
    var g = pos.tabla.grafico
    var usadas = [g.x].concat(g.series)
    var copia = [usadas.map(function (i) { return pos.tabla.columnas[i].etiqueta })].concat(
      pos.tabla.filas.map(function (f) { return usadas.map(function (i) { return f[i] === null ? 0 : f[i] }) }))
    var colDatos = 8
    tamano(h, Math.max(h.getMaxRows(), filaGrafico + copia.length), colDatos + usadas.length)
    h.getRange(filaGrafico, colDatos, copia.length, usadas.length).setValues(copia)
    h.hideColumns(colDatos, usadas.length)
    var posCopia = {
      filaEncabezado: filaGrafico,
      nFilas: pos.nFilas,
      tabla: {
        grafico: { tipo: g.tipo, titulo: g.titulo, colores: g.colores, apilado: g.apilado, x: 0,
          series: g.series.map(function (_, i) { return i + 1 }) },
        filas: copia.slice(1),
      },
    }
    // Las columnas de datos arrancan en `colDatos`: se corre el origen.
    posCopia.tabla.grafico.x += colDatos - 1
    posCopia.tabla.grafico.series = posCopia.tabla.grafico.series.map(function (i) { return i + colDatos - 1 })
    posCopia.tabla.filas = copia.slice(1).map(function (f) {
      var fila = []
      f.forEach(function (v, i) { fila[i + colDatos - 1] = v })
      return fila
    })
    grafico(h, h, posCopia, filaGrafico, 2, true)
  }

  // Índice: qué hay en cada hoja, con link.
  h.getRange(filaIndice, 2).setValue('Qué hay en cada hoja').setFontSize(13).setFontWeight('bold')
  datos.hojas.forEach(function (d, i) {
    var gid = dibujadas[d.nombre].hoja.getSheetId()
    var r = filaIndice + 1 + i
    h.getRange(r, 2)
      .setRichTextValue(SpreadsheetApp.newRichTextValue().setText(d.titulo).setLinkUrl('#gid=' + gid).build())
      .setFontWeight('bold')
    h.getRange(r, 3, 1, 3).merge().setValue(d.descripcion).setFontColor(GRIS).setWrap(true)
    h.setRowHeight(r, 36)
  })
  var fn = filaIndice + datos.hojas.length + 2
  h.getRange(fn, 2, 1, 4).merge()
    .setValue('No se edita a mano: cada actualización reescribe todas las hojas. Para anotar algo, usá una hoja aparte.')
    .setFontColor(GRIS).setFontSize(9).setFontStyle('italic')
}
