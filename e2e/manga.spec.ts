import { test, expect, type Page } from '@playwright/test'

/**
 * Manga: elección de alcance + escaneo rápido con el bastón.
 *
 * Corre offline contra el build de producción (misma config que
 * `offline.spec.ts`) porque es el régimen real: en la manga no hay señal y todo
 * pasa por Dexie. Sin credenciales — se fabrica la sesión en localStorage.
 *
 * El test que importa es el de las DOS lecturas seguidas: el bastón es un
 * teclado HID y con auto-confirmar prendido dispara la asignación sola. La
 * segunda lectura entra antes de que Dexie propague la primera, y hasta este
 * arreglo las dos caían sobre el MISMO animal (la segunda moría después en el
 * sync contra `uq_caravana_vigente_por_animal`, dejando un animal sin
 * caravanear y una lectura perdida).
 */

const AUTH_KEY = 'sb-voippiczkxbxsreiqiqu-auth-token'
const MEMBRESIA_KEY = 'risso.membresia.v1'
const EMPRESA = '00000000-0000-4000-8000-00000000000e'
const MOVIL = { width: 390, height: 844 }

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.firma-fake`
}

function sesionFabricada() {
  const ahora = Math.floor(Date.now() / 1000)
  const userId = '00000000-0000-4000-8000-000000000001'
  return {
    access_token: fakeJwt({
      sub: userId,
      exp: ahora + 3_600,
      role: 'authenticated',
      aud: 'authenticated',
      session_id: '00000000-0000-4000-8000-000000000002',
    }),
    refresh_token: 'refresh-fake-e2e',
    token_type: 'bearer',
    expires_in: 3_600,
    expires_at: ahora + 3_600,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'offline@e2e.local',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { nombre: 'Offline', apellido: 'E2E' },
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
}

const membresiaFabricada = {
  empresa_id: EMPRESA,
  rol: 'dueno',
  empresa: { id: EMPRESA, nombre: 'E2E Offline' },
}

/**
 * Tres animales en la tropa que va a pasar por la manga y uno en OTRO potrero.
 * El de afuera es el testigo del bug del alcance: si el filtro no anda, la
 * cabeza de cola puede caer sobre él.
 */
const ANIMALES = [
  {
    id: 'a1',
    empresa_id: EMPRESA,
    categoria: 'vaca',
    potrero_id: 'p1',
    potrero_nombre: '11B',
    lote_id: 'l1',
    lote_nombre: 'Lote 3',
    caravaneado: 0,
  },
  {
    id: 'a2',
    empresa_id: EMPRESA,
    categoria: 'vaca',
    potrero_id: 'p1',
    potrero_nombre: '11B',
    lote_id: 'l1',
    lote_nombre: 'Lote 3',
    caravaneado: 0,
  },
  {
    id: 'a3',
    empresa_id: EMPRESA,
    categoria: 'vaca',
    potrero_id: 'p1',
    potrero_nombre: '11B',
    lote_id: 'l1',
    lote_nombre: 'Lote 3',
    caravaneado: 0,
  },
  {
    id: 'z9',
    empresa_id: EMPRESA,
    categoria: 'vaca',
    potrero_id: 'p2',
    potrero_nombre: '10B',
    lote_id: 'l2',
    lote_nombre: 'Lote 4',
    caravaneado: 0,
  },
]

declare global {
  /** Abre la base de la manga tal como la dejó Dexie, o null si aún no existe.
   *  Sin número de versión a propósito: Dexie multiplica por 10 la que declara
   *  (`version(2)` → 20 en IndexedDB), así que pedir una fija tira VersionError. */
  function abrirManga(): Promise<IDBDatabase | null>
  /** Ídem para el cache de la Recorrida, que es de donde el croquis de la
   *  Manga saca los campos y los potreros con su polígono. */
  function abrirRecorrida(): Promise<IDBDatabase | null>
}

/** Un campo con cuatro potreros dibujados: dos con hacienda, uno con DOS
 *  tropas (el caso que obliga a preguntar cuál) y uno vacío. */
const CAMPO = { id: 'c1', nombre: 'La Porteña', empresa_id: EMPRESA, color_idx: 0 }

const cuadro = (x: number, y: number): [number, number][] => [
  [y, x],
  [y, x + 0.01],
  [y - 0.01, x + 0.01],
  [y - 0.01, x],
]

const POTREROS_REF = [
  {
    id: 'p1',
    campo_id: 'c1',
    nombre: '11B',
    estado_ciclo: 'ganadero',
    cabezas: 3,
    composicion: [
      { categoria: 'vaquillona', cabezas: 14 },
      { categoria: 'ternero', cabezas: 5 },
      { categoria: 'oveja', cabezas: 4 },
      { categoria: 'cordero', cabezas: 4 },
      { categoria: 'yegua', cabezas: 3 },
    ],
    tropas: [
      {
        id: 'l1',
        nombre: 'Lote 3',
        cabezas: 3,
        composicion: [
          { categoria: 'vaquillona', cabezas: 14 },
          { categoria: 'ternero', cabezas: 5 },
          { categoria: 'oveja', cabezas: 4 },
          { categoria: 'cordero', cabezas: 4 },
          { categoria: 'yegua', cabezas: 3 },
        ],
      },
    ],
    poligono: cuadro(-59.0, -37.0),
    ultima: null,
  },
  {
    id: 'p2',
    campo_id: 'c1',
    nombre: '10B',
    estado_ciclo: 'ganadero',
    cabezas: 1,
    composicion: [],
    tropas: [
      { id: 'l2', nombre: 'Lote 4 cría', cabezas: 1, composicion: [] },
      { id: 'l3', nombre: 'Lote 4 invernada', cabezas: 0, composicion: [] },
    ],
    poligono: cuadro(-58.98, -37.0),
    ultima: null,
  },
  {
    id: 'p3',
    campo_id: 'c1',
    nombre: '9B',
    estado_ciclo: 'ganadero',
    cabezas: 0,
    composicion: [],
    tropas: [],
    poligono: cuadro(-59.0, -37.02),
    ultima: null,
  },
]

/**
 * Los 12 potreros de La Porteña con sus posiciones y tamaños REALES (de prod).
 * Reproduce el caso que rompía: con el panel abierto el mapa quedaba en ~160px,
 * cada potrero medía menos que el mínimo táctil y TODOS pasaban a pin — los
 * pines se amontonaban unos sobre otros y el croquis dejaba de serlo.
 */
const LA_PORTENA: [string, number, number, number, number][] = [
  // nombre, lat_min, lng_min, alto_m, ancho_m
  ['11B', -35.93183, -59.30613, 1747, 1497],
  ['2B', -35.91673, -59.30197, 1056, 981],
  ['9B', -35.91599, -59.28596, 977, 1016],
  ['8B', -35.92133, -59.29171, 937, 940],
  ['1B', -35.91313, -59.30609, 903, 868],
  ['10B', -35.91004, -59.27935, 779, 817],
  ['5B', -35.9181, -59.2957, 756, 722],
  ['4B', -35.91446, -59.29173, 749, 720],
  ['3B', -35.91058, -59.29523, 704, 661],
  ['6B', -35.91939, -59.29799, 498, 559],
  ['7B', -35.92304, -59.2925, 440, 441],
  ['12B', -35.92071, -59.29546, 320, 433],
]

const POTREROS_GRANDES = LA_PORTENA.map(([nombre, lat, lng, altoM, anchoM], i) => {
  const dLat = altoM / 111_000
  const dLng = anchoM / 89_000
  return {
    id: `gp${i}`,
    campo_id: 'c1',
    nombre,
    estado_ciclo: 'ganadero',
    cabezas: 10,
    composicion: [{ categoria: 'vaca', cabezas: 10 }],
    tropas: [{ id: `gl${i}`, nombre: `Lote ${i}`, cabezas: 10, composicion: [] }],
    poligono: [
      [lat, lng],
      [lat, lng + dLng],
      [lat + dLat, lng + dLng],
      [lat + dLat, lng],
    ],
    ultima: null,
  }
})

/** Visita online (instala el SW), fabrica sesión y siembra Dexie. */
async function prepararManga(page: Page) {
  await page.addInitScript(() => {
    const abrir = (nombre: string, stores: string[]) => () =>
      new Promise<IDBDatabase | null>((resolve) => {
        const req = indexedDB.open(nombre)
        req.onsuccess = () => {
          const db = req.result
          if (!stores.every((s) => db.objectStoreNames.contains(s))) {
            db.close()
            resolve(null)
            return
          }
          resolve(db)
        }
        req.onerror = () => resolve(null)
      })
    Object.assign(window, {
      abrirManga: abrir('risso-manga', ['animales', 'outbox', 'refs']),
      abrirRecorrida: abrir('risso-recorrida', ['refs']),
    })
  })
  await page.goto('/')
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    if (!reg.active) throw new Error('service worker sin activar')
  })
  await page.evaluate(
    ([authKey, sesion, membKey, memb]) => {
      localStorage.setItem(authKey as string, JSON.stringify(sesion))
      localStorage.setItem(membKey as string, JSON.stringify(memb))
    },
    [AUTH_KEY, sesionFabricada(), MEMBRESIA_KEY, membresiaFabricada],
  )
  // Una visita a la manga CON red deja la base creada por Dexie con su schema
  // real. Recién después se siembra: así el test no tiene que replicar (ni
  // mantener sincronizado) el esquema de `db.ts`.
  await page.goto('/campo/manga')
  await expect
    .poll(async () => page.evaluate(() => abrirManga().then((db) => db !== null)), {
      timeout: 15_000,
    })
    .toBe(true)

  await page.evaluate(async (animales) => {
    const db = await abrirManga()
    if (!db) throw new Error('la app no creó risso-manga')
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['animales', 'refs'], 'readwrite')
      const store = tx.objectStore('animales')
      for (const a of animales) store.put(a)
      tx.objectStore('refs').put({ id: 'rfids', rfids: [], updated_at: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, ANIMALES)

  // El croquis de la Manga lee el cache de la Recorrida: campos y potreros con
  // su polígono. Se siembra igual, sin replicar el esquema a mano.
  await page.goto('/campo/recorrida')
  await expect
    .poll(() => page.evaluate(() => abrirRecorrida().then((d) => d !== null)), {
      timeout: 15_000,
    })
    .toBe(true)

  await page.evaluate(
    async ([campo, potreros]) => {
      const db = await abrirRecorrida()
      if (!db) throw new Error('la app no creó risso-recorrida')
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('refs', 'readwrite')
        tx.objectStore('refs').put({
          id: 'refs',
          campos: [campo],
          potreros,
          updated_at: Date.now(),
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    [CAMPO, POTREROS_REF] as const,
  )
}

/** Camino completo hasta la pantalla de trabajo: actividad → croquis → tropa. */
async function entrarACaravanear(page: Page, potrero: string) {
  await page.goto('/campo/manga')
  await page.getByRole('button', { name: /Caravanear/ }).click()
  await page.getByRole('button', { name: /Elegir los animales/ }).click()
  // El potrero se toca en el DIBUJO, que es el punto de todo esto.
  await page.getByRole('button', { name: potrero, exact: true }).click()
  await page.getByRole('button', { name: /^Empezar/ }).click()
}

/** Teclea como el bastón: ráfaga rápida (gaps < 120ms) y Enter al final. */
async function escanear(page: Page, rfid: string) {
  for (const c of rfid) await page.keyboard.press(c, { delay: 8 })
  await page.keyboard.press('Enter')
}

/**
 * Dos lecturas en el MISMO tick de JS — la condición de carrera real.
 *
 * Con `page.keyboard` de por medio pasan ~130ms entre lectura y lectura, de
 * sobra para que Dexie propague y React re-renderice: así el bug NO se
 * reproduce (verificado reintroduciéndolo a mano). En un teléfono con 500
 * animales en el cache esa propagación tarda, y la lectura siguiente entra
 * antes. Acá se despachan los KeyboardEvent sincrónicamente, que es la forma
 * determinista de meterse en esa ventana.
 *
 * Se `blur()` antes de cada ráfaga a propósito: sin foco en el input entra por
 * el rescate de `useScanner`, que asigna desde el propio handler de keydown.
 * Ese es el camino que dispara el bastón con auto-confirmar prendido.
 */
async function escanearEnElMismoTick(page: Page, rfids: string[]) {
  await page.evaluate((lecturas) => {
    for (const texto of lecturas) {
      ;(document.activeElement as HTMLElement | null)?.blur()
      for (const ch of texto) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }
  }, rfids)
}

/** Lee la cola de asignaciones de Dexie (lo que se va a subir). */
async function leerOutbox(page: Page) {
  return page.evaluate(async () => {
    const db = await abrirManga()
    if (!db) return []
    return new Promise<{ animal_id: string; rfid: string }[]>((resolve, reject) => {
      const tx = db.transaction('outbox', 'readonly')
      const all = tx.objectStore('outbox').getAll()
      all.onsuccess = () =>
        resolve(
          (all.result as { animal_id: string; rfid: string }[]).map((o) => ({
            animal_id: o.animal_id,
            rfid: o.rfid,
          })),
        )
      all.onerror = () => reject(all.error)
    })
  })
}

/** Rodeo YA caravaneado, para los trabajos que IDENTIFICAN (no crean). */
const RODEO = [
  {
    rfid: '032010010414565',
    animal_id: 'r1',
    empresa_id: EMPRESA,
    categoria: 'vaquillona',
    potrero_id: 'p1',
    lote_id: 'l1',
  },
  {
    rfid: '032010010414566',
    animal_id: 'r2',
    empresa_id: EMPRESA,
    categoria: 'ternero',
    potrero_id: 'p1',
    lote_id: 'l1',
  },
  // Un toro: no es madre ni cría, así que un destete no lo contempla. Es el
  // testigo del animal que cae FUERA del plan de salidas.
  {
    rfid: '032010010414567',
    animal_id: 'r3',
    empresa_id: EMPRESA,
    categoria: 'toro',
    potrero_id: 'p1',
    lote_id: 'l1',
  },
]

async function sembrarRodeo(page: Page) {
  await page.evaluate(async (filas) => {
    const db = await abrirManga()
    if (!db) throw new Error('sin risso-manga')
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('rodeo', 'readwrite')
      for (const f of filas) tx.objectStore('rodeo').put(f)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, RODEO)
}

async function leerTrabajos(page: Page) {
  return page.evaluate(async () => {
    const db = await abrirManga()
    if (!db) return []
    return new Promise<{ animal_id: string; tipo: string; datos: Record<string, unknown> }[]>(
      (resolve, reject) => {
        const all = db.transaction('trabajos', 'readonly').objectStore('trabajos').getAll()
        all.onsuccess = () =>
          resolve(
            (all.result as { animal_id: string; tipo: string; datos: Record<string, unknown> }[]).map(
              (t) => ({ animal_id: t.animal_id, tipo: t.tipo, datos: t.datos }),
            ),
          )
        all.onerror = () => reject(all.error)
      },
    )
  })
}

/** Lee el aparte: a qué grupo fue cada animal y qué falta ejecutar. */
async function leerApartes(page: Page) {
  return page.evaluate(async () => {
    const db = await abrirManga()
    if (!db) return []
    return new Promise<
      {
        animal_id: string
        salida_id: string
        destino_k: string
        potrero_destino_id: string | null
        estado: string
      }[]
    >((resolve, reject) => {
      const all = db.transaction('apartes', 'readonly').objectStore('apartes').getAll()
      all.onsuccess = () => resolve(all.result)
      all.onerror = () => reject(all.error)
    })
  })
}

test.describe('croquis — legibilidad con muchos potreros', () => {
  test('con 12 potreros el mapa NO los degrada a pines amontonados', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    // Se pisa el cache con el campo real de 12 potreros.
    await page.evaluate(
      async ([campo, potreros]) => {
        const db = await abrirRecorrida()
        if (!db) throw new Error('sin risso-recorrida')
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('refs', 'readwrite')
          tx.objectStore('refs').put({
            id: 'refs',
            campos: [campo],
            potreros,
            updated_at: Date.now(),
          })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      },
      [CAMPO, POTREROS_GRANDES] as const,
    )
    await context.setOffline(true)

    await page.goto('/campo/manga')
    await page.getByRole('button', { name: /Caravanear/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()

    // Con el panel ABIERTO —que es cuando el mapa se aplastaba— los polígonos
    // tienen que seguir dibujados, no convertidos en pines.
    await page.getByRole('button', { name: '11B', exact: true }).click()
    await expect(page.getByText('Potrero 11B')).toBeVisible()
    // "No hay bovinos" y "no sé qué hay" son cosas distintas: sin composición
    // en el cache solo corresponde la segunda.
    await expect(page.getByText('Sin bovinos acá')).toHaveCount(0)
    await expect(page.getByText('No sabemos qué categorías')).toBeVisible()

    const svg = page.locator('svg[aria-label*="Croquis"]')
    await expect(svg).toBeVisible()
    const caja = await svg.boundingBox()
    // 38vh de 844px ≈ 320px. Si el mapa cae de ahí, todo vuelve a ser pin.
    expect(caja!.height).toBeGreaterThan(280)

    // Los 12 sigan tocables y con su forma.
    for (const n of ['1B', '5B', '12B', '9B']) {
      await expect(page.getByRole('button', { name: n, exact: true })).toBeVisible()
    }

    await context.close()
  })
})

test.describe('manga — trabajos sobre animales caravaneados', () => {
  test('vacunar + destetar: un escaneo deja DOS eventos y el retiro cargado', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await sembrarRodeo(page)
    await context.setOffline(true)

    await page.goto('/campo/manga')
    await page.getByRole('button', { name: /Vacunar/ }).click()
    await page.getByRole('button', { name: /Destetar/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()
    await page.getByRole('button', { name: '11B', exact: true }).click()
    await page.getByRole('button', { name: /^Empezar/ }).click()

    // Prearmado: se carga UNA vez y vale para toda la sesión. En la manga se
    // aplican VARIAS vacunas en la misma pasada (meter el rodeo es caro), así
    // que se marcan todas y cada una queda como un hecho propio.
    await expect(page.getByText('¿Qué se aplica?')).toBeVisible()
    await page.getByRole('button', { name: 'Brucelosis' }).click()
    await page.getByPlaceholder('Quién lo aplica').fill('Dr. Gómez')
    await page.getByRole('button', { name: '30 d', exact: true }).click()
    await page.getByRole('button', { name: /Empezar con 2 vacunas/ }).click()

    // Destetar SEPARA. Los grupos se nombran por lo que ES el animal —no por
    // la puerta— y en un destete vienen propuestos (madres de un lado, crías
    // del otro): con vaquillonas y terneros presentes, "Vaquillona" y "Ternero".
    await expect(page.getByText('Qué sale y a dónde va')).toBeVisible()
    await expect(page.getByTestId('grupo-nombre')).toHaveText([
      'Vaquillona',
      'Ternero',
    ])
    // El destino se pide POR GRUPO ("a dónde van las vaquillonas"), y el
    // potrero se toca en el CROQUIS, no en una lista.
    await page.getByRole('button', { name: 'A dónde van Vaquillona' }).click()
    await expect(page.getByText('A otro potrero')).toBeVisible()
    await page.getByText('A otro potrero').click()
    await page.getByRole('button', { name: '9B', exact: true }).click()
    await page.getByRole('button', { name: 'Van acá' }).click()
    await expect(
      page.getByRole('button', { name: 'A dónde van Vaquillona' }),
    ).toContainText('Potrero 9B')

    await page.getByRole('button', { name: /^Empezar$/ }).click()

    await expect(page.getByText('Podés guardar el teléfono')).toBeVisible()

    // Una lectura: TRES hechos distintos en el historial del animal — las dos
    // vacunas y el destete. Antes esto era imposible: `datosPorTipo` era un
    // mapa por tipo y la segunda `sanidad` pisaba a la primera.
    await escanearEnElMismoTick(page, ['032010010414565'])
    await expect
      .poll(async () => (await leerTrabajos(page)).length, { timeout: 10_000 })
      .toBe(3)
    // El número de caravana queda a la vista, agrupado para leerse de un golpe.
    await expect(page.getByText('032 0100 1041 4565')).toBeVisible()
    // La puerta por la que sale se ENCIENDE y dice qué es el animal. El lado
    // ya lo dicen su posición, su flecha y su color.
    await expect(page.getByTestId('cartel-hero')).toHaveText('Vaquillona')

    const t = await leerTrabajos(page)
    expect(t.map((x) => x.tipo).sort()).toEqual(['destete', 'sanidad', 'sanidad'])
    expect(t.every((x) => x.animal_id === 'r1')).toBe(true)
    // Las dos vacunas quedan por separado y se pueden leer una y otra.
    const sanidades = t.filter((x) => x.tipo === 'sanidad')
    expect(sanidades.map((x) => x.datos.tratamiento).sort()).toEqual([
      'Aftosa',
      'Brucelosis',
    ])
    expect(sanidades.every((x) => x.datos.veterinario === 'Dr. Gómez')).toBe(true)
    // El retiro queda como FECHA, que es lo que después enciende el aviso.
    expect(sanidades.every((x) => typeof x.datos.retiro_hasta === 'string')).toBe(
      true,
    )

    // Repetir el mismo animal no vuelve a anotarlo.
    await escanearEnElMismoTick(page, ['032010010414565'])
    await expect(page.getByText('Ya lo hiciste', { exact: false })).toBeVisible()
    expect((await leerTrabajos(page)).length).toBe(3)

    // Una caravana que no es del rodeo avisa en vez de registrar cualquier cosa.
    await escanearEnElMismoTick(page, ['032999999999999'])
    await expect(page.getByText('no es de tus animales')).toBeVisible()
    expect((await leerTrabajos(page)).length).toBe(3)

    // Cierre: la única lectura tranquila del día.
    await page.getByRole('button', { name: 'Terminar' }).last().click()
    await expect(page.getByText(/animal(es)? pas/)).toBeVisible()

    await context.close()
  })

  test('tacto: el toque registra el resultado Y decide el lado', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await sembrarRodeo(page)
    await context.setOffline(true)

    await page.goto('/campo/manga')
    await page.getByRole('button', { name: /Tacto/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()
    await page.getByRole('button', { name: '11B', exact: true }).click()
    await page.getByRole('button', { name: /^Empezar/ }).click()

    // El prearmado del tacto no pregunta por categoría: los grupos SON los dos
    // resultados, y el toque decide cuál.
    await expect(page.getByText('Qué sale y a dónde va')).toBeVisible()
    await expect(page.getByTestId('grupo-nombre')).toHaveText(['Preñada', 'Vacía'])
    await page.getByRole('button', { name: /^Empezar$/ }).click()

    // Esperar a que la pantalla de trabajo monte el capturador del bastón: si
    // se escanea antes, la lectura se despacha al vacío y se pierde.
    await expect(page.getByText('Podés guardar el teléfono')).toBeVisible()

    // Escanear IDENTIFICA pero todavía no registra: falta el resultado.
    await escanearEnElMismoTick(page, ['032010010414565'])
    await expect(page.getByText('Tocá por dónde sale')).toBeVisible()
    expect((await leerTrabajos(page)).length).toBe(0)

    // El toque cierra el hecho y manda al lado de una sola vez. Se toca LA
    // PUERTA: el resultado y la salida son el mismo gesto.
    await page.getByRole('button', { name: /^Vacía —/ }).click()
    await expect
      .poll(async () => (await leerTrabajos(page)).length, { timeout: 10_000 })
      .toBe(1)

    const t = await leerTrabajos(page)
    expect(t[0].tipo).toBe('tacto')
    expect(t[0].datos.resultado).toBe('vacia')
    // La puerta encendida repite el RESULTADO, que es lo que le pasó al animal.
    await expect(page.getByTestId('cartel-hero')).toHaveText('Vacía')

    await context.close()
  })
})

test.describe('manga — apartar', () => {
  test('apartar solo: los grupos salen de las categorías y el aparte se REGISTRA', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await sembrarRodeo(page)
    await context.setOffline(true)

    await page.goto('/campo/manga')
    await page.getByRole('button', { name: /Apartar/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()
    await page.getByRole('button', { name: '11B', exact: true }).click()
    await page.getByRole('button', { name: /^Empezar/ }).click()

    // Apartar suelto es el único sin semántica propia: el productor elige con
    // qué criterio separa y de ahí salen los botones. Todo en UNA pantalla:
    // el interruptor arriba y lo que decide abajo, sin ir y volver.
    await expect(page.getByText('¿Qué apartás?')).toBeVisible()
    await expect(page.getByRole('button', { name: /Por categoría/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Vienen todas marcadas: lo normal es separar todo lo que hay.
    await expect(page.getByRole('button', { name: 'Vaquillona' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: /^Seguir$/ }).click()

    // Los grupos son las categorías presentes, con su nombre.
    await expect(page.getByTestId('grupo-nombre')).toHaveText([
      'Vaquillona',
      'Ternero',
    ])

    // Las vaquillonas se van al 9B; los terneros vuelven al potrero.
    await page.getByRole('button', { name: 'A dónde van Vaquillona' }).click()
    await page.getByText('A otro potrero').click()
    await page.getByRole('button', { name: '9B', exact: true }).click()
    await page.getByRole('button', { name: 'Van acá' }).click()
    await expect(
      page.getByRole('button', { name: 'A dónde van Vaquillona' }),
    ).toContainText('Potrero 9B')

    await page.getByRole('button', { name: /^Empezar$/ }).click()
    await expect(page.getByText('Podés guardar el teléfono')).toBeVisible()

    // r1 es vaquillona → cae en el grupo que va al 9B.
    await escanearEnElMismoTick(page, ['032010010414565'])
    await expect
      .poll(async () => (await leerApartes(page)).length, { timeout: 10_000 })
      .toBe(1)

    const [ap] = await leerApartes(page)
    expect(ap.animal_id).toBe('r1')
    expect(ap.destino_k).toBe('potrero')
    expect(ap.potrero_destino_id).toBe('p3')
    // Pendiente = todavía hay que moverlo de verdad contra el servidor.
    expect(ap.estado).toBe('pendiente')

    // Apartar NO genera ningún `evento`: al animal solo le cambia el potrero.
    expect((await leerTrabajos(page)).length).toBe(0)

    // Y sin embargo el progreso avanza. Es la regresión que importa: hasta
    // ahora un aparte suelto dejaba el contador clavado en 0 y nunca detectaba
    // un repetido, porque lo hecho se medía SOLO en eventos.
    await expect(page.getByTestId('listos')).toHaveText('1')
    await escanearEnElMismoTick(page, ['032010010414565'])
    await expect(page.getByText('Ya lo hiciste', { exact: false })).toBeVisible()
    expect((await leerApartes(page)).length).toBe(1)

    await context.close()
  })

  test('venta y "quedan en la manga" dejan rastro; volver al potrero no', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await sembrarRodeo(page)
    await context.setOffline(true)

    await page.goto('/campo/manga')
    await page.getByRole('button', { name: /Apartar/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()
    await page.getByRole('button', { name: '11B', exact: true }).click()
    await page.getByRole('button', { name: /^Empezar/ }).click()
    await page.getByRole('button', { name: /^Seguir$/ }).click()

    // Vaquillonas a venta; terneros vuelven al potrero (el default).
    await page.getByRole('button', { name: 'A dónde van Vaquillona' }).click()
    await page.getByText('Se venden').click()

    await page.getByRole('button', { name: /^Empezar$/ }).click()
    await expect(page.getByText('Podés guardar el teléfono')).toBeVisible()

    await escanearEnElMismoTick(page, ['032010010414565'])
    await expect
      .poll(async () => (await leerApartes(page)).length, { timeout: 10_000 })
      .toBe(1)

    const [venta] = await leerApartes(page)
    expect(venta.destino_k).toBe('venta')
    // No hay nada que mover: la marca de venta viaja como evento, no por acá.
    expect(venta.estado).toBe('sincronizada')

    // Apartar para vender NO da de baja al animal —sigue vivo y en el campo—
    // pero sí deja constancia en su ficha.
    const t = await leerTrabajos(page)
    expect(t.length).toBe(1)
    expect(t[0].tipo).toBe('nota')
    expect(t[0].datos.motivo).toBe('aparte')
    expect(t[0].datos.destino).toBe('venta')

    // El ternero vuelve al potrero: no le pasó nada, no se escribe nada.
    await escanearEnElMismoTick(page, ['032010010414566'])
    await expect
      .poll(async () => (await leerApartes(page)).length, { timeout: 10_000 })
      .toBe(2)
    const queda = (await leerApartes(page)).find((a) => a.animal_id === 'r2')!
    expect(queda.destino_k).toBe('queda')
    expect((await leerTrabajos(page)).length).toBe(1)

    await context.close()
  })

  test('una categoría fuera del plan avisa en vez de quedarse muda', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await sembrarRodeo(page)
    await context.setOffline(true)

    await page.goto('/campo/manga')
    await page.getByRole('button', { name: /Destetar/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()
    await page.getByRole('button', { name: '11B', exact: true }).click()
    await page.getByRole('button', { name: /^Empezar/ }).click()
    await page.getByRole('button', { name: /^Empezar$/ }).click()
    await expect(page.getByText('Podés guardar el teléfono')).toBeVisible()

    // r3 es un TORO: no es madre ni cría, así que el destete no lo contempla.
    // Antes la pantalla no cambiaba y parecía que la app no había reaccionado.
    await escanearEnElMismoTick(page, ['032010010414567'])
    await expect(page.getByText('no está en el plan')).toBeVisible()
    expect((await leerApartes(page)).length).toBe(0)

    await context.close()
  })
})

test.describe('manga — alcance y escaneo rápido', () => {
  test('arranca preguntando qué se hace, no mostrando animales', async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await context.setOffline(true)

    await page.goto('/campo/manga')

    // Primera pregunta: la actividad. Nada de escanear todavía.
    await expect(page.getByRole('heading', { name: '¿Qué se hace hoy?' })).toBeVisible()
    await expect(page.locator('input[data-scan-target]')).toHaveCount(0)

    // Y el origen se elige DESPUÉS, sobre el croquis.
    await page.getByRole('button', { name: /Caravanear/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()
    await expect(page.getByRole('button', { name: '11B', exact: true })).toBeVisible()
    await expect(page.locator('input[data-scan-target]')).toHaveCount(0)

    await context.close()
  })

  test('el potrero se elige en el croquis y la tropa solo si hay varias', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await context.setOffline(true)

    await page.goto('/campo/manga')
    await page.getByRole('button', { name: /Caravanear/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()

    // 11B tiene UNA sola tropa: no se pregunta cuál.
    await page.getByRole('button', { name: '11B', exact: true }).click()
    await expect(page.getByText('Potrero 11B')).toBeVisible()
    await expect(page.getByText('Tropas en este potrero')).toHaveCount(0)

    // Solo BOVINOS: ovejas, corderos y yeguas no llevan caravana, así que no
    // tienen nada que hacer en la manga.
    await expect(page.getByText('Vaquillonas')).toBeVisible()
    await expect(page.getByText('Terneros')).toBeVisible()
    await expect(page.getByText('Ovejas')).toHaveCount(0)
    await expect(page.getByText('Yeguas')).toHaveCount(0)
    // Y el TOTAL también los excluye: 14 + 5 = 19, no 30. El número de la
    // manga es el de animales que se pueden trabajar, no el del potrero.
    await expect(page.getByText('19', { exact: true })).toBeVisible()

    // 10B tiene DOS: ahí sí hay que elegir, y ya sin ambigüedad de nombre.
    await page.getByRole('button', { name: '10B', exact: true }).click()
    await expect(page.getByText('Tropas en este potrero')).toBeVisible()
    // Anclado al inicio: si no, matchea también el botón "Empezar con …".
    await expect(page.getByRole('button', { name: /^Lote 4 cría/ })).toBeVisible()

    await context.close()
  })

  test('dos lecturas seguidas caen en DOS animales distintos', async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await context.setOffline(true)

    await entrarACaravanear(page, '11B')

    // Arranca con los 3 de la tropa; el de 10B no entra en la cola.
    await expect(page.getByText('quedan')).toBeVisible()
    const input = page.locator('input[data-scan-target]')
    await expect(input).toBeVisible()

    // Las dos lecturas dentro de la misma tarea de JS: React no llega a
    // re-renderizar en el medio, que es justo la ventana donde se pisaban.
    await escanearEnElMismoTick(page, ['032010010414565', '032010010414566'])

    await expect
      .poll(async () => (await leerOutbox(page)).length, { timeout: 10_000 })
      .toBe(2)

    const cola = await leerOutbox(page)
    const animales = cola.map((o) => o.animal_id)
    const rfids = cola.map((o) => o.rfid).sort()

    // El corazón del test: dos animales DISTINTOS.
    expect(new Set(animales).size).toBe(2)
    // Y los dos números llegaron enteros, sin concatenarse.
    expect(rfids).toEqual(['032010010414565', '032010010414566'])
    // Ninguna cayó sobre el animal del otro potrero.
    expect(animales).not.toContain('z9')

    await context.close()
  })

  test('el alcance elegido no deja tocar animales de otro potrero', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await context.setOffline(true)

    // 10B tiene UN solo animal (z9): al caravanearlo la cola queda vacía y no
    // debe "seguir" con los del 11B.
    await entrarACaravanear(page, '10B')

    await escanear(page, '032010010414570')
    await expect
      .poll(async () => (await leerOutbox(page)).length, { timeout: 10_000 })
      .toBe(1)

    await escanear(page, '032010010414571')
    // Sigue habiendo UNA sola: no quedan animales en este alcance.
    await expect
      .poll(async () => (await leerOutbox(page)).length, { timeout: 3_000 })
      .toBe(1)

    const cola = await leerOutbox(page)
    expect(cola[0].animal_id).toBe('z9')

    await context.close()
  })
})

test.describe('layout — nada recortado en el teléfono', () => {
  /**
   * Regresión del recorte de abajo. La causa fue medir alturas en `vh` dentro
   * de contenedores que NO son el viewport (`main` mide ~666 de 844) y que
   * además arrastran el `html{zoom:1.06}` de la casa, que infla las unidades de
   * viewport un 6% y no los porcentajes. Sumado a hijos flex sin `shrink-0`,
   * el contenido se comprimía y el `overflow-hidden` lo cortaba: los botones
   * principales quedaban fuera de la pantalla, inalcanzables incluso
   * scrolleando.
   *
   * El test no mira píxeles bonitos: verifica el invariante duro —lo que se
   * toca está DENTRO de la caja que lo contiene, y ninguna caja esconde
   * contenido propio—.
   */
  const dentroDeMain = async (page: Page, sel: ReturnType<Page['locator']>) => {
    const boton = await sel.boundingBox()
    const main = await page.locator('main').boundingBox()
    expect(boton, 'el botón no está en el DOM').not.toBeNull()
    expect(main).not.toBeNull()
    return boton!.y + boton!.height - (main!.y + main!.height)
  }

  test('elegir origen: "Empezar" entero, aun con el panel largo', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await context.setOffline(true)

    await page.goto('/campo/manga')
    await page.getByRole('button', { name: /Caravanear/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()

    // 10B es el caso feo: DOS tropas hacen el panel más alto.
    await page.getByRole('button', { name: '10B', exact: true }).click()
    await expect(page.getByText('Tropas en este potrero')).toBeVisible()
    const sobra = await dentroDeMain(
      page,
      page.getByRole('button', { name: /^Empezar con/ }),
    )
    expect(sobra, 'el botón se sale de la pantalla').toBeLessThanOrEqual(0)

    await context.close()
  })

  test('prearmado: la tarjeta del grupo no se come la fila del lado', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()
    await prepararManga(page)
    await sembrarRodeo(page)
    await context.setOffline(true)

    await page.goto('/campo/manga')
    await page.getByRole('button', { name: /Destetar/ }).click()
    await page.getByRole('button', { name: /Elegir los animales/ }).click()
    await page.getByRole('button', { name: '11B', exact: true }).click()
    await page.getByRole('button', { name: /^Empezar/ }).click()
    await expect(page.getByText('Qué sale y a dónde va')).toBeVisible()

    // Ninguna caja con `overflow-hidden` puede esconder contenido propio: si
    // `scrollHeight > clientHeight` y no scrollea, eso es contenido perdido.
    const recortes = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="grupo-nombre"]')]
        .map((n) => n.closest('div[class*="rounded-2xl"]') as HTMLElement)
        .map((c) => ({
          alto: c.getBoundingClientRect().height,
          contenido: c.scrollHeight,
        })),
    )
    expect(recortes.length).toBeGreaterThan(0)
    for (const r of recortes) expect(r.alto).toBeGreaterThanOrEqual(r.contenido)

    // Y los tres chips del lado tienen que estar, con tamaño táctil.
    const chips = page.getByRole('button', { name: /Izquierda|Derecha|De frente/ })
    await expect(chips.first()).toBeVisible()
    const caja = await chips.first().boundingBox()
    expect(caja!.height).toBeGreaterThanOrEqual(44)

    await context.close()
  })
})
