import { test, expect } from '@playwright/test'
import { VERSION_LEGALES } from '../src/features/legales/textos'
import { CELULAR_E2E, CODIGO_E2E, aceptacionesDe, codigoDelLog, entrar, invitarComoDueno } from './helpers'

// Acceso (spec «Troppero para código», 1 · Acceso): se entra con un código por
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
  await page.getByRole('button', { name: 'Mandame el código' }).click()
  await expect(page.getByText('Ese número ya tiene cuenta.')).toBeVisible()
  await page.getByRole('button', { name: 'Entrar con este número' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('A3: el mail es opcional, pero si se escribe tiene que estar completo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill('Daniel')
  await page.getByLabel('Apellido').fill('Risso')
  await page.getByLabel('Tu celular, el que tiene WhatsApp').fill('2241600999')
  await page.getByLabel('Tu mail, si querés').fill('daniel@')
  // El botón queda apagado y abajo dice qué falta.
  await expect(page.getByRole('button', { name: 'Mandame el código' })).toBeDisabled()
  await expect(page.getByText('Ese mail no parece completo').first()).toBeVisible()
  await expect(page).toHaveURL(/\/registro$/)
})

test('A4: el invitado entra por el link con su código y queda en la empresa, sin onboarding', async ({ page }) => {
  const numero = `22416${String(Date.now()).slice(-5)}`
  const token = await invitarComoDueno(numero, 'Dra. Paula Ríos', 'vet')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/invitacion/${token}`)
  await expect(page.getByRole('heading', { name: 'Prueba te sumó a E2E Pruebas.' })).toBeVisible()
  await expect(page.getByText('Veterinario · Dra. Paula Ríos')).toBeVisible()
  // Lo que le habilitó el dueño, no lo que se supone del rol.
  await expect(page.getByText('Hacienda', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Entrar con mi celular' }).click()
  await page.waitForURL('**/login/codigo')
  await page.waitForTimeout(800)
  await page.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
  await expect(page).not.toHaveURL(/\/onboarding/)
  // Al entrar queda registrado que aceptó los términos, y por dónde.
  await expect.poll(() => aceptacionesDe(`549${numero}`)).toEqual([`${VERSION_LEGALES}:invitacion`])

  // El link ya no sirve otra vez.
  await page.goto(`/invitacion/${token}`)
  await expect(page.getByRole('heading', { name: 'Esta invitación ya se usó' }).filter({ visible: true }).first()).toBeVisible()
})

test('A4: un link que no es de una invitación avisa', async ({ page }) => {
  await page.goto('/invitacion/no-existe')
  await expect(page.getByRole('heading', { name: 'Esta invitación ya no sirve' }).filter({ visible: true }).first()).toBeVisible()
})

test('A5 afuera: un solo camino, escribirnos desde el número nuevo, sin pedir el CUIT', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Te ayudamos' }).click()
  await expect(page).toHaveURL(/\/cambie-de-numero$/)
  await expect(page.getByText(/Escribinos y lo cambiamos/).filter({ visible: true }).first()).toBeVisible()
  // Ya no se cambia solo (Lau, 25/11): ni «lo cambiás vos» ni «lo cambia el dueño».
  await expect(page.getByText('Todavía tengo Troppero abierto')).toHaveCount(0)
  await expect(page.getByText('Me invitó el dueño')).toHaveCount(0)
  await expect(page.getByText(/CUIT/)).toHaveCount(0)
})

test('A5 adentro: el número no se cambia solo; el link viejo lleva a Tu cuenta', async ({ page }) => {
  await entrar(page)
  await page.goto('/mi-cuenta/numero')
  await expect(page).toHaveURL(/\/configuracion\?tab=cuenta$/)
  await expect(page.getByText(/Escribinos y lo cambiamos/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cambiar mi número' })).toHaveCount(0)
})
