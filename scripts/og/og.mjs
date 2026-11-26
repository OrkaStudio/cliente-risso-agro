// Genera public/troppero-compartir.jpg (1200×630): la vista previa al mandar
// app.troppero.com por WhatsApp. Uso: node scripts/og/og.mjs
import { chromium } from '@playwright/test'

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await p.goto(new URL('./og.html', import.meta.url).href, { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
await p.screenshot({ path: new URL('../../public/troppero-compartir.jpg', import.meta.url).pathname, type: 'jpeg', quality: 88 })
await b.close()
