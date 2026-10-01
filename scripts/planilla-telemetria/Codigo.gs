/**
 * Planilla viva de telemetría de Tropero. Se pega en Extensiones → Apps Script
 * de la planilla. Cada hora trae los datos de la edge function
 * `planilla-telemetria` y dibuja dos hojas:
 *
 *  · Tablero: lo que miramos juntos para decidir (cinco preguntas).
 *  · Productores: una fila por productor con toda su historia.
 *
 * Qué se muestra lo decide la función; este script sólo dibuja.
 *
 * La clave NO va en este archivo: se carga una vez desde el menú Orka →
 * Configurar clave y queda en las propiedades del script.
 */

var URL_FUNCION = 'https://voippiczkxbxsreiqiqu.supabase.co/functions/v1/planilla-telemetria'
var HUSO = 'America/Argentina/Buenos_Aires'

var VERDE = '#178a55'
var TINTA = '#1f2a24'
var GRIS = '#6b7570'
var GRIS_CLARO = '#f5f7f6'
var BORDE = '#e3e8e5'
var ROJO = '#b3261e'
var FUENTE = 'Inter'

var ESTADOS = {
  bien: { fondo: '#e3f2e9', tinta: '#1e7a4c' },
  atencion: { fondo: '#fdf3dc', tinta: '#8a6100' },
  mal: { fondo: '#fbe6e2', tinta: '#b3261e' },
  pocos: { fondo: '#f1f3f2', tinta: '#6b7570' },
  base: { fondo: '#eef3f8', tinta: '#2f6f9f' },
}

// Hojas de versiones anteriores de la planilla: se borran.
var VIEJAS = ['Resumen', 'Activación', 'Uso', 'Tutoriales', 'Misiones', 'Embudo onboarding',
  'Tiempos onboarding', 'Sesiones onboarding', 'Eventos recientes', 'Cuentas de prueba',
  'Estado', 'Untitled', 'Hoja 1', 'Sheet1']

var ANCHOS = {
  texto: 150, largo: 340, email: 210, entero: 110, decimal: 110, fecha: 110,
  fechahora: 140, puntaje: 110, dispositivo: 100, activo: 110,
}
var FORMATOS = {
  entero: '#,##0', decimal: '#,##0.0', fecha: 'dd/mm/yyyy', fechahora: 'dd/mm/yyyy hh:mm',
  puntaje: '0" de 5"', activo: '0',
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
  var tablero = hoja(libro, 'Tablero')
  if (res.getResponseCode() !== 200) {
    // Se deja lo último que se trajo y se avisa arriba del tablero.
    tablero.getRange('B3')
      .setValue('● No se pudo actualizar (' + res.getResponseCode() + '). Los datos son de la última vez que funcionó.')
      .setFontColor(ROJO).setFontWeight('bold')
    throw new Error('La función respondió ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200))
  }

  var datos = JSON.parse(res.getContentText())
  var productores = hoja(libro, 'Productores')
  dibujarProductores(productores, datos.productores)
  dibujarTablero(tablero, productores, datos)

  VIEJAS.forEach(function (n) {
    var vieja = libro.getSheetByName(n)
    if (vieja && libro.getSheets().length > 2) libro.deleteSheet(vieja)
  })
  libro.setActiveSheet(productores)
  libro.moveActiveSheet(2)
  libro.setActiveSheet(tablero)
  libro.moveActiveSheet(1)
}

// ── Utilidades ─────────────────────────────────────────────────────────────

function hoja(libro, nombre) {
  return libro.getSheetByName(nombre) || libro.insertSheet(nombre)
}

/** Deja la hoja en blanco y con el tamaño justo. */
function limpiar(h, filas, cols) {
  h.getCharts().forEach(function (c) { h.removeChart(c) })
  if (h.getFilter()) h.getFilter().remove()
  h.getBandings().forEach(function (b) { b.remove() })
  h.setConditionalFormatRules([])
  h.setFrozenRows(0)
  h.setFrozenColumns(0)
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).breakApart()
  h.clear()
  if (h.getMaxRows() < filas) h.insertRowsAfter(h.getMaxRows(), filas - h.getMaxRows())
  if (h.getMaxRows() > filas) h.deleteRows(filas + 1, h.getMaxRows() - filas)
  if (h.getMaxColumns() < cols) h.insertColumnsAfter(h.getMaxColumns(), cols - h.getMaxColumns())
  if (h.getMaxColumns() > cols) h.deleteColumns(cols + 1, h.getMaxColumns() - cols)
  h.setRowHeights(1, h.getMaxRows(), 22)
  h.setHiddenGridlines(true)
  h.getRange(1, 1, filas, cols).setFontFamily(FUENTE).setFontColor(TINTA).setFontSize(10)
    .setVerticalAlignment('middle')
}

