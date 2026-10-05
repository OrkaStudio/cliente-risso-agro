import { test, expect } from '@playwright/test'
import { CELULAR_E2E, CODIGO_E2E, entrar } from './helpers'

// Acceso (spec «Tropero para código», 1 · Acceso): se entra con un código por
// WhatsApp. La cuenta E2E usa el código fijo de la base local.

test('A1 → A2 → adentro: el código correcto entra solo', async ({ page }) => {
  await entrar(page)
  await expect(page).not.toHaveURL(/\/login/)
})

test('A1: un número sin cuenta no recibe código y ofrece crearla', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Tu celular, el que tiene WhatsApp').fill('2999111222')
  await page.getByRole('button', { name: 'Mandame el código' }).click()
  await expect(page.getByText('Ese número no tiene cuenta')).toBeVisible()
  await page.getByRole('button', { name: 'Crear la cuenta con este número' }).click()
  await expect(page).toHaveURL(/\/registro$/)
  // El número viaja ya escrito.
  await expect(page.locator('input[type=tel]')).toHaveValue('299 911-1222')
})

test('A2: tres códigos mal y el código se anula', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Tu celular, el que tiene WhatsApp').fill(CELULAR_E2E)
  await page.getByRole('button', { name: 'Mandame el código' }).click()
  await page.waitForURL('**/login/codigo')
  const campo = page.locator('#codigo')
  await campo.fill('000001')
  await expect(page.getByText('te quedan 2 intentos')).toBeVisible()
  await campo.fill('000002')
  await expect(page.getByText('te queda 1 intento')).toBeVisible()
  await campo.fill('000003')
  await expect(page.getByText('Probaste 3 veces y el código se anuló')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mandame uno nuevo' })).toBeVisible()
  await expect(campo).toBeDisabled()
})

test('A2: pegar el mensaje entero de WhatsApp completa el código y entra', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/login')
  await page.getByLabel('Tu celular, el que tiene WhatsApp').fill(CELULAR_E2E)
  await page.getByRole('button', { name: 'Mandame el código' }).click()
  await page.waitForURL('**/login/codigo')
  await page.evaluate(
    (c) =>
      navigator.clipboard.writeText(
        `Tu código de verificación es ${c}. Por tu seguridad, no lo compartas. Este código caduca en 10 minutos.`,
      ),
    CODIGO_E2E,
  )
  await page.getByRole('button', { name: 'Pegar el código' }).click()
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible()
})

test('A3: con un número que ya tiene cuenta, avisa y ofrece entrar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill('Otra')
  await page.getByLabel('Apellido').fill('Persona')
  await page.getByLabel('Tu celular, el que tiene WhatsApp').fill(CELULAR_E2E)
  await page.getByRole('button', { name: 'Seguir, mandame el código' }).click()
  await expect(page.getByText('Ese número ya tiene cuenta.')).toBeVisible()
  await page.getByRole('button', { name: 'Entrar con este número' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('A3: el mail es opcional, pero si se escribe tiene que estar completo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/registro')
  await page.getByLabel('Tu nombre').fill('Daniel Risso')
  await page.getByLabel('Tu celular').fill('2241600999')
  await page.getByLabel('Tu mail, si querés').fill('daniel@')
  await page.getByRole('button', { name: 'Seguir, mandame el código' }).click()
  await expect(page.getByText('Ese mail no parece completo')).toBeVisible()
  await expect(page).toHaveURL(/\/registro$/)
})
