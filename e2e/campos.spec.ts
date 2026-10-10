import { test, expect } from '@playwright/test'
import { entrar } from './helpers'

test('campos y potreros: crear campo + crear potrero', async ({ page }) => {
  const campo = `E2E Campo ${Date.now()}`
  await entrar(page)

  await page.getByRole('link', { name: 'Campos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Campos', level: 1 })).toBeVisible()

  // Crear campo: la localidad sale del buscador (Open-Meteo), nunca texto suelto
  await page.getByRole('button', { name: '+ Nuevo campo' }).click()
  const alta = page.getByRole('dialog', { name: 'Nuevo campo' })
  await alta.getByLabel('Nombre').fill(campo)
  await alta.getByRole('button', { name: 'Ganadera' }).click()
  await alta.getByRole('combobox', { name: '¿Dónde está el campo?' }).fill('Chascomús')
  await page.getByRole('option', { name: /Chascom/ }).first().click()
  await alta.getByLabel('Hectáreas (opcional)').fill('50')
  await alta.getByRole('button', { name: 'Crear campo' }).click()
  await expect(alta).toBeHidden()

  // Entrar al campo: se elige en el mapa y se abre su resumen
  await page.getByRole('button', { name: campo, exact: true }).click()
  await page.getByRole('link', { name: 'Resumen del campo' }).click()
  await expect(page.getByRole('heading', { name: campo, level: 1 })).toBeVisible()

  // Crear potrero: el número lo pone el productor, la letra es del campo
  await page.getByRole('button', { name: '+ Nuevo potrero' }).click()
  const potrero = page.getByRole('dialog', { name: 'Nuevo potrero' })
  await potrero.getByLabel('Número de potrero').fill('7')
  await potrero.getByLabel('Hectáreas (opcional)').fill('20')
  await potrero.getByRole('button', { name: 'Crear potrero' }).click()
  await expect(potrero).toBeHidden()
  // Con más de 26 campos la letra es doble (AA, AB…): la cuenta de E2E acumula uno por corrida.
  await expect(page.getByRole('link', { name: /^7[A-Z]+ / })).toBeVisible()
})
