import postgres from 'npm:postgres@3.4.5'
import * as db from '../../../functions/wa-webhook/db.ts'
import type { InfraNueva } from '../../../functions/_shared/wa/tipos.ts'

if (Deno.env.get('WA_QA_LOCAL_DB') !== '1' || !Deno.env.get('SUPABASE_DB_URL')?.includes('@127.0.0.1:55442/postgres')) throw Error('Sólo base local descartable')
const admin = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, onnotice: () => {} })
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const E1 = id(1), E2 = id(2), U1 = id(11), U2 = id(12), C1 = id(21), C2 = id(22), P8 = id(31), P9 = id(32), PX = id(33), V1 = id(41), V2 = id(42)
// Dos potreros vecinos de ~1 km que comparten el borde lng = -59.29.
const pol8 = [[-36, -59.30], [-36, -59.29], [-36.01, -59.29], [-36.01, -59.30]], pol9 = [[-36, -59.29], [-36, -59.28], [-36.01, -59.28], [-36.01, -59.29]]
await admin`insert into auth.users values (${U1},'{}'),(${U2},'{}')`
await admin`insert into empresa values (${E1},'QA Uno'),(${E2},'QA Dos')`
await admin`insert into miembro_empresa values (${U1},${E1}),(${U2},${E2})`
await admin`insert into campo values (${C1},${E1},'La Porteña'),(${C2},${E2},'Campo Ajeno')`
await admin`insert into potrero (id,empresa_id,campo_id,nombre,poligono) values
  (${P8},${E1},${C1},'8B',${admin.json(pol8)}),(${P9},${E1},${C1},'9B',${admin.json(pol9)}),(${PX},${E2},${C2},'9B',${admin.json(pol9)})`
const v1: db.Vinculo = { id: V1, telefono: '5491111111101', user_id: U1, empresa_id: E1, pendiente: null, pendiente_at: null }
const v2: db.Vinculo = { ...v1, id: V2, telefono: '5491111111102', user_id: U2, empresa_id: E2 }
for (const v of [v1, v2]) await admin`insert into wa_vinculo (id,telefono,user_id,empresa_id) values (${v.id},${v.telefono},${v.user_id},${v.empresa_id})`

const assert = (ok: unknown, m = 'Assertion falló') => { if (!ok) throw Error(m) }
let fail = 0
async function test(caso: string, run: () => Promise<void>) { try { await run(); console.log('PASA', caso) } catch (e) { fail++; console.error('FALLA', caso, e) } }
async function denied(run: () => Promise<unknown>) { let rejected = false; try { await run() } catch { rejected = true } assert(rejected, 'Debía rechazarse') }
const nueva = (x: Partial<InfraNueva>): InfraNueva => ({ campoId: C1, tipo: 'tanque', apodo: null, lat: -36.005, lng: -59.285, linea: null, nombre: '', focoId: null, ...x })
let tanque = ''

