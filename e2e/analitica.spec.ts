import { test, expect, type Locator } from '@playwright/test'
import { entrar } from './helpers'

/** Toca una categoría: si no está entre las más usadas, abre «Otra». */
async function enQue(panel: Locator, nombre: string) {
  const chip = panel.getByRole('group', { name: 'En qué' }).getByRole('button', { name: nombre, exact: true })
  if (!(await chip.count())) await panel.getByRole('group', { name: 'En qué' }).getByRole('button', { name: /^Ver las \d+$/ }).click()
  await chip.click()
}

test('plata: anotar un gasto, verlo en los movimientos y buscarlo', async ({ page }) => {
  const desc = `E2E gasto ${Date.now()}`
  await entrar(page)

  await page.getByRole('link', { name: 'Plata', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lo que viene' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'En qué se va' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Qué rinde' })).toBeVisible()

  await page.getByRole('button', { name: 'Anotar un gasto' }).click()
  const panel = page.getByRole('dialog', { name: 'Anotar plata' })
  await panel.getByRole('textbox', { name: 'Cuánto' }).fill('12345')
  // En pasos: sin decir en qué, no sigue: lo dice.
  await panel.getByRole('button', { name: 'Seguir' }).click()
  await expect(panel.getByText('Tocá en qué se fue.')).toBeVisible()

  await enQue(panel, 'Combustible')
  await panel.getByRole('button', { name: 'Seguir' }).click()
  await panel.getByRole('group', { name: 'De qué campo' }).getByRole('button', { name: 'E2E Campo base' }).click()
  await panel.getByRole('group', { name: 'Cómo' }).getByRole('button', { name: 'Efectivo' }).click()
  // Cuándo no viene elegido: hay que tocarlo.
  await panel.getByRole('button', { name: 'Seguir' }).click()
  await expect(panel.getByText('Tocá cuándo salió.')).toBeVisible()
  await panel.getByRole('group', { name: 'Cuándo' }).getByRole('button', { name: 'Hoy' }).click()
  await panel.getByRole('button', { name: 'Seguir' }).click()
  await panel.getByRole('textbox', { name: 'Qué fue' }).fill(desc)
  await panel.getByRole('button', { name: 'Anotar $12.345' }).click()
  await expect(panel).toBeHidden()

  // En los movimientos del mes, y se encuentra buscándolo.
  await page.getByRole('link', { name: 'Ver los movimientos' }).click()
  await page.getByRole('textbox', { name: 'Buscar un movimiento' }).fill(desc)
  await expect(page.getByText(desc)).toBeVisible()
  await expect(page.getByText('−$12.345')).toBeVisible()
})

test('plata: un gasto en cuotas va a la Agenda', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Plata', exact: true }).click()
  await page.getByRole('button', { name: 'Anotar un gasto' }).click()
  const panel = page.getByRole('dialog', { name: 'Anotar plata' })
  await panel.getByRole('textbox', { name: 'Cuánto' }).fill('90000')
  await enQue(panel, 'Combustible')
  await panel.getByRole('button', { name: 'Seguir' }).click()
  await panel.getByRole('group', { name: 'De qué campo' }).getByRole('button', { name: 'E2E Campo base' }).click()
  await panel.getByRole('group', { name: 'Cuándo' }).getByRole('button', { name: 'En varios pagos' }).click()

  // A plazos: se tocan los días (30, 60, 90) y el total se divide.
  const varios = page.getByRole('dialog', { name: 'Lo pagás en varios pagos' })
  await varios.getByRole('radio', { name: /^A plazos/ }).click()
  for (const d of ['30 días', '60 días', '90 días']) await varios.getByRole('group', { name: 'A cuántos días' }).getByRole('button', { name: d }).click()
  await expect(varios.getByRole('region', { name: 'Cómo queda' })).toContainText('3 pagos')
  await expect(varios.getByRole('region', { name: 'Cómo queda' })).toContainText('$90.000 en total')
  // Se puede volver atrás al paso de antes.
  await varios.getByRole('button', { name: 'Volver' }).click()
  await expect(page.getByRole('dialog', { name: 'Anotar plata' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Anotar plata' }).getByRole('group', { name: 'Cuándo' }).getByRole('button', { name: 'En varios pagos' }).click()
  await varios.getByRole('button', { name: 'Anotar 3 pagos de $30k' }).click()
  await expect(varios).toBeHidden()
  await expect(page.getByText('Listo: 3 pagos de $30.000 en la Agenda')).toBeVisible()
})

test('plata: el alquiler de un campo, paso a paso, queda en la Agenda', async ({ page }) => {
  await entrar(page)
  await page.getByRole('radiogroup', { name: 'Qué campo estás viendo' }).getByRole('radio', { name: /^Todos tus campos/ }).click()
  await page.getByRole('link', { name: 'Plata', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar un alquiler' }).click()
  // Sin campo elegido en la barra, pregunta cuál (aunque ninguno esté marcado como alquilado).
  await page.getByRole('dialog', { name: '¿De qué campo?' }).getByRole('button', { name: /E2E Campo base/ }).click()
  await page.getByRole('dialog', { name: '¿En qué está pactado?' }).getByRole('button', { name: /En pesos/ }).click()
  const cuanto = page.getByRole('dialog', { name: '¿Cuánto?' })
  await cuanto.getByRole('button', { name: 'Seguir' }).click()
  await expect(cuanto.getByRole('alert')).toBeVisible()
  await cuanto.getByRole('textbox').fill('100000')
  await cuanto.getByRole('button', { name: 'Seguir' }).click()
  await page.getByRole('dialog', { name: '¿Cuándo se paga?' }).getByRole('button', { name: 'Seguir' }).click()
  const resumen = page.getByRole('dialog', { name: 'Así queda' })
  await expect(resumen).toContainText('$300.000')
  await resumen.getByRole('button', { name: 'Guardar el alquiler' }).click()
  await expect(resumen).toBeHidden()
  await expect(page.getByText(/Listo: anotamos el alquiler de E2E Campo base/)).toBeVisible()
})

test('plata: un sueldo que se repite queda con el mismo monto cada mes', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Agenda', exact: true }).click()
  await page.getByRole('button', { name: 'Anotar un pago o un cobro' }).click()
  const panel = page.getByRole('dialog', { name: 'Algo que vence' })
  await panel.getByRole('textbox', { name: 'Cuánto' }).fill('2900000')
  await enQue(panel, 'Combustible')
  await panel.getByRole('button', { name: 'Seguir' }).click()
  await panel.getByRole('group', { name: 'De qué campo' }).getByRole('button', { name: 'E2E Campo base' }).click()
  await panel.getByRole('group', { name: 'Cuándo vence' }).getByRole('button', { name: 'En varios pagos' }).click()
  const repite = page.getByRole('dialog', { name: 'Lo pagás en varios pagos' })
  // Todos los meses: lo escrito es lo de cada mes.
  await repite.getByRole('radio', { name: /^Todos los meses/ }).click()
  await repite.getByRole('group', { name: 'Cuántos meses' }).getByRole('button', { name: '6', exact: true }).click()
  await expect(repite.getByRole('radio', { name: 'Lo de cada pago' })).toBeChecked()
  await repite.getByRole('button', { name: /^Anotar 6 pagos de/ }).click()
  await expect(repite).toBeHidden()
  await expect(page.getByText(/Listo: 6 pagos de \$2\.900\.000/)).toBeVisible()
})
