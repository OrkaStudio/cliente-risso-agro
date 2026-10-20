import { test, expect, type Page } from '@playwright/test'
import { entrar } from './helpers'

// RFID con prefijo E2E para poder limpiarlo después sin tocar datos reales.
const rfid = (sufijo = '') => `E2E${Date.now()}${sufijo}`

async function darDeAlta(page: Page, caravana: string) {
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  await page.getByRole('button', { name: 'Entraron', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Uno solo, con su caravana/ }).click()
  const alta = page.getByRole('dialog', { name: 'Un animal nuevo' })
  await alta.getByLabel('Caravana electrónica').fill(caravana)
  await alta.getByRole('button', { name: 'Vaca', exact: true }).click()
  await alta.getByRole('button', { name: '1A', exact: true }).first().click()
  await alta.getByRole('button', { name: 'Sumar al rodeo' }).click()
  await expect(alta).toBeHidden()
  // El rodeo es largo: se busca por la caravana, como lo haría el productor.
  await page.getByPlaceholder('Buscá una caravana').fill(caravana)
}

test('golden path Hacienda: login → alta → stock → ficha', async ({ page }) => {
  const caravana = rfid()
  await entrar(page)
  await darDeAlta(page, caravana)

  // Stock: la fila del animal, con su potrero
  const fila = page.getByRole('row', { name: new RegExp(caravana) })
  await expect(fila).toBeVisible()
  await expect(fila).toContainText('1A')

  // Ficha: la caravana y el alta en el historial
  await fila.getByRole('link').click()
  await expect(page).toHaveURL(/\/hacienda\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Vaca', level: 1 })).toBeVisible()
  await expect(page.getByText(caravana, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Su historia/ })).toBeVisible()
  await expect(page.getByText('Alta', { exact: true })).toBeVisible()
})

test('acciones del animal: registrar evento → corregir datos → dar de baja', async ({
  page,
}) => {
  const caravanaA = rfid('A')
  await entrar(page)
  await darDeAlta(page, caravanaA)
  await page
    .getByRole('row', { name: new RegExp(caravanaA) })
    .getByRole('link')
    .click()
  await expect(page.getByText(caravanaA, { exact: true })).toBeVisible()

  // Anotarle algo (sanidad)
  await page.getByRole('button', { name: 'Anotarle algo' }).click()
  const evento = page.getByRole('dialog', { name: /Qué le pasó/ })
  await evento.getByRole('button', { name: 'Aftosa' }).click()
  await evento.getByRole('button', { name: 'Anotar la sanidad' }).click()
  await expect(evento).toBeHidden()
  await expect(page.getByText('Sanidad', { exact: true })).toBeVisible()

  // Se movió: cambia el potrero de verdad (no sólo deja una nota)
  await page.getByRole('button', { name: 'Anotarle algo' }).click()
  const mov = page.getByRole('dialog', { name: /Qué le pasó/ })
  await mov.getByRole('radio', { name: 'Se movió' }).click()
  const destino = mov.getByRole('group', { name: 'A qué potrero fue' }).getByRole('button').first()
  const nombreDestino = (await destino.textContent())!.trim()
  await destino.click()
  await mov.getByRole('button', { name: `Moverlo al ${nombreDestino}` }).click()
  await expect(mov).toBeHidden()
  await expect(page.getByText(`Pasó al ${nombreDestino}`)).toBeVisible()

  // Corregir datos: la caravana y qué es, juntas; lo de antes queda en la historia
  const visible = String(Date.now()).slice(-6)
  await page.getByRole('button', { name: 'Corregir datos' }).click()
  const corregir = page.getByRole('dialog', { name: 'Corregir datos' })
  await corregir.getByLabel('Visible').fill(visible)
  await corregir.getByRole('button', { name: 'Vaquillona', exact: true }).click()
  await expect(corregir.getByText('Antes: Vaca')).toBeVisible()
  await corregir.getByRole('button', { name: 'Guardar 2 cambios' }).click()
  await expect(corregir).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Vaquillona', level: 1 })).toBeVisible()
  await expect(page.getByRole('img', { name: new RegExp(`^Caravana ${visible}`) })).toBeVisible()
  await expect(page.getByText(`Caravana nueva: la ${visible}`)).toBeVisible()
  await expect(page.getByText(`Antes tenía la ${caravanaA}`)).toBeVisible()
  await expect(page.getByText('Qué es: Vaca → Vaquillona')).toBeVisible()

  // Dar de baja
  await page.getByRole('button', { name: 'Dar de baja' }).click()
  const baja = page.getByRole('dialog', { name: /^Sale el/ })
  await baja.getByRole('radio', { name: 'Se vendió' }).click()
  await baja.getByRole('button', { name: 'Anotar la venta' }).click()
  await expect(baja).toBeHidden()
  await expect(page.getByText('Vendido', { exact: true })).toBeVisible()
})

