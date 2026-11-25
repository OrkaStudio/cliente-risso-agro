import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { codigoDelLog, despejarGuia, entrar, invitarComoDueno } from './helpers'

/** SQL directo en la base local (como servicio): para simular lo que carga el bot. */
const sql = (q: string) => execSync('docker exec -i supabase_db_cliente-risso-agro psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q', { input: q })

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
  // Los niveles van en la tabla (20/11): cada círculo se llama «Sección: Nivel».
  const nivel = (nombre: string) => panel.getByRole('radio', { name: nombre, exact: true })
  await expect(panel.getByRole('radio', { checked: true })).toHaveCount(0)
  // El nombre se escribe con mayúsculas solo.
  await panel.getByLabel('Nombre').pressSequentially(nombre.toLowerCase())
  await expect(panel.getByLabel('Nombre')).toHaveValue(nombre)
  // El celular como lo escribe la gente, con 0 y 15: queda limpio mientras se tipea.
  const cel = panel.getByLabel('Celular con WhatsApp')
  await cel.pressSequentially(`0${numero.slice(0, 4)} 15 ${numero.slice(4)}`)
  await expect(cel).toHaveValue(`${numero.slice(0, 4)} ${numero.slice(4, 6)}-${numero.slice(6)}`)
  await panel.getByRole('radiogroup', { name: 'Qué hace' }).getByRole('radio', { name: 'Peón' }).click()
  // El rol sólo nombra: no marca ningún nivel.
  await expect(panel.getByRole('radio', { name: /^(Hacienda|Campos|Plata y Agenda): /, checked: true })).toHaveCount(0)
  // Sin elegir todas las secciones no deja invitar.
  await nivel('Hacienda: Anota').click()
  await panel.getByRole('button', { name: `Invitar a ${nombre.split(' ')[0]}` }).click()
  await expect(panel.getByRole('alert')).toContainText('Elegí qué puede hacer en cada sección')
  await nivel('Campos: No ve').click()
  await nivel('Plata y Agenda: No ve').click()
  // Cada nivel se explica, y antes de invitar se resume en una frase.
  await panel.getByRole('button', { name: '¿Qué significa cada una?' }).click()
  await expect(panel).toContainText('Lo ve y carga desde la app o por WhatsApp. Cada cosa queda con su nombre.')
  await expect(panel).toContainText('Ve y carga la Hacienda. No ve los Campos ni la Plata y la Agenda.')
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
  // En la compu se edita en la misma tabla (25/11): cada celda dice el nivel.
  await expect(fila.getByRole('button', { name: 'Hacienda: Anota. Cambiar' })).toBeVisible()
  await expect(fila.getByRole('button', { name: 'Plata y Agenda: No ve. Cambiar' })).toBeVisible()
  // Cambiar un nivel ahí mismo: se guarda y avisa con Deshacer.
  await fila.getByRole('button', { name: 'Plata y Agenda: No ve. Cambiar' }).click()
  await page.getByRole('radio', { name: /^Mira/ }).click()
  await expect(page.getByText(/ahora mira la Plata y la Agenda/)).toBeVisible()
  await expect(fila.getByRole('button', { name: 'Plata y Agenda: Mira. Cambiar' })).toBeVisible()
  // «⋯» al final de la fila: sacarle el acceso.
  await fila.getByRole('button', { name: /Más opciones de/ }).click()
  await page.getByRole('button', { name: 'Sacarle el acceso' }).click()
  await page.getByRole('button', { name: 'Sí, sacárselo' }).click()
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

