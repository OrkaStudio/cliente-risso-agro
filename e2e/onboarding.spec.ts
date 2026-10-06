import { test, expect, type Page } from '@playwright/test'
import { codigoDelLog } from './helpers'

// Onboarding (spec «Tropero para código», 2 · Onboarding), contra Supabase local.
// Cada test crea su propia cuenta: el onboarding es de una empresa nueva.

test.use({ viewport: { width: 1440, height: 900 } })

async function cuentaNueva(page: Page): Promise<string> {
  const numero = `22415${String(Date.now()).slice(-5)}`
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill('Daniel')
  await page.getByLabel('Apellido').fill('Risso')
  await page.locator('input[type=tel]').fill(numero)
  await page.getByRole('button', { name: 'Seguir, mandame el código' }).click()
  await page.waitForURL('**/login/codigo')
  await page.waitForTimeout(800)
  await page.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await page.waitForURL('**/onboarding')
  return numero
}

async function empresaYCampo(page: Page, hectareas = '353') {
  await expect(page.getByLabel('Nombre')).toHaveValue('Risso Agro')
  await page.getByRole('button', { name: 'Crear mi empresa' }).click()
  await page.getByLabel('Cómo se llama').fill('La Porteña')
  await page.getByRole('combobox').fill('Chascomús')
  await page.getByRole('option', { name: /Chascom/ }).first().click()
  await page.getByLabel('Cuántas hectáreas').fill(hectareas)
  await page.getByRole('button', { name: 'Guardar el campo' }).click()
  await expect(page.getByRole('heading', { name: '¿Cómo lo tenés dividido?' })).toBeVisible()
}

async function potreros(page: Page, filas: [string, string][]) {
  for (let i = 0; i < filas.length; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Sumar otro potrero' }).click()
    await page.getByLabel(`Número del potrero ${i + 1}`).fill(filas[i]![0])
    await page.locator('input[inputmode=decimal]').nth(i).fill(filas[i]![1])
  }
}

