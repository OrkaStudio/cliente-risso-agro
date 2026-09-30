/**
 * Planilla viva de telemetría de Tropero. Se pega en Extensiones → Apps Script
 * de la planilla. Cada hora trae las vistas de `interno` desde la edge function
 * `planilla-telemetria` y reescribe una hoja por vista.
 *
 * La clave NO va en este archivo: se carga una vez desde el menú Orka →
 * Configurar clave y queda en las propiedades del script.
 */

var URL_FUNCION = 'https://voippiczkxbxsreiqiqu.supabase.co/functions/v1/planilla-telemetria'

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
  var clave = PropertiesService.getScriptProperties().getProperty('CLAVE')
  if (!clave) throw new Error('Falta la clave: menú Orka → Configurar clave.')

  var res = UrlFetchApp.fetch(URL_FUNCION, {
    method: 'post',
    headers: { 'x-clave-planilla': clave },
    muteHttpExceptions: true,
  })
  var estado = libro.getSheetByName('Estado') || libro.insertSheet('Estado', 0)
  if (res.getResponseCode() !== 200) {
    estado.getRange('A1:B2').setValues([
      ['Última actualización', 'FALLÓ ' + new Date().toLocaleString('es-AR')],
      ['Error', res.getResponseCode() + ' ' + res.getContentText().slice(0, 200)],
    ])
    throw new Error('La función respondió ' + res.getResponseCode())
  }

  var datos = JSON.parse(res.getContentText())
  datos.hojas.forEach(function (h) {
    var hoja = libro.getSheetByName(h.nombre) || libro.insertSheet(h.nombre)
    hoja.clearContents()
    var filas = [h.columnas].concat(h.filas)
    if (h.filas.length === 0) filas.push(h.columnas.map(function (_, i) { return i === 0 ? '(sin datos todavía)' : '' }))
    hoja.getRange(1, 1, filas.length, h.columnas.length).setValues(filas)
    hoja.getRange(1, 1, 1, h.columnas.length).setFontWeight('bold')
    hoja.setFrozenRows(1)
  })

  estado.getRange('A1:B2').setValues([
    ['Última actualización', new Date(datos.generado).toLocaleString('es-AR')],
    ['Error', ''],
  ])
  estado.getRange('A4:A6').setValues([
    ['Se actualiza sola cada hora. Menú Orka → Actualizar ahora para forzarla.'],
    ['Sólo cuentas reales: las de prueba están en la hoja «Cuentas de prueba».'],
    ['No editar las hojas a mano: se reescriben en cada actualización.'],
  ])
}
