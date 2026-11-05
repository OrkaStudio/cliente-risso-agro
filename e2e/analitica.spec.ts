import { test, expect, type Locator } from '@playwright/test'
import { entrar } from './helpers'

/** Toca una categoría: si no está entre las más usadas, abre «Otra». */
async function enQue(panel: Locator, nombre: string) {
  const chip = panel.getByRole('group', { name: 'En qué' }).getByRole('button', { name: nombre, exact: true })
  if (!(await chip.count())) await panel.getByRole('group', { name: 'En qué' }).getByRole('button', { name: 'Otra', exact: true }).click()
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
  // Sin decir en qué, no se guarda: lo dice.
  await panel.getByRole('button', { name: 'Anotar $12.345' }).click()
  await expect(panel.getByText('Tocá en qué se fue.')).toBeVisible()

  await enQue(panel, 'Combustible')
  await panel.getByRole('group', { name: 'De qué campo' }).getByRole('button', { name: 'E2E Campo base' }).click()
  await panel.getByRole('group', { name: 'Cómo' }).getByRole('button', { name: 'Efectivo' }).click()
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
  await panel.getByRole('group', { name: 'De qué campo' }).getByRole('button', { name: 'E2E Campo base' }).click()
  await panel.getByRole('textbox', { name: 'Qué fue' }).fill('E2E cubiertas')
  await panel.getByRole('group', { name: 'Cuándo' }).getByRole('button', { name: 'En cuotas' }).click()

  const cuotas = page.getByRole('dialog', { name: 'Un gasto en cuotas' })
  await cuotas.getByRole('group', { name: 'Cuántas cuotas' }).getByRole('button', { name: '3', exact: true }).click()
  await expect(cuotas.getByText('en 3 cuotas de $30.000')).toBeVisible()
  await cuotas.getByRole('button', { name: 'Anotar las 3 cuotas' }).click()
  await expect(cuotas).toBeHidden()
  await expect(page.getByText('Listo: 3 cuotas en la Agenda')).toBeVisible()
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
  await expect(page.getByText(/Alquiler de E2E Campo base/)).toBeVisible()
})
