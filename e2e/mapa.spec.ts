import { test, expect, type Page } from '@playwright/test'
import { codigoDelLog } from './helpers'

// Módulo 3 · Mapa del campo, contra Supabase local. Cada test arma su propia
// empresa: onboarding con un campo de 100 ha y dos potreros (60 y 40).

test.use({ viewport: { width: 1440, height: 900 } })

async function empresaConOnboarding(page: Page) {
  const numero = `22413${String(Date.now()).slice(-5)}`
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill('Prueba')
  await page.getByLabel('Apellido').fill('Mapa')
  await page.locator('input[type=tel]').fill(numero)
  await page.getByRole('button', { name: 'Seguir, mandame el código' }).click()
  await page.waitForURL('**/login/codigo')
  await page.waitForTimeout(800)
  await page.locator('#codigo').fill(codigoDelLog(`549${numero}`))
  await page.waitForURL('**/onboarding')
  await page.getByRole('button', { name: 'Crear mi empresa' }).click()
  await page.getByLabel('Cómo se llama').fill('La Porteña')
  await page.getByRole('combobox').fill('Chascomús')
  await page.getByRole('option', { name: /Chascom/ }).first().click()
  await page.getByLabel('Cuántas hectáreas').fill('100')
  await page.getByRole('button', { name: 'Guardar el campo' }).click()
  await expect(page.getByRole('heading', { name: '¿Cómo lo tenés dividido?' })).toBeVisible()
  await page.locator('input[inputmode=decimal]').nth(0).fill('60')
  await page.getByRole('button', { name: 'Sumar otro potrero' }).click()
  await page.locator('input[inputmode=decimal]').nth(1).fill('40')
  await page.getByRole('button', { name: 'Guardar los 2 potreros' }).click()
  await page.getByRole('radio', { name: 'Hacienda' }).click()
  await page.getByLabel('Vacas').fill('30')
  await page.getByRole('button', { name: 'Siguiente potrero' }).click()
  await expect(page.getByRole('heading', { name: '¿Qué hay en el 2A?' })).toBeVisible()
  await page.getByRole('radio', { name: 'Sembrado' }).click()
  await page.getByRole('button', { name: 'Trigo' }).click()
  await page.getByRole('button', { name: 'Listo, La Porteña' }).click()
  await page.getByRole('button', { name: 'No, con La Porteña está' }).click()
  await expect(page.getByRole('heading', { name: 'Tus campos están cargados.' })).toBeVisible()
}

/** Toca las esquinas y cierra tocando la primera (como el productor). */
async function dibujar(page: Page, puntos: [number, number][]) {
  for (const [x, y] of puntos) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(150)
  }
  await page.mouse.click(puntos[0]![0], puntos[0]![1])
}

test('primero el campo: sin el mapa sólo andan el Inicio y Campos', async ({ page }) => {
  await empresaConOnboarding(page)
  await page.getByRole('button', { name: 'Después: queda esperando en el Inicio' }).click()
  await expect(page).not.toHaveURL(/onboarding/)
  await page.goto('/hacienda')
  await expect(page).toHaveURL(/\/mapa$/)
  await expect(page.getByRole('heading', { name: 'Armemos La Porteña en el mapa' })).toBeVisible()
  await page.goto('/campos')
  await expect(page).toHaveURL(/\/campos$/)
})