/** Toca un potrero en el croquis del panel (o su botón, si el campo no está dibujado). */
async function tocarPotrero(page: Page, nombre: string) {
  const etiqueta = page.locator('.leaflet-tooltip', { hasText: new RegExp(`^${nombre}`) }).first()
  if (await etiqueta.count()) {
    const b = (await etiqueta.boundingBox())!
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  } else {
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${nombre}`) }).first().click()
  }
}

/** Vende una vaca del 1A por cantidad, sin decir cuál. */
async function venderUnaVaca(page: Page) {
  const panel = page.getByRole('dialog')
  await page.getByRole('button', { name: 'Salieron', exact: true }).click()
  await panel.getByRole('button', { name: /Los vendí/ }).click()
  await panel.getByRole('combobox', { name: 'Campo' }).selectOption({ label: 'E2E Campo base' })
  await tocarPotrero(page, '1A')
  await panel.getByRole('button', { name: 'Uno más: Vacas' }).click()
  await panel.getByRole('button', { name: /Revisar: 1 vaca/ }).click()
  await panel.getByRole('button', { name: 'Vender 1 vaca' }).click()
  await panel.getByRole('button', { name: 'Listo' }).click()
  await expect(panel).toBeHidden()
}

/** Abre, desde la pestaña «Sin identificar», la salida más nueva (la última fila). */
async function abrirUltimaSalida(page: Page) {
  await page.getByRole('tab', { name: /Sin identificar/ }).click()
  await page.getByRole('row', { name: /vendida|murió/ }).last().click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('salieron y entraron por cantidad, sin leer caravanas', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()

  // Salieron · Los vendí: una vaca del 1A. Todas tienen caravana → queda para identificar.
  await page.getByRole('button', { name: 'Salieron', exact: true }).click()
  const panel = page.getByRole('dialog')
  await panel.getByRole('button', { name: /Los vendí/ }).click()
  await panel.getByRole('combobox', { name: 'Campo' }).selectOption({ label: 'E2E Campo base' })
  await tocarPotrero(page, '1A')
  await panel.getByRole('button', { name: 'Uno más: Vacas' }).click()
  await panel.getByRole('button', { name: /Revisar: 1 vaca/ }).click()
  await expect(panel.getByText(/sin identificar/).first()).toBeVisible()
  await panel.getByRole('button', { name: 'Vender 1 vaca' }).click()
  await expect(panel.getByRole('heading', { name: 'Se vendió 1 vaca' })).toBeVisible()
  await expect(panel.getByText('1 sin identificar')).toBeVisible()
  await panel.getByRole('button', { name: 'Listo' }).click()

  // La salida aparece como fila propia; «No sé cuál fue» la cierra con una cualquiera.
  await abrirUltimaSalida(page)
  await panel.getByRole('radio', { name: /No sé cuál fue/ }).click()
  await expect(panel.getByText(/Queda como vendida la/)).toBeVisible()
  await panel.getByRole('button', { name: /^Que quede/ }).click()
  await expect(panel).toBeHidden()

  // Entraron · Nacieron: dos terneros en el 1A, sin caravana.
  await page.getByRole('button', { name: 'Entraron', exact: true }).click()
  await panel.getByRole('button', { name: /Nacieron/ }).click()
  await panel.getByRole('combobox', { name: 'Campo' }).selectOption({ label: 'E2E Campo base' })
  await tocarPotrero(page, '1A')
  await panel.getByRole('button', { name: 'Uno más: Terneros' }).click()
  await panel.getByRole('button', { name: 'Uno más: Terneros' }).click()
  await panel.getByRole('button', { name: /Revisar: 2 terneros/ }).click()
  await panel.getByRole('button', { name: 'Sumar 2 terneros' }).click()
  await expect(panel.getByRole('heading', { name: 'Sumamos 2 terneros nacidos' })).toBeVisible()
  await panel.getByRole('button', { name: 'Listo' }).click()
  await page.getByRole('tab', { name: /Sin caravana/ }).click()
  await expect(page.getByRole('row', { name: /Ternero/ }).first()).toBeVisible()
})

test('decir cuál salió: del potrero, de otro potrero o anularla', async ({ page }) => {
  test.slow() // tres altas y tres ventas
  await entrar(page)
  // Vacas propias para vender: el test no depende de lo que dejaron otros.
  for (const sufijo of ['S1', 'S2', 'S3']) await darDeAlta(page, rfid(sufijo))
  await page.getByPlaceholder('Buscá una caravana').fill('')
  const panel = page.getByRole('dialog')

  // Una venta por cantidad (todas con caravana): resta del número, no marca a nadie.
  await venderUnaVaca(page)
  await abrirUltimaSalida(page)
  await expect(panel.getByRole('heading', { name: /Qué vaca se vendió del 1A/ })).toBeVisible()
  await panel.getByRole('radio', { name: /^\S+ ?Vaca/ }).first().click()
  await panel.getByRole('button', { name: /^Guardar: fue la/ }).click()
  await expect(panel).toBeHidden()

  // Se tocó el potrero equivocado: la que salió está en otro potrero.
  await venderUnaVaca(page)
  await abrirUltimaSalida(page)
  await panel.getByPlaceholder('Buscá por número de caravana').fill('E2E')
  await panel.getByRole('radio', { name: /Vaca/ }).last().click()
  await panel.getByRole('button', { name: /^Guardar: fue la/ }).click()
  await expect(panel).toBeHidden()

  // Otra venta, cargada por error: se anula y el potrero queda como estaba.
  await venderUnaVaca(page)
  await abrirUltimaSalida(page)
  await panel.getByRole('radio', { name: /Me equivoqué al cargarla/ }).click()
  await panel.getByRole('radio', { name: 'No se vendió' }).click()
  await panel.getByRole('button', { name: /^Anular: no se vendió/ }).click()
  await expect(panel).toBeHidden()
})

/** Sube una planilla CSV al panel «Caravanas desde una planilla». */
async function subirPlanilla(page: Page, csv: string) {
  await page.getByRole('button', { name: 'Caravanas desde una planilla' }).click()
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'caravanas.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
}

/** Elige el campo base y toca el 1A en el croquis (o en sus botones). */
async function elDelUnoA(page: Page) {
  const panel = page.getByRole('dialog')
  const select = panel.getByRole('combobox', { name: 'Campo' })
  if (await select.count()) await select.selectOption({ label: 'E2E Campo base' })
  else await panel.getByRole('radio', { name: /E2E Campo base/ }).click()
  await tocarPotrero(page, '1A')
}

test('planilla completa: ¿Es ésta?, Revisá con el antes y después, y Deshacer', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  const panel = page.getByRole('dialog')
  const n = String(Date.now()).slice(-6)
  await subirPlanilla(page, `Caravana visible;Categoría;Potrero;Electrónica\n${n};Ternero;1A;032${n}${n}\n`)
  await expect(panel.getByRole('heading', { name: '¿Es ésta?' })).toBeVisible()
  await expect(panel.getByText('para ponerles caravana')).toBeVisible()
  await panel.getByRole('button', { name: 'Sí, es ésta' }).click()
  // Todo se entendió solo: va directo al Revisá.
  await expect(panel.getByRole('heading', { name: 'Revisá' })).toBeVisible()
  await expect(panel.getByText('1 ternero del 1A va a tener caravana')).toBeVisible()
  await panel.getByRole('button', { name: 'Ponerle caravana a 1' }).click()
  await expect(panel.getByRole('heading', { name: 'Listo: 1 caravana puesta' })).toBeVisible()

  // Deshacer: el ternero vuelve a estar sin caravana y el número queda libre.
  await panel.getByRole('button', { name: 'Deshacer esta carga' }).click()
  await expect(panel.getByRole('heading', { name: 'Se deshizo la carga' })).toBeVisible()
  await panel.getByRole('button', { name: 'Listo' }).click()
  await page.getByPlaceholder('Buscá una caravana').fill(n)
  await expect(page.getByRole('row', { name: new RegExp(n) })).toHaveCount(0)
})

test('planilla con sólo números: se dice qué son y dónde estaban, sin suponer', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  const panel = page.getByRole('dialog')
  const n = Number(String(Date.now()).slice(-6))
  await subirPlanilla(page, `Nro\n${n}\n${n + 1}\n`)
  await panel.getByRole('button', { name: 'Sí, es ésta' }).click()
  await expect(panel.getByRole('heading', { name: '¿Qué son estos 2?' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Seguir' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Todos lo mismo' }).click()
  await panel.getByRole('combobox', { name: 'Qué son todos' }).selectOption('ternero')
  await panel.getByRole('button', { name: 'Seguir' }).click()
  await expect(panel.getByRole('heading', { name: '¿Estaban todos en el mismo potrero?' })).toBeVisible()
  await elDelUnoA(page)
  await panel.getByRole('button', { name: 'Seguir' }).click()
  await expect(panel.getByText(String(n + 1), { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Ponerle caravana a 2' }).click()
  await expect(panel.getByRole('heading', { name: 'Listo: 2 caravanas puestas' })).toBeVisible()
  await panel.getByRole('button', { name: 'Listo' }).click()
  await page.getByPlaceholder('Buscá una caravana').fill(String(n + 1))
  await expect(page.getByRole('row', { name: new RegExp(String(n + 1)) })).toContainText('Ternero')
})

test('planilla que no cierra: se decide por grupo, y los errores se corrigen en el Revisá', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  const panel = page.getByRole('dialog')
  const n = String(Date.now()).slice(-6)
  await subirPlanilla(page, `Caravana;Categoría;Potrero\n${n};Toro;1A\nA-${n};Ternero;1A\n`)
  await expect(panel.getByText('con un error')).toBeVisible()
  await panel.getByRole('button', { name: 'Sí, es ésta' }).click()
  await expect(panel.getByRole('heading', { name: 'Un grupo no cierra' })).toBeVisible()
  await panel.getByRole('radio', { name: 'No ponerles caravana por ahora' }).click()
  await panel.getByRole('button', { name: 'Seguir' }).click()
  await expect(panel.getByText('Toros del 1A: 1 quedan para después')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'No hay nada para poner' })).toBeDisabled()
  // El error se corrige ahí mismo: sin la letra, entra.
  await panel.getByRole('button', { name: 'Ver y corregir' }).click()
  await panel.getByRole('textbox', { name: 'Caravana de la fila 3' }).fill(`9${n}`)
  await expect(panel.getByRole('button', { name: 'Ponerle caravana a 1' })).toBeEnabled()
})

test('desde la ficha: a uno solo se le pone su primera caravana, y la planilla le suma el chip', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  await page.getByRole('tab', { name: /Sin caravana/ }).click()
  await page.getByRole('row', { name: /Ternero/ }).first().getByRole('link').click()
  const n = String(Date.now()).slice(-5)
  await page.getByRole('button', { name: 'Ponerle caravana' }).click()
  const ficha = page.getByRole('dialog', { name: 'Corregir datos' })
  await expect(ficha.getByText('Escribí la que le pusiste.')).toBeVisible()
  await ficha.getByLabel('Visible').fill(n)
  await ficha.getByRole('button', { name: 'Guardar 1 cambio' }).click()
  await expect(ficha).toBeHidden()
  await expect(page.getByRole('img', { name: `Caravana ${n}` })).toBeVisible()
  await expect(page.getByText(`La ${n}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ponerle caravana' })).toHaveCount(0)

  // La planilla del veterinario trae su chip: se saltea la caravana y se suma el chip.
  await page.getByRole('link', { name: 'Hacienda', exact: true }).first().click()
  const panel = page.getByRole('dialog')
  await subirPlanilla(page, `Caravana;Chip\n${n};0325300${n.padStart(8, '0')}\n`)
  await expect(panel.getByText('1 ya tiene caravana')).toBeVisible()
  await panel.getByRole('button', { name: 'Sí, es ésta' }).click()
  await expect(panel.getByRole('checkbox', { name: /Sumarles el chip a 1/ })).toBeChecked()
  await panel.getByRole('button', { name: 'Sumar 1 chip' }).click()
  await expect(panel.getByRole('heading', { name: 'Listo: 1 chip sumado' })).toBeVisible()
})

