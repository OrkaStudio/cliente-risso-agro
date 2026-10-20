import { test, expect } from '@playwright/test'
import { entrar } from './helpers'

test('campos: sumar un campo, y si todavía no está en el mapa, ubicarlo', async ({ page }) => {
  const campo = `E2E Campo ${Date.now()}`
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

  // Queda elegido; como no tiene borde ni potreros, se lo ubica en el satélite
  await expect(page.getByRole('heading', { name: campo, level: 1 })).toBeVisible()
  await expect(page.getByText(`${campo} todavía no está en el mapa`)).toBeVisible()
  await page.getByRole('button', { name: 'Ubicarlo en el mapa' }).click()
  await expect(page).toHaveURL(/\/mapa\/[0-9a-f-]{36}$/)
})
