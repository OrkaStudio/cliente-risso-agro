import { test, expect } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL ?? ''
const PASSWORD = process.env.E2E_PASSWORD ?? ''

test('analitica: cargar un gasto y verlo en la lista', async ({ page }) => {
  // login
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible()

  // ir a Analítica
  await page.getByRole('link', { name: 'Analítica', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Analítica' })).toBeVisible()

  // cargar un gasto (tipo gasto por defecto)
  await page.getByRole('button', { name: '+ Cargar gasto/ingreso' }).click()
  await page.selectOption('#mv-categoria', { label: 'Combustible' })
  await page.selectOption('#mv-campo', { label: 'Don Gilberto' })
  await page.locator('#mv-monto').fill('12345')
  await page.locator('#mv-desc').fill('E2E test')
  await page.getByRole('button', { name: 'Cargar', exact: true }).click()

  await expect(page.getByRole('dialog')).toBeHidden()
  // aparece como fila en la tabla de movimientos
  await expect(page.getByRole('cell', { name: 'Combustible' })).toBeVisible()
})