test('con «Ve» se mira sin cargar, y sin Campos no se cuentan cabezas ni se recorre (permisos, 13/11)', async ({ page }) => {
  const numero = `22416${String(Date.now()).slice(-5)}`
  const token = await invitarComoDueno(numero, 'Vera Mirada', 'encargado', { hacienda: 've', campos: 'no', plata: 'no' })
  await despejarGuia(page)
  await page.goto(`/invitacion/${token}`)
  await expect(page.getByText('Hacienda', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Entrar con mi celular' }).click()
  await page.waitForURL('**/login/codigo')
  await page.waitForTimeout(800)
  await page.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))

  // Hacienda: el rodeo se ve, los botones de cargar no.
  await page.goto('/hacienda')
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entraron' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Salieron' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Caravanas desde una planilla/ })).toHaveCount(0)

  // Sin Campos: la barra no cuenta cabezas, el Inicio no habla de recorridas y Campos no se abre.
  const barra = page.getByRole('navigation', { name: 'Oficina' })
  await expect(barra.getByRole('link', { name: 'Campos' })).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByText('Última recorrida')).toHaveCount(0)
  await expect(page.getByText(/se recorrió|sin recorrer/i)).toHaveCount(0)
  await page.goto('/campos')
  await expect(page).toHaveURL(/\/$/)
  // El Modo Campo (celular): la recorrida y la manga son cargar.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/campo/manga')
  await expect(page).toHaveURL(/\/campo$/)
  const nav = page.getByRole('navigation', { name: 'Modo Campo' })
  await expect(nav.getByRole('link', { name: 'Manga' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Recorrida' })).toHaveCount(0)
})

test('lo que manda un invitado le llega al dueño como nuevo, con su nombre, y lo corrige (permisos, entrega 4)', async ({ page }) => {
  const sufijo = String(Date.now()).slice(-5)
  const detalle = `Gasoil ${sufijo}`
  // Un invitado con la Plata en «Solo manda» manda un gasto por WhatsApp (como lo carga el bot).
  sql(`
    with u as (
      insert into auth.users (id, instance_id, aud, role, phone, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '54922415${sufijo}', '{"nombre":"Tito","apellido":"Manda"}', now(), now(), '', '', '', '')
      returning id
    ), m as (
      insert into public.miembro_empresa (empresa_id, user_id, rol, niveles)
      select me.empresa_id, u.id, 'encargado', '{"hacienda":"no","campos":"no","plata":"solo_manda"}'
      from u, public.miembro_empresa me join auth.users d on d.id = me.user_id where d.phone = '5492240000001'
      returning empresa_id, user_id
    )
    insert into public.movimiento_financiero (empresa_id, campo_id, tipo, categoria_id, monto, fecha_devengo, fecha_cobro_pago, estado, descripcion, created_by, canal)
    select m.empresa_id, (select id from public.campo where empresa_id = m.empresa_id order by color_idx limit 1), 'gasto',
      (select id from public.categoria_movimiento where empresa_id is null limit 1), 85000, current_date, current_date, 'liquidado', '${detalle}', m.user_id, 'whatsapp'
    from m`)

  await entrar(page)
  // El número junto a Plata y el aviso en Plata.
  const barra = page.getByRole('navigation', { name: 'Oficina' })
  await expect(barra.getByRole('link', { name: 'Plata', exact: true }).locator('[data-nuevos]')).toBeVisible()
  await page.goto('/analitica')
  await page.getByRole('button', { name: 'Revisarlos' }).click()
  await expect(page).toHaveURL(/movimientos\?nuevos=1/)
  // «Para revisar» es una pestaña de Movimientos (24/11): agrupado por quién lo cargó, con «Corregir» y «Está bien».
  await expect(page.getByRole('tab', { name: /Para revisar/, selected: true })).toBeVisible()
  const grupo = page.getByRole('region', { name: 'Cargó Tito Manda (encargado) · por WhatsApp' })
  const fila = grupo.getByRole('listitem').filter({ hasText: detalle })
  await expect(fila).toBeVisible()

  // Mirarlo y cerrarlo no lo da por revisado: Tito todavía lo puede corregir (24/11).
  await fila.getByRole('button').first().click()
  const detalleAbierto = page.getByRole('dialog', { name: detalle })
  await expect(detalleAbierto).toContainText('Tito Manda')
  await expect(detalleAbierto).toContainText('lo mandó por WhatsApp')
  await page.keyboard.press('Escape')
  await expect(fila).toBeVisible()

  // «Corregir» abre directo para corregir: el monto y en qué se fue. Deja de ser nuevo.
  await fila.getByRole('button', { name: 'Corregir' }).click()
  const panel = page.getByRole('dialog', { name: 'Corregir el movimiento' })
  await panel.getByLabel('Monto').fill('90000')
  await panel.locator('select').selectOption({ label: 'Combustible' })
  await panel.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Listo: el movimiento quedó corregido')).toBeVisible()
  await page.goto(`/analitica/movimientos?q=${encodeURIComponent(detalle)}`)
  await expect(page.getByRole('listitem').filter({ hasText: detalle })).not.toContainText('Nuevo')
  await expect(page.getByRole('listitem').filter({ hasText: detalle })).toContainText('90.000')
  await expect(page.getByRole('listitem').filter({ hasText: detalle })).toContainText('Combustible')
})

test('invitar con sólo «No ve» y «Avisa» es por WhatsApp: sin link a la app, y si entra le dice dónde está lo suyo (un solo ingreso, 25/11)', async ({ page, browser }) => {
  const numero = `22414${String(Date.now()).slice(-5)}`
  await entrar(page)
  await page.goto('/configuracion?tab=personas')
  await page.getByRole('button', { name: 'Invitar a alguien' }).click()
  const panel = page.getByRole('dialog', { name: 'Invitar a alguien' })
  await panel.getByLabel('Nombre').fill('Vete Rinaria')
  await panel.getByLabel('Celular con WhatsApp').fill(numero)
  await panel.getByRole('radiogroup', { name: 'Qué hace' }).getByRole('radio', { name: 'Veterinario' }).click()
  // No hay paso aparte: con sólo «No ve» y «Avisa», va por WhatsApp (lo dice antes de invitar).
  await panel.getByRole('radio', { name: 'Hacienda: Avisa', exact: true }).click()
  await panel.getByRole('radio', { name: 'Campos: No ve', exact: true }).click()
  await panel.getByRole('radio', { name: 'Plata y Agenda: Avisa', exact: true }).click()
  await expect(panel).toContainText('Va sólo por WhatsApp')
  await panel.getByRole('button', { name: 'Invitar a Vete' }).click()
  const listo = page.getByRole('dialog', { name: /Listo: invitaste a/ })
  await expect(listo).toContainText('Mandale el número de Troppero')
  await expect(listo.getByRole('button', { name: 'Copiar el link' })).toHaveCount(0)
  const wa = decodeURIComponent((await listo.getByRole('link', { name: 'Mandárselo por WhatsApp' }).getAttribute('href'))!)
  expect(wa).toContain('mandale cualquier mensaje a este número')
  expect(wa).not.toContain('/invitacion/')

  // Si igual entra a la app (la cuenta la arma el bot con su primer mensaje; acá, directo en la base).
  sql(`
    with u as (
      insert into auth.users (id, instance_id, aud, role, phone, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '549${numero}', '{"nombre":"Vete"}', now(), now(), '', '', '', '')
      returning id
    )
    insert into public.miembro_empresa (empresa_id, user_id, rol, niveles, acceso)
    select i.empresa_id, u.id, i.rol, i.niveles, i.acceso from u, public.invitacion i where i.celular = '549${numero}'`)
  const otro = await browser.newContext()
  const vet = await otro.newPage()
  await despejarGuia(vet)
  await vet.goto('/login')
  await vet.getByLabel('Tu celular, el que tiene WhatsApp').fill(numero)
  await vet.getByRole('button', { name: 'Mandame el código' }).click()
  await vet.waitForURL('**/login/codigo')
  await vet.waitForTimeout(800)
  await vet.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await expect(vet.getByRole('heading', { name: 'Tu acceso es por WhatsApp' })).toBeVisible()
  await expect(vet.getByRole('button', { name: 'Abrir WhatsApp' })).toBeVisible()
  await otro.close()
})
