import { test, expect } from '@playwright/test'
import { codigoDelLog, despejarGuia, entrar } from './helpers'

// Configuración (Lau, 05/11): el dueño invita y elige qué ve cada uno; el
// invitado entra y ve sólo eso (lo demás no se abre ni por link); el dueño
// le cambia lo que ve o le saca el acceso.
test('el dueño invita con lo que va a ver, el invitado ve sólo eso y después se le saca el acceso', async ({ page, browser }) => {
  const numero = `22417${String(Date.now()).slice(-5)}`
  const nombre = `Peón ${numero.slice(-4)}`
  await entrar(page)
  await page.getByRole('link', { name: 'Configuración' }).click()
  await expect(page.getByRole('heading', { name: 'Configuración', level: 1 })).toBeVisible()
  await page.getByRole('tab', { name: /Plan/ }).click()
  await expect(page.getByRole('region', { name: 'Tu plan' })).toContainText('Piloto, sin cargo')
  await page.getByRole('tab', { name: /Personas/ }).click()

  // Invitar: sin rol no hay nada elegido; el rol propone, y se cambia.
  await page.getByRole('button', { name: 'Invitar a alguien' }).click()
  const panel = page.getByRole('dialog', { name: 'Invitar a alguien' })
  const que = panel.getByRole('group', { name: 'Qué ve' })
  await expect(que.getByRole('checkbox', { checked: true })).toHaveCount(0)
  await panel.getByLabel('Cómo se llama').fill(nombre)
  await panel.getByLabel('Su celular, el que tiene WhatsApp').fill(numero)
  await panel.getByRole('group', { name: 'Qué hace' }).getByRole('button', { name: 'Peón' }).click()
  await expect(que.getByRole('checkbox', { name: /Hacienda/ })).toBeChecked()
  await expect(que.getByRole('checkbox', { name: /Plata/ })).not.toBeChecked()
  await que.getByRole('checkbox', { name: /Campos/ }).click()
  await panel.getByRole('button', { name: `Invitar a ${nombre.split(' ')[0]}` }).click()
  const listo = page.getByRole('dialog', { name: /Listo: invitaste a/ })
  await expect(listo).toContainText('Va a ver: Inicio, Hacienda.')
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
  await expect(fila.getByLabel('Hacienda: lo ve')).toBeVisible()
  await expect(fila.getByLabel('Plata: no lo ve')).toBeVisible()
  await fila.getByRole('button', { name: 'Cambiar' }).click()
  await page.getByRole('button', { name: 'Sacarle el acceso' }).click()
  await page.getByRole('button', { name: 'Sí, sacarle el acceso' }).click()
  await expect(page.getByRole('region', { name: 'Quién ve qué' }).getByRole('listitem').filter({ hasText: nombre })).toHaveCount(0)
})
