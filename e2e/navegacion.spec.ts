import { test, expect } from '@playwright/test'
import { entrar } from './helpers'

// Ir a otra pantalla con un botón la abre arriba; «atrás» vuelve a donde estabas (Lau, 05/11).
test('al ir a otra pantalla arranca arriba, y atrás vuelve a donde estaba', async ({ page }) => {
  await entrar(page)
  const columna = page.locator('main')
  await columna.evaluate((e) => e.scrollTo(0, e.scrollHeight))
  const abajo = await columna.evaluate((e) => e.scrollTop)
  expect(abajo).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Ver hacienda' }).or(page.getByRole('link', { name: 'Ver hacienda' })).first().click()
  await expect(page).toHaveURL(/\/hacienda/)
  await expect.poll(() => columna.evaluate((e) => e.scrollTop)).toBe(0)
  await page.goBack()
  await expect.poll(() => columna.evaluate((e) => e.scrollTop)).toBeGreaterThan(0)
})
