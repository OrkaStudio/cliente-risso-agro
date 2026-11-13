import { test, expect } from '@playwright/test'
import { codigoDelLog, despejarGuia, entrar } from './helpers'

// Configuración (Lau, 05/11 y 13/11): el dueño invita y elige, sección por
// sección, qué puede hacer (no ve, ve, ve y carga, solo manda); el invitado
// entra y ve sólo eso (lo demás no se abre ni por link); el dueño le cambia lo
// que puede hacer o le saca el acceso.
test('el dueño invita eligiendo el nivel de cada sección, el invitado ve sólo eso y después se le saca el acceso', async ({ page, browser }) => {
  const numero = `22417${String(Date.now()).slice(-5)}`
  const nombre = `Peón ${numero.slice(-4)}`
  await entrar(page)
  await page.getByRole('link', { name: 'Configuración' }).click()
  await expect(page.getByRole('heading', { name: 'Configuración', level: 1 })).toBeVisible()
  await page.getByRole('tab', { name: /Plan/ }).click()
  await expect(page.getByRole('region', { name: 'Tu plan' })).toContainText('Piloto, sin cargo')
  await page.getByRole('tab', { name: /Personas/ }).click()

  // Invitar: nada viene elegido, ni con un rol (el rol sólo nombra).
  await page.getByRole('button', { name: 'Invitar a alguien' }).click()
  const panel = page.getByRole('dialog', { name: 'Invitar a alguien' })
  const nivel = (seccion: RegExp) => panel.getByRole('radiogroup', { name: seccion })
  await expect(panel.getByRole('radio', { checked: true })).toHaveCount(0)
  // El nombre se escribe con mayúsculas solo.
  await panel.getByLabel('Cómo se llama').pressSequentially(nombre.toLowerCase())
  await expect(panel.getByLabel('Cómo se llama')).toHaveValue(nombre)
  // El celular como lo escribe la gente, con 0 y 15: queda limpio mientras se tipea.
  const cel = panel.getByLabel('Su celular, el que tiene WhatsApp')
  await cel.pressSequentially(`0${numero.slice(0, 4)} 15 ${numero.slice(4)}`)
  await expect(cel).toHaveValue(`${numero.slice(0, 4)} ${numero.slice(4, 6)}-${numero.slice(6)}`)
  await panel.getByRole('group', { name: 'Qué hace' }).getByRole('button', { name: 'Peón' }).click()
  await expect(panel.getByRole('radio', { checked: true })).toHaveCount(0)
  // Sin elegir todas las secciones no deja invitar.
  await nivel(/Hacienda/).getByRole('radio', { name: 'Ve y carga' }).click()
  await panel.getByRole('button', { name: `Invitar a ${nombre.split(' ')[0]}` }).click()
  await expect(panel.getByRole('alert')).toContainText('Elegí qué puede hacer en cada sección')
  await nivel(/Campos/).getByRole('radio', { name: 'No ve' }).click()
  await nivel(/Plata/).getByRole('radio', { name: 'No ve' }).click()
  // Cada nivel se explica, y antes de invitar se resume en una frase.
  await expect(panel).toContainText('Mira y anota. Lo que carga queda con su nombre.')
  await expect(panel).toContainText('Ve y carga la Hacienda. No ve los Campos y la Plata y la Agenda.')
  await panel.getByRole('button', { name: `Invitar a ${nombre.split(' ')[0]}` }).click()
  const listo = page.getByRole('dialog', { name: /Listo: invitaste a/ })
  await expect(listo).toContainText('Va a poder')
  await expect(listo).toContainText('Ve y carga la Hacienda')
  const wa = await listo.getByRole('link', { name: 'Mandárselo por WhatsApp' }).getAttribute('href')
  const token = /invitacion\/([^\s&%]+)/.exec(decodeURIComponent(wa!))![1]!
  await page.getByRole('button', { name: 'Cerrar' }).first().click()
  await expect(page.getByRole('region', { name: 'Invitaciones esperando' })).toContainText('Invitado, todavía no entró')

  // El invitado entra por el link: ve Inicio y Hacienda; Plata no se abre ni escribiendo la dirección.
  const otro = await browser.newContext()
  const inv = await otro.newPage()
  await despejarGuia(inv)
  await inv.goto(`/invitacion/${token}`)
  await inv.getByRole('button', { name: 'Entrar con mi celular' }).click()
  await inv.waitForURL('**/login/codigo')
  await inv.waitForTimeout(800)
  await inv.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await inv.waitForURL((u) => !u.pathname.startsWith('/login'))
  const barra = inv.getByRole('navigation', { name: 'Oficina' })
  await expect(barra.getByRole('link', { name: 'Hacienda' })).toBeVisible()
  await expect(barra.getByRole('link', { name: 'Plata' })).toHaveCount(0)
  await expect(barra.getByRole('link', { name: 'Campos' })).toHaveCount(0)
  await inv.goto('/analitica')
  await expect(inv).toHaveURL(/\/$/)
  await inv.goto('/configuracion')
  await expect(inv.getByRole('region', { name: 'Tu cuenta' })).toBeVisible()
  await expect(inv.getByRole('tab', { name: /Personas/ })).toHaveCount(0)
  await otro.close()

  // El dueño lo ve adentro y le saca el acceso.
  await page.reload()
  const fila = page.getByRole('region', { name: 'Quién ve qué' }).getByRole('listitem').filter({ hasText: nombre })
  await expect(fila.getByLabel('Hacienda: Ve y carga')).toBeVisible()
  await expect(fila.getByLabel('Plata y Agenda: No ve')).toBeVisible()
  await fila.getByRole('button', { name: 'Cambiar' }).click()
  await page.getByRole('button', { name: 'Sacarle el acceso' }).click()
  await page.getByRole('button', { name: 'Sí, sacarle el acceso' }).click()
  await expect(page.getByRole('region', { name: 'Quién ve qué' }).getByRole('listitem').filter({ hasText: nombre })).toHaveCount(0)
})

test('Plan: el dueño se da de baja, ve el trámite y la deshace', async ({ page }) => {
  await entrar(page)
  await page.goto('/configuracion?tab=plan')
  await page.getByRole('button', { name: 'Dar de baja' }).click()
  await expect(page.getByText('Esto va a pasar')).toBeVisible()
  await page.getByRole('button', { name: 'Sí, dar de baja' }).click()
  await expect(page.getByRole('heading', { name: /Pediste la baja el/ })).toBeVisible()
  await expect(page.getByText(/Número de trámite: \d+/)).toBeVisible()
  // Deshacerla deja todo como estaba.
  await page.getByRole('button', { name: 'Deshacer la baja' }).click()
  await expect(page.getByRole('button', { name: 'Dar de baja' })).toBeVisible()
})
