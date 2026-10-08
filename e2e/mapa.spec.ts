import { test, expect, type Page } from '@playwright/test'
import { codigoDelLog } from './helpers'

// Módulo 3 · Mapa del campo, contra Supabase local. Cada test arma su propia
// empresa: onboarding con un campo de 100 ha y dos potreros (60 y 40).

test.use({ viewport: { width: 1440, height: 900 } })

async function empresaConOnboarding(page: Page) {
  const numero = `22413${String(Date.now()).slice(-5)}`
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill('Prueba')
  await page.getByLabel('Apellido').fill('Mapa')
  await page.locator('input[type=tel]').fill(numero)
  await page.getByRole('button', { name: 'Seguir, mandame el código' }).click()
  await page.waitForURL('**/login/codigo')
  await page.waitForTimeout(800)
  await page.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await page.waitForURL('**/onboarding')
  await page.getByRole('button', { name: 'Crear mi empresa' }).click()
  await page.getByLabel('Cómo se llama').fill('La Porteña')
  await page.getByRole('combobox').fill('Chascomús')
  await page.getByRole('option', { name: /Chascom/ }).first().click()
  await page.getByLabel('Cuántas hectáreas').fill('100')
  await page.getByRole('button', { name: 'Guardar el campo' }).click()
  await expect(page.getByRole('heading', { name: '¿Cómo lo tenés dividido?' })).toBeVisible()
  await page.locator('input[inputmode=decimal]').nth(0).fill('60')
  await page.getByRole('button', { name: 'Sumar otro potrero' }).click()
  await page.locator('input[inputmode=decimal]').nth(1).fill('40')
  await page.getByRole('button', { name: 'Guardar los 2 potreros' }).click()
  await page.getByRole('radio', { name: 'Hacienda' }).click()
  await page.getByLabel('Vacas').fill('30')
  await page.getByRole('button', { name: 'Siguiente potrero' }).click()
  await expect(page.getByRole('heading', { name: '¿Qué hay en el 2A?' })).toBeVisible()
  await page.getByRole('radio', { name: 'Sembrado' }).click()
  await page.getByRole('button', { name: 'Trigo' }).click()
  await page.getByRole('button', { name: 'Listo, La Porteña' }).click()
  await page.getByRole('button', { name: 'No, con La Porteña está' }).click()
  await expect(page.getByRole('heading', { name: 'Tus campos están cargados.' })).toBeVisible()
}

/** Toca las esquinas y cierra tocando la primera (como el productor). */
async function dibujar(page: Page, puntos: [number, number][]) {
  for (const [x, y] of puntos) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(150)
  }
  await page.mouse.click(puntos[0]![0], puntos[0]![1])
}

test('primero el campo: sin el mapa sólo andan el Inicio y Campos', async ({ page }) => {
  await empresaConOnboarding(page)
  await page.getByRole('button', { name: 'Después: queda esperando en el Inicio' }).click()
  await expect(page).not.toHaveURL(/onboarding/)
  await page.goto('/hacienda')
  await expect(page).toHaveURL(/\/mapa$/)
  await expect(page.getByRole('heading', { name: 'Armemos La Porteña en el mapa' })).toBeVisible()
  await page.goto('/campos')
  await expect(page).toHaveURL(/\/campos$/)
})

test('de punta a punta: borde a mano, los dos potreros y se abre la app', async ({ page }) => {
  await empresaConOnboarding(page)
  await page.getByRole('button', { name: 'Ubicar La Porteña en el mapa' }).click()
  await page.waitForURL('**/mapa/**')
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByRole('heading', { name: 'Encontrá tu campo' })).toBeVisible()
  await page.getByRole('button', { name: 'Ya lo veo' }).click()
  await page.getByRole('button', { name: 'No la tengo: lo marco en el mapa' }).click()
  await expect(page.getByRole('heading', { name: 'Clic en cada esquina' })).toBeVisible()

  await dibujar(page, [[260, 260], [680, 240], [700, 640], [280, 660]])
  await expect(page.getByRole('heading', { name: /La Porteña mide unas \d+ ha/ })).toBeVisible()
  await page.getByRole('button', { name: 'Seguir con los potreros' }).click()

  await expect(page.getByRole('heading', { name: 'Dibujá un potrero' })).toBeVisible()
  await dibujar(page, [[300, 300], [500, 290], [510, 620], [310, 630]])
  await expect(page.getByRole('heading', { name: /¿Cuál es\?/ })).toBeVisible()
  // Ninguno de tamaño parecido: hay que elegir.
  await expect(page.getByText('Elegí uno para seguir')).toBeVisible()
  await page.getByRole('radio', { name: /1A/ }).click()
  await page.getByRole('button', { name: 'Es el 1A' }).click()
  await expect(page.getByRole('heading', { name: 'El 1A ya está' })).toBeVisible()

  await page.getByRole('button', { name: 'Dibujar otro' }).click()
  // Uno encima del otro no se acepta.
  await dibujar(page, [[320, 320], [480, 320], [480, 600], [320, 600]])
  await expect(page.getByText('Se pisa con el 1A. Dibujalo al lado.')).toBeVisible()
  await dibujar(page, [[560, 300], [660, 290], [675, 600], [570, 605]])
  // Queda uno solo: va elegido.
  await page.getByRole('button', { name: 'Es el 2A' }).click()
  await page.getByRole('button', { name: 'Listo, La Porteña' }).click()
  await expect(page.getByRole('heading', { name: 'Tu campo, en el mapa' })).toBeVisible()
  await page.getByRole('button', { name: 'Ir al Inicio' }).click()
  await expect(page).not.toHaveURL(/mapa/)

  // La app quedó abierta.
  await page.goto('/hacienda')
  await expect(page).toHaveURL(/\/hacienda$/)
})
