import { test, expect } from '@playwright/test'
import { CELULAR_E2E, CODIGO_E2E, codigoDelLog, entrar, invitarComoDueno } from './helpers'

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

test('A4: el invitado entra por el link con su código y queda en la empresa, sin onboarding', async ({ page }) => {
  const numero = `22416${String(Date.now()).slice(-5)}`
  const token = await invitarComoDueno(numero, 'Dra. Paula Ríos', 'vet')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/invitacion/${token}`)
  await expect(page.getByRole('heading', { name: 'Prueba te sumó a E2E Pruebas.' })).toBeVisible()
  await expect(page.getByText('Veterinaria · Dra. Paula Ríos')).toBeVisible()
  await page.getByRole('button', { name: 'Entrar con mi celular' }).click()
  await page.waitForURL('**/login/codigo')
  await page.waitForTimeout(800)
  await page.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
  await expect(page).not.toHaveURL(/\/onboarding/)

  // El link ya no sirve otra vez.
  await page.goto(`/invitacion/${token}`)
  await expect(page.getByText('Esta invitación ya se usó')).toBeVisible()
})

test('A4: un link que no es de una invitación avisa', async ({ page }) => {
  await page.goto('/invitacion/no-existe')
  await expect(page.getByText('Ese link no es de una invitación')).toBeVisible()
})

test('A5 afuera: explica los tres caminos, sin pedir el CUIT', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Te ayudamos' }).click()
  await expect(page).toHaveURL(/\/cambie-de-numero$/)
  await expect(page.getByText('¿Seguís adentro en la compu o en otro celular?')).toBeVisible()
  await expect(page.getByText('¿Te invitaron?')).toBeVisible()
  await expect(page.getByText('¿Sos el dueño y no entrás desde ningún lado?')).toBeVisible()
  await expect(page.getByText(/CUIT/)).toHaveCount(0)
})

test('A5 adentro: con la sesión abierta, el número se cambia con un código al número nuevo', async ({ page }) => {
  const viejo = `22417${String(Date.now()).slice(-5)}`
  const nuevo = `22418${String(Date.now()).slice(-5)}`
  await page.setViewportSize({ width: 390, height: 844 })
  // Una cuenta nueva (no la de prueba, que usan los demás tests).
  await page.goto('/registro')
  await page.getByLabel('Tu nombre').fill('Cambio Número')
  await page.getByLabel('Tu celular').fill(viejo)
  await page.getByRole('button', { name: 'Seguir, mandame el código' }).click()
  await page.waitForURL('**/login/codigo')
  await page.waitForTimeout(800)
  await page.locator('#codigo').fill(codigoDelLog(`549${viejo}`))
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))

  await page.goto('/mi-cuenta/numero')
  await page.getByLabel('Tu número nuevo, el que tiene WhatsApp').fill(nuevo)
  await page.getByRole('button', { name: 'Mandame el código' }).click()
  await expect(page.locator('#codigo-nuevo')).toBeVisible()
  await page.waitForTimeout(800)
  await page.locator('#codigo-nuevo').fill(codigoDelLog(`549${nuevo}`))
  await expect(page.getByText('Listo, ya entrás con el número nuevo')).toBeVisible()
})
