import { test, expect } from '@playwright/test'
import { CELULAR_E2E, CODIGO_E2E, entrar } from './helpers'
import { borrarCampo } from './mapa-e2e'

// Los campos que crea un test se borran al terminar: uno a medias trabaría la app (primero el mapa).
const creados: string[] = []
test.afterEach(() => {
  for (const n of creados.splice(0)) borrarCampo(n)
})


test('campos: sumar un campo, y si todavía no está en el mapa, ubicarlo', async ({ page }) => {
  const campo = `E2E Campo ${Date.now()}`
  creados.push(campo)
  await entrar(page)

  await page.getByRole('link', { name: 'Campos', exact: true }).click()

  // Sumar un campo: la localidad sale del buscador (Open-Meteo), nunca texto suelto
  await page.getByRole('button', { name: '+ Sumar un campo' }).click()
  const alta = page.getByRole('dialog', { name: 'Nuevo campo' })
  await alta.getByLabel('Nombre').fill(campo)
  await alta.getByRole('button', { name: 'Ganadera' }).click()
  await alta.getByRole('combobox', { name: '¿Dónde está el campo?' }).fill('Chascomús')
  await page.getByRole('option', { name: /Chascom/ }).first().click()
  await alta.getByLabel('Hectáreas (opcional)').fill('50')
  await alta.getByRole('button', { name: 'Crear campo' }).click()
  await expect(alta).toBeHidden()

  // Queda elegido y, como no tiene borde, Campos se vuelve el mapa para armarlo: sin salir de la web.
  await expect(page.getByRole('heading', { name: `Armemos ${campo} en el mapa` })).toBeVisible()
  await page.getByRole('button', { name: 'Empezar' }).click()
  // En Buenos Aires arranca por el número de partida de la boleta.
  await expect(page.getByRole('heading', { name: '¿Tenés a mano la boleta de ARBA?' })).toBeVisible()
  await expect(page).toHaveURL(/\/campos/)

  // Primero el mapa: mientras ese campo no esté dibujado, la Hacienda lleva a terminarlo.
  await page.goto('/hacienda')
  await expect(page).toHaveURL(/\/campos/)
  await expect(page.getByRole('region', { name: 'Falta terminar el mapa' })).toContainText(`Falta terminar ${campo}`)
  await expect(page.getByRole('radiogroup', { name: 'Qué campo estás viendo' }).getByRole('radio', { name: new RegExp(campo) })).toContainText('Falta el mapa')

  // Sumado por error y sin hacienda: se saca, y la app se destraba.
  await page.getByRole('button', { name: 'Sumé este campo por error: sacarlo' }).click()
  await page.getByRole('button', { name: `Sí, sacar ${campo}` }).click()
  await expect(page.getByRole('radio', { name: new RegExp(campo) })).toHaveCount(0)
  await page.goto('/hacienda')
  await expect(page).toHaveURL(/\/hacienda$/)
})

test('el Modo Campo no se abre desde la compu: ni botón ni URL', async ({ page }) => {
  await entrar(page)
  await expect(page.getByRole('link', { name: /Modo Campo/ })).toHaveCount(0)

  await page.goto('/campo/recorrida')
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible()
  await expect(page).not.toHaveURL(/\/campo(\/|$)/)
  await page.screenshot({ path: 'test-results/modo-campo-compu.png' })
})

test('en el celular el Modo Campo sigue abriendo', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Tu celular, el que tiene WhatsApp').fill(CELULAR_E2E)
  await page.getByRole('button', { name: 'Mandame el código' }).click()
  await page.waitForURL('**/login/codigo')
  await page.locator('#codigo').fill(CODIGO_E2E)
  await expect(page.getByRole('navigation', { name: 'Modo Campo' })).toBeVisible()
  await expect(page).toHaveURL(/\/campo$/)
  await page.screenshot({ path: 'test-results/modo-campo-celular.png' })
  await context.close()
})

test('el campo se elige en la barra: filtra donde estás y «Todos» es la vista general', async ({ page }) => {
  await entrar(page)
  const barra = page.getByRole('radiogroup', { name: 'Qué campo estás viendo' })
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  await barra.getByRole('radio', { name: /E2E Campo base \d+ cab/ }).click()
  // Te quedás en la pantalla; ella dice qué estás viendo y no deja elegir otro.
  await expect(page).toHaveURL(/\/hacienda$/)
  await expect(barra.getByRole('radio', { name: /E2E Campo base \d+ cab/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Estás viendo').locator('..')).toContainText('E2E Campo base')
  await expect(page.getByRole('radiogroup', { name: 'Qué campo estás viendo' })).toHaveCount(1)

  await page.getByRole('link', { name: 'Campos', exact: true }).click()
  await barra.getByRole('radio', { name: /^Todos tus campos/ }).click()
  await expect(page.getByRole('heading', { name: 'Todos tus campos' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Mapa de todos tus campos' })).toBeVisible()
})
