import { test, expect } from '@playwright/test'
import { codigoDelLog, despejarGuia, entrar, invitarComoDueno } from './helpers'

// Un solo ingreso (Lau, 25/11): el dueño decide todo en la tabla de Personas y
// cómo entra cada uno sale de sus niveles. Dos navegadores a la vez: el dueño
// cambia una celda y la persona, con la app abierta, lo recibe sin recargar.
test.setTimeout(180_000)

test('cada cambio del dueño le llega en vivo a la persona: mira, pierde una sección, pasa a WhatsApp, vuelve a la app y se le saca el acceso', async ({ page, browser }) => {
  const numero = `22419${String(Date.now()).slice(-5)}`
  const nombre = `Encargado ${numero.slice(-4)}`
  const token = await invitarComoDueno(numero, nombre, 'encargado', { hacienda: 'carga', campos: 've', plata: 'no' })

  // La persona entra por el link y queda en la Hacienda, donde puede cargar.
  const otro = await browser.newContext()
  const yo = await otro.newPage()
  await despejarGuia(yo)
  await yo.goto(`/invitacion/${token}`)
  await yo.getByRole('button', { name: 'Entrar con mi celular' }).click()
  await yo.waitForURL('**/login/codigo')
  await yo.waitForTimeout(800)
  await yo.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await yo.waitForURL((u) => !u.pathname.startsWith('/login'))
  await yo.goto('/hacienda')
  await expect(yo.getByRole('button', { name: /^Entraron/ })).toBeVisible()

  // El dueño, en su tabla.
  await entrar(page)
  await page.goto('/configuracion?tab=personas')
  const fila = page.getByRole('region', { name: 'Quién ve qué' }).getByRole('listitem').filter({ hasText: nombre })
  const cambiar = async (seccion: string, de: string, a: RegExp) => {
    await fila.getByRole('button', { name: `${seccion}: ${de}. Cambiar` }).click()
    await page.getByRole('radio', { name: a }).click()
    await expect(fila.getByRole('button', { name: new RegExp(`^${seccion}: `) })).not.toHaveAccessibleName(`${seccion}: ${de}. Cambiar`)
  }
  await expect(fila).toContainText('En la app')

  // 1) Sigue en la app y cambia una sección: Hacienda «Anota» → «Mira». Se le van los botones de cargar.
  await cambiar('Hacienda', 'Anota', /^Mira/)
  await expect(page.getByText(/ahora mira la Hacienda, sin cargar/)).toBeVisible()
  await expect(yo.getByText('Cambió lo que podés ver')).toBeVisible()
  await expect(yo.getByText(/En la Hacienda ahora sólo mirás/)).toBeVisible()
  await expect(yo.getByRole('button', { name: /^Entraron/ })).toHaveCount(0)

  // 4) Pierde la sección donde está parada: vuelve al Inicio y se le dice.
  await cambiar('Hacienda', 'Mira', /^No ve/)
  await expect(yo).toHaveURL(/\/$/)
  await expect(yo.getByText(/Ya no ves la Hacienda/)).toBeVisible()
  await expect(yo.getByRole('navigation', { name: 'Oficina' }).getByRole('link', { name: 'Hacienda' })).toHaveCount(0)

  // 5) La última sección que le queda no puede pasar a «No ve»: para eso se le saca el acceso.
  await fila.getByRole('button', { name: 'Campos: Mira. Cambiar' }).click()
  await expect(page.getByRole('radio', { name: /^No ve/ })).toBeDisabled()
  await page.keyboard.press('Escape')

  // 2) Pierde la app: Campos pasa a «Avisa» y ya no mira nada. Al dueño se le dice; a ella le cambia la pantalla.
  await cambiar('Campos', 'Mira', /^Avisa/)
  await expect(page.getByText('Ya no usa la app: lo suyo va por WhatsApp.')).toBeVisible()
  await expect(fila).toContainText('Por WhatsApp')
  await expect(yo.getByText('Tu acceso es por WhatsApp').filter({ visible: true })).toBeVisible()

  // 3) Vuelve a la app: con «Mira» en Hacienda, la pantalla de WhatsApp se va sola y aparece la Hacienda.
  await cambiar('Hacienda', 'No ve', /^Mira/)
  await expect(page.getByText('Ya puede entrar a la app con su número y un código por WhatsApp.')).toBeVisible()
  await expect(fila).toContainText('En la app')
  await expect(yo.getByText('Tu acceso es por WhatsApp').filter({ visible: true })).toHaveCount(0)
  await expect(yo.getByRole('navigation', { name: 'Oficina' }).getByRole('link', { name: 'Hacienda' })).toBeVisible()

  // Deshacer vuelve atrás de verdad: otra vez sólo por WhatsApp.
  await page.locator('[data-sonner-toast]').filter({ hasText: 'Ya puede entrar a la app' }).getByRole('button', { name: 'Deshacer' }).click()
  await expect(fila).toContainText('Por WhatsApp')
  await expect(yo.getByText('Tu acceso es por WhatsApp').filter({ visible: true })).toBeVisible()

  // 7) Sacarle el acceso: sale de la cuenta y ya no está en la tabla.
  await fila.getByRole('button', { name: /Más opciones de/ }).click()
  await page.getByRole('button', { name: 'Sacarle el acceso' }).click()
  await page.getByRole('button', { name: 'Sí, sacárselo' }).click()
  await expect(fila).toHaveCount(0)
  // A ella se le dice qué pasó (25/11), no se la manda a armar un campo como productora nueva.
  const sinAcceso = yo.getByRole('heading', { name: /Ya no tenés acceso a / }).filter({ visible: true })
  await expect(sinAcceso).toBeVisible()
  await expect(yo).not.toHaveURL(/onboarding/)
  await expect(yo.getByRole('navigation', { name: 'Oficina' })).toHaveCount(0)
  // Y se le sigue diciendo si vuelve a entrar más tarde.
  await yo.reload()
  await expect(sinAcceso).toBeVisible()
  // Si también tiene campo propio, lo arma desde ahí; después ya no se le repite.
  await yo.getByRole('button', { name: 'Armar mi propio campo' }).filter({ visible: true }).click()
  await expect(yo).toHaveURL(/onboarding/)
  await yo.goto('/')
  await expect(sinAcceso).toHaveCount(0)
  await otro.close()
})

test('invitar: cómo entra sale de los niveles, sin paso aparte', async ({ page }) => {
  await entrar(page)
  await page.goto('/configuracion?tab=personas')
  await page.getByRole('button', { name: 'Invitar a alguien' }).click()
  const panel = page.getByRole('dialog', { name: 'Invitar a alguien' })
  await expect(panel.getByText('Cómo va a usar Troppero')).toHaveCount(0)
  const nivel = (n: string) => panel.getByRole('radio', { name: n, exact: true })
  // Todo en «No ve» o «Avisa»: va por WhatsApp.
  await nivel('Hacienda: Avisa').click()
  await nivel('Campos: No ve').click()
  await nivel('Plata y Agenda: Avisa').click()
  await expect(panel).toContainText('Va sólo por WhatsApp')
  // Con «Mira» en algo: usa la app.
  await nivel('Campos: Mira').click()
  await expect(panel).toContainText('Va a usar la app')
})
