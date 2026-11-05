import { test, expect } from '@playwright/test'
import { entrar } from './helpers'

// Agenda por semana (Lau, 05/11): anotar algo que vence, verlo en su semana,
// marcarlo pagado con su «Deshacer», y lo vencido sin marcar se pregunta.
test('agenda: algo que vence aparece en su semana, se marca pagado y se deshace', async ({ page }) => {
  const que = `E2E vence ${Date.now()}`
  await entrar(page)
  await page.getByRole('link', { name: 'Agenda', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Anotar un pago o un cobro' }).click()
  const panel = page.getByRole('dialog', { name: 'Algo que vence' })
  await panel.getByRole('textbox', { name: 'Cuánto' }).fill('4200')
  const enQue = panel.getByRole('group', { name: 'En qué' })
  if (!(await enQue.getByRole('button', { name: 'Combustible', exact: true }).count())) await enQue.getByRole('button', { name: 'Otra' }).click()
  await enQue.getByRole('button', { name: 'Combustible', exact: true }).click()
  await panel.getByRole('group', { name: 'De qué campo' }).getByRole('button', { name: 'E2E Campo base' }).click()
  await panel.getByRole('group', { name: 'Cuándo vence' }).getByRole('button', { name: 'En 7 días' }).click()
  await panel.getByRole('textbox', { name: 'Qué fue' }).fill(que)
  await panel.getByRole('button', { name: /^Anotar: pagás/ }).click()
  await expect(panel).toBeHidden()

  // En el calendario, su día tiene el monto y el nombre; tocarlo abre «¿Lo pagaste?».
  const enSieteDias = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('es-AR', { month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
  const esteMes = new Date().toLocaleDateString('es-AR', { month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
  if (enSieteDias !== esteMes) await page.getByRole('button', { name: /por resolver|^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)$/ }).last().click()
  // Tocar su día abre todo lo de ese día; ahí está, con su botón.
  const largo = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
  await page.getByRole('button', { name: new RegExp(`^Ver el ${largo.charAt(0).toUpperCase() + largo.slice(1)}:`) }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: new RegExp(`Pagás: ${que}`) })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar' }).first().click()

  // En la lista por semana se lee entero y se resuelve ahí.
  await page.getByRole('radio', { name: 'Lista por semana' }).click()
  const fila = page.getByRole('button', { name: new RegExp(`Pagás: ${que}`) })
  await expect(fila).toContainText('Ya lo pagué')
  await fila.click()
  const pagar = page.getByRole('dialog', { name: que })
  await expect(pagar.getByText('En 7 días')).toBeVisible()
  // Nada viene elegido: sin decir cuándo, no se marca.
  await pagar.getByRole('button', { name: 'Marcar pagado' }).click()
  await expect(pagar.getByRole('alert')).toContainText('Tocá cuándo lo pagaste')
  await pagar.getByRole('group', { name: 'Cuándo' }).getByRole('button', { name: 'Hoy' }).click()
  await pagar.getByRole('group', { name: 'Cómo' }).getByRole('button', { name: 'Transferencia' }).click()
  await pagar.getByRole('button', { name: 'Marcar pagado' }).click()
  await expect(pagar).toBeHidden()

  // «Deshacer» del aviso lo devuelve: vuelve a decir «Ya lo pagué».
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByRole('button', { name: new RegExp(`Pagás: ${que}`) })).toContainText('Ya lo pagué')
})

test('agenda: lo vencido sin marcar se pregunta y se resuelve de una vez', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Agenda', exact: true }).click()
  // El filtro de cheques dice lo que hay en cartera y lo que se dio.
  await page.getByRole('radio', { name: 'Cheques' }).click()
  await expect(page.getByText(/Cheques: tenés/)).toBeVisible()
  await page.getByRole('radio', { name: 'Todo', exact: true }).click()
  const revisar = page.getByRole('button', { name: /Revisarlas/ })
  if (await revisar.count()) {
    await revisar.click()
    const pregunta = page.getByRole('region', { name: 'Vencido sin marcar' })
    // Nada viene tildado: el botón espera; se tilda uno y cuenta; «Tildar todas» los marca a todos.
    const tildes = pregunta.getByRole('checkbox')
    const n = await tildes.count()
    await expect(pregunta.getByRole('button', { name: 'Tildá lo que ya está' })).toBeDisabled()
    await tildes.first().click()
    await expect(pregunta.getByRole('button', { name: /marcar 1$/ })).toBeVisible()
    await pregunta.getByRole('button', { name: 'Tildar todas' }).click()
    await expect(pregunta.getByRole('button', { name: new RegExp(`marcar ${n}$`) })).toBeVisible()
    // Toda la fila abre el detalle, y desde ahí se vuelve a la lista.
    await pregunta.getByRole('button', { name: /^\d+ \w+ (Pagar|Cobrar):/ }).first().click()
    await page.getByRole('button', { name: 'Volver a la lista' }).click()
    await expect(page.getByRole('dialog', { name: '¿Ya pagaste esto?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar' }).first().click()
  }
  // Un día del calendario abre todo lo de ese día en el panel.
  await page.getByRole('button', { name: /^Ver el .*, hoy|^Ver el / }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