/** El color aclarado, para fondos suaves. */
function tinte(hex, cuanto) {
  var n = parseInt(hex.slice(1), 16)
  var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
    return Math.round(v + (255 - v) * cuanto)
  })
  return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2) }).join('')
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

/** Barra de texto proporcional: se ve igual en cualquier pantalla. */
function barra(valor, maximo, largo) {
  if (!maximo) return ''
  var n = Math.round((largo * valor) / maximo)
  return n > 0 ? new Array(n + 1).join('█') : (valor > 0 ? '▏' : '')
}

/** Tendencia en una línea de caracteres: ▁ bajo … █ alto. */
function chispa(valores) {
  var hay = valores.filter(function (v) { return v !== null && v !== undefined })
  if (hay.length === 0) return ''
  var max = Math.max.apply(null, hay)
  var min = Math.min.apply(null, hay)
  var marcas = '▁▂▃▄▅▆▇█'
  return valores.map(function (v) {
    if (v === null || v === undefined) return ' '
    if (max === min) return v > 0 ? '▄' : '▁'
    return marcas.charAt(Math.round(((v - min) / (max - min)) * 7))
  }).join('')
}

function duracion(horas) {
  if (horas === null || horas === undefined) return '—'
  if (horas < 1) return Math.round(horas * 60) + ' min'
  if (horas < 48) return Math.round(horas) + ' h'
  return (horas / 24).toFixed(1).replace('.', ',') + ' días'
}

function seccion(h, fila, titulo, texto) {
  h.getRange(fila, 2).setValue(titulo).setFontSize(13).setFontWeight('bold')
  h.setRowHeight(fila, 32)
  if (!texto) return fila + 1
  h.getRange(fila + 1, 2, 1, 6).merge().setValue(texto).setFontColor(GRIS).setFontSize(9).setWrap(true)
  return fila + 2
}

function encabezado(h, fila, titulos, desde) {
  var r = h.getRange(fila, desde, 1, titulos.length)
  r.setValues([titulos]).setFontWeight('bold').setFontColor(VERDE).setFontSize(9)
    .setBackground(tinte(VERDE, 0.88)).setWrap(true)
    .setBorder(null, null, true, null, null, null, VERDE, SpreadsheetApp.BorderStyle.SOLID)
  h.setRowHeight(fila, 30)
}

function linea(h, fila) {
  h.getRange(fila, 2, 1, 6).setBorder(null, null, true, null, null, null, BORDE, SpreadsheetApp.BorderStyle.SOLID)
}

// ── Tablero ────────────────────────────────────────────────────────────────