test('de punta a punta: empresa, campo, potreros, qué hay en cada uno y el cierre', async ({ page }) => {
  await cuentaNueva(page)
  await expect(page.getByText('Paso 1 de 4')).toBeVisible()
  await empresaYCampo(page)
  await potreros(page, [['11', '116'], ['8', '45'], ['3', '192']])
  await expect(page.getByText('3 potreros, 353 de 353 ha: cierran justo')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar los 3 potreros' }).click()

  await expect(page.getByRole('heading', { name: '¿Qué hay en el 11A?' })).toBeVisible()
  // Sin elegir no avanza.
  await page.getByRole('button', { name: 'Siguiente potrero' }).click()
  await expect(page.getByText('Elegí qué hay: hacienda, sembrado o descanso.')).toBeVisible()
  await page.getByRole('radio', { name: 'Hacienda' }).click()
  await page.getByLabel('Vacas').fill('26')
  await page.getByLabel('Terneros').fill('18')
  await page.getByRole('radio', { name: 'Ovinos' }).click()
  await page.getByLabel('Ovejas').fill('10')
  await page.getByRole('button', { name: 'Siguiente potrero' }).click()

  await expect(page.getByRole('heading', { name: '¿Qué hay en el 8A?' })).toBeVisible()
  await page.getByRole('radio', { name: 'Sembrado' }).click()
  await page.getByRole('button', { name: 'Otro' }).click()
  await page.getByLabel('Qué está sembrado').fill('Cebada')
  await page.getByRole('button', { name: 'Siguiente potrero' }).click()

  await expect(page.getByRole('heading', { name: '¿Qué hay en el 3A?' })).toBeVisible()
  await page.getByRole('radio', { name: 'Descanso' }).click()
  await page.getByRole('radio', { name: 'Más de dos meses' }).click()
  await page.getByRole('button', { name: 'Listo, La Porteña' }).click()

  await expect(page.getByRole('heading', { name: '¿Tenés otro campo?' })).toBeVisible()
  await page.getByRole('button', { name: 'No, con La Porteña está' }).click()
  await expect(page.getByRole('heading', { name: 'Tus campos están cargados.' })).toBeVisible()
  await expect(page.getByText('Propio · 353 ha · 3 potreros · 54 cabezas')).toBeVisible()

  // Terminado: «Después» lleva al Inicio y entrar ya no vuelve al onboarding.
  await page.getByRole('button', { name: 'Después: queda esperando en el Inicio' }).click()
  await expect(page).not.toHaveURL(/onboarding/)
  await page.goto('/onboarding')
  await expect(page).not.toHaveURL(/onboarding/)
})

test('retoma donde quedó: al recargar y desde otro equipo', async ({ page, browser }) => {
  const numero = await cuentaNueva(page)
  await empresaYCampo(page, '100')
  await potreros(page, [['1', '60'], ['2', '40']])
  await page.getByRole('button', { name: 'Guardar los 2 potreros' }).click()
  await page.getByRole('radio', { name: 'Hacienda' }).click()
  await page.getByLabel('Vacas').fill('30')
  await page.getByRole('button', { name: 'Siguiente potrero' }).click()
  await expect(page.getByRole('heading', { name: '¿Qué hay en el 2A?' })).toBeVisible()

  // Recargar: el mismo paso.
  await page.reload()
  await expect(page.getByRole('heading', { name: '¿Qué hay en el 2A?' })).toBeVisible()

  // Otro equipo (sin el progreso de este navegador): entra y vuelve al paso pendiente.
  const otro = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await otro.goto('/login')
  await otro.getByLabel('Tu celular, el que tiene WhatsApp').fill(numero)
  await otro.getByRole('button', { name: 'Mandame el código' }).click()
  await otro.waitForURL('**/login/codigo')
  await otro.waitForTimeout(800)
  await otro.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await expect(otro).toHaveURL(/\/onboarding/)
  await expect(otro.getByRole('heading', { name: '¿Qué hay en el 2A?' })).toBeVisible()
  await otro.close()
})

test('hectáreas que sobran y que faltan', async ({ page }) => {
  await cuentaNueva(page)
  await empresaYCampo(page, '100')
  await potreros(page, [['1', '70'], ['2', '50']])
  await expect(page.getByText('sobran 20')).toBeVisible()
  await page.getByRole('button', { name: 'El campo tiene 120 ha' }).click()
  await expect(page.getByText('2 potreros, 120 de 120 ha: cierran justo')).toBeVisible()

  await page.locator('input[inputmode=decimal]').nth(1).fill('30')
  await expect(page.getByText('Faltan 20 ha: 100 de 120')).toBeVisible()
  await page.getByRole('button', { name: 'Sumar el potrero que falta' }).click()
  await expect(page.getByText('3 potreros, 120 de 120 ha: cierran justo')).toBeVisible()
})

test('corregir un potrero ya cargado no duplica la hacienda', async ({ page }) => {
  await cuentaNueva(page)
  await empresaYCampo(page, '100')
  await potreros(page, [['1', '60'], ['2', '40']])
  await page.getByRole('button', { name: 'Guardar los 2 potreros' }).click()
  await page.getByRole('radio', { name: 'Hacienda' }).click()
  await page.getByLabel('Vacas').fill('30')
  await page.getByRole('button', { name: 'Siguiente potrero' }).click()
  await expect(page.getByRole('heading', { name: '¿Qué hay en el 2A?' })).toBeVisible()
  // Atrás al 1A, se corrige y se guarda de nuevo.
  await page.getByRole('button', { name: 'Atrás' }).click()
  await expect(page.getByRole('heading', { name: '¿Qué hay en el 1A?' })).toBeVisible()
  await expect(page.getByLabel('Vacas')).toHaveValue('30')
  await page.getByLabel('Vacas').fill('25')
  await page.getByRole('button', { name: 'Siguiente potrero' }).click()
  await expect(page.getByRole('heading', { name: '¿Qué hay en el 2A?' })).toBeVisible()
  await page.getByRole('radio', { name: 'Hacienda' }).click()
  await page.getByLabel('Toros').fill('1')
  await page.getByRole('button', { name: 'Listo, La Porteña' }).click()
  await page.getByRole('button', { name: 'No, con La Porteña está' }).click()
  await expect(page.getByText('Propio · 100 ha · 2 potreros · 26 cabezas')).toBeVisible()
})

test('los potreros no repiten número: los nuevos toman el siguiente y uno repetido no deja guardar', async ({ page }) => {
  await cuentaNueva(page)
  await empresaYCampo(page, '100')
  await page.locator('input[inputmode=decimal]').nth(0).fill('40')
  await page.getByRole('button', { name: 'Sumar otro potrero' }).click()
  await page.getByRole('button', { name: 'Sumar otro potrero' }).click()
  // Cada fila nueva ya trae su número.
  await expect(page.getByLabel('Número del potrero 2')).toHaveValue('2')
  await expect(page.getByLabel('Número del potrero 3')).toHaveValue('3')
  await page.locator('input[inputmode=decimal]').nth(1).fill('30')
  await page.locator('input[inputmode=decimal]').nth(2).fill('30')
  // Repetido: se marca y no guarda.
  await page.getByLabel('Número del potrero 3').fill('1')
  await expect(page.getByText('Ya hay un 1A')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar los 3 potreros' }).click()
  await expect(page.getByRole('heading', { name: '¿Cómo lo tenés dividido?' })).toBeVisible()
  // Se arregla y se guarda; después se intercambian dos números sin chocar.
  await page.getByLabel('Número del potrero 3').fill('3')
  await page.getByRole('button', { name: 'Guardar los 3 potreros' }).click()
  await expect(page.getByRole('heading', { name: '¿Qué hay en el 1A?' })).toBeVisible()
  await page.getByRole('button', { name: 'Atrás' }).click()
  await page.getByLabel('Número del potrero 1').fill('2')
  await page.getByLabel('Número del potrero 2').fill('1')
  await page.getByRole('button', { name: 'Guardar los 3 potreros' }).click()
  await expect(page.getByRole('heading', { name: '¿Qué hay en el 2A?' })).toBeVisible()
})