test('de punta a punta: borde a mano, los dos potreros y se abre la app', async ({ page }) => {
  await empresaConOnboarding(page)
  await page.getByRole('button', { name: 'Ubicar La Porteña en el mapa' }).click()
  await page.waitForURL('**/mapa/**')
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByRole('heading', { name: 'Encontrá tu campo' })).toBeVisible()
  await page.getByRole('button', { name: 'Ya lo veo' }).click()
  await page.getByRole('button', { name: 'Lo marco a mano' }).click()
  await expect(page.getByRole('heading', { name: 'Clic en cada esquina' })).toBeVisible()

  await dibujar(page, [[260, 260], [680, 240], [700, 640], [280, 660]])
  await expect(page.getByRole('heading', { name: /La Porteña mide unas \d+ ha/ })).toBeVisible()
  // Dibujado a mano no cuadra con las 100 ha del alta: no deja seguir sin decidir.
  await expect(page.getByText('No cuadra con el alta')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Seguir con los potreros' })).toHaveCount(0)
  await page.getByRole('button', { name: /Sí, mide \d+ ha: lo corrijo/ }).click()
  await page.getByRole('button', { name: 'Seguir con los potreros' }).click()

  await expect(page.getByRole('heading', { name: 'Dibujá un potrero' })).toBeVisible()
  await dibujar(page, [[300, 300], [500, 290], [510, 620], [310, 630]])
  await expect(page.getByRole('heading', { name: /¿Cuál es\?/ })).toBeVisible()
  // Ninguno de tamaño parecido: hay que elegir.
  await expect(page.getByText('Elegí uno para seguir')).toBeVisible()
  await page.getByRole('radio', { name: /1A/ }).click()
  await page.getByRole('button', { name: 'Es el 1A' }).click()
  await expect(page.getByRole('heading', { name: 'El 1A ya está' })).toBeVisible()

  await page.getByRole('button', { name: 'Dibujar otro' }).click()
  // Uno encima del otro no se acepta.
  await dibujar(page, [[320, 320], [480, 320], [480, 600], [320, 600]])
  await expect(page.getByText('Se pisa con el 1A. Dibujalo al lado.')).toBeVisible()
  await dibujar(page, [[560, 300], [660, 290], [675, 600], [570, 605]])
  // Queda uno solo: va elegido.
  await page.getByRole('button', { name: 'Es el 2A' }).click()
  await page.getByRole('button', { name: 'Listo, La Porteña' }).click()
  await expect(page.getByRole('heading', { name: 'Tu campo, en el mapa' })).toBeVisible()
  await page.getByRole('button', { name: 'Ir al Inicio' }).click()
  await expect(page).not.toHaveURL(/mapa/)

  // La app quedó abierta.
  await page.goto('/hacienda')
  await expect(page).toHaveURL(/\/hacienda$/)
})

test('tocando el campo trae el borde del catastro y lo compara con el alta', async ({ page }) => {
  // ARBA simulado: devuelve una parcela de 1 km de lado (100 ha) alrededor del punto tocado.
  await page.route('**/geo.arba.gov.ar/**', async (route) => {
    const cql = new URL(route.request().url()).searchParams.get('CQL_FILTER') ?? ''
    const [lng, lat] = cql.match(/POINT\(([-\d.]+) ([-\d.]+)\)/)!.slice(1).map(Number) as [number, number]
    const dLat = 0.5 / 111.32
    const dLng = 0.5 / (111.32 * Math.cos((lat * Math.PI) / 180))
    const anillo = [
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
      [lng - dLng, lat - dLat],
    ]
    await route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { cca: '999', ara1: 1_000_000 }, geometry: { type: 'MultiPolygon', coordinates: [[anillo]] } }],
      },
    })
  })
  await empresaConOnboarding(page)
  await page.getByRole('button', { name: 'Ubicar La Porteña en el mapa' }).click()
  await page.getByRole('button', { name: 'Empezar' }).click()
  await page.getByRole('button', { name: 'Ya lo veo' }).click()
  await expect(page.getByRole('heading', { name: 'Hacé clic en tu campo' })).toBeVisible()
  await page.mouse.click(480, 450)
  await expect(page.getByRole('heading', { name: '¿Es este tu campo?' })).toBeVisible()
  await expect(page.getByText('Coincide con el alta')).toBeVisible()
  await page.getByRole('button', { name: 'Sí, es este' }).click()
  await expect(page.getByRole('heading', { name: /La Porteña mide unas 100 ha/ })).toBeVisible()
  await page.getByRole('button', { name: 'Seguir con los potreros' }).click()
  await expect(page.getByRole('heading', { name: 'Dibujá un potrero' })).toBeVisible()
})
