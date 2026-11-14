import { test, expect } from '@playwright/test'
import { entrar } from './helpers'

// Una dirección que no existe se dice dentro de la app, con el camino al Inicio (no «Algo salió mal»).
test('una página que no existe lleva al Inicio', async ({ page }) => {
  await entrar(page)
  await page.goto('/algo-que-no-existe')
  await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  await page.getByRole('button', { name: 'Ir al Inicio' }).click()
  await expect(page).toHaveURL(/\/$/)
})