await test('Alta como el usuario: tipo nuevo, apodo y autor', async () => {
  tanque = await db.guardarInfra(v1, nueva({ apodo: 'australiano' }))
  const [r] = await admin`select tipo::text, apodo, created_by from infraestructura where id=${tanque}`
  assert(r.tipo === 'tanque' && r.apodo === 'australiano' && r.created_by === U1)
})
await test('Un campo de otra empresa se rechaza (usuario y servicio)', async () => {
  await denied(() => db.guardarInfra(v1, nueva({ campoId: C2 })))
  await denied(() => admin`insert into infraestructura (empresa_id,campo_id,tipo,lat,lng) values (${E1},${C2},'molino',-36,-59)`)
})
await test('Línea: sólo eléctricos, al menos dos puntos y en rango', async () => {
  await denied(() => db.guardarInfra(v1, nueva({ linea: [[-36, -59.29], [-36.01, -59.29]] })))
  await denied(() => db.guardarInfra(v1, nueva({ tipo: 'electrico', linea: [[-36, -59.29]] })))
  await denied(() => db.guardarInfra(v1, nueva({ tipo: 'electrico', linea: [[100, -59.29], [-36.01, -59.29]] })))
  await denied(() => admin`insert into infraestructura (empresa_id,campo_id,tipo,lat,lng,linea) values (${E1},${C1},'electrico',-36,-59,${admin.json([['a', 1], [2, 3]])})`)
  const ok = await db.guardarInfra(v1, nueva({ tipo: 'electrico', linea: [[-36, -59.29], [-36.01, -59.29]] }))
  await admin`delete from infraestructura where id=${ok}`
})
await test('Apodo vacío o de más de 40 letras se rechaza', async () => {
  await denied(() => db.guardarInfra(v1, nueva({ apodo: 'x'.repeat(41) })))
  await denied(() => db.guardarInfra(v1, nueva({ apodo: '   ' })))
})
await test('Otra empresa no ve ni borra lo cargado', async () => {
  assert((await db.infraDeEmpresa(v2)).length === 0)
  assert(!(await db.borrarInfra(v2, tanque)))
  assert((await admin`select 1 from infraestructura where id=${tanque}`).length === 1)
})
await test('Mapa: infraestructura, cabezas activas y recorrida sólo si el campo ya recorre', async () => {
  await admin`insert into animal (empresa_id,potrero_id,estado) values (${E1},${P9},'activo'),(${E1},${P9},'activo'),(${E1},${P9},'vendido'),(${E2},${PX},'activo')`
  let d = (await db.datosMapa(v1, C1))!
  const p9 = d.potreros.find(p => p.id === P9)!
  assert(p9.cabezas === 2, `cabezas ${p9.cabezas}`)
  assert(d.potreros.every(p => p.ultimaRecorrida === undefined), 'Sin recorridas no debería marcar «nunca»')
  assert(d.infraestructura?.some(i => i.id === tanque && i.apodo === 'australiano'))
  const [r] = await admin`insert into recorrida (empresa_id,campo_id,fecha) values (${E1},${C1},'2026-10-01') returning id`
  await admin`insert into observacion_potrero (empresa_id,recorrida_id,potrero_id,agua) values (${E1},${r.id},${P8},'normal')`
  d = (await db.datosMapa(v1, C1))!
  assert(d.potreros.find(p => p.id === P8)!.ultimaRecorrida === '2026-10-01')
  assert(d.potreros.find(p => p.id === P9)!.ultimaRecorrida === null)
  assert(!(await db.datosMapa(v2, C1)), 'Otra empresa no lee el campo')
})
await admin`delete from infraestructura`

