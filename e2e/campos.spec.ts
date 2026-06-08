import { test, expect } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL ?? ''
const PASSWORD = process.env.E2E_PASSWORD ?? ''

test('campos y potreros: crear campo + crear potrero', async ({ page }) => {
  const ts = Date.now()
  const campo = `E2E Campo ${ts}`
  const potrero = `E2E Potrero ${ts}`

  // login
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible()

  // ir a Campos
  await page.getByRole('link', { name: 'Campos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Campos' })).toBeVisible()

  // crear campo
  await page.getByRole('button', { name: '+ Nuevo campo' }).click()
  await page.locator('#campo-nombre').fill(campo)
  await page.locator('#campo-ha').fill('50')
  await page.getByRole('button', { name: 'Crear campo' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('link', { name: campo })).toBeVisible()

  // entrar al campo
  await page.getByRole('link', { name: campo }).click()
  await expect(page.getByRole('heading', { name: campo })).toBeVisible()

  // crear potrero
  await page.getByRole('button', { name: '+ Nuevo potrero' }).click()
  await page.locator('#potrero-nombre').fill(potrero)
  await page.selectOption('#potrero-estado', 'descanso')
  await page.getByRole('button', { name: 'Crear potrero' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByText(potrero)).toBeVisible()
})
