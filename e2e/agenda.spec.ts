import { test, expect } from '@playwright/test'
import { entrar } from './helpers'

// Agenda (rediseño, Figma página 35): anotar algo que vence, verlo en «Lo que
// viene», marcarlo pagado con su «Deshacer», y que quede en «Ya pagado».
test('agenda: algo que vence, se marca pagado, se deshace y queda en Ya pagado', async ({ page }) => {
  const que = `E2E vence ${Date.now()}`
  await entrar(page)
  await page.getByRole('link', { name: 'Agenda', exact: true }).click()
  await expect(page.getByText(/En los próximos 30 días te (quedan|faltan)/)).toBeVisible()

  await page.getByRole('button', { name: 'Anotar algo que vence' }).click()
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

  // En «Lo que viene», y se abre «¿Lo pagaste?».
  await page.getByRole('button', { name: new RegExp(que) }).click()
  const pagar = page.getByRole('dialog', { name: que })
  await expect(pagar.getByText('En 7 días')).toBeVisible()
  await pagar.getByRole('group', { name: 'Cómo' }).getByRole('button', { name: 'Transferencia' }).click()
  await pagar.getByRole('button', { name: 'Marcar pagado' }).click()
  await expect(pagar).toBeHidden()

  // Ya pagado; «Deshacer» del aviso lo devuelve a la Agenda.
  await page.getByRole('tab', { name: 'Ya pagado' }).click()
  await expect(page.getByRole('button', { name: new RegExp(que) })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByRole('button', { name: new RegExp(que) })).toBeHidden()
  await page.getByRole('tab', { name: 'Lo que viene' }).click()
  await expect(page.getByRole('button', { name: new RegExp(que) })).toBeVisible()
})

test('agenda: las pestañas se abren con su resumen', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Agenda', exact: true }).click()
  await page.getByRole('tab', { name: 'Calendario' }).click()
  await expect(page.getByText('Tocá uno para marcarlo pagado o ver su detalle.')).toBeVisible()
  await page.getByRole('tab', { name: /^Para arreglar/ }).click()
  await expect(page.getByText(/para arreglar, la(s)? dejó la recorrida/)).toBeVisible()
  await page.getByRole('tab', { name: 'En cuotas' }).click()
  await expect(page.getByText(/faltan pagar en cuotas/)).toBeVisible()
  await page.getByRole('tab', { name: 'Cheques' }).click()
  await expect(page.getByText('En cartera', { exact: true }).first()).toBeVisible()
})