await test('WhatsApp completo: ubicación, tanque, guardar una sola vez, eléctrico por borde, tranquera pegada y baja', async () => {
  for (const [k, val] of [['WA_APP_SECRET', 'qa_local_secret'], ['WA_TOKEN', 'qa_local_token'], ['WA_PHONE_NUMBER_ID', 'qa_local_phone'], ['ANTHROPIC_API_KEY', 'qa_local'], ['OPENAI_API_KEY', 'qa_local']]) Deno.env.set(k, val)
  let handler: ((r: Request) => Promise<Response>) | undefined
  const originalServe = Deno.serve, originalFetch = globalThis.fetch
  Deno.serve = ((fn: unknown) => { handler = fn as typeof handler; return {} }) as typeof Deno.serve
  const salida: { to?: string; type?: string; interactive?: { body?: { text?: string }; action?: { buttons?: { reply: { id: string } }[]; sections?: { rows: { id: string }[] }[] } }; text?: { body: string }; image?: { caption: string } }[] = []
  let seq = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('graph.facebook.com')) {
      if (url.endsWith('/media')) return Response.json({ id: 'qa-media-out' })
      const body = JSON.parse(String(init!.body)); if (body.status !== 'read') salida.push(body)
      return Response.json({ messages: [{ id: 'qa-out-' + (++seq) }] })
    }
    if (url.includes('arcgisonline.com')) return new Response('', { status: 503 })
    throw Error('Red externa no permitida en QA: ' + url)
  }) as typeof fetch
  try {
    await import('../../../functions/wa-webhook/index.ts')
    const firmar = async (v: db.Vinculo, contenido: Record<string, unknown>) => {
      const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: 'qa-' + crypto.randomUUID(), from: v.telefono, ...contenido }] } }] }] })
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('qa_local_secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('')
      const desde = salida.length
      const r = await handler!(new Request('https://local.invalid/functions/v1/wa-webhook', { method: 'POST', headers: { 'X-Hub-Signature-256': 'sha256=' + sig }, body }))
      assert(r.status === 200)
      return salida.slice(desde)
    }
    const texto = (v: db.Vinculo, t: string) => firmar(v, { type: 'text', text: { body: t } })
    const boton = (v: db.Vinculo, bid: string) => firmar(v, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: bid, title: 'x' } } })
    const lista = (v: db.Vinculo, bid: string) => firmar(v, { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: bid, title: 'x' } } })
    const ubic = (v: db.Vinculo, lat: number, lng: number) => firmar(v, { type: 'location', location: { latitude: lat, longitude: lng } })
    const botones = (out: typeof salida) => out.flatMap(o => [...(o.interactive?.action?.buttons?.map(b => b.reply.id) ?? []), ...(o.interactive?.action?.sections?.flatMap(s => s.rows.map(r => r.id)) ?? [])])
    const textos = (out: typeof salida) => out.map(o => o.text?.body ?? o.interactive?.body?.text ?? o.image?.caption ?? '').join(' | ')

    let out = await ubic(v1, -36.005, -59.285)
    assert(botones(out).includes('inf:tipo=tanque') && textos(out).includes('9B'), 'Ubicación sin ofrecer carga: ' + textos(out))
    assert(((await db.vinculoDe(v1.telefono))!.pendiente as { tipo: string }).tipo === 'ubicado', 'La recorrida pierde el «estás acá»')
    out = await texto(v1, 'tanque australiano')
    assert(out.some(o => o.type === 'image'), 'Sin foto de dónde queda')
    const si = botones(out).find(b => b.startsWith('inf:si='))!
    assert(si && textos(out).includes('tanque australiano del 9B'), textos(out))
    assert((await admin`select 1 from infraestructura`).length === 0, 'Guardó antes de confirmar')
    out = await boton(v1, si)
    assert(textos(out).includes('Listo, guardé') && (await admin`select 1 from infraestructura where tipo='tanque' and apodo='australiano' and empresa_id=${E1}`).length === 1)
    out = await boton(v1, si)
    assert((await admin`select 1 from infraestructura`).length === 1 && textos(out).includes('ya'), 'Doble Guardar duplicó: ' + textos(out))

    out = await texto(v1, 'El eléctrico va entre el 8B y el 9B')
    assert(textos(out).includes('eléctrico entre el 8B y el 9B') && /\(1\d{3} m\)/.test(textos(out)), textos(out))
    out = await texto(v1, 'si')
    const [el] = await admin`select linea, lat, lng from infraestructura where tipo='electrico'`
    assert(el && el.linea.length === 2 && el.linea.every((p: number[]) => p[1] === -59.29), 'Eléctrico mal guardado')

    out = await ubic(v1, -36.004, -59.2903)
    out = await lista(v1, 'inf:tipo=tranquera')
    out = await boton(v1, botones(out).find(b => b.startsWith('inf:si='))!)
    const [tr] = await admin`select lng from infraestructura where tipo='tranquera'`
    assert(tr && Math.abs(tr.lng + 59.29) < 1e-9, 'La tranquera no quedó sobre el alambrado')

    out = await texto(v1, 'borrá la tranquera entre el 8B y el 9B')
    const baja = botones(out).find(b => b.startsWith('inf:borrar='))!
    assert(baja && (await admin`select 1 from infraestructura where tipo='tranquera'`).length === 1, 'Borró sin confirmar')
    out = await boton(v1, baja)
    assert(textos(out).includes('Listo, borré') && (await admin`select 1 from infraestructura where tipo='tranquera'`).length === 0)

    out = await texto(v2, 'borrá el tanque del 9B')
    assert(!botones(out).some(b => b.startsWith('inf:borrar=')) && (await admin`select 1 from infraestructura where tipo='tanque'`).length === 1, 'Otra empresa pudo pedir la baja')
    out = await texto(v1, 'tanque australiano')
    assert(!out.some(o => o.type === 'image'), 'Sin ubicación reciente no debía proponer una carga')
    assert(!salida.some(o => o.to && o.to !== v1.telefono && o.to !== v2.telefono), 'Envió a otro destinatario')
  } finally { Deno.serve = originalServe; globalThis.fetch = originalFetch }
})

await admin.end()
console.log(fail ? `${fail} fallas` : 'Todas pasan.')
if (fail) Deno.exit(1)
Deno.exit(0)
