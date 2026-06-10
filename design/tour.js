/**
 * Tour visual de la maqueta navegable (dashboard-agro-ai.html).
 * Recorre las secciones y los estados interactivos, captura screenshots
 * en design/shots/ y reporta errores de consola.
 *
 * Uso (desde la raíz del repo):  node design/tour.js
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = 'file:///' + path.resolve(__dirname, 'dashboard-agro-ai.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const shot = (name) => ({ path: path.join(OUT, name + '.png'), animations: 'disabled', timeout: 60000 });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL);
await page.waitForTimeout(1800);

// Secciones base
for (const p of ['inicio', 'hacienda', 'campos', 'analitica', 'recorrida', 'clima']) {
  await page.evaluate((x) => nav(x), p);
  await page.waitForTimeout(500);
  await page.screenshot(shot(p));
}

// Recorrida paso 2: potreros del campo elegido
await page.evaluate(() => { nav('recorrida'); REC.campo = 'esperanza'; renderPhone(); });
await page.waitForTimeout(500);
await page.screenshot(shot('recorrida-potreros'));

// Recorrida: lluvia "sí" con input manual de mm abierto
await page.evaluate(() => { mLluvia('si'); mMMOtro(); });
await page.waitForTimeout(500);
await page.screenshot(shot('recorrida-lluvia'));
await page.evaluate(() => { REC.lluvia = {}; REC.mm = {}; REC.mmOtro = false; renderPhone(); });

// Recorrida paso 3: parte de potrero abierto en el teléfono
await page.evaluate(() => mOpen('la-loma'));
await page.waitForTimeout(600);
await page.screenshot(shot('recorrida-parte'));
await page.evaluate(() => { REC.cur = null; REC.campo = null; renderPhone(); });

// Manga: setup de sesión y sesión activa con escaneos
await page.evaluate(() => { PH.tab = 'manga'; MG.preset = 'aftosa'; renderPhone(); });
await page.waitForTimeout(500);
await page.screenshot(shot('manga-setup'));
await page.evaluate(() => { mgStart(); mgScan(); mgScan(); mgScan(); });
await page.waitForTimeout(500);
await page.screenshot(shot('manga-sesion'));
await page.evaluate(() => { MG.active = false; MG.preset = null; PH.tab = 'rec'; renderPhone(); });

// Clima: drawer de carga de lluvia
await page.evaluate(() => { nav('clima'); openLluvia(); });
await page.waitForTimeout(700);
await page.screenshot(shot('clima-lluvia'));
await page.evaluate(() => closeDrawer());

// Campos: drawer de potrero
await page.evaluate(() => { nav('campos'); openPotrero('la-loma'); });
await page.waitForTimeout(800);
await page.screenshot(shot('campos-drawer'));

// Campos: vista satelital (tiles de Esri tardan en cargar)
await page.evaluate(() => { closeDrawer(); setCamposView('satelital'); });
await page.waitForTimeout(4000);
await page.screenshot(shot('campos-satelital'));

// Campos: modo planificar
await page.evaluate(() => { setCamposView('mosaico'); setCamposMode('planificar'); });
await page.waitForTimeout(700);
await page.screenshot(shot('campos-planificar'));

// Hacienda: filtro de señal activo
await page.evaluate(() => { setCamposMode('mapa'); nav('hacienda'); setQ('trat'); });
await page.waitForTimeout(600);
await page.screenshot(shot('hacienda-filtro'));

// Hacienda: filtrada por potrero (flujo mapa → animales)
await page.evaluate(() => { setQ('todos'); setPotF('La Loma'); });
await page.waitForTimeout(500);
await page.screenshot(shot('hacienda-potrero'));
await page.evaluate(() => setPotF(null));

// Ficha de animal (D15)
await page.evaluate(() => openFicha('AR 138 001234567'));
await page.waitForTimeout(700);
await page.screenshot(shot('ficha-animal'));
await page.evaluate(() => closeDrawer());

// Analítica: drawer de carga de movimiento
await page.evaluate(() => { setQ('todos'); nav('analitica'); openCarga(); });
await page.waitForTimeout(800);
await page.screenshot(shot('analitica-carga'));

// El Ingeniero (asistente IA) — espera a que termine el tipeo en vivo
await page.evaluate(() => { closeDrawer(); nav('inicio'); openIngeniero(); });
await page.waitForTimeout(4500);
await page.screenshot(shot('ingeniero'));

// Sidebar colapsado
await page.evaluate(() => { closeDrawer(); toggleSidebar(); });
await page.waitForTimeout(700);
await page.screenshot(shot('inicio-colapsado'));

console.log('shots →', OUT);
console.log('console errors:', errors.length ? errors.join(' | ') : 'ninguno');
await browser.close();
process.exitCode = errors.length ? 1 : 0;