function dibujarTablero(h, hojaProductores, datos) {
  var t = datos.tablero
  var filas = 12 + t.camino.length + 4 + Math.max(t.fugas.length, 1) + 4 + Math.max(t.ayudar.length, 1) +
    6 + t.comparaciones.length + Math.max(t.cohortes.length, 1) + 2 + 6 + 4
  limpiar(h, filas, 8)
  h.setTabColor(VERDE)
  h.setColumnWidth(1, 28)
  h.setColumnWidth(2, 200)
  for (var c = 3; c <= 7; c++) h.setColumnWidth(c, 150)
  h.setColumnWidth(8, 28)

  // Encabezado: la pregunta, si la medición anda y el titular.
  h.getRange('B2').setValue('Tropero · ¿Funciona?').setFontSize(22).setFontWeight('bold').setFontColor(VERDE)
  h.setRowHeight(2, 44)
  h.getRange('B3')
    .setValue('● ' + t.salud.texto + ' · actualizado ' +
      Utilities.formatDate(new Date(datos.generado), HUSO, "dd/MM 'a las' HH:mm"))
    .setFontColor(t.salud.ok ? ESTADOS.bien.tinta : ESTADOS.atencion.tinta).setFontSize(9)
  h.getRange(5, 2, 1, 6).merge().setValue(t.titular).setFontSize(12).setWrap(true)
    .setBackground(GRIS_CLARO).setVerticalAlignment('middle')
  h.setRowHeight(5, 48)
  var f = 7

  // 1 · El camino.
  f = seccion(h, f, '1 · ¿El que llega, llega a ver su campo?',
    'Cada etapa contra su meta (qué porcentaje de la anterior pasa). En gris, menos de ' + t.minimo +
    ' personas: todavía no se puede concluir.')
  var maximo = Math.max.apply(null, t.camino.map(function (e) { return e.cantidad }))
  t.camino.forEach(function (e) {
    var est = ESTADOS[e.estado] || ESTADOS.pocos
    h.getRange(f, 2).setValue(e.etapa).setFontWeight('bold')
    h.getRange(f, 3, 1, 2).merge().setValue(barra(e.cantidad, maximo, 22)).setFontColor(est.tinta)
    h.getRange(f, 5).setValue(e.cantidad).setNumberFormat('#,##0').setHorizontalAlignment('right')
      .setFontWeight('bold')
    h.getRange(f, 6).setValue(e.pct === null ? '' : e.pct + ' %').setHorizontalAlignment('right')
      .setFontColor(est.tinta).setFontWeight('bold')
    var chip = e.estado === 'base' ? '' :
      e.estado === 'pocos' ? 'pocos datos · meta ' + e.meta + ' %' :
      (e.estado === 'bien' ? '✓ ' : e.estado === 'mal' ? '✗ ' : '! ') + 'meta ' + e.meta + ' %'
    h.getRange(f, 7).setValue(chip).setFontColor(est.tinta).setBackground(est.fondo).setFontSize(9)
      .setHorizontalAlignment('center')
    linea(h, f)
    f++
  })
  f++

  // 2 · Dónde se traba.
  f = seccion(h, f, '2 · ¿Dónde se traba?', 'Las fugas que más productores afectan, ordenadas, con qué hacer.')
  if (t.fugas.length === 0) {
    h.getRange(f, 2, 1, 6).merge().setValue('Sin fugas todavía.').setFontColor(GRIS).setFontStyle('italic')
    f++
  }
  var numeros = ['①', '②', '③']
  t.fugas.forEach(function (x, i) {
    h.getRange(f, 2, 1, 4).merge().setValue(numeros[i] + '  ' + x.que + ' — ' + x.n).setWrap(true)
      .setFontWeight('bold')
    h.getRange(f, 6, 1, 2).merge().setValue('→ ' + x.hacer).setFontColor(GRIS).setWrap(true)
    h.setRowHeight(f, 34)
    linea(h, f)
    f++
  })
  f++

  // 3 · A quién ayudar.
  f = seccion(h, f, '3 · ¿A quién ayudamos hoy?',
    'Los trabados según los días que pasaron desde el registro. Escribirles es lo que más convierte con pocos usuarios.')
  encabezado(h, f, ['Productor', 'Email', 'Días', 'Dónde quedó', 'Qué hacer', ''], 2)
  h.getRange(f, 6, 1, 2).merge()
  f++
  if (t.ayudar.length === 0) {
    h.getRange(f, 2, 1, 6).merge().setValue('Nadie trabado por ahora.').setFontColor(GRIS).setFontStyle('italic')
    f++
  }
  t.ayudar.forEach(function (p) {
    h.getRange(f, 2, 1, 4).setValues([[p.nombre, p.email, p.dias, p.etapa]])
    h.getRange(f, 2).setFontWeight('bold')
    h.getRange(f, 4).setHorizontalAlignment('center')
    h.getRange(f, 6, 1, 2).merge().setValue(p.hacer).setWrap(true)
    h.setRowHeight(f, 34)
    linea(h, f)
    f++
  })
  f++

  // 4 · ¿Mejora con el tiempo?
  f = seccion(h, f, '4 · ¿Mejora con el tiempo?',
    'Por día de registro: qué porcentaje llegó (eficacia) y en cuánto tiempo desde el registro (eficiencia, mediana). ' +
    'Las cohortes de menos de 7 días están en curso: todavía pueden llegar.')
  t.comparaciones.forEach(function (x) {
    h.getRange(f, 2, 1, 6).merge().setValue('•  ' + x).setFontWeight('bold')
    f++
  })
  encabezado(h, f, ['Día de registro', 'Se registraron', 'Terminaron el alta', 'Aha: vieron su campo',
    'Setup (tutorial)', 'Anotaron (7 d)'], 2)
  f++
  if (t.cohortes.length === 0) {
    h.getRange(f, 2, 1, 6).merge().setValue('Todavía no hay registros con la medición puesta.')
      .setFontColor(GRIS).setFontStyle('italic')
    f++
  }
  var pv = function (x, unidad) {
    if (x.pct === null) return '—'
    var tiempo = x.valor === null ? '' : ' · ' + (unidad === 'min' ? Math.round(x.valor) + ' min' : duracion(x.valor))
    return Math.round(x.pct) + ' %' + tiempo
  }
  t.cohortes.forEach(function (c) {
    var p = c.dia.split('-')
    var dia = p[2] + '/' + p[1] + (c.enCurso ? '  (en curso)' : '')
    h.getRange(f, 2, 1, 6).setValues([[dia, c.registrados, pv(c.alta, 'min'), pv(c.aha, 'h'), pv(c.setup, 'h'),
      c.anoto === null ? '—' : Math.round(c.anoto) + ' %']])
    h.getRange(f, 3, 1, 5).setHorizontalAlignment('center')
    if (c.enCurso) h.getRange(f, 2, 1, 6).setFontColor(GRIS).setFontStyle('italic')
    linea(h, f)
    f++
  })
  if (t.cohortes.length > 1) {
    // De más viejo a más nuevo, para leer la tendencia de izquierda a derecha.
    var orden = t.cohortes.slice().reverse()
    h.getRange(f, 2).setValue('Tendencia del tiempo (más bajo = más rápido)').setFontColor(GRIS).setFontSize(9)
      .setWrap(true)
    h.getRange(f, 4).setValue(chispa(orden.map(function (c) { return c.alta.valor })))
    h.getRange(f, 5).setValue(chispa(orden.map(function (c) { return c.aha.valor })))
    h.getRange(f, 6).setValue(chispa(orden.map(function (c) { return c.setup.valor })))
    h.getRange(f, 4, 1, 3).setFontColor(VERDE).setFontSize(12).setHorizontalAlignment('center')
    h.setRowHeight(f, 30)
    f++
  }
  f++

  // 5 · ¿Vuelven?
  f = seccion(h, f, '5 · ¿Vuelven?', null)
  var hoy = t.vuelven[t.vuelven.length - 1] || 0
  var pico = t.vuelven.length ? Math.max.apply(null, t.vuelven) : 0
  h.getRange(f, 2, 1, 6).merge()
    .setValue(pico > 0 ? chispa(t.vuelven) : 'Todavía nadie abrió la app con la medición puesta.')
    .setFontColor(pico > 0 ? VERDE : GRIS).setFontSize(pico > 0 ? 22 : 10)
  h.setRowHeight(f, 40)
  f++
  h.getRange(f, 2, 1, 6).merge()
    .setValue('Productores que abrieron la app cada día, últimos 30 días · hoy ' + hoy + ' · el día con más: ' + pico)
    .setFontColor(GRIS).setFontSize(9)
  f += 2

  h.getRange(f, 2, 1, 6).merge()
    .setRichTextValue(SpreadsheetApp.newRichTextValue()
      .setText('El detalle de cada productor está en la pestaña Productores →')
      .setLinkUrl('#gid=' + hojaProductores.getSheetId()).build())
    .setFontSize(9)
}

