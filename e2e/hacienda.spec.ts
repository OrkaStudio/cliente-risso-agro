import { test, expect } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL ?? ''
const PASSWORD = process.env.E2E_PASSWORD ?? ''

// RFID con prefijo E2E para poder limpiarlo después sin tocar datos reales.
const RFID = `E2E${Date.now()}`

test('golden path Hacienda: login → alta → ficha → stock', async ({ page }) => {
  expect(EMAIL, 'definir E2E_EMAIL').not.toBe('')
  expect(PASSWORD, 'definir E2E_PASSWORD').not.toBe('')

  // --- Login ---
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  // Tras loguear: ruta protegida (shell con email + botón Salir visibles)
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible()
  await expect(page.getByText(EMAIL)).toBeVisible()

  // --- Ir a Hacienda y abrir alta ---
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hacienda' })).toBeVisible()
  await page.getByRole('link', { name: '+ Nuevo animal' }).click()

  // --- Alta con caravana manual ---
  await expect(page.getByText('Nuevo animal')).toBeVisible()
  await page.getByLabel('Caravana (RFID) *').fill(RFID)
  await page.selectOption('#categoria', 'vaca')
  await page.selectOption('#potrero', { label: 'Potrero 1' })
  await page.getByRole('button', { name: 'Dar de alta' }).click()

  // --- Ficha: muestra la caravana y el evento de alta en el historial ---
  await expect(page).toHaveURL(/\/hacienda\/[0-9a-f-]{36}$/)
  await expect(page.getByText(`Caravana ${RFID}`)).toBeVisible()
  await expect(page.getByText('Historial')).toBeVisible()
  await expect(page.getByText('Alta', { exact: true })).toBeVisible()

  // --- Lista + stock: el animal aparece en la tabla y el potrero se muestra ---
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  await expect(page.getByRole('cell', { name: RFID })).toBeVisible()
  await expect(page.getByText('Potrero 1')).toBeVisible()
})
