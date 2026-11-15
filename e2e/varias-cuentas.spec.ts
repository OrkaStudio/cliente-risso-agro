import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { CODIGO_E2E, despejarGuia } from './helpers'

/** SQL directo en la base local (como servicio). */
const sql = (q: string) => execSync('docker exec -i supabase_db_cliente-risso-agro psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q', { input: q })

// Una persona en varias cuentas (Lau, 14/11; spec del cerebro
// clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona, «Una
// persona en varios campos»): un veterinario atiende dos campos con el mismo
// celular. Al entrar elige la cuenta (nada viene elegido); ve sólo lo de esa
// cuenta; cambia desde la barra y la app arranca con la otra, sin restos.
//
// Usa la cuenta de QA 2240000009 (código fijo de [auth.sms.test_otp]), que no es
// de ninguna empresa: el test le da dos y al terminar se las saca.
const CELULAR = '2240000009'
const OTRA = 'e2e00000-0000-4000-8000-0000000000e2'
const E2E = 'e2e00000-0000-4000-8000-0000000000e1'

function limpiar() {
  sql(`
    delete from miembro_empresa where user_id = (select id from auth.users where phone = '549${CELULAR}');
    delete from empresa where id = '${OTRA}';
  `)
}

test.beforeAll(() => {
  limpiar()
  sql(`
    insert into empresa (id, nombre, onboarding_completo_at, mapa_completo_at) values ('${OTRA}', 'E2E Otra Estancia', now(), now());
    insert into campo (empresa_id, nombre) values ('${OTRA}', 'La de la Otra');
    insert into miembro_empresa (empresa_id, user_id, rol, niveles)
    select '${E2E}', id, 'vet', '{"hacienda":"ve","campos":"ve","plata":"no"}' from auth.users where phone = '549${CELULAR}';
    insert into miembro_empresa (empresa_id, user_id, rol, niveles)
    select '${OTRA}', id, 'vet', '{"hacienda":"no","campos":"ve","plata":"no"}' from auth.users where phone = '549${CELULAR}';
  `)
})
test.afterAll(limpiar)

async function entrarComoVete(page: Page) {
  await despejarGuia(page)
  await page.goto('/login')
  await page.getByLabel('Tu celular, el que tiene WhatsApp').fill(CELULAR)
  await page.getByRole('button', { name: 'Mandame el código' }).click()
  await page.waitForURL('**/login/codigo')
  await page.locator('#codigo').fill(CODIGO_E2E)
}

test('con dos cuentas elige al entrar, ve sólo la elegida y cambia desde la barra', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComoVete(page)

  // Nada viene elegido ni entra solo: se pregunta.
  const lista = page.getByRole('list', { name: 'Tus cuentas' })
  await expect(lista.getByRole('button')).toHaveCount(2)
  await expect(lista.getByRole('button', { name: /E2E Otra Estancia/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Oficina' })).toHaveCount(0)

  // Entra a la otra: sus campos y ninguno de E2E Pruebas.
  await lista.getByRole('button', { name: /E2E Otra Estancia/ }).click()
  const cuenta = page.getByRole('button', { name: /Estás en E2E Otra Estancia/ })
  await expect(cuenta).toBeVisible()
  await expect(page.getByRole('radio', { name: /La de la Otra/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /E2E Campo base/ })).toHaveCount(0)

  // Al volver a abrir la app sigue en la misma cuenta (la elegida en este equipo).
  await page.reload()
  await expect(cuenta).toBeVisible()

  // Cambia desde la barra: la actual va marcada (es donde está), la otra se toca.
  await cuenta.click()
  const cuentas = page.getByRole('radiogroup', { name: 'Tus cuentas' })
  await expect(cuentas.getByRole('radio', { checked: true })).toHaveAccessibleName(/E2E Otra Estancia/)
  await cuentas.getByRole('radio', { name: /E2E Pruebas/ }).click()
  await expect(page.getByRole('button', { name: /Estás en E2E Pruebas/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('radio', { name: /E2E Campo base/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /La de la Otra/ })).toHaveCount(0)
})

test('si la cuenta elegida ya no es suya (lo sacaron), vuelve a preguntar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarComoVete(page)
  await page.getByRole('list', { name: 'Tus cuentas' }).getByRole('button', { name: /E2E Otra Estancia/ }).click()
  await expect(page.getByRole('button', { name: /Estás en E2E Otra Estancia/ })).toBeVisible()

  // El dueño de la otra lo saca; ahora está en una sola: entra directo a ésa.
  sql(`delete from miembro_empresa where empresa_id = '${OTRA}' and user_id = (select id from auth.users where phone = '549${CELULAR}');`)
  await page.reload()
  await expect(page.getByRole('radio', { name: /E2E Campo base/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /Estás en/ })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: /La de la Otra/ })).toHaveCount(0)

  // Vuelve a estar en dos: como la elegida ya no vale, se pregunta de nuevo.
  sql(`
    insert into miembro_empresa (empresa_id, user_id, rol, niveles)
    select '${OTRA}', id, 'vet', '{"hacienda":"no","campos":"ve","plata":"no"}' from auth.users where phone = '549${CELULAR}';
    update empresa set nombre = nombre where id = '${OTRA}';
  `)
  await page.reload()
  await expect(page.getByRole('list', { name: 'Tus cuentas' }).getByRole('button')).toHaveCount(2)
})