// ── Productores ────────────────────────────────────────────────────────────

function dibujarProductores(h, d) {
  var cols = d.columnas.length
  var n = Math.max(d.filas.length, 1)
  limpiar(h, 4 + n + 3, cols + 1)
  h.setTabColor(GRIS)

  h.getRange(1, 1).setValue('Productores').setFontSize(16).setFontWeight('bold').setFontColor(VERDE)
  h.getRange(2, 1).setValue('Una fila por productor real: dónde está, qué le falta, cuánto tardó y cuánto usa la app.')
    .setFontColor(GRIS)
  h.setRowHeight(1, 34)

  var fila = 4
  h.getRange(fila, 1, 1, cols).setValues([d.columnas.map(function (c) { return c.etiqueta })])
    .setFontWeight('bold').setFontColor(VERDE).setBackground(tinte(VERDE, 0.88)).setWrap(true)
    .setBorder(null, null, true, null, null, null, VERDE, SpreadsheetApp.BorderStyle.SOLID)
  h.setRowHeight(fila, 40)
  d.columnas.forEach(function (c, i) { h.setColumnWidth(i + 1, ANCHOS[c.tipo] || 140) })

  if (d.filas.length === 0) {
    h.getRange(fila + 1, 1).setValue('Todavía no hay productores reales.').setFontColor(GRIS).setFontStyle('italic')
    return
  }
  var valores = d.filas.map(function (f) {
    return f.map(function (v, i) { return aValor(v, d.columnas[i].tipo) })
  })
  h.getRange(fila + 1, 1, valores.length, cols).setValues(valores)

  var reglas = []
  d.columnas.forEach(function (c, i) {
    var col = h.getRange(fila + 1, i + 1, valores.length, 1)
    if (FORMATOS[c.tipo]) col.setNumberFormat(FORMATOS[c.tipo])
    if (['entero', 'decimal', 'puntaje', 'activo'].indexOf(c.tipo) !== -1) col.setHorizontalAlignment('right')
    if (c.tipo === 'dispositivo') col.setHorizontalAlignment('center')
    if (c.tipo === 'largo') col.setWrap(true)
    if (i === 0) col.setFontWeight('bold')
    if (c.tipo === 'puntaje') {
      reglas.push(SpreadsheetApp.newConditionalFormatRule().setRanges([col])
        .setGradientMinpointWithValue('#f4c7bd', SpreadsheetApp.InterpolationType.NUMBER, '0')
        .setGradientMidpointWithValue('#fbe9b7', SpreadsheetApp.InterpolationType.NUMBER, '3')
        .setGradientMaxpointWithValue('#bfe3cd', SpreadsheetApp.InterpolationType.NUMBER, '5')
        .build())
    }
    if (c.tipo === 'activo') {
      reglas.push(SpreadsheetApp.newConditionalFormatRule().setRanges([col])
        .whenNumberEqualTo(0).setFontColor(ROJO).build())
    }
  })
  h.setConditionalFormatRules(reglas)

  var tabla = h.getRange(fila, 1, valores.length + 1, cols)
  tabla.applyRowBanding(SpreadsheetApp.BandingTheme.GREEN, true, false)
    .setHeaderRowColor(tinte(VERDE, 0.88)).setFirstRowColor('#ffffff').setSecondRowColor('#f8faf9')
  tabla.createFilter()
  h.setFrozenRows(fila)
}
