import { test, expect } from '@playwright/test'
import { elegir, entrar } from './helpers'

test('analitica: cargar un gasto y verlo en la lista', async ({ page }) => {
  const desc = `E2E gasto ${Date.now()}`
  await entrar(page)

  await page.getByRole('link', { name: 'Analítica', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Analítica', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: '+ Cargar' }).click()
  const carga = page.getByRole('dialog', { name: 'Cargar' })

  // Paso 1: gasto único
  await carga.getByRole('button', { name: 'Gasto', exact: true }).click()
  await carga.getByRole('button', { name: 'Único', exact: true }).click()
  await carga.getByRole('button', { name: 'Siguiente' }).click()

  // Paso 2: monto, ya pagado hoy
  await carga.getByRole('textbox', { name: 'Monto' }).fill('12345')
  await carga.getByRole('button', { name: 'Ya se pagó' }).click()
  await carga.getByRole('button', { name: 'Siguiente' }).click()

  // Paso 3: de qué
  await carga.getByRole('textbox', { name: 'Descripción' }).fill(desc)
  await elegir(page, 'Categoría', 'Combustible')
  await elegir(page, 'Campo', 'E2E Campo base')
  await carga.getByRole('button', { name: 'Cargar', exact: true }).click()
  await expect(carga).toBeHidden()

  // Aparece en "Todos los movimientos"
  await page.getByText('Todos los movimientos').click()
  await expect(page.getByRole('cell', { name: 'Combustible' }).first()).toBeVisible()
})
