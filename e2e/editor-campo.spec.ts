import { test, expect, type Page } from '@playwright/test'
import { entrar, sesionDePrueba } from './helpers'

// Campos · el editor del mapa (Figma 39, «Dibujar en el celular»): dibujar el
// potrero que falta, volver al campo y dividir otro con una línea. Contra
// Supabase local: el campo de prueba se arma acá, con su borde y un potrero ya
// dibujado.

const SUPABASE_LOCAL = 'http://127.0.0.1:54321'
const CLAVE = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const EMPRESA = 'e2e00000-0000-4000-8000-0000000000e1'

// Unas 96 ha cerca de Las Flores; el 1 ocupa la mitad oeste.
const N = -36.0
const S = -36.008
const O = -59.1
const E = -59.088
const M = (O + E) / 2

async function rest(token: string, ruta: string, metodo: string, cuerpo?: unknown) {
  const r = await fetch(`${SUPABASE_LOCAL}/rest/v1/${ruta}`, {
    method: metodo,
    headers: { apikey: CLAVE, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  if (!r.ok) throw new Error(`${metodo} ${ruta}: ${await r.text()}`)
  return (await r.json()) as Record<string, unknown>[]
}

/** Clic en una fracción del borde del campo en pantalla (0,0 = esquina noroeste). */
/** Con CAPTURAS=<carpeta>, cada paso queda en una imagen para mirarlo. */
const captura = (page: Page, nombre: string) => process.env.CAPTURAS && page.screenshot({ path: `${process.env.CAPTURAS}/${nombre}.png` })

async function tocar(page: Page, fx: number, fy: number, trazo = '#b85c2e') {
  const caja = await page.locator(`.leaflet-overlay-pane path[stroke="${trazo}"]`).first().boundingBox()
  if (!caja) throw new Error(`no se ve el dibujo de trazo ${trazo}`)
  await page.mouse.click(caja.x + caja.width * fx, caja.y + caja.height * fy)
  await page.waitForTimeout(150)
}

test('editor del mapa: dibujar el que falta y dividir otro con una línea', async ({ page }) => {
  const token = (await sesionDePrueba()).access_token as string
  const [campo] = await rest(token, 'campo', 'POST', {
    empresa_id: EMPRESA,
    nombre: `E2E Editor ${Date.now()}`,
    tipo: 'propio',
    lat: (N + S) / 2,
    lon: M,
    contorno: [
      [N, O],
      [N, E],
      [S, E],
      [S, O],
    ],
  })
  const campoId = campo!.id as string
  const [uno, dos] = await rest(token, 'potrero', 'POST', [
    { empresa_id: EMPRESA, campo_id: campoId, nombre: '1', estado_ciclo: 'descanso', hectareas: 48, poligono: [[N, O], [N, M], [S, M], [S, O]] },
    { empresa_id: EMPRESA, campo_id: campoId, nombre: '2', estado_ciclo: 'descanso', hectareas: 48, poligono: null },
  ])

  await entrar(page)
  if (process.env.MOVIL) await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/campos?campo=${campoId}`)

  // Falta el 2: el editor se abre solo, con la lista del alta (y el asistente acompaña).
  await expect(page.getByRole('heading', { name: 'Dibujá el siguiente' })).toBeVisible()
  await expect(page.getByTestId('acompanante')).toContainText('Dibujá el siguiente.')
  await captura(page, '1-elegir')
  await page.getByRole('region', { name: 'Faltan dibujar' }).getByRole('button', { name: new RegExp(`^${dos!.nombre}`) }).click()
  await expect(page.getByRole('heading', { name: `Dibujá el ${dos!.nombre}` })).toBeVisible()
  await page.waitForTimeout(1200) // el vuelo del encuadre

  // La mitad este, esquina por esquina, y se cierra en el primer punto.
  await tocar(page, 0.53, 0.04)
  await tocar(page, 0.96, 0.04)
  await tocar(page, 0.96, 0.96)
  await tocar(page, 0.53, 0.96)
  await expect(page.getByText('4 esquinas')).toBeVisible()
  await captura(page, '2-dibujar')
  await tocar(page, 0.53, 0.04)

  await expect(page.getByRole('heading', { name: `El ${dos!.nombre} ya está` })).toBeVisible()
  await captura(page, '3-dibujado')
  await page.getByRole('button', { name: 'Volver al campo' }).click()

  // De vuelta en el campo: «Corregir el campo» → «Dibujar en el satélite».
  await page.getByRole('button', { name: 'Corregir el campo' }).click()
  await page.getByRole('button', { name: 'Dibujar en el satélite' }).click()
  await expect(page.getByRole('heading', { name: /^El mapa de / })).toBeVisible()
  await page.getByRole('region', { name: 'Ya dibujados' }).getByRole('button', { name: new RegExp(`^${uno!.nombre}`) }).click()
  await captura(page, '4-potrero')
  await page.getByRole('button', { name: /Dividirlo con una línea/ }).click()
  await expect(page.getByRole('heading', { name: `Dividí el ${uno!.nombre} con una línea` })).toBeVisible()
  await page.waitForTimeout(1200)

  // Una línea norte-sur por el medio del 1 (el elegido, en trigo): de afuera a afuera.
  await tocar(page, 0.5, -0.1, '#ecc46a')
  await tocar(page, 0.5, 1.1, '#ecc46a')
  await captura(page, '5a-linea')

  await expect(page.getByRole('heading', { name: 'Revisá la división' })).toBeVisible()
  await captura(page, '5-revisar')
  await page.getByRole('button', { name: `Dividir el ${uno!.nombre}` }).click()
  await expect(page.getByRole('heading', { name: new RegExp(`^${uno!.nombre} y \\d+[A-Z]+ listos$`) })).toBeVisible()
  await captura(page, '6-dividido')

  // En la base: tres potreros dibujados que suman el campo (antes de corregir el 2).
  const ps = await rest(token, `potrero?campo_id=eq.${campoId}&select=nombre,hectareas,poligono`, 'GET')
  expect(ps).toHaveLength(3)
  expect(ps.every((p) => Array.isArray(p.poligono))).toBe(true)
  const total = ps.reduce((s, p) => s + Number(p.hectareas), 0)
  expect(total).toBeGreaterThan(90)
  expect(total).toBeLessThan(102)
  const has = ps.map((p) => Number(p.hectareas)).sort((a, b) => a - b)
  expect(has[0]).toBeGreaterThan(20)
  expect(has[1]).toBeLessThan(30)

  // Corregir el borde del 2: se arrastra su esquina noreste hacia adentro.
  await page.getByRole('button', { name: 'Ver los potreros' }).click()
  await page.getByRole('region', { name: 'Ya dibujados' }).getByRole('button', { name: new RegExp(`^${dos!.nombre}`) }).click()
  await page.getByRole('button', { name: /Corregir el borde/ }).click()
  await expect(page.getByRole('heading', { name: `Corregí el borde del ${dos!.nombre}` })).toBeVisible()
  await page.waitForTimeout(1200)
  const esquinas = page.locator('.leaflet-marker-pane .marker-icon:not(.marker-icon-middle)')
  await expect(esquinas.first()).toBeVisible()
  const cajas = (await esquinas.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) as DOMRect[]
  const ne = cajas.reduce((a, b) => (b.x - b.y > a.x - a.y ? b : a))
  await page.mouse.move(ne.x + ne.width / 2, ne.y + ne.height / 2)
  await page.mouse.down()
  await page.mouse.move(ne.x - 60, ne.y + 60, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByText(/^Ahora mide/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar el borde' })).toBeEnabled()
  await captura(page, '7-borde')
  await page.getByRole('button', { name: 'Guardar el borde' }).click()
  await expect(page.getByRole('heading', { name: `El ${dos!.nombre} ya está` })).toBeVisible()
  const [corregido] = await rest(token, `potrero?id=eq.${dos!.id}&select=hectareas`, 'GET')
  expect(Number(corregido!.hectareas)).toBeLessThan(47)
})