test('desde la ficha: «¿Fue ésta?» → la vaca queda vendida, el número no cambia', async ({ page }) => {
  await entrar(page)
  for (const sufijo of ['F1', 'F2']) await darDeAlta(page, rfid(sufijo))
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  await venderUnaVaca(page)

  // Una vaca del 1A (todas son posibles de esa venta): su ficha pregunta.
  await page.getByPlaceholder('Buscá una caravana').fill('E2E')
  await page.getByRole('row', { name: /Vaca.*1A, E2E Campo base/ }).first().getByRole('link').click()
  await expect(page.getByText('¿Fue ésta?').first()).toBeVisible()
  await page.getByRole('button', { name: 'Sí, fue ésta' }).first().click()
  await expect(page.getByText('Vendido', { exact: true })).toBeVisible()
  await expect(page.getByText('¿Fue ésta?')).toBeHidden()
  // La caravana como la muestra la lista: la visible o, si no tiene, los últimos 4 de la electrónica.
  const etiqueta = (await page.getByRole('img', { name: /^Caravana / }).getAttribute('aria-label'))!
  const numero = etiqueta.replace(/^Caravana /, '').split(',')[0]!
  const caravana = /^\d{1,8}$/.test(numero) ? numero : numero.slice(-4)

  // Se ve en Hacienda, pestaña «Salieron».
  await page.getByRole('link', { name: 'Hacienda', exact: true }).first().click()
  await page.getByRole('tab', { name: /Salieron/ }).click()
  await expect(page.getByRole('row', { name: new RegExp(`${caravana}.*Vendida`) })).toBeVisible()
})
