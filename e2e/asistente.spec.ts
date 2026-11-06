import { test, expect } from '@playwright/test'
import { entrar } from './helpers'

// El asistente de Troppero fuera del mapa: abajo a la derecha, con su invitación
// a preguntarle. Se le escribe lo que sea; arranca con lo que notó.

test.use({ viewport: { width: 1440, height: 900 } })

test('se entiende qué es, dice lo que notó y lo que propone lo hace', async ({ page }) => {
  await entrar(page)
  const barra = page.getByRole('button', { name: /^El asistente de Troppero: notó/ })
  await expect(barra).toBeVisible()
  // La barra invita a preguntarle y, un rato, cuenta lo que notó.
  await expect(barra).toContainText('Preguntale a Troppero')
  await expect(barra).toContainText(/Noté \w+ cosas? en tus campos/, { timeout: 8000 })

  await page.getByRole('button', { name: /^El asistente de Troppero/ }).click()
  const panel = page.getByRole('dialog', { name: '¿En qué te ayudo?' })
  await expect(panel).toContainText('Lo que vi en tus campos')
  await expect(panel).toContainText('Probá preguntarme')
  await expect(panel).toContainText(/no tienen? hacienda cargada/)

  await panel.getByRole('button', { name: /Cargar la hacienda/ }).click()
  await expect(page).toHaveURL(/\/hacienda$/)
  // Lo abre él: aparece el «Entraron» con sus opciones.
  await expect(page.getByText('¿De dónde vienen?')).toBeVisible({ timeout: 8000 })
})

test('se le escribe: una duda la contesta, un número lleva a WhatsApp', async ({ page }) => {
  await entrar(page)
  await page.getByRole('button', { name: /^El asistente de Troppero/ }).click()
  const panel = page.getByRole('dialog', { name: '¿En qué te ayudo?' })
  // Ejemplos con sus campos, para arrancar.
  await expect(panel.getByRole('button', { name: /^¿Cuántos animales tengo/ })).toBeVisible()

  await panel.getByRole('textbox', { name: 'Escribí tu pregunta' }).fill('¿cómo dibujo los potreros?')
  await panel.getByRole('button', { name: 'Preguntar' }).click()
  await expect(panel.getByRole('button', { name: 'Ir al mapa' })).toBeVisible()

  await panel.getByRole('textbox', { name: 'Escribí tu pregunta' }).fill('¿cuánta plata gané este mes?')
  await panel.getByRole('textbox', { name: 'Escribí tu pregunta' }).press('Enter')
  await expect(panel).toContainText('Todavía no puedo leer tus números desde acá')
})
