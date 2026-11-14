import { test, expect, type Page } from '@playwright/test'
import { codigoDelLog } from './helpers'

// Módulo 3 · Mapa del campo, contra Supabase local. Cada test arma su propia
// empresa: onboarding con un campo de 100 ha y dos potreros (60 y 40).

test.use({ viewport: { width: 1440, height: process.env.ALTO ? Number(process.env.ALTO) : 900 } })

async function empresaConOnboarding(page: Page) {
  const numero = `22413${String(Date.now()).slice(-5)}`
  await page.goto('/registro')
  await page.getByLabel('Nombre').fill('Prueba')
  await page.getByLabel('Apellido').fill('Mapa')
  await page.locator('input[type=tel]').fill(numero)
  await page.getByRole('button', { name: 'Mandame el código' }).click()
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

/** Con CAPTURAS=<carpeta>, cada paso queda en una imagen para mirarlo. */
const captura = (page: Page, nombre: string) => process.env.CAPTURAS && page.waitForTimeout(700).then(() => page.screenshot({ path: `${process.env.CAPTURAS}/${nombre}.png` }))

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
  // La Hacienda espera: lleva a Campos, donde se arma el mapa sin salir de la web.
  await page.goto('/hacienda')
  await expect(page).toHaveURL(/\/campos$/)
  await expect(page.getByRole('heading', { name: 'Armemos La Porteña en el mapa' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Oficina' })).toBeVisible()
  // Dice por qué está acá; al dar el primer paso ya no hace falta.
  await expect(page.getByText('La Hacienda se abre cuando tu campo esté en el mapa.')).toBeVisible()
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByText('La Hacienda se abre cuando tu campo esté en el mapa.')).toBeHidden()
  await page.goto('/campos')
  await expect(page).toHaveURL(/\/campos$/)
})

test('de punta a punta: borde a mano, los dos potreros y se abre la app', async ({ page }) => {
  await empresaConOnboarding(page)
  await page.getByRole('button', { name: 'Ubicar La Porteña en el mapa' }).click()
  await page.waitForURL('**/campos?campo=**')
  // Llega a la tarjeta, se despierta y abre solo su ayuda: la primera vez, presentándose.
  await expect(page.getByText('Lo encontramos en el satélite')).toBeVisible()
  const ayuda = page.getByRole('dialog', { name: '¿En qué te ayudo?' })
  await expect(ayuda).toContainText('¡Hola! Soy tu asistente', { timeout: 8000 })
  await expect(ayuda).toContainText('¿Qué necesito tener a mano?')
  await page.keyboard.press('Escape')
  await expect(ayuda).toHaveCount(0)
  await captura(page, 't1-bienvenida')
  await page.getByRole('button', { name: 'Empezar' }).click()
  // Una sola pregunta: ¿tenés la boleta? Sin ella, se busca en el mapa.
  await expect(page.getByRole('heading', { name: '¿Tenés a mano la boleta de ARBA?' })).toBeVisible()
  await page.getByRole('button', { name: /^No/ }).click()
  await expect(page.getByRole('heading', { name: 'Buscá tu campo y tocalo' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Paraje, pueblo o ruta cerca de tu campo' })).toBeVisible()
  await captura(page, 't2-encontrar')
  // Un solo asistente: mientras el del mapa acompaña, el de abajo a la derecha se corre.
  await expect(page.getByRole('button', { name: /^El asistente de Troppero(: notó|$)/ })).toHaveCount(0)
  // Marcar a mano aparece recién si no encuentra su campo dos veces (acá, en la laguna: sin parcela).
  await expect(page.getByRole('button', { name: 'No aparece: lo marco a mano' })).toHaveCount(0)
  for (const [x, y] of [[420, 520], [440, 540]] as const) {
    await page.mouse.click(x, y)
    await expect(page.getByText('Buscando la parcela…')).toHaveCount(0, { timeout: 20000 })
  }
  await page.getByRole('button', { name: 'No aparece: lo marco a mano' }).click()
  await expect(page.getByRole('heading', { name: 'Clic en cada esquina' })).toBeVisible()
  await captura(page, 't3-marcar')

  await dibujar(page, [[360, 260], [780, 240], [800, 640], [380, 660]])
  await expect(page.getByRole('heading', { name: /La Porteña mide unas [\d.,]+ ha/ })).toBeVisible()
  // Dibujado a mano no cuadra con las 100 ha del alta: no deja seguir sin decidir.
  await expect(page.getByText('No cuadra con el alta', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Seguir con los potreros' })).toHaveCount(0)
  await captura(page, 't4-no-cuadra')
  // Mide 10 veces lo cargado: lo primero que ofrece es ajustar el dibujo, no pisar el alta.
  await expect(page.getByRole('button', { name: 'Ajustar el borde' })).toBeVisible()
  await page.getByRole('button', { name: /Mide [\d.,]+ ha: corregir el alta/ }).click()
  await page.getByRole('button', { name: 'Seguir con los potreros' }).click()

  await expect(page.getByRole('heading', { name: 'Dibujá un potrero' })).toBeVisible()
  await captura(page, 't5-potreros')
  await page.getByRole('button', { name: 'Dibujar un potrero', exact: true }).click()
  await page.waitForTimeout(1000) // el mapa se encuadra en el campo
  await dibujar(page, [[400, 300], [600, 290], [610, 620], [410, 630]])
  await expect(page.getByRole('heading', { name: '¿Cuál de estos es?' })).toBeVisible()
  // Ninguno de tamaño parecido: hay que elegir.
  await expect(page.getByText('Elegí uno para seguir')).toBeVisible()
  await captura(page, 't6-cual')
  await page.getByRole('radio', { name: /1A/ }).click()
  // Lo dibujado no cuadra con las 60 ha del alta: se avisa y hay que confirmar la corrección.
  await expect(page.getByText('No cuadra con el alta', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lo dibujo de nuevo' }).first()).toBeVisible()
  await page.getByRole('button', { name: /El 1A mide [\d.,]+ ha: corregir el alta/ }).click()
  await expect(page.getByRole('heading', { name: 'El 1A ya está' })).toBeVisible()
  await captura(page, 't7-listo')

  await page.getByRole('button', { name: 'Dibujar otro' }).click()
  // Uno encima del otro no se acepta.
  await dibujar(page, [[420, 320], [580, 320], [580, 600], [420, 600]])
  await expect(page.getByText('Se pisa con el 1A. Dibujalo al lado.')).toBeVisible()
  await dibujar(page, [[660, 300], [760, 290], [775, 600], [670, 605]])
  // Queda uno solo: va elegido.
  await page.getByRole('button', { name: /Es el 2A|Sí, el 2A mide|El 2A mide [\d.,]+ ha: corregir el alta/ }).click()
  await page.getByRole('button', { name: 'Listo, La Porteña' }).click()
  await expect(page.getByRole('heading', { name: 'Tu campo, en el mapa' })).toBeVisible()
  await captura(page, 't8-cierre')
  await page.getByRole('button', { name: 'Ir al Inicio' }).click()
  await expect(page).toHaveURL(/\/$/)

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
        features: [{ type: 'Feature', properties: { cca: '999', ara1: 1_000_000, pda: '999000001' }, geometry: { type: 'MultiPolygon', coordinates: [[anillo]] } }],
      },
    })
  })
  await empresaConOnboarding(page)
  await page.getByRole('button', { name: 'Ubicar La Porteña en el mapa' }).click()
  await page.getByRole('button', { name: 'Empezar' }).click()
  await page.getByRole('button', { name: /^No/ }).click()
  await expect(page.getByRole('heading', { name: 'Buscá tu campo y tocalo' })).toBeVisible()
  await captura(page, 'c1-tocar')
  await page.mouse.click(580, 450)
  // Pregunta si es el suyo, con la partida y las hectáreas; si es la del vecino, vuelve a tocar.
  await expect(page.getByRole('heading', { name: '¿Es tu campo?' })).toBeVisible()
  await expect(page.getByText(/partida 999.000001/)).toBeVisible()
  await expect(page.getByText('Coincide con el alta')).toBeVisible()
  await captura(page, 'c2-parcela')
  await page.getByRole('button', { name: 'No, toco otra' }).click()
  await expect(page.getByText('Tocá bien adentro de tu campo, lejos del alambrado.')).toBeVisible()
  await page.mouse.click(600, 460)
  await page.getByRole('button', { name: 'Sí, es mi campo' }).click()
  await expect(page.getByRole('heading', { name: /La Porteña mide unas 100 ha/ })).toBeVisible()
  await page.getByRole('button', { name: 'Seguir con los potreros' }).click()
  await expect(page.getByRole('heading', { name: 'Dibujá un potrero' })).toBeVisible()
})

test('con el número de partida trae el campo exacto y se confirma', async ({ page }) => {
  // ARBA simulado: la partida 058-000146 es una parcela de 100 ha cerca de Chascomús.
  await page.route('**/geo.arba.gov.ar/**', async (route) => {
    const cql = new URL(route.request().url()).searchParams.get('CQL_FILTER') ?? ''
    const [lat, lng] = [-35.57, -58.0]
    const dLat = 0.5 / 111.32
    const dLng = 0.5 / (111.32 * Math.cos((lat * Math.PI) / 180))
    const anillo = [[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]
    const es = cql.includes("pda='058000146'")
    await route.fulfill({ json: { type: 'FeatureCollection', features: es ? [{ type: 'Feature', properties: { cca: '058', ara1: 1_000_000, pda: '058000146' }, geometry: { type: 'MultiPolygon', coordinates: [[anillo]] } }] : [] } })
  })
  await empresaConOnboarding(page)
  await page.getByRole('button', { name: 'Ubicar La Porteña en el mapa' }).click()
  await page.getByRole('button', { name: 'Empezar' }).click()
  await captura(page, 'p00-pregunta')
  await page.getByRole('button', { name: /^Sí, la tengo/ }).click()
  await expect(page.getByRole('heading', { name: 'Tu número de partida' })).toBeVisible()
  await captura(page, 'p0-formulario')
  await page.getByLabel('Partido').fill('58')
  await page.getByLabel('Partida').fill('999')
  await page.getByRole('button', { name: 'Traer mi campo' }).click()
  await expect(page.getByText(/No encontramos esa partida/)).toBeVisible()
  // Recién con el error aparece la salida al mapa.
  await expect(page.getByRole('button', { name: 'Buscarlo en el mapa' })).toBeVisible()
  await page.getByLabel('Partida').fill('146')
  await page.getByRole('button', { name: 'Traer mi campo' }).click()
  await expect(page.getByRole('heading', { name: '¿Es tu campo?' })).toBeVisible()
  await expect(page.getByText(/partida 058.000146, de 100 ha/)).toBeVisible()
  await captura(page, 'p1-partida')
  await expect(page.getByRole('button', { name: 'No, reviso el número' })).toBeVisible()
  await page.getByRole('button', { name: 'Sí, es mi campo' }).click()
  await expect(page.getByRole('button', { name: 'Ajustar el borde' })).toBeVisible()
})

test('en el borde se vuelve con un botón, paso por paso', async ({ page }) => {
  await empresaConOnboarding(page)
  await page.getByRole('button', { name: 'Ubicar La Porteña en el mapa' }).click()
  await page.getByRole('button', { name: 'Empezar' }).click()
  await page.getByRole('button', { name: /^No/ }).click()
  await expect(page.getByRole('heading', { name: 'Buscá tu campo y tocalo' })).toBeVisible()
  await captura(page, 'v1-tocar')
  // Encontró la boleta: vuelve y elige que sí.
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await page.getByRole('button', { name: /^Sí, la tengo/ }).click()
  await expect(page.getByRole('heading', { name: 'Tu número de partida' })).toBeVisible()
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(page.getByRole('heading', { name: '¿Tenés a mano la boleta de ARBA?' })).toBeVisible()
})
