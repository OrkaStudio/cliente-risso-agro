import postgres from 'npm:postgres@3.4.5'
import * as db from '../../../functions/wa-webhook/db.ts'
import { lecturasDelTurno } from '../../../functions/wa-webhook/lecturas-turno.ts'
import { permisosDe } from '../../../functions/_shared/wa/permisos.ts'
import { ddmm, hoyAR, inicioSemana, sumarDias } from '../../../functions/_shared/wa/texto.ts'
import type { InfraNueva } from '../../../functions/_shared/wa/tipos.ts'

if (Deno.env.get('WA_QA_LOCAL_DB') !== '1' || !Deno.env.get('SUPABASE_DB_URL')?.includes('@127.0.0.1:55442/postgres')) throw Error('Sólo base local descartable')
function facturaPdfQA(): Uint8Array {
  const lineas = ['Factura A', 'Cod. 01', 'Razon Social: Veterinaria QA', 'CUIT: 20-12345678-9',
    'Comp. Nro: 00001-00000023', 'Fecha de Emision: 12/11/2026', 'Importe Neto Gravado: $ 10.000,00', 'Importe Total: $ 12.100,00']
  const contenido = 'BT /F1 12 Tf 50 780 Td 18 TL\n' + lineas.map((linea, i) => `${i ? 'T* ' : ''}(${linea}) Tj`).join('\n') + '\nET\n'
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}endstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objetos.map((o, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
    return String(offset).padStart(10, '0') + ' 00000 n \n'
  })
  const xref = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

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

function assert(ok: unknown, mensaje = 'Assertion falló'): asserts ok {
  if (!ok) throw Error(mensaje)
}
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
  const modeloReal = Deno.env.get('WA_QA_MODELO_REAL') === '1'
  for (const [k, val] of [['WA_APP_SECRET', 'qa_local_secret'], ['WA_TOKEN', 'qa_local_token'], ['WA_PHONE_NUMBER_ID', 'qa_local_phone'], ['OPENAI_API_KEY', 'qa_local']]) Deno.env.set(k, val)
  if (!modeloReal) Deno.env.set('ANTHROPIC_API_KEY', 'qa_local')
  let handler: ((r: Request) => Promise<Response>) | undefined
  const originalServe = Deno.serve, originalFetch = globalThis.fetch
  Deno.serve = ((fn: unknown) => { handler = fn as typeof handler; return {} }) as typeof Deno.serve
  const salida: { to?: string; type?: string; interactive?: { body?: { text?: string }; action?: { buttons?: { reply: { id: string } }[]; sections?: { rows: { id: string }[] }[] } }; text?: { body: string }; image?: { caption: string } }[] = []
  let seq = 0
  let interpretarComo: Record<string, unknown> | null = null
  const interpretacionesReales: number[] = []
  const usoLecturas: { herramienta: string; estado: string }[] = []
  let tokensEnsayo = 0
  let simularLecturas = false
  let simularPotreroAmbiguo = false
  const redaccionesReales: { status: number; texto: string | null }[] = []
  let redactarComo: ((datos: { historial: unknown[] }) => string) | null = null
  let fallarRespuesta = false
  let transcripcionQA = ''
  let estadoLectorQA = 200
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/qa-factura')) return Response.json({ url: 'https://qa.invalid/factura.pdf', mime_type: 'application/pdf' })
    if (url === 'https://qa.invalid/factura.pdf') return new Response(new Blob([facturaPdfQA() as Uint8Array<ArrayBuffer>]))
    if (url.endsWith('/qa-pdf')) return new Response('', { status: 404 })
    if (url.endsWith('/qa-foto')) return Response.json({ url: 'https://qa.invalid/foto.jpg', mime_type: 'image/jpeg' })
    if (url === 'https://qa.invalid/foto.jpg') return new Response(new Uint8Array([255, 216, 255, 217]))
    if (url.endsWith('/functions/v1/extraer-comprobante')) return Response.json({ monto: null }, { status: estadoLectorQA })
    if (url.endsWith('/qa-audio')) return Response.json({ url: 'https://qa.invalid/audio.ogg', mime_type: 'audio/ogg' })
    if (url === 'https://qa.invalid/audio.ogg') return new Response(new Uint8Array([79, 103, 103, 83]))
    if (url.includes('api.openai.com/v1/audio/transcriptions')) return Response.json({ text: transcripcionQA })
    if (url.includes('graph.facebook.com')) {
      if (url.endsWith('/media')) return Response.json({ id: 'qa-media-out' })
      const body = JSON.parse(String(init!.body))
      if (body.status !== 'read' && fallarRespuesta) throw Error('Fallo local de envío tras confirmar')
      if (body.status !== 'read') salida.push(body)
      return Response.json({ messages: [{ id: 'qa-out-' + (++seq) }] })
    }
    if (url.includes('arcgisonline.com')) return new Response('', { status: 503 })
    if (url === 'https://api.anthropic.com/v1/messages' && (modeloReal || simularLecturas)) {
      const pedido = JSON.parse(String(init?.body))
      const ultima = pedido.messages.at(-1)?.content
      if (Array.isArray(ultima)) {
        const anterior = pedido.messages.at(-2)?.content ?? []
        for (const resultado of ultima) {
          const llamada = anterior.find((b: { id?: string }) => b.id === resultado.tool_use_id)
          if (llamada?.name === 'resolver_potrero' || llamada?.name === 'consultar_stock') {
            usoLecturas.push({ herramienta: llamada.name, estado: JSON.parse(resultado.content).estado })
          }
        }
      }
      if (simularLecturas && pedido.tools && interpretarComo) {
        const expuesta = pedido.tools.some((h: { name: string }) => h.name === 'consultar_stock')
        if (expuesta && pedido.tool_choice.type === 'auto') {
          if (!Array.isArray(ultima)) return Response.json({ stop_reason: 'tool_use', content: [
            { type: 'tool_use', id: 'resolver-qa', name: 'resolver_potrero', input: simularPotreroAmbiguo ? { potrero: '9B' } : { potrero: '9B', campo: 'La Porteña' } },
          ] })
          const resultado = JSON.parse(ultima[0].content)
          if (resultado.estado === 'resuelto') return Response.json({ stop_reason: 'tool_use', content: [
            { type: 'tool_use', id: 'stock-qa', name: 'consultar_stock', input: { referencia: resultado.referencia } },
          ] })
          if (simularPotreroAmbiguo) {
            assert(resultado.estado === 'ambiguo' && resultado.opciones.length === 2, 'Se eligió un potrero ambiguo.')
          } else {
            assert(resultado.estado === 'verificado' && resultado.total === 2
              && resultado.categorias[0]?.categoria === 'vaca', 'El modelo no recibió el stock real del potrero.')
          }
        }
        return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', input: interpretarComo }] })
      }
    }
    if (url === 'https://api.anthropic.com/v1/messages' && modeloReal) {
      const pedido = JSON.parse(String(init?.body))
      const respuesta = await originalFetch(input, init)
      if (pedido.tools) {
        interpretacionesReales.push(respuesta.status)
        if (respuesta.ok) {
          const { usage } = await respuesta.clone().json()
          tokensEnsayo += (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)
        }
      } else {
        const datos = respuesta.ok ? await respuesta.clone().json() : null
        const texto = datos?.content?.find((bloque: { type: string }) => bloque.type === 'text')?.text ?? null
        redaccionesReales.push({ status: respuesta.status, texto })
      }
      return respuesta
    }
    if (url.includes('api.anthropic.com') && redactarComo) {
      const pedido = JSON.parse(String(init?.body))
      if (!pedido.tools) return Response.json({ stop_reason: 'end_turn', content: [{
        type: 'text', text: redactarComo(JSON.parse(pedido.messages[0].content)),
      }] })
    }
    if (url.includes('api.anthropic.com') && interpretarComo) return Response.json({ content: [{ type: 'tool_use', input: interpretarComo }], stop_reason: 'tool_use' })
    if (url.includes('api.anthropic.com')) return new Response(null, { status: 401 })
    throw Error('Red externa no permitida en QA: ' + url)
  }) as typeof fetch
  try {
    await import('../../../functions/wa-webhook/index.ts')
    const enviarFirmado = async (messages: Record<string, unknown>[]) => {
      const body = JSON.stringify({ entry: [{ changes: [{ value: { messages } }] }] })
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('qa_local_secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('')
      const desde = salida.length
      const r = await handler!(new Request('https://local.invalid/functions/v1/wa-webhook', { method: 'POST', headers: { 'X-Hub-Signature-256': 'sha256=' + sig }, body }))
      return { status: r.status, mensajes: salida.slice(desde) }
    }
    const firmar = async (v: db.Vinculo, contenido: Record<string, unknown>) => {
      const entrega = await enviarFirmado([{ id: 'qa-' + crypto.randomUUID(), from: v.telefono, ...contenido }])
      assert(entrega.status === 200)
      return entrega.mensajes
    }
    const texto = (v: db.Vinculo, t: string) => firmar(v, { type: 'text', text: { body: t } })
    const boton = (v: db.Vinculo, bid: string) => firmar(v, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: bid, title: 'x' } } })
    const lista = (v: db.Vinculo, bid: string) => firmar(v, { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: bid, title: 'x' } } })
    const ubic = (v: db.Vinculo, lat: number, lng: number) => firmar(v, { type: 'location', location: { latitude: lat, longitude: lng } })
    const botones = (out: typeof salida) => out.flatMap(o => [...(o.interactive?.action?.buttons?.map(b => b.reply.id) ?? []), ...(o.interactive?.action?.sections?.flatMap(s => s.rows.map(r => r.id)) ?? [])])
    const textos = (out: typeof salida) => out.map(o => o.text?.body ?? o.interactive?.body?.text ?? o.image?.caption ?? '').join(' | ')

    await test('Lecturas de turno: aislamiento, ambigüedad, referencia y permisos', async () => {
      const contexto = { ...await db.contexto(v1, hoyAR()), permisos: (await db.permisosVinculados(v1))! }
      const lecturas = lecturasDelTurno(contexto, b => db.hacienda(v1, b))
      assert(lecturas.resolverPotrero({ potrero: '9B', campo: 'Campo Ajeno' }).estado === 'no_encontrado')
      assert((await lecturas.consultarStock({ referencia: 1 })).estado === 'referencia_invalida')
      const otroCampo = { id: C2, nombre: 'Otro campo QA', potreros: [{ id: PX, nombre: '9B' }] }
      const varios = lecturasDelTurno({ ...contexto, campos: [...contexto.campos, otroCampo] }, () => {
        throw Error('Una referencia ambigua no debe leer stock.')
      })
      assert(varios.resolverPotrero({ potrero: '9B' }).estado === 'ambiguo')
      const limitado = lecturasDelTurno({ ...contexto, permisos: permisosDe({
        rol: 'invitado', acceso: 'whatsapp', niveles: { hacienda: 'solo_manda', campos: 'solo_manda' }, secciones: null,
      }) }, () => { throw Error('Un vínculo sin acceso no debe leer stock.') })
      assert(!limitado.herramientas.length && limitado.resolverPotrero({ potrero: '9B' }).estado === 'sin_permiso'
        && (await limitado.consultarStock({ referencia: 1 })).estado === 'sin_permiso')
      let intentos = 0
      const recuperable = lecturasDelTurno(contexto, async b => {
        if (++intentos === 1) throw Error('Fallo local de lectura.')
        return await db.hacienda(v1, b)
      })
      const resuelto = recuperable.resolverPotrero({ potrero: '9B' })
      assert('referencia' in resuelto && resuelto.referencia === 1)
      assert((await recuperable.consultarStock({ referencia: 1 })).estado === 'no_disponible')
      const stock = await recuperable.consultarStock({ referencia: 1 })
      assert('total' in stock && stock.total === 2)
      const filas = await recuperable.stockVerificado({ tipo: 'consulta_hacienda', campoId: C1, potreroId: P9 })
      assert(filas?.[0]?.cabezas === 2 && intentos === 2)
    })

    const variableLecturas = 'WA_LECTURAS_TURNO_EMPRESAS'
    const limpiarConversacion = async () => {
      await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${V1}`
      await admin`delete from captura where empresa_id=${E1} and user_id=${U1}`
      await admin`delete from wa_mensaje where empresa_id=${E1} and vinculo_id=${V1}`
    }
    for (const modo of ['actual', 'con_herramientas'] as const) {
      await test('Comparación de recorrida firmada: ' + modo, async () => {
        const hoy = hoyAR()
        const limpiar = async () => {
          await limpiarConversacion()
          await admin`delete from lluvia where empresa_id=${E1} and fecha=${hoy} and mm=23`
          await admin`delete from observacion_potrero where potrero_id in (${P8},${P9}) and recorrida_id in
            (select id from recorrida where empresa_id=${E1} and fecha=${hoy})`
        }
        const env = variableLecturas
        const previo = Deno.env.get(env)
        if (modo === 'con_herramientas') Deno.env.set(env, E1)
        else Deno.env.delete(env)
        const observacion = 'Pasé por el 9B y estaba casi vacío el bebedero'
        const consulta = '¿Cuántas cabezas figuran ahí?'
        const lluvia = 'De paso, anotá 23 milímetros en La Porteña'
        const antes = usoLecturas.length
        const tokensAntes = tokensEnsayo
        try {
          await limpiar()
          const stock = JSON.stringify(await db.hacienda(v1, { tipo: 'consulta_hacienda', campoId: C1, potreroId: P9 }))
          transcripcionQA = `${observacion}. ${consulta} ${lluvia}.`
          simularLecturas = !modeloReal
          if (!modeloReal) interpretarComo = { pedidos: [
            { intent: 'novedad', fragmento: observacion, observaciones: [{ potrero: '9B', agua: 'baja' }] },
            { intent: 'consulta_hacienda', fragmento: consulta, potrero: null },
            { intent: 'lluvia', fragmento: lluvia, mm: 23, campo: 'La Porteña' },
          ] }
          const inicio = performance.now()
          const recibido = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
          console.log(JSON.stringify({ modo, modeloReal, msPrimerTurno: Math.round(performance.now() - inicio),
            tokensPrimerTurno: modeloReal ? tokensEnsayo - tokensAntes : null, lecturas: usoLecturas.slice(antes) }))
          assert(textos(recibido).includes('2 cabezas') && textos(recibido).includes('9B de La Porteña')
            && textos(recibido).includes('23 mm'), textos(recibido))
          const viejo = botones(recibido).find(x => x.includes('|si='))
          assert(viejo)
          assert(modo === 'actual' ? usoLecturas.length === antes : usoLecturas.slice(antes).some(
            r => r.herramienta === 'consultar_stock' && r.estado === 'verificado'),
            'El ensayo tiene que ejecutar el camino de herramientas sólo cuando está habilitado.')
          interpretarComo = null
          const correccion = await texto(v1, 'Lo del bebedero era en el 8B')
          const aceptar = botones(correccion).find(x => x.includes('|si='))
          assert(aceptar && aceptar !== viejo && textos(correccion).includes('del 9B al 8B'), textos(correccion))
          await boton(v1, viejo)
          const primero = await boton(v1, aceptar)
          const aceptarLluvia = botones(primero).find(x => x.includes('|si='))
          assert(aceptarLluvia, textos(primero))
          await boton(v1, aceptarLluvia)
          await boton(v1, aceptarLluvia)
          const filas = await admin`select o.potrero_id, o.agua::text from observacion_potrero o
            join recorrida r on r.id=o.recorrida_id where r.empresa_id=${E1} and r.fecha=${hoy}`
          assert(filas.length === 1 && filas[0].potrero_id === P8 && filas[0].agua === 'baja')
          const lluvias = await admin`select campo_id from lluvia where empresa_id=${E1} and fecha=${hoy} and mm=23`
          assert(lluvias.length === 1 && lluvias[0].campo_id === C1)
          assert(stock === JSON.stringify(await db.hacienda(v1, { tipo: 'consulta_hacienda', campoId: C1, potreroId: P9 })))
        } finally {
          if (previo === undefined) Deno.env.delete(env)
          else Deno.env.set(env, previo)
          simularLecturas = false
          interpretarComo = null
          transcripcionQA = ''
          await limpiar()
        }
      })
      await test('Comparación con dos potreros del mismo nombre: ' + modo, async () => {
        const campo = id(1301)
        const potrero = id(1302)
        const previa = Deno.env.get(variableLecturas)
        if (modo === 'con_herramientas') Deno.env.set(variableLecturas, E1)
        else Deno.env.delete(variableLecturas)
        const consulta = '¿Cuántas vacas figuran en el 9B?'
        const novedad = 'Encontré una tranquera arrancada en el 8B de La Porteña'
        const antes = usoLecturas.length
        const tokensAntes = tokensEnsayo
        try {
          await limpiarConversacion()
          await admin`insert into campo values (${campo},${E1},'Palo Blanco')`
          await admin`insert into potrero (id,empresa_id,campo_id,nombre) values (${potrero},${E1},${campo},'9B')`
          simularLecturas = simularPotreroAmbiguo = !modeloReal
          if (!modeloReal) interpretarComo = { pedidos: [
            { intent: 'consulta_hacienda', fragmento: consulta, potrero: '9B', categoria_animal: 'vaca' },
            { intent: 'novedad', fragmento: novedad, observaciones: [{ campo: 'La Porteña', potrero: '8B', novedad: 'Tranquera arrancada' }] },
          ] }
          transcripcionQA = `${consulta} ${novedad}.`
          const inicio = performance.now()
          const recibido = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
          console.log(JSON.stringify({ modo, caso: 'potrero_ambiguo', modeloReal, msPrimerTurno: Math.round(performance.now() - inicio),
            tokensPrimerTurno: modeloReal ? tokensEnsayo - tokensAntes : null, lecturas: usoLecturas.slice(antes) }))
          const pendiente = (await db.vinculoDe(v1.telefono))?.pendiente
          assert(pendiente?.tipo === 'turno' && pendiente.pasos.length === 2
            && pendiente.pasos.some(x => x.pendiente.borrador.tipo === 'consulta_hacienda' && !x.pendiente.borrador.potreroId)
            && pendiente.pasos.some(x => x.pendiente.borrador.tipo === 'recorrida'
              && x.pendiente.borrador.observaciones?.some(o => o.potreroId === P8 && o.novedad?.toLowerCase().includes('tranquera'))),
            textos(recibido))
          assert(!/\b(?:0|2)\s+vacas\b/.test(textos(recibido)), textos(recibido))
          assert(modo === 'actual' ? usoLecturas.length === antes : usoLecturas.slice(antes).some(
            r => r.herramienta === 'resolver_potrero' && r.estado === 'ambiguo'), 'La herramienta debe detectar los nombres duplicados.')
        } finally {
          simularLecturas = simularPotreroAmbiguo = false
          interpretarComo = null
          transcripcionQA = ''
          if (previa === undefined) Deno.env.delete(variableLecturas)
          else Deno.env.set(variableLecturas, previa)
          await limpiarConversacion()
          await admin`delete from potrero where id=${potrero}`
          await admin`delete from campo where id=${campo}`
        }
      })
    }

    if (modeloReal) {

      await test('Audio real transcripto: conectores, tres pedidos y nota abierta recuperable', async () => {
        try {
          await limpiarConversacion()
          transcripcionQA = 'Anotá una lluvia de 10 milímetros en el potrero 8B de La Porteña. Después, en el potrero del noveno B se encontró el eléctrico cortado y el molino no anda. y después, mostrame de cerca el mapa del potrero 9B.'
          const recibido = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
          const resumen = recibido.filter(m => m.type !== 'image')
          assert(resumen.length === 1 && recibido[0] === resumen[0] && recibido.at(-1)?.type === 'image', textos(recibido))
          assert(textos(resumen).includes('10 mm') && textos(resumen).includes('eléctrico cortado')
            && /molino/i.test(textos(resumen)) && !textos(resumen).includes('Me quedó por aclarar'), textos(resumen))
          await limpiarConversacion()
          transcripcionQA = ''
          const mensaje = 'Dejame guardado que el encargado tiene la llave del galpón en su casa.'
          const nota = await texto(v1, mensaje)
          const pendiente = (await db.vinculoDe(v1.telefono))?.pendiente
          assert(pendiente?.tipo === 'propuesta' && pendiente.borrador.tipo === 'nota', textos(nota))
          const guardar = botones(nota).find(b => b.includes('|si'))
          assert(guardar, textos(nota))
          const respuesta = await boton(v1, guardar)
          assert(textos(respuesta).includes('Guardé la nota'), textos(respuesta))
          assert((await db.cargasRecientes(v1, null)).some(c => c.tipo === 'nota' && c.contenido === mensaje))
        } finally {
          transcripcionQA = ''
          await limpiarConversacion()
        }
      })

      await test('Charla diaria con modelo real: saludo, mapa y campos de la cuenta', async () => {
        for (const saludo of ['Hola', 'Buenas, ¿cómo andás?']) {
          const mapa = await texto(v1, 'Acercá el 9B')
          assert(mapa.some(m => m.type === 'image'), textos(mapa))
          const cantidadRedacciones = redaccionesReales.length
          const dialogo = await texto(v1, saludo)
          const redaccion = redaccionesReales.at(-1)
          const salida = textos(dialogo)
          assert(redaccionesReales.length > cantidadRedacciones && redaccion?.status === 200 && redaccion.texto?.trim() === salida,
            'La respuesta del saludo tiene que salir del modelo real.')
          assert(dialogo.length === 1 && /\b(?:hola|buenas|bien|como|todo)\b/i.test(salida)
            && !/\b(?:9B|potrero|satelite|satélite|mapa|mandame un audio)\b/i.test(salida), salida)
          const doble = await texto(v1, 'Quiero ver el potrero 9b con el satélite y saber que tengo ahí adentro')
          assert(doble.some(m => m.type === 'image' && m.image?.caption.includes('9B'))
            && doble.some(m => m.type === 'text' && m.text?.body.includes('2 cabezas')), textos(doble))
          const cantidadInterpretadas = interpretacionesReales.length
          const campos = await texto(v1, '¿Podrías enumerar los establecimientos de esta cuenta?')
          assert(interpretacionesReales.length > cantidadInterpretadas && interpretacionesReales.at(-1) === 200,
            'La paráfrasis tiene que pasar por el intérprete real.')
          assert(textos(campos).includes('La Porteña') && !textos(campos).includes('Campo Ajeno') && !botones(campos).length, textos(campos))
        }
        const estado = await db.vinculoDe(v1.telefono)
        assert(!estado?.pendiente && !(await admin`select 1 from lluvia where empresa_id=${E1}`).length
          && !(await admin`select 1 from movimiento_financiero where empresa_id=${E1}`).length, 'La charla de consultas dejó una carga.')
      })
      await test('Asistente de recorrida con modelo real: audio y corrección de ubicación', async () => {
        const antes = interpretacionesReales.length
        transcripcionQA = 'En el 9B vi el bebedero bajo. ¿Cuántos animales tengo ahí? De paso, anotá 15 mm.'
        try {
          const inicio = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
          assert(interpretacionesReales.length > antes && interpretacionesReales.at(-1) === 200, 'El audio debe pasar por el intérprete real.')
          assert(textos(inicio).includes('2 cabezas') && textos(inicio).includes('9B de La Porteña')
            && textos(inicio).includes('15 mm') && botones(inicio).some(x => x.includes('|si=')), textos(inicio))
          const pendientes = (await db.vinculoDe(v1.telefono))?.pendiente
          assert(pendientes?.tipo === 'turno' && pendientes.pasos.length === 2, 'La charla debe conservar dos propuestas.')
          const antesDelCambio = interpretacionesReales.length
          const revisada = await texto(v1, 'Mové el registro del bebedero al 8B')
          assert(interpretacionesReales.length > antesDelCambio && interpretacionesReales.at(-1) === 200, 'La paráfrasis debe pasar por el intérprete real.')
          assert(textos(revisada).includes('del 9B al 8B'), textos(revisada))
          const revisados = (await db.vinculoDe(v1.telefono))?.pendiente
          assert(revisados?.tipo === 'turno' && JSON.stringify(revisados.pasos[1]) === JSON.stringify(pendientes.pasos[1]),
            'La lluvia debe conservar su alcance al mover el bebedero.')
        } finally {
          transcripcionQA = ''
          await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${V1}`
        }
      })
      return
    }


    await test('Audio completo: un texto reúne lluvia, eléctrico y molino; el mapa llega después y el recordatorio no duplica', async () => {
      const lluvia = 'Anotá una lluvia de 10 milímetros en el potrero 8B de La Porteña'
      const novedad = 'en el potrero 9B se encontró el eléctrico cortado y el molino no anda'
      const mapa = 'mostrame de cerca el mapa del potrero 9B'
      try {
        transcripcionQA = `${lluvia}. Después, ${novedad}. y después, ${mapa}.`
        interpretarComo = { pedidos: [
          { intent: 'lluvia', fragmento: lluvia, mm: 10, campo: 'La Porteña' },
          { intent: 'novedad', fragmento: novedad, observaciones: [{ potrero: '9B', campo: 'La Porteña', electrico: 'cortado', novedad: 'molino no anda' }] },
          { intent: 'consulta_mapa', fragmento: mapa, campo: 'La Porteña', potrero: '9B' },
        ] }
        const recibido = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
        const resumen = recibido.filter(m => m.type !== 'image')
        assert(resumen.length === 1 && recibido[0] === resumen[0] && recibido.at(-1)?.type === 'image', textos(recibido))
        assert(textos(resumen).includes('10 mm') && textos(resumen).includes('eléctrico cortado')
          && textos(resumen).includes('molino no anda') && !textos(resumen).includes('Me quedó por aclarar'), textos(resumen))
        const antes = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(antes?.tipo === 'turno' && antes.pasos.length === 2)
        interpretarComo = { intent: 'novedad', observaciones: [{ campo: 'La Porteña', potrero: '9B', electrico: 'cortado' }] }
        const recordatorio = await texto(v1, 'El eléctrico cortado te dije')
        const despues = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(JSON.stringify(despues) === JSON.stringify(antes) && textos(recordatorio).includes('molino no anda'),
          'Recordar el eléctrico cambió o duplicó las propuestas.')
      } finally {
        interpretarComo = null
        transcripcionQA = ''
        await admin`update wa_vinculo set pendiente=null,pendiente_at=null where id=${V1}`
      }
    })

    await test('Nota fuera del catálogo: confirmar, recuperar, aislar y conservar el stock', async () => {
      const contenido = 'Asigná las caravanas del archivo a los animales del 9B'
      const stock = JSON.stringify(await db.hacienda(v1, { tipo: 'consulta_hacienda', potreroId: P9 }))
      let captura: string | undefined
      try {
        interpretarComo = { intent: 'no_soportado', campo: 'La Porteña', potrero: '9B' }
        const propuesta = await texto(v1, contenido)
        assert(textos(propuesta).includes(contenido) && !textos(propuesta).includes('no puedo cargar'), textos(propuesta))
        const pendiente = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(pendiente?.tipo === 'propuesta' && pendiente.borrador.tipo === 'nota', JSON.stringify(pendiente))
        captura = pendiente.capturaId
        assert(await db.verificarCargaDeCaptura(v1, captura) === null, 'La nota figuró guardada antes de confirmar.')
        const guardar = botones(propuesta).find(b => b.includes('|si'))
        assert(guardar, 'No hay botón para guardar la nota: ' + JSON.stringify(botones(propuesta)))
        const recibido = await boton(v1, guardar)
        assert(textos(recibido).includes('Guardé la nota'), textos(recibido))
        await boton(v1, guardar)
        assert(await db.verificarCargaDeCaptura(v1, captura) === true, 'La nota confirmada no quedó verificable.')
        assert(await db.verificarCargaDeCaptura(v2, captura) === null)
        const propias = await db.cargasRecientes(v1, null)
        assert(propias.some(n => n.tipo === 'nota' && n.contenido === contenido), JSON.stringify(propias))
        assert(!(await db.cargasRecientes(v2, null)).some(n => n.contenido === contenido))
        assert(stock === JSON.stringify(await db.hacienda(v1, { tipo: 'consulta_hacienda', potreroId: P9 })))
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null,pendiente_at=null where id=${V1}`
        if (captura) await admin`delete from captura where id=${captura}`
      }
    })


    await test('Nota confirmada: falla de envío, botón repetido y permiso revocado', async () => {
      let captura: string | undefined
      try {
        interpretarComo = { intent: 'no_soportado' }
        const propuesta = await texto(v1, 'Conservá el pedido de revisar las caravanas')
        const pendiente = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(pendiente?.tipo === 'propuesta' && pendiente.borrador.tipo === 'nota')
        captura = pendiente.capturaId
        const guardar = botones(propuesta).find(b => b.includes('|si'))
        assert(guardar)
        fallarRespuesta = true
        await boton(v1, guardar)
        fallarRespuesta = false
        assert(await db.verificarCargaDeCaptura(v1, captura) === true)
        const repetido = await boton(v1, guardar)
        assert(textos(repetido).includes('ya está guardada'), textos(repetido))
        const restringido = permisosDe({ rol: 'invitado', acceso: 'app',
          niveles: { hacienda: 'no', campos: 'carga', plata: 'no' }, secciones: null })
        assert(!(await db.cargasRecientes(v1, null, restringido)).some(n => n.tipo === 'nota'))
      } finally {
        interpretarComo = null
        fallarRespuesta = false
        await admin`update wa_vinculo set pendiente=null,pendiente_at=null where id=${V1}`
        if (captura) await admin`delete from captura where id=${captura}`
      }
    })

    await test('Lluvia: «sí, pero eran 35» pide una nueva confirmación y sólo guarda 35', async () => {
      const hoy = hoyAR()
      try {
        interpretarComo = { intent: 'lluvia', mm: 11, fecha: hoy, campo: 'La Porteña' }
        const primera = await texto(v1, 'Anotá 11 mm en La Porteña')
        const viejo = botones(primera).find(x => x.includes('|si='))
        const anterior = (await db.vinculoDe(v1.telefono))?.pendiente
        if (!viejo || anterior?.tipo !== 'propuesta') throw new Error('No apareció la primera propuesta.')
        interpretarComo = { intent: 'lluvia', mm: 35 }
        const correccion = await texto(v1, 'Sí, pero eran 35')
        const actual = botones(correccion).find(x => x.includes('|si='))
        assert(actual && actual !== viejo && textos(correccion).includes('35 mm'), 'La corrección no produjo una propuesta nueva.')
        assert(!(await admin`select 1 from lluvia where empresa_id=${E1}`).length, 'Guardó antes de ver y confirmar el cambio.')
        assert(!await db.tomarPropuesta(v1, anterior.capturaId, anterior), 'Una ejecución con el borrador anterior pudo reclamarlo.')
        assert(textos(await boton(v1, viejo)).includes('propuesta anterior'), 'Siguió vigente el botón de 11 mm.')
        assert(textos(await boton(v2, actual!)).includes('propuesta anterior'), 'Otro número pudo confirmar la lluvia.')
        const r = await boton(v1, actual!)
        assert(textos(r).includes('anoté *35 mm*'), 'No confirmó los 35 mm.')
        await boton(v1, actual!)
        const filas = await admin`select mm::int as mm from lluvia where empresa_id=${E1}`
        assert(filas.length === 1 && filas[0].mm === 35, 'Confirmar dos veces o tocar el botón viejo cambió el dato.')
      } finally {
        interpretarComo = null
        await admin`delete from lluvia where empresa_id=${E1} and fecha=${hoy} and mm in (11,35)`
      }
    })

    await test('Gasto: «dale, pero fueron 45 mil», cancelar y tocar el botón anterior', async () => {
      const hoy = hoyAR()
      const cat = id(240)
      await admin`insert into categoria_movimiento (id,empresa_id,nombre,aplica_a) values (${cat},${E1},'Combustible','gasto')`
      try {
        interpretarComo = { intent: 'gasto', monto: 30000, fecha: hoy, campo: 'La Porteña', categoria: 'Combustible' }
        const original = await texto(v1, 'Anotá $30.000 de combustible en La Porteña')
        const idOriginal = botones(original).find(x => x.includes('|si='))
        assert(idOriginal && textos(original).includes('30.000'), 'No apareció el gasto propuesto.')
        interpretarComo = { intent: 'gasto', monto: 45000 }
        const correccion = await texto(v1, 'Dale, pero fueron 45 mil')
        const aceptar = botones(correccion).find(x => x.includes('|si='))
        const cancelar = botones(correccion).find(x => x.includes('|cancelar='))
        assert(aceptar && cancelar && textos(correccion).includes('45.000'), 'No mostró el importe corregido.')
        await boton(v1, idOriginal!)
        await boton(v1, cancelar!)
        await boton(v1, aceptar!)
        assert(!(await admin`select 1 from movimiento_financiero where empresa_id=${E1}`).length, 'El gasto cancelado entró a Plata.')
      } finally {
        interpretarComo = null
        await admin`delete from categoria_movimiento where id=${cat}`
      }
    })

    await test('Un gasto pendiente y una consulta de hacienda en la misma charla', async () => {
      const cat = id(241)
      await admin`insert into categoria_movimiento (id,empresa_id,nombre,aplica_a) values (${cat},${E1},'Vacunación QA','gasto')`
      try {
        interpretarComo = { intent: 'gasto', monto: 62000, fecha: hoyAR(), campo: 'La Porteña', categoria: 'Vacunación QA' }
        const original = await texto(v1, 'Anotá 62 mil de la vacuna en La Porteña')
        const aceptar = botones(original).find(x => x.includes('|si='))
        assert(aceptar, 'Falta la propuesta de gasto.')
        const antes = (await db.vinculoDe(v1.telefono))?.pendiente
        interpretarComo = { intent: 'consulta_hacienda', campo: 'La Porteña', potrero: '9B' }
        const respuesta = textos(await texto(v1, 'No, primero decime cuántas cabezas hay en el 9B de La Porteña'))
        const despues = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(respuesta.includes('2 cabezas') && respuesta.includes('9B') && !respuesta.includes('62.000'), respuesta)
        assert(respuesta.includes('retomar gasto'), 'No explicó cómo retomar el gasto.')
        assert(despues?.tipo === 'corregir' && despues.capturaId === antes?.capturaId
          && antes?.tipo === 'propuesta' && JSON.stringify(despues.borrador) === JSON.stringify(antes.borrador),
          'La consulta cambió el gasto pendiente.')
        assert(textos(await boton(v1, aceptar!)).includes('propuesta anterior'), 'El botón anterior seguía confirmando.')
        const retomado = await texto(v1, 'retomar gasto')
        assert(textos(retomado).includes('62.000') && botones(retomado).some(x => x.includes('|si=')), 'No se pudo retomar el gasto.')
        assert(!(await admin`select 1 from movimiento_financiero where empresa_id=${E1}`).length, 'La consulta cargó un gasto.')
      } finally {
        interpretarComo = null
        await texto(v1, 'cancelar')
        await admin`delete from categoria_movimiento where id=${cat}`
      }
    })

    await test('Audio mixto guarda la lluvia y contrasta novillo y ovejas por potrero antes de una baja', async () => {
      const ayer = sumarDias(hoyAR(), -1)
      const animales = [id(601), id(602), id(603), id(604)]
      await admin`insert into animal (id,empresa_id,potrero_id,categoria,estado) values
        (${animales[0]},${E1},${P9},'oveja','activo'),
        (${animales[1]},${E1},${P9},'novillo','activo'),
        (${animales[2]},${E1},${P9},'oveja','vendido'),
        (${animales[3]},${E2},${PX},'oveja','activo')`
      try {
        transcripcionQA = 'Ayer llovieron 15 milímetros en La Porteña, se inundó el potrero 9D y se murió un novillo y nueve ovejas.'
        interpretarComo = {
          intent: 'lluvia', mm: 15, fecha: ayer, campo: 'La Porteña', otros_registros: ['novedad'],
          mortandad: {
            campo: 'La Porteña', potrero: '9D', detalle: 'Se inundó el potrero 9D',
            grupos: [{ categoria: 'novillo', cantidad: 1 }, { categoria: 'oveja', cantidad: 9 }],
          },
        }
        const audio = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
        const guardar = botones(audio).find(x => x.includes('|si='))
        assert(guardar && textos(audio).includes('15 mm') && textos(audio).includes('Se inundó el potrero 9D')
          && textos(audio).includes('1 novillo y 9 ovejas'), textos(audio))
        assert(!(await admin`select 1 from lluvia where empresa_id=${E1} and mm=15`).length, 'La lluvia se guardó antes de confirmar.')

        interpretarComo = null
        const confirmado = textos(await boton(v1, guardar!))
        assert(confirmado.includes('15 mm') && confirmado.includes('¿Era el 9B?') && !confirmado.includes('figura *1 oveja*'), confirmado)
        const dudoso = textos(await texto(v1, 'sí'))
        assert(dudoso.includes('¿Era el 9B?') && !dudoso.includes('figura *1 oveja*'), 'Un sí sin identificar el potrero hizo la comparación.')

        const revision = textos(await texto(v1, 'Fue en el 9B'))
        assert(revision.includes('En el 9B de La Porteña hoy figura *1 oveja*') && revision.includes('murieron *9 ovejas*')
          && revision.includes('¿Fueron menos o fue en otro potrero?'), revision)
        const corregida = textos(await texto(v1, 'Era una oveja'))
        assert(corregida.includes('1 novillo y 1 oveja') && corregida.includes('falta identificarlos en Hacienda'), corregida)
        const pendiente = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(pendiente?.tipo === 'mortandad' && pendiente.reporte.grupos.some(g => g.categoria === 'oveja' && g.cantidad === 1),
          'La corrección no quedó en la revisión pendiente.')
        await boton(v1, guardar!)
        assert((await admin`select 1 from lluvia where empresa_id=${E1} and campo_id=${C1} and fecha=${ayer} and mm=15`).length === 1,
          'La revisión duplicó o cambió la lluvia.')
        assert((await admin`select 1 from animal where id in ${admin(animales)} and estado='activo'`).length === 3,
          'La revisión cambió el stock.')
      } finally {
        interpretarComo = null
        transcripcionQA = ''
        await texto(v1, 'cancelar')
        await admin`delete from lluvia where empresa_id=${E1} and fecha=${ayer} and mm=15`
        await admin`delete from animal where id in ${admin(animales)}`
      }
    })

    await test('Un audio conserva dos lluvias y responde las ovejas del potrero antes de confirmar', async () => {
      const ayer = sumarDias(hoyAR(), -1)
      const oveja = id(612)
      await admin`insert into animal (id,empresa_id,potrero_id,categoria,estado) values (${oveja},${E1},${P9},'oveja','activo')`
      const primero = 'Anotá 15 mm ayer en La Porteña'
      const consulta = '¿Cuántas ovejas hay en el 9B?'
      const segundo = 'Anotá 12 mm hoy en La Porteña'
      try {
        transcripcionQA = `${primero}. ${consulta} ${segundo}.`
        interpretarComo = { pedidos: [
          { intent: 'lluvia', fragmento: primero, campo: 'La Porteña', mm: 15 },
          { intent: 'consulta_hacienda', fragmento: consulta, campo: 'La Porteña', potrero: '9B', categoria_animal: 'oveja' },
          { intent: 'lluvia', fragmento: segundo, campo: 'La Porteña', mm: 12 },
        ] }
        const salida = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
        const guardar1 = botones(salida).find(x => x.includes('|si='))
        assert(guardar1 && textos(salida).includes('Hoy figura *1 oveja* en el 9B') && textos(salida).includes('15 mm en La Porteña'), textos(salida))
        const estado = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(estado?.tipo === 'turno' && estado.pasos.length === 2)
        const previo = await admin`select mm from lluvia where empresa_id=${E1} and mm in (12,14,15)`
        assert(!previo.length, 'Se guardó una carga antes de mostrarla.')

        interpretarComo = null
        const respuesta2 = await boton(v1, guardar1!)
        const guardar2 = botones(respuesta2).find(x => x.includes('|si='))
        assert(guardar2 && guardar2 !== guardar1 && textos(respuesta2).includes('12 mm en La Porteña'), textos(respuesta2))
        await boton(v1, guardar1!)
        await texto(v1, 'sí')
        assert((await admin`select mm from lluvia where empresa_id=${E1} and mm in (12,14,15)`).length === 1,
          'El reintento o un sí suelto confirmó el segundo pendiente.')

        interpretarComo = { intent: 'lluvia', mm: 14 }
        const corregido = await texto(v1, 'Dale, pero eran 14')
        const guardarCorregida = botones(corregido).find(x => x.includes('|si='))
        assert(guardarCorregida && guardarCorregida !== guardar2 && textos(corregido).includes('14 mm en La Porteña'), textos(corregido))
        await boton(v1, guardar2!)
        await boton(v1, guardarCorregida!)
        await boton(v1, guardarCorregida!)
        const filas = await admin`select mm::float8, fecha::text from lluvia where empresa_id=${E1} and mm in (12,14,15) order by fecha`
        assert(filas.length === 2 && filas[0].mm === 15 && filas[0].fecha === ayer
          && filas[1].mm === 14 && filas[1].fecha === hoyAR(), JSON.stringify(filas))
        assert(!(await db.vinculoDe(v1.telefono))?.pendiente, 'Quedaron pendientes de un turno finalizado.')
      } finally {
        interpretarComo = null
        transcripcionQA = ''
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${v1.id}`
        await admin`delete from lluvia where empresa_id=${E1} and mm in (12,14,15)`
        await admin`delete from animal where id=${oveja}`
      }
    })

    await test('Un potrero desconocido y un gasto incompleto conservan la lluvia disponible', async () => {
      const cat = id(613)
      await admin`insert into categoria_movimiento (id,empresa_id,nombre,aplica_a) values (${cat},${E1},'Combustible','gasto')`
      const consulta = 'Cuántas cabezas hay en el 9D de La Porteña'
      const lluvia = 'Anotá 21 mm en La Porteña'
      const gasto = 'Pagué combustible en La Porteña'
      try {
        interpretarComo = { pedidos: [
          { intent: 'consulta_hacienda', fragmento: consulta, campo: 'La Porteña', potrero: '9D' },
          { intent: 'lluvia', fragmento: lluvia, campo: 'La Porteña', mm: 21 },
          { intent: 'gasto', fragmento: gasto, campo: 'La Porteña', categoria: 'Combustible' },
        ] }
        const inicial = textos(await texto(v1, `${consulta}. ${lluvia}. ${gasto}.`))
        assert(inicial.includes('No encontré el potrero «9D»') && inicial.includes('siguiente pendiente') && !inicial.includes('2 cabezas'), inicial)
        interpretarComo = null
        const siguiente = await texto(v1, 'siguiente pendiente')
        const guardar = botones(siguiente).find(x => x.includes('|si='))
        assert(guardar && textos(siguiente).includes('21 mm en La Porteña'), textos(siguiente))
        const resta = textos(await boton(v1, guardar!))
        assert(resta.includes('¿De cuánto fue el gasto?'), resta)
        const monto = await texto(v1, '45000')
        assert(textos(monto).includes('45.000') && botones(monto).some(x => x.includes('|si=')), textos(monto))
        const cancelar = botones(monto).find(x => x.includes('|cancelar='))
        assert(cancelar)
        assert(textos(await boton(v1, cancelar!)).includes('No encontré el potrero «9D»'))
        const resuelta = textos(await texto(v1, '9B'))
        assert(resuelta.includes('2 cabezas') && resuelta.includes('9B'), resuelta)
        assert((await admin`select 1 from lluvia where empresa_id=${E1} and mm=21`).length === 1)
        assert(!(await admin`select 1 from movimiento_financiero where empresa_id=${E1}`).length)
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${v1.id}`
        await admin`delete from lluvia where empresa_id=${E1} and mm=21`
        await admin`delete from categoria_movimiento where id=${cat}`
      }
    })

    await test('Novedad y gasto comparten el coordinador y el gasto pide corregir un campo ajeno', async () => {
      const cat = id(614)
      const novedad = 'El molino del 9B se rompió'
      const gasto = 'Pagué combustible en Campo Ajeno'
      const detalle = 'Molino roto en QA compuesto'
      await admin`insert into categoria_movimiento (id,empresa_id,nombre,aplica_a) values (${cat},${E1},'Combustible','gasto')`
      try {
        interpretarComo = { pedidos: [
          { intent: 'novedad', fragmento: novedad, campo: 'La Porteña', observaciones: [{ potrero: '9B', novedad: detalle }] },
          { intent: 'gasto', fragmento: gasto, campo: 'Campo Ajeno', categoria: 'Combustible' },
        ] }
        const inicio = await texto(v1, `${novedad}. ${gasto}.`)
        const guardar = botones(inicio).find(x => x.includes('|si='))
        assert(guardar && textos(inicio).includes(detalle), textos(inicio))
        assert(!(await admin`select 1 from observacion_potrero where empresa_id=${E1} and novedad=${detalle}`).length)
        const sigue = textos(await boton(v1, guardar!))
        assert(sigue.includes('No encontré el campo «Campo Ajeno»'), sigue)
        assert((await admin`select 1 from observacion_potrero where empresa_id=${E1} and potrero_id=${P9} and novedad=${detalle}`).length === 1)
        assert(textos(await texto(v1, 'La Porteña')).includes('¿De cuánto fue el gasto?'))
        await texto(v1, 'cancelar')
        assert(!(await admin`select 1 from movimiento_financiero where empresa_id=${E1}`).length)
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${v1.id}`
        await admin`delete from observacion_potrero where empresa_id=${E1} and novedad=${detalle}`
        await admin`delete from categoria_movimiento where id=${cat}`
      }
    })

    await test('Una falla de Hacienda deja la lluvia del mismo mensaje en pie', async () => {
      const consulta = 'Cuántas cabezas hay en el 9B'
      const lluvia = 'Anotá 22 mm en La Porteña'
      try {
        interpretarComo = { pedidos: [
          { intent: 'consulta_hacienda', fragmento: consulta, campo: 'La Porteña', potrero: '9B' },
          { intent: 'lluvia', fragmento: lluvia, campo: 'La Porteña', mm: 22 },
        ] }
        await admin`alter table animal rename column categoria to categoria_qa`
        let salida
        try {
          salida = await texto(v1, `${consulta}. ${lluvia}.`)
        } finally {
          await admin`alter table animal rename column categoria_qa to categoria`
        }
        const guardar = botones(salida).find(x => x.includes('|si='))
        assert(guardar && textos(salida).includes('Esa consulta no está disponible ahora') && textos(salida).includes('22 mm en La Porteña'), textos(salida))
        await boton(v1, guardar!)
        assert((await admin`select 1 from lluvia where empresa_id=${E1} and mm=22`).length === 1)
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${v1.id}`
        await admin`delete from lluvia where empresa_id=${E1} and mm=22`
      }
    })

    await test('Una lluvia que no se guardó vuelve a quedar pendiente sin perder la siguiente', async () => {
      const primera = 'Anotá 42 mm de ayer en La Porteña'
      const segunda = 'Anotá 43 mm de hoy en La Porteña'
      try {
        interpretarComo = { pedidos: [
          { intent: 'lluvia', fragmento: primera, campo: 'La Porteña', mm: 42 },
          { intent: 'lluvia', fragmento: segunda, campo: 'La Porteña', mm: 43 },
        ] }
        const inicio = await texto(v1, `${primera}. ${segunda}.`)
        const anterior = botones(inicio).find(x => x.includes('|si='))
        assert(anterior, textos(inicio))
        await admin`alter table lluvia add constraint qa_turno_lluvia check (mm <> 42)`
        let fallida
        try {
          fallida = await boton(v1, anterior!)
        } finally {
          await admin`alter table lluvia drop constraint qa_turno_lluvia`
        }
        const reintentar = botones(fallida).find(x => x.includes('|si='))
        assert(reintentar && reintentar !== anterior && textos(fallida).includes('42 mm en La Porteña'), textos(fallida))
        await boton(v1, anterior!)
        assert(!(await admin`select 1 from lluvia where empresa_id=${E1} and mm in (42,43)`).length)
        const segundaSalida = await boton(v1, reintentar!)
        const guardarSegunda = botones(segundaSalida).find(x => x.includes('|si='))
        assert(guardarSegunda && textos(segundaSalida).includes('43 mm en La Porteña'))
        await boton(v1, guardarSegunda!)
        assert((await admin`select 1 from lluvia where empresa_id=${E1} and mm in (42,43)`).length === 2)
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${v1.id}`
        await admin`delete from lluvia where empresa_id=${E1} and mm in (42,43)`
      }
    })

    await test('«¿Y anteayer?» retoma el campo de la última consulta de lluvia y conserva la carga', async () => {
      const hoy = hoyAR()
      const dias = [sumarDias(hoy, -1), sumarDias(hoy, -2)]
      const ids = [id(615), id(616)]
      await admin`insert into lluvia (id,empresa_id,campo_id,fecha,mm,fuente) values
        (${ids[0]},${E1},${C1},${dias[0]},7,'manual'), (${ids[1]},${E1},${C1},${dias[1]},8,'manual')`
      const consulta = '¿Cuánto llovió ayer en La Porteña?'
      const carga = 'Anotá 52 mm hoy en La Porteña'
      try {
        interpretarComo = { pedidos: [
          { intent: 'consulta_lluvia', fragmento: consulta, campo: 'La Porteña' },
          { intent: 'lluvia', fragmento: carga, campo: 'La Porteña', mm: 52 },
        ] }
        const salida = await texto(v1, `${consulta} ${carga}.`)
        assert(textos(salida).includes('*7 mm* ayer') && botones(salida).some(x => x.includes('|si=')), textos(salida))
        interpretarComo = null
        const anterior = (await db.vinculoDe(v1.telefono))?.pendiente
        const seguimiento = textos(await texto(v1, '¿Y anteayer?'))
        assert(seguimiento.includes('*8 mm*') && seguimiento.includes('La Porteña') && !seguimiento.includes('*7 mm*'), seguimiento)
        assert(JSON.stringify((await db.vinculoDe(v1.telefono))?.pendiente) === JSON.stringify(anterior))
        assert(!(await admin`select 1 from lluvia where empresa_id=${E1} and mm=52`).length)
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${v1.id}`
        await admin`delete from lluvia where id in ${admin(ids)}`
      }
    })

    await test('Una repregunta corta pide el campo si el turno anterior consultó dos', async () => {
      const otroCampo = id(617)
      const consulta1 = '¿Cuánto llovió ayer en La Porteña?'
      const consulta2 = '¿Y en La Loma?'
      const carga = 'Anotá 53 mm hoy en La Porteña'
      await admin`insert into campo (id,empresa_id,nombre) values (${otroCampo},${E1},'La Loma')`
      try {
        interpretarComo = { pedidos: [
          { intent: 'consulta_lluvia', fragmento: consulta1, campo: 'La Porteña' },
          { intent: 'consulta_lluvia', fragmento: consulta2, campo: 'La Loma', fecha: sumarDias(hoyAR(), -1) },
          { intent: 'lluvia', fragmento: carga, campo: 'La Porteña', mm: 53 },
        ] }
        const inicial = await texto(v1, `${consulta1} ${consulta2} ${carga}.`)
        assert(textos(inicial).includes('La Loma') && botones(inicial).some(x => x.includes('|si=')), textos(inicial))
        const antes = (await db.vinculoDe(v1.telefono))?.pendiente
        interpretarComo = null
        const respuesta = textos(await texto(v1, '¿Y anteayer?'))
        assert(respuesta.includes('Decime también el campo') && !respuesta.includes('medición de lluvia'), respuesta)
        assert(JSON.stringify((await db.vinculoDe(v1.telefono))?.pendiente) === JSON.stringify(antes))
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${v1.id}`
        await admin`delete from campo where id=${otroCampo}`
      }
    })

    await test('Lluvia de la semana pasada y antes de ayer distingue registros manuales y estimaciones', async () => {
      const hoy = hoyAR()
      const domingo = sumarDias(inicioSemana(hoy), -1)
      const lunes = sumarDias(domingo, -6)
      const anteayer = sumarDias(hoy, -2)
      const ids = [id(621), id(622), id(623), id(624), id(625), id(626)]
      await admin`insert into lluvia (id,empresa_id,campo_id,fecha,mm,fuente) values
        (${ids[0]},${E1},${C1},${lunes},0,'manual'),
        (${ids[1]},${E1},${C1},${domingo},4.5,'manual'),
        (${ids[2]},${E1},${C1},${domingo},10,'open_meteo'),
        (${ids[3]},${E1},${C1},${anteayer},3,'open_meteo'),
        (${ids[4]},${E1},${C1},${hoy},99,'manual'),
        (${ids[5]},${E2},${C2},${domingo},555,'open_meteo')`
      const semana = 'cuánto llovió en el 9B la semana pasada'
      const dia = 'antes de ayer'
      try {
        const simple = textos(await texto(v1, '¿' + semana + '?'))
        assert(simple.includes('El 9B está en La Porteña') && simple.includes(`del ${ddmm(lunes)} al ${ddmm(domingo)}`)
          && simple.includes('4,5 mm') && simple.includes('Estimación de Open-Meteo')
          && !simple.includes('99 mm') && !simple.includes('555 mm'), simple)
        interpretarComo = { pedidos: [
          { intent: 'consulta_lluvia', fragmento: semana, potrero: '9B', periodo: 'semana' },
          { intent: 'consulta_lluvia', fragmento: dia, potrero: '9B' },
        ] }
        transcripcionQA = `¿${semana} y ${dia}?`
        const mixta = textos(await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } }))
        assert(mixta.includes(`del ${ddmm(lunes)} al ${ddmm(domingo)}`) && mixta.includes('3 mm')
          && mixta.includes(ddmm(anteayer)) && !mixta.includes('99 mm'), mixta)
        assert(!(await db.vinculoDe(v1.telefono))?.pendiente)
      } finally {
        interpretarComo = null
        transcripcionQA = ''
        await admin`delete from lluvia where id in ${admin(ids)}`
      }
    })

    await test('La consulta rápida de lluvia no absorbe otro pedido del mensaje', async () => {
      const consulta = '¿Cuánto llovió ayer en La Porteña?'
      const lluvia = 'Anotá 19 mm hoy en La Porteña'
      try {
        interpretarComo = { pedidos: [
          { intent: 'consulta_lluvia', fragmento: consulta, campo: 'La Porteña' },
          { intent: 'lluvia', fragmento: lluvia, campo: 'La Porteña', mm: 19 },
        ] }
        const salida = await texto(v1, `${consulta} ${lluvia}.`)
        assert(textos(salida).includes('medición de lluvia') && textos(salida).includes('ayer')
          && botones(salida).some(x => x.includes('|si=')), textos(salida))
        assert(!(await admin`select 1 from lluvia where empresa_id=${E1} and mm=19`).length)
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${v1.id}`
      }
    })

    await test('Potrero desconocido: no mostrar stock del campo entero', async () => {
      try {
        interpretarComo = { intent: 'consulta_hacienda', campo: 'La Porteña', potrero: '99Z' }
        const respuesta = textos(await texto(v1, '¿Cuántas cabezas hay en el potrero 99Z de La Porteña?'))
        assert(respuesta.includes('No encontré el potrero') && respuesta.includes('99Z') && !respuesta.includes('2 cabezas'), respuesta)
        interpretarComo = { intent: 'consulta_hacienda', campo: 'La Porteña', potrero: '8B' }
        assert(textos(await texto(v1, '¿Cuántas cabezas hay en el potrero 8B?')).includes('8B de La Porteña está sin animales.'),
          'La consulta de un potrero vacío incluyó animales de los potreros vecinos.')
      } finally {
        interpretarComo = null
      }
    })

    for (const caso of [
      { nombre: 'lector de comprobantes caído', estado: 503, mensaje: 'foto' },
      { nombre: 'foto que no es un comprobante', estado: 200, mensaje: 'ticket o factura' },
    ]) {
      await test(`Una carga pendiente sobrevive a ${caso.nombre}`, async () => {
        try {
          interpretarComo = { intent: 'lluvia', mm: 23, fecha: hoyAR(), campo: 'La Porteña' }
          const original = await texto(v1, 'Anotá 23 mm en La Porteña')
          const aceptar = botones(original).find(x => x.includes('|si='))
          assert(aceptar, 'Falta la propuesta de lluvia.')
          const antes = (await db.vinculoDe(v1.telefono))?.pendiente
          assert(antes?.capturaId)
          estadoLectorQA = caso.estado
          const respuesta = textos(await firmar(v1, { type: 'image', image: { id: 'qa-foto', mime_type: 'image/jpeg' } }))
          const despues = (await db.vinculoDe(v1.telefono))?.pendiente
          const [captura] = await admin`select estado from captura where id=${antes!.capturaId}`
          assert(JSON.stringify(despues) === JSON.stringify(antes) && captura.estado === 'propuesta',
            `Pendiente ${despues?.tipo ?? 'borrado'}, captura ${captura.estado}. Respuesta: ${respuesta}`)
          assert(respuesta.includes(caso.mensaje), respuesta)
          await boton(v1, aceptar!)
          assert((await admin`select 1 from lluvia where empresa_id=${E1} and mm=23`).length === 1,
            'El botón de la propuesta original dejó de funcionar.')
        } finally {
          interpretarComo = null
          estadoLectorQA = 200
          await texto(v1, 'cancelar')
          await admin`delete from lluvia where empresa_id=${E1} and mm=23`
        }
      })
    }

    await test('Audio real reproducido: antes de ayer conserva el potrero y la mortandad consulta Hacienda', async () => {
      const semana = 'Cuánto llovió en el 9B la semana pasada'
      const dia = 'y antes de ayer'
      const muertes = 'Después ayer encontré muertos dos novillos y una vaquillona en el 8B'
      try {
        transcripcionQA = `${semana} ${dia}. ${muertes}.`
        interpretarComo = { pedidos: [
          { intent: 'consulta_lluvia', fragmento: semana, potrero: '9B', periodo: 'semana' },
          { intent: 'consulta_lluvia', fragmento: dia },
          { intent: 'lluvia', fragmento: muertes, potrero: '8B', mortandad: {
            campo: 'La Porteña', potrero: '8B', detalle: null,
            grupos: [{ categoria: 'novillo', cantidad: 2 }, { categoria: 'vaquillona', cantidad: 1 }],
          } },
        ] }
        const res = textos(await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } }))
        assert(res.split('El 9B está en La Porteña').length === 3 && res.includes('murieron *2 novillos*')
          && !res.includes('¿En qué campo llovió?'), res)
        assert(!(await db.vinculoDe(v1.telefono))?.pendiente, 'El reporte abrió una carga de lluvia.')
      } finally {
        interpretarComo = null
        transcripcionQA = ''
      }
    })

    await test('Asistente general: datos del audio con y sin cruce, novedades abiertas y fragmentos omitidos', async () => {
      const hoy = hoyAR()
      const agua = 'En el 9B el bebedero estaba bajo'
      const reporte = 'En el 9B encontraron dos vacas muertas y tres perros muertos'
      const dron = 'También cayó un dron cerca del molino en el 9B'
      const lluvia = 'Anotá 19 mm en La Porteña'
      const sinInterpretar = 'Alguien dejó una caja sin etiqueta en la entrada'
      const stock = await admin`select id, estado from animal where empresa_id=${E1} order by id`
      try {
        transcripcionQA = [agua, reporte, dron, lluvia, sinInterpretar].join('. ') + '.'
        interpretarComo = { pedidos: [
          { intent: 'novedad', fragmento: agua, observaciones: [{ potrero: '9B', campo: 'La Porteña', agua: 'baja' }] },
          { intent: 'novedad', fragmento: reporte, mortandad: { potrero: '9B', campo: 'La Porteña',
            grupos: [{ categoria: 'vaca', cantidad: 2 }, { categoria: 'perro', cantidad: 3 }] } },
          { intent: 'novedad', fragmento: dron, observaciones: [{ potrero: '9B', campo: 'La Porteña', novedad: 'Cayó un dron cerca del molino' }] },
          { intent: 'lluvia', fragmento: lluvia, mm: 19, campo: 'La Porteña' },
        ] }
        const recibido = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
        assert(textos(recibido).includes('2 vacas') && textos(recibido).includes('3 perros')
          && textos(recibido).includes('fuera del cruce con Hacienda') && textos(recibido).includes(sinInterpretar), textos(recibido))
        const incompleta = await admin`select 1 from captura where empresa_id=${E1} and texto=${sinInterpretar} and estado='incompleta'`
        assert(incompleta.length === 1, 'El fragmento omitido quedó fuera del registro.')
        const pendientes = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(pendientes?.tipo === 'turno' && pendientes.pasos.length === 4, 'Se perdió una propuesta del audio.')
        let salida = recibido
        for (let i = 0; i < pendientes.pasos.length; i++) {
          const aceptar = botones(salida).find(x => x.includes('|si='))
          assert(aceptar, textos(salida))
          salida = await boton(v1, aceptar)
        }
        const [final] = await admin`select op.agua::text,op.novedad from observacion_potrero op
          join recorrida r on r.id=op.recorrida_id where r.empresa_id=${E1} and r.fecha=${hoy} and op.potrero_id=${P9}`
        assert(final?.agua === 'baja' && final.novedad?.includes(reporte) && final.novedad.includes('Cayó un dron')
          && !final.novedad.includes(sinInterpretar), JSON.stringify(final))
        assert((await admin`select 1 from lluvia where empresa_id=${E1} and fecha=${hoy} and mm=19`).length === 1,
          'Se perdió la lluvia del mismo audio.')
        assert(JSON.stringify(await admin`select id, estado from animal where empresa_id=${E1} order by id`) === JSON.stringify(stock),
          'Un aviso de mortandad alteró Hacienda.')
      } finally {
        interpretarComo = null
        transcripcionQA = ''
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${V1}`
        await admin`delete from lluvia where empresa_id=${E1} and fecha=${hoy} and mm=19`
        await admin`delete from observacion_potrero where potrero_id=${P9} and recorrida_id in
          (select id from recorrida where empresa_id=${E1} and fecha=${hoy})`
      }
    })

    await test('Asistente de recorrida: audio, stock exacto, corrección parcial y confirmaciones idempotentes', async () => {
      const potrero12 = id(801)
      const otroCampo = id(802)
      const animales12 = [id(803), id(804), id(805)]
      const hoy = hoyAR()
      await admin`insert into campo values (${otroCampo},${E1},'Otro campo QA')`
      await admin`insert into potrero (id,empresa_id,campo_id,nombre,poligono) values
        (${potrero12},${E1},${C1},'12B',${admin.json(pol8)})`
      for (const animal of animales12) {
        await admin`insert into animal (id,empresa_id,potrero_id,estado) values (${animal},${E1},${potrero12},'activo')`
      }
      const observacion = 'En el 12B vi el bebedero bajo y el pasto escaso'
      const consulta = '¿Cuántos animales tengo ahí?'
      const lluvia = 'De paso, anotá 15 mm'
      try {
        transcripcionQA = `${observacion}. ${consulta} ${lluvia}.`
        interpretarComo = { pedidos: [
          { intent: 'novedad', fragmento: observacion, observaciones: [{ potrero: '12B', agua: 'baja', pasto: 'escaso' }] },
          { intent: 'consulta_hacienda', fragmento: consulta, potrero: null, campo: null },
          { intent: 'lluvia', fragmento: lluvia, mm: 15, campo: null },
        ] }
        const recibido = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
        const original = botones(recibido).find(b => b.includes('|si='))
        assert(original && textos(recibido).includes('3 cabezas') && textos(recibido).includes('12B de La Porteña')
          && textos(recibido).includes('aguada baja, pasto escaso') && textos(recibido).includes('15 mm'), textos(recibido))
        const antes = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(antes?.tipo === 'turno' && antes.pasos.length === 2 && antes.pasos[1].pendiente.borrador.campoId === C1,
          'La lluvia y la recorrida deben quedar para confirmar en el campo resuelto del audio.')

        interpretarComo = null
        const lluviaPrimero = await texto(v1, 'siguiente pendiente')
        const botonLluvia = botones(lluviaPrimero).find(b => b.includes('|si='))
        assert(botonLluvia && textos(lluviaPrimero).includes('15 mm en La Porteña'), textos(lluviaPrimero))
        const corregida = await texto(v1, 'Lo del bebedero era en el 9B')
        const botonRecorrida = botones(corregida).find(b => b.includes('|si='))
        assert(botonRecorrida && botonRecorrida !== original && textos(corregida).includes('del 12B al 9B'), textos(corregida))
        const luego = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(luego?.tipo === 'turno' && JSON.stringify(luego.pasos[1]) === JSON.stringify(antes.pasos[1]),
          'Corregir el agua modificó el borrador o el botón de lluvia.')
        assert(luego.pasos[0].pendiente.borrador.observaciones?.some(o => o.potreroId === P9 && o.agua === 'baja')
          && luego.pasos[0].pendiente.borrador.observaciones?.some(o => o.potreroId === potrero12 && o.pasto === 'escaso' && o.agua === null),
          'La corrección debe mover sólo el agua.')

        const observacionesGuardadas = () => admin`select op.potrero_id, op.agua::text, op.pasto::text
          from observacion_potrero op join recorrida r on r.id=op.recorrida_id
          where r.empresa_id=${E1} and r.fecha=${hoy} and op.potrero_id in (${potrero12},${P9}) order by op.potrero_id`
        const antesGuardar = JSON.stringify(await observacionesGuardadas())
        await boton(v1, original)
        assert(JSON.stringify(await observacionesGuardadas()) === antesGuardar, 'Se guardó con un botón anterior a la corrección.')
        assert(!(await admin`select 1 from lluvia where empresa_id=${E1} and mm=15 and fecha=${hoy}`).length, 'Se guardó lluvia antes de confirmarla.')

        const sigue = await boton(v1, botonRecorrida)
        assert(botones(sigue).includes(botonLluvia), textos(sigue))
        const filas = await observacionesGuardadas()
        assert(filas.some(o => o.potrero_id === P9 && o.agua === 'baja')
          && filas.some(o => o.potrero_id === potrero12 && o.pasto === 'escaso' && o.agua === null), JSON.stringify(filas))
        await boton(v1, botonRecorrida)
        assert(JSON.stringify(await observacionesGuardadas()) === JSON.stringify(filas), 'Repetir el botón cambió la recorrida.')
        await boton(v1, botonLluvia)
        await boton(v1, botonLluvia)
        const guardadas = await admin`select campo_id from lluvia where empresa_id=${E1} and mm=15 and fecha=${hoy}`
        assert(guardadas.length === 1 && guardadas[0].campo_id === C1, 'La lluvia debe guardarse una sola vez en el campo original.')
        assert(!(await db.vinculoDe(v1.telefono))?.pendiente, 'Quedó un pendiente después de confirmar las dos cargas.')
      } finally {
        interpretarComo = null
        transcripcionQA = ''
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${V1}`
        await admin`delete from lluvia where empresa_id=${E1} and mm=15 and fecha=${hoy}`
        await admin`delete from observacion_potrero where potrero_id in (${potrero12},${P9})
          and recorrida_id in (select id from recorrida where empresa_id=${E1} and fecha=${hoy})`
        await admin`delete from animal where potrero_id=${potrero12}`
        await admin`delete from potrero where id=${potrero12}`
        await admin`delete from campo where id=${otroCampo}`
      }
    })

    await test('Asistente de recorrida: «ahí» sin referencia pide potrero y queda listo para continuar', async () => {
      try {
        interpretarComo = { intent: 'consulta_hacienda', campo: null, potrero: null }
        const pregunta = await texto(v1, '¿Cuántos animales tengo ahí?')
        assert(textos(pregunta).includes('En qué potrero') && !textos(pregunta).includes('en total'), textos(pregunta))
        interpretarComo = null
        const respuesta = await texto(v1, '9B')
        assert(textos(respuesta).includes('2 cabezas') && textos(respuesta).includes('9B de La Porteña'), textos(respuesta))
        assert(!(await db.vinculoDe(v1.telefono))?.pendiente, 'La consulta llegó al resultado y el pendiente tiene que cerrarse.')
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${V1}`
      }
    })

    await test('Charla diaria: un saludo después del mapa abre un intercambio nuevo', async () => {
      const vista = await texto(v1, 'Acercá el 9B')
      assert(vista.some(m => m.type === 'image'), textos(vista))
      try {
        interpretarComo = { intent: 'saludo' }
        redactarComo = datos => datos.historial.length
          ? '¡Hola! El potrero 9B no lo puedo acercar desde acá.'
          : '¡Hola! ¿Todo bien?'
        const saludo = await texto(v1, 'Hola')
        assert(saludo.length === 1 && textos(saludo) === '¡Hola! ¿Todo bien?', textos(saludo))
      } finally {
        interpretarComo = null
        redactarComo = null
      }
    })

    await test('Charla diaria: pedir el satélite y qué hay dentro entrega imagen y stock del mismo potrero', async () => {
      for (const pedido of ['Quiero ver el potrero 9b con el satélite y saber que tengo ahí adentro',
        'Mostrame el potrero 9B con satélite y decime qué hay adentro']) {
        const salida = await texto(v1, pedido)
        const imagen = salida.find(m => m.type === 'image')
        assert(imagen?.image?.caption.includes('Detalle de 9B'), textos(salida))
        assert(imagen?.image?.caption.includes('no pude obtener la imagen satelital'), 'Esri está simulado en 503: debe informar el respaldo.')
        const stock = salida[0]
        assert(stock?.type === 'text' && stock.text?.body.includes('2 cabezas') && stock.text.body.includes('9B'),
          'La consulta de Hacienda debe salir antes de esperar la foto. ' + textos(salida))
        assert(!botones(salida).length, 'Una doble consulta terminó en una propuesta.')
      }
    })

    await test('Charla diaria: «potrero o campo entero» entrega una sola vista y conserva los pedidos con «y»', async () => {
      const sinDibujo = id(34)
      await admin`insert into potrero (id,empresa_id,campo_id,nombre) values (${sinDibujo},${E1},${C1},'10C')`
      try {
        for (const [potrero, conector, esperadas, pie] of [
          ['9B', 'o', 1, 'Detalle de 9B'],
          ['10C', 'o', 1, 'Te muestro La Porteña'],
          ['91X', 'o', 1, 'Te muestro La Porteña'],
          ['9B', 'y', 2, 'Detalle de 9B'],
        ] as const) {
          const alternativa = conector + ' mandarme todo el campo La Porteña?'
          transcripcionQA = 'Hola, ¿me pueden mandar el potrero ' + potrero + ' en el campo La Porteña ' + alternativa
          interpretarComo = { pedidos: [
            { intent: 'consulta_mapa', fragmento: transcripcionQA, campo: 'La Porteña', potrero },
            { intent: 'consulta_mapa', fragmento: alternativa, campo: 'La Porteña' },
          ] }
          const salida = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
          assert(salida.filter(m => m.type === 'image').length === esperadas, textos(salida))
          assert(salida.find(m => m.type === 'image')?.image?.caption.includes(pie), textos(salida))
        }
      } finally {
        await admin`delete from potrero where id=${sinDibujo}`
        interpretarComo = null
        transcripcionQA = ''
      }
    })

    await test('Charla diaria: preguntar qué campos tenemos devuelve nombres propios', async () => {
      try {
        interpretarComo = { intent: 'ayuda_general' }
        for (const pregunta of ['Qué campos tenemos ?', '¿Cuáles son mis campos?', 'Mostrame los campos que tenemos']) {
          const respuesta = textos(await texto(v1, pregunta))
          assert(respuesta.includes('La Porteña') && !respuesta.includes('Campo Ajeno')
            && !respuesta.includes('Mandame un audio'), respuesta)
        }
      } finally {
        interpretarComo = null
      }
    })

    await test('Pedidos de mapa y PDF salen del pendiente y la aclaración vuelve al adjunto', async () => {
      const campo = 'La Porteña'
      const lluvia = 'Anotá 24 mm en La Porteña'
      const gasto = 'Pagué gasoil en La Porteña'
      try {
        interpretarComo = { pedidos: [
          { intent: 'lluvia', fragmento: lluvia, campo, mm: 24 },
          { intent: 'gasto', fragmento: gasto, campo },
        ] }
        await texto(v1, `${lluvia}. ${gasto}.`)
        const antes = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(antes?.tipo === 'turno')
        interpretarComo = null
        for (const pedido of ['Mostrarme el campo', 'No me podes mostrar los potreros ?']) {
          const mapa = await texto(v1, pedido)
          assert(mapa.some(m => m.type === 'image') || textos(mapa).includes('No pude enviar el mapa'), textos(mapa))
          assert(!textos(mapa).includes('¿Los guardo?'), textos(mapa))
        }
        const natural = await texto(v1, 'Me mostras el campo la porteña por favor')
        assert(natural.some(m => m.type === 'image'), textos(natural))
        const pedidoVisual = 'Quiero tener a la vista La Porteña entera'
        const pedidoLluvia = '¿Cuánto llovió la semana pasada?'
        interpretarComo = { pedidos: [
          { intent: 'consulta_mapa', fragmento: pedidoVisual, campo },
          { intent: 'consulta_lluvia', fragmento: pedidoLluvia, campo, periodo: 'semana' },
        ] }
        const mixto = await texto(v1, pedidoVisual + '. ' + pedidoLluvia)
        assert(mixto.some(m => m.type === 'image') && textos(mixto).includes('Lluvia'), textos(mixto))
        interpretarComo = null
        const pdf = textos(await firmar(v1, { type: 'document', document: { id: 'qa-factura', filename: 'factura.pdf', mime_type: 'application/pdf' } }))
        assert(pdf.includes('Leí la factura 00001-00000023 de Veterinaria QA') && pdf.includes('$12.100,00') && !pdf.includes('¿Los guardo?'), pdf)
        const aclaracion = textos(await texto(v1, 'Eso es una factura'))
        assert(aclaracion === pdf, aclaracion)
        assert(JSON.stringify((await db.vinculoDe(v1.telefono))?.pendiente) === JSON.stringify(antes), 'El documento modificó la propuesta.')
      } finally {
        interpretarComo = null
        await admin`update wa_vinculo set pendiente=null, pendiente_at=null where id=${v1.id}`
      }
    })

    await test('PDF reenviado y audio vacío: explicar cómo seguir y conservar la propuesta', async () => {
      try {
        interpretarComo = { intent: 'lluvia', mm: 24, fecha: hoyAR(), campo: 'La Porteña' }
        await texto(v1, 'Anotá 24 mm en La Porteña')
        const antes = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(antes?.tipo === 'propuesta', 'Falta la propuesta de lluvia.')
        const pdf = textos(await firmar(v1, { type: 'document', document: { id: 'qa-pdf', filename: 'factura.pdf', mime_type: 'application/pdf' } }))
        const audio = textos(await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } }))
        assert(pdf.includes('No pude abrir el PDF') && audio.includes('¿Me lo escribís?'), `PDF: ${pdf}. Audio: ${audio}`)
        assert(JSON.stringify((await db.vinculoDe(v1.telefono))?.pendiente) === JSON.stringify(antes), 'Se perdió la propuesta.')
        assert(!(await admin`select 1 from lluvia where empresa_id=${E1} and mm=24`).length, 'Se guardó lluvia sin confirmación.')
      } finally {
        interpretarComo = null
        await texto(v1, 'cancelar')
      }
    })

    await test('Dos mensajes juntos y reenvío de Meta: confirmar en orden y una sola vez', async () => {
      try {
        interpretarComo = { intent: 'lluvia', mm: 26, fecha: hoyAR(), campo: 'La Porteña' }
        const juntos = ['Anotá 26 mm en La Porteña', 'sí'].map(body => ({
          id: 'qa-' + crypto.randomUUID(), from: v1.telefono, type: 'text', text: { body },
        }))
        const primera = await enviarFirmado(juntos)
        const reenvio = await enviarFirmado(juntos)
        assert(primera.status === 200 && primera.mensajes.length >= 2, textos(primera.mensajes))
        assert(reenvio.status === 200 && !reenvio.mensajes.length, 'Reenviar el lote provocó otra respuesta.')
        assert((await admin`select 1 from lluvia where empresa_id=${E1} and mm=26`).length === 1, 'El lote duplicó o perdió el dato.')
      } finally {
        interpretarComo = null
        await texto(v1, 'cancelar')
        await admin`delete from lluvia where empresa_id=${E1} and mm=26`
      }
    })

    await test('Falla al guardar un mensaje de un lote: Meta puede reenviarlo sin duplicar lo recibido', async () => {
      const falla = { id: 'qa-forzar-fallo', from: v1.telefono, type: 'text', text: { body: 'ayuda' } }
      const bien = { ...falla, id: 'qa-' + crypto.randomUUID() }
      await admin`alter table wa_mensaje add constraint qa_ingreso check (wamid <> 'qa-forzar-fallo')`
      let primera
      try {
        primera = await enviarFirmado([bien, falla])
      } finally {
        await admin`alter table wa_mensaje drop constraint qa_ingreso`
      }
      assert(primera.status === 503 && primera.mensajes.length === 1,
        `Recibió HTTP ${primera.status} aunque uno de los mensajes nunca quedó en la base.`)
      const reenvio = await enviarFirmado([bien, falla])
      assert(reenvio.status === 200 && reenvio.mensajes.length === 1, 'El reintento no procesó sólo lo que faltaba.')
      assert((await admin`select 1 from wa_mensaje where wamid in (${falla.id},${bien.id})`).length === 2, 'Falta un mensaje de la entrega.')
    })

    await test('Si se pierde la carga nueva de un lote, el «sí» no confirma el borrador anterior', async () => {
      try {
        interpretarComo = { intent: 'lluvia', mm: 17, fecha: hoyAR(), campo: 'La Porteña' }
        await texto(v1, 'Anotá 17 mm en La Porteña')
        const antes = (await db.vinculoDe(v1.telefono))?.pendiente
        assert(antes?.tipo === 'propuesta', 'Falta el borrador anterior.')
        interpretarComo = { intent: 'lluvia', mm: 27, fecha: hoyAR(), campo: 'La Porteña' }
        const lote = [
          { id: 'qa-carga-fallida', from: v1.telefono, type: 'text', text: { body: 'Anotá 27 mm en La Porteña' } },
          { id: 'qa-si-despues-de-fallo', from: v1.telefono, type: 'text', text: { body: 'sí' } },
          { id: 'qa-ayuda-otro-numero', from: v2.telefono, type: 'text', text: { body: 'ayuda' } },
        ]
        await admin`alter table wa_mensaje add constraint qa_carga_fallida check (wamid <> 'qa-carga-fallida')`
        let entrega
        try {
          entrega = await enviarFirmado(lote)
        } finally {
          await admin`alter table wa_mensaje drop constraint qa_carga_fallida`
        }
        assert(entrega.status === 503, 'El lote incompleto se aceptó.')
        assert(!(await admin`select 1 from lluvia where empresa_id=${E1} and mm in (17,27)`).length,
          'El «sí» guardó la propuesta de 17 mm que era de antes del lote.')
        assert(entrega.mensajes.length === 1 && entrega.mensajes[0].to === v2.telefono,
          'La falla no debía bloquear al otro número ni responder al número que tenía mensajes pendientes.')
        assert(JSON.stringify((await db.vinculoDe(v1.telefono))?.pendiente) === JSON.stringify(antes),
          'Una entrega incompleta cambió el borrador anterior.')
        const reenvio = await enviarFirmado(lote)
        const lluvias = await admin`select mm::float8 from lluvia where empresa_id=${E1} and mm in (17,27)`
        assert(reenvio.status === 200 && lluvias.length === 1 && lluvias[0].mm === 27,
          'El reintento debía guardar una sola medición de 27 mm.')
        assert(!reenvio.mensajes.some(m => m.to === v2.telefono), 'El reintento volvió a responder al otro número.')
      } finally {
        interpretarComo = null
        await texto(v1, 'cancelar')
        await admin`delete from lluvia where empresa_id=${E1} and mm in (17,27)`
      }
    })

    await test('Un campo desconocido no se transforma en una consulta de toda la empresa', async () => {
      try {
        interpretarComo = { intent: 'consulta_hacienda', campo: 'Campo Ajeno' }
        const consulta = await texto(v1, '¿Cuántas cabezas hay en Campo Ajeno?')
        assert(textos(consulta).includes('No encontré el campo') && !textos(consulta).includes('cabezas*'),
          'Respondió con stock fuera del alcance pedido.')
      } finally {
        interpretarComo = null
      }
    })

    await test('Una recorrida corregida a anteayer conserva la fecha y bloquea la tarjeta anterior', async () => {
      const dia = sumarDias(hoyAR(), -2)
      try {
        interpretarComo = { intent: 'novedad', campo: 'La Porteña', fecha: sumarDias(hoyAR(), -1), observaciones: [{ potrero: '9B', novedad: 'molino revisado en QA' }] }
        const viejo = botones(await texto(v1, 'Ayer recorrí el 9B y revisé el molino')).find(x => x.includes('|si='))
        interpretarComo = null
        const actual = botones(await texto(v1, 'Fue anteayer')).find(x => x.includes('|si='))
        assert(viejo && actual && actual !== viejo, 'Corregir la fecha no reemplazó la confirmación.')
        assert(textos(await boton(v1, viejo!)).includes('propuesta anterior'), 'El botón de ayer todavía escribe.')
        const confirmado = await boton(v1, actual!)
        assert(textos(confirmado).includes('Guardé la recorrida'), 'No confirmó la fecha corregida.')
        const fechas = await admin`select r.fecha::text as fecha from observacion_potrero o join recorrida r on r.id=o.recorrida_id
          where o.empresa_id=${E1} and o.novedad='molino revisado en QA'`
        assert(fechas.length === 1 && fechas[0].fecha === dia, 'La observación quedó en otra fecha o se duplicó.')
      } finally {
        interpretarComo = null
        await admin`delete from observacion_potrero where empresa_id=${E1} and novedad='molino revisado en QA'`
      }
    })

    await test('Si el intérprete falla al corregir, el importe anterior no se confirma', async () => {
      interpretarComo = { intent: 'lluvia', mm: 11, fecha: hoyAR(), campo: 'La Porteña' }
      const primero = await texto(v1, 'Anotá 11 mm en La Porteña')
      const viejo = botones(primero).find(x => x.includes('|si='))
      assert(viejo, 'Falta la propuesta de lluvia inicial.')
      interpretarComo = null
      const error = await texto(v1, 'Sí, pero eran 35')
      assert(textos(error).includes('Probá más tarde'), 'Falta una salida clara cuando falla el intérprete.')
      await boton(v1, viejo!)
      assert(!(await admin`select 1 from lluvia where empresa_id=${E1}`).length, 'Se guardó una cantidad que el productor estaba corrigiendo.')
      const no = await texto(v1, 'cancelar')
      assert(textos(no).includes('no anoto nada'), 'El productor no pudo descartar la corrección.')
    })

    await test('Cuánto llovió consulta el pluviómetro con el intérprete en 401', async () => {
      const hoy = hoyAR()
      const lluvias = [id(301), id(302), id(303)]
      const inicial = await texto(v1, '¿Cuánto llovió este mes?')
      assert(textos(inicial).includes('sin mediciones registradas'), 'Un mes sin datos se mostró como cero.')
      await admin`insert into lluvia (id,empresa_id,campo_id,fecha,mm,fuente) values
        (${lluvias[0]},${E1},${C1},${hoy},12,'manual'),
        (${lluvias[1]},${E1},${C1},${hoy},1000,'estimada'),
        (${lluvias[2]},${E2},${C2},${hoy},99,'manual')`
      try {
        const respuesta = textos(await texto(v1, 'Cuánto llovió'))
        assert(respuesta.includes('La Porteña') && respuesta.includes('12 mm'), 'La respuesta no leyó la medición.')
        assert(!/1000|99 mm|Campo Ajeno|No pude procesar/.test(respuesta), 'Incluyó datos ajenos, estimados o devolvió el error genérico.')
      } finally {
        await admin`delete from lluvia where id in ${admin(lluvias)}`
      }
    })

    await test('Una consulta de lluvia sale de la recorrida y su Sí anterior deja de guardar', async () => {
      const ayer = sumarDias(hoyAR(), -1)
      const mediciones = [id(304), id(305)]
      await admin`insert into lluvia (id,empresa_id,campo_id,fecha,mm,fuente) values
        (${mediciones[0]},${E1},${C1},${ayer},7,'manual'),
        (${mediciones[1]},${E1},${C1},${hoyAR()},11,'manual')`
      const [antes] = await admin`select count(*)::int as n from observacion_potrero`
      try {
        interpretarComo = { intent: 'novedad', campo: 'La Porteña', fecha: ayer, observaciones: [{ potrero: '9B', novedad: 'molino roto' }] }
        const propuesta = await texto(v1, 'Ayer en La Porteña recorrí el 9B y encontré el molino roto')
        const aceptar = botones(propuesta).find(x => x.includes('|si='))
        assert(aceptar, 'Falta la propuesta inicial de recorrida.')
        interpretarComo = null

        interpretarComo = { intent: 'consulta_hacienda', campo: 'La Porteña' }
        transcripcionQA = 'Che, ¿y cuántos ovidos hacés? En La Porteña.'
        const antesDeCorregir = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
        assert(textos(antesDeCorregir).includes('¿Me la repetís en otro audio o por texto?'),
          'Una transcripción dudosa mostró stock en vez de pedir aclaración.')
        assert((await db.vinculoDe(v1.telefono))?.pendiente?.tipo === 'propuesta',
          'La consulta dudosa cambió el borrador original.')
        interpretarComo = null

        const primero = textos(await texto(v1, 'No es una recorrida, quiero saber cuánto llovió en La Porteña'))
        assert(primero.includes('Dejé la recorrida pendiente de revisar') && primero.includes('Lluvia medida en ') && primero.includes('La Porteña'),
          'El mensaje escrito sin fecha debe consultar el mes y pausar la recorrida.')
        transcripcionQA = 'No es una recorrida. Te estoy preguntando si sabés cuántos llovió ayer en La Porteña. ¿Tenés idea?'
        const audio = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
        assert(textos(audio).includes('El pluviómetro de *La Porteña* marcó *7 mm* ayer.')
          && !textos(audio).includes('18 mm'), 'El audio de ayer devolvió un acumulado incorrecto.')
        assert(textos(await texto(v1, 'Cuánto llovió ayer en Campo Ajeno')).includes('No encontré un campo único'),
          'Un campo ajeno amplió la consulta.')
        const viejo = await boton(v1, aceptar!)
        assert(textos(viejo).includes('propuesta anterior'), 'El botón anterior siguió confirmando.')
        const [despues] = await admin`select count(*)::int as n from observacion_potrero`
        assert(despues.n === antes.n, 'La consulta o el botón viejo escribió una observación.')

        interpretarComo = { intent: 'consulta_hacienda', campo: 'La Porteña' }
        transcripcionQA = 'Che, ¿y cuántos ovidos hacés? En La Porteña.'
        const dudoso = await firmar(v1, { type: 'audio', audio: { id: 'qa-audio' } })
        assert(textos(dudoso).includes('¿Me la repetís en otro audio o por texto?') && !textos(dudoso).includes('cabezas'),
          'El audio ambiguo tiene que pedir que repitan la pregunta sin sugerir un tema ni devolver stock.')
        const retomar = await texto(v1, 'retomar recorrida')
        const cancelar = botones(retomar).find(x => x.includes('|cancelar='))
        assert(cancelar && textos(retomar).includes('molino roto'), 'Se perdió el borrador de la recorrida.')
        await boton(v1, cancelar!)
      } finally {
        interpretarComo = null
        transcripcionQA = ''
        await admin`delete from lluvia where id in ${admin(mediciones)}`
      }
    })

    await admin`insert into miembro_empresa values (${U1},${E2})`
    await admin`delete from miembro_empresa where user_id=${U1} and empresa_id=${E1}`
    try {
      const wamid = 'qa-revocado-' + crypto.randomUUID()
      const revocado = await firmar(v1, { id: wamid, type: 'text', text: { body: 'Mensaje privado tras retirar el acceso' } })
      assert(textos(revocado).includes('Tu número no está vinculado'), 'Reconoció un número sin acceso a la empresa')
      const [entrada] = await admin`select cuerpo, empresa_id, vinculo_id from wa_mensaje
        where wamid=${wamid} and telefono=${v1.telefono} and direccion='entrante'`
      assert(entrada?.cuerpo.sin_vincular === true && !entrada.cuerpo.text
        && entrada.empresa_id === null && entrada.vinculo_id === null,
        'Guardó el contenido privado o lo asoció a la empresa revocada')
    } finally {
      await admin`insert into miembro_empresa values (${U1},${E1})`
      await admin`delete from miembro_empresa where user_id=${U1} and empresa_id=${E2}`
    }

    // Apagado (como en producción hasta que la app muestre los tipos nuevos): sólo molino y tranquera.
    Deno.env.delete('WA_INFRA_TIPOS_NUEVOS')
    let out = await ubic(v1, -36.005, -59.285)
    assert(!botones(out).includes('inf:tipo=tanque') && botones(out).includes('inf:tipo=molino'), 'Ofreció un tipo que la app no muestra')
    out = await texto(v1, 'tanque australiano')
    assert(textos(out).includes('Por ahora puedo cargar molinos y tranqueras') && (await admin`select 1 from infraestructura`).length === 0)
    out = await texto(v1, 'eléctrico entre el 8B y el 9B')
    assert(textos(out).includes('Por ahora'), 'Propuso un eléctrico con los tipos nuevos apagados')
    Deno.env.set('WA_INFRA_TIPOS_NUEVOS', 'true')
    out = await ubic(v1, -36.005, -59.285)
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

    // Sin señal: la palabra puede llegar antes que la ubicación.
    out = await texto(v1, 'bebedero grande')
    assert(textos(out).includes('Mandame la ubicación del bebedero grande') && !out.some(o => o.type === 'image'), textos(out))
    out = await ubic(v1, -36.006, -59.284)
    assert(out.some(o => o.type === 'image') && textos(out).includes('bebedero grande del 9B'), 'La ubicación tardía no completó la carga: ' + textos(out))
    out = await boton(v1, botones(out).find(b => b.startsWith('inf:si='))!)
    const [beb] = await admin`select apodo from infraestructura where tipo='bebedero'`
    assert(beb?.apodo === 'grande', 'No guardó el bebedero')
    const [cap] = await admin`select entrada, texto from captura where escrito_tabla='infraestructura' order by created_at desc limit 1`
    assert(cap.entrada === 'texto' && cap.texto === 'bebedero grande', 'La captura perdió lo que dijo')

    out = await texto(v2, 'borrá el tanque del 9B')
    assert(!botones(out).some(b => b.startsWith('inf:borrar=')) && (await admin`select 1 from infraestructura where tipo='tanque'`).length === 1, 'Otra empresa pudo pedir la baja')
    out = await texto(v1, 'tanque australiano')
    assert(!out.some(o => o.type === 'image'), 'Sin ubicación reciente no debía proponer una carga')
    await texto(v1, 'cancelar')

    const proponerMolino = async (apodo: string) => {
      await ubic(v1, -36.005, -59.285)
      const propuesta = await texto(v1, `molino ${apodo}`)
      const guardar = botones(propuesta).find(b => b.startsWith('inf:si='))!
      assert(guardar, 'No propuso el molino')
      return { guardar, captura: guardar.split('=')[1] }
    }
    const capturaDe = async (captura: string) => (await admin`select estado,escrito_id from captura where id=${captura}`)[0]

    await test('Un INSERT fallido conserva la propuesta y el reintento realmente guarda', async () => {
      const p = await proponerMolino('reintento')
      await admin.unsafe("create function qa_falla_infra() returns trigger language plpgsql as $$ begin raise exception 'Fallo local de INSERT'; end $$; create trigger qa_falla_infra before insert on infraestructura for each row execute function qa_falla_infra()")
      try { await boton(v1, p.guardar) } finally { await admin.unsafe('drop trigger qa_falla_infra on infraestructura; drop function qa_falla_infra()') }
      assert((await capturaDe(p.captura)).estado === 'propuesta', 'Confirmó una escritura que falló')
      assert((await admin`select 1 from infraestructura where apodo='reintento'`).length === 0)
      const segundo = await boton(v1, p.guardar)
      assert(textos(segundo).includes('Listo, guardé') && (await admin`select 1 from infraestructura where apodo='reintento'`).length === 1, textos(segundo))
      await boton(v1, p.guardar)
      assert((await admin`select 1 from infraestructura where apodo='reintento'`).length === 1)
    })
    await test('Si falla el registro de confirmación también se revierte el elemento', async () => {
      const p = await proponerMolino('atomico')
      await admin.unsafe("create function qa_falla_captura() returns trigger language plpgsql as $$ begin if new.escrito_tabla='infraestructura' then raise exception 'Fallo local de confirmación'; end if; return new; end $$; create trigger qa_falla_captura before update on captura for each row execute function qa_falla_captura()")
      try { await boton(v1, p.guardar) } finally { await admin.unsafe('drop trigger qa_falla_captura on captura; drop function qa_falla_captura()') }
      assert((await admin`select 1 from infraestructura where apodo='atomico'`).length === 0, 'Quedó el elemento sin confirmación')
      assert((await capturaDe(p.captura)).estado === 'propuesta')
      await boton(v1, p.guardar)
      assert((await admin`select 1 from infraestructura where apodo='atomico'`).length === 1)
    })
    await test('Un DELETE fallido no anuncia una baja y permite reintentar', async () => {
      await texto(v1, 'borrá el molino reintento del 9B')
      const p = (await db.vinculoDe(v1.telefono))!.pendiente as { capturaId: string }
      assert(p?.capturaId)
      await admin.unsafe("create function qa_falla_baja() returns trigger language plpgsql as $$ begin raise exception 'Fallo local de DELETE'; end $$; create trigger qa_falla_baja before delete on infraestructura for each row execute function qa_falla_baja()")
      try { await boton(v1, `inf:borrar=${p.capturaId}`) } finally { await admin.unsafe('drop trigger qa_falla_baja on infraestructura; drop function qa_falla_baja()') }
      assert((await capturaDe(p.capturaId)).estado === 'propuesta')
      assert((await admin`select 1 from infraestructura where apodo='reintento'`).length === 1)
      const segundo = await boton(v1, `inf:borrar=${p.capturaId}`)
      assert(textos(segundo).includes('Listo, borré') && (await admin`select 1 from infraestructura where apodo='reintento'`).length === 0)
      assert(textos(await boton(v1, `inf:borrar=${p.capturaId}`)).includes('ya se borró'))
    })
    await test('Ayuda, consultas y falla de IA conservan la propuesta de infraestructura', async () => {
      const p = await proponerMolino('pendiente')
      for (const consulta of ['ayuda', 'resumen semanal', 'tareas', 'soporte', 'mapa', 'cuánto llovió']) {
        await texto(v1, consulta)
        const pendiente = (await db.vinculoDe(v1.telefono))!.pendiente as { capturaId: string }
        assert(pendiente?.capturaId === p.captura && (await capturaDe(p.captura)).estado === 'propuesta', `Perdió la propuesta al pedir ${consulta}`)
      }
      interpretarComo = { intent: 'consulta_gastos', campo: 'La Porteña', periodo: 'semana' }
      try { await texto(v1, 'cuánto gasté esta semana') } finally { interpretarComo = null }
      assert(((await db.vinculoDe(v1.telefono))!.pendiente as { capturaId: string })?.capturaId === p.captura, 'La consulta respondió pero descartó infraestructura')
      await texto(v1, 'cuánto gasté esta semana') // La red de IA está bloqueada en este fixture.
      assert(((await db.vinculoDe(v1.telefono))!.pendiente as { capturaId: string })?.capturaId === p.captura)
      assert((await capturaDe(p.captura)).estado === 'propuesta')
      assert(textos(await boton(v1, p.guardar)).includes('Listo, guardé'))
    })
    await test('Confirmaciones concurrentes no duplican y otro vínculo no puede confirmar', async () => {
      const p = await proponerMolino('concurrente')
      await boton(v2, p.guardar)
      assert((await capturaDe(p.captura)).estado === 'propuesta')
      await Promise.all([boton(v1, p.guardar), boton(v1, p.guardar)])
      assert((await admin`select 1 from infraestructura where apodo='concurrente'`).length === 1)
      assert((await capturaDe(p.captura)).escrito_id)
      const dos = await proponerMolino('dos consumidores')
      // Saltea Turnos del isolate para simular dos consumidores distintos de la base.
      const resultados = await Promise.all([db.confirmarInfra(v1, dos.captura, 'guardar'), db.confirmarInfra(v1, dos.captura, 'guardar')])
      assert(resultados.includes('guardada') && resultados.includes('ya_guardada'))
      assert((await admin`select 1 from infraestructura where apodo='dos consumidores'`).length === 1)
    })
    await test('Un envío fallido después del commit no duplica al reintentar', async () => {
      const p = await proponerMolino('entrega')
      fallarRespuesta = true
      try { await boton(v1, p.guardar) } finally { fallarRespuesta = false }
      assert((await capturaDe(p.captura)).escrito_id && (await admin`select 1 from infraestructura where apodo='entrega'`).length === 1)
      assert(textos(await boton(v1, p.guardar)).includes('ya está guardado'))
      assert((await admin`select 1 from infraestructura where apodo='entrega'`).length === 1)
    })
    await test('Permisos por persona de Tropero: lectura, Solo manda, cuenta vinculada y baja de permiso', async () => {
      const niveles = (campos: string) => admin.json({ campos, hacienda: 'no', plata: 'no' })
      await admin`update wa_vinculo set pendiente=null,pendiente_at=null where id=${V1}`
      const hoy = hoyAR()
      try {
        await admin`insert into miembro_empresa(user_id,empresa_id,rol,niveles,acceso) values
          (${U1},${E2},'dueno',null,'app')`
        await admin`update miembro_empresa set rol='Ingeniero QA',niveles=${niveles('ve')},acceso='app'
          where user_id=${U1} and empresa_id=${E1}`
        const cuenta = await db.comoUsuario(v1, tx => tx<{ id: string }[]>`select auth_empresa_ids() as id`)
        assert(cuenta.length === 1 && cuenta[0].id === E1, 'El encabezado del vínculo no eligió exclusivamente su empresa.')
        const mapa = await texto(v1, 'Mostrame el campo La Porteña')
        assert(mapa.some(x => x.type === 'image'), textos(mapa))
        assert((await db.datosMapa(v1, C1, false))?.potreros.every(p => p.cabezas === undefined), 'El mapa conserva datos de Hacienda que no corresponden.')
        interpretarComo = { intent: 'consulta_hacienda', campo: 'La Porteña' }
        const hacienda = textos(await texto(v1, '¿Cuántos animales hay?'))
        assert(hacienda.includes('Tu acceso a Hacienda no permite'), hacienda)
        interpretarComo = { intent: 'consulta_vencimientos' }
        assert(textos(await texto(v1, '¿Qué tengo que pagar?')).includes('Plata y Agenda'))
        interpretarComo = { intent: 'lluvia', mm: 71, campo: 'La Porteña', fecha: hoy }
        const lectura = await texto(v1, 'Anotá 71 mm en La Porteña')
        assert(!botones(lectura).length && textos(lectura).includes('no permite registrar'), textos(lectura))

        await admin`update miembro_empresa set rol='Empleado QA',niveles=${niveles('solo_manda')},acceso='whatsapp'
          where user_id=${U1} and empresa_id=${E1}`
        const consultaAjena = await texto(v1, '¿Cuánto llovió ayer?')
        assert(textos(consultaAjena).includes('no permite esa consulta'), textos(consultaAjena))
        const sinMapa = await texto(v1, 'Mostrame el campo La Porteña')
        assert(!sinMapa.some(x => x.type === 'image') && textos(sinMapa).includes('Tu acceso a Campos'), textos(sinMapa))
        const propuesta = await texto(v1, 'Anotá 71 mm en La Porteña')
        const aceptar = botones(propuesta).find(id => id.includes('|si'))
        assert(aceptar, textos(propuesta))
        const guardada = textos(await boton(v1, aceptar))
        assert(guardada.includes('71 mm') && !/acumulad|este mes|año pasado/i.test(guardada), guardada)
        assert((await admin`select id from lluvia where empresa_id=${E1} and campo_id=${C1} and mm=71`).length === 1)
        interpretarComo = { intent: 'consulta_cargas' }
        assert(textos(await texto(v1, 'Mostrame mis últimas cargas')).includes('71'), 'Solo manda no pudo ver su propia carga.')

        interpretarComo = { intent: 'lluvia', mm: 72, campo: 'La Porteña', fecha: hoy }
        const anterior = await texto(v1, 'Anotá 72 mm en La Porteña')
        const viejo = botones(anterior).find(id => id.includes('|si'))
        assert(viejo, textos(anterior))
        await admin`update miembro_empresa set niveles=${niveles('ve')},acceso='app' where user_id=${U1} and empresa_id=${E1}`
        assert(textos(await boton(v1,viejo)).includes('no permite registrar'), 'El botón viejo conservó permiso de carga.')
        assert(!(await admin`select 1 from lluvia where empresa_id=${E1} and mm=72`).length)
      } finally {
        interpretarComo = null
        await admin`update miembro_empresa set rol='dueno',niveles=null,acceso=null where user_id=${U1} and empresa_id=${E1}`
        await admin`delete from miembro_empresa where user_id=${U1} and empresa_id=${E2}`
        await admin`update wa_vinculo set pendiente=null,pendiente_at=null where id=${V1}`
        await admin`delete from lluvia where empresa_id=${E1} and mm in (71,72)`
      }
    })

    await test('Una confirmación antigua sin dato comprobado nunca anuncia éxito', async () => {
      const p = await proponerMolino('legado')
      await admin`update captura set estado='confirmada' where id=${p.captura}`
      const respuesta = textos(await boton(v1, p.guardar))
      assert(respuesta.includes('No pude comprobar') && !respuesta.includes('ya está guardado'), respuesta)
      assert((await admin`select 1 from infraestructura where apodo='legado'`).length === 0)
      await texto(v1, 'cancelar')
    })
    assert(!salida.some(o => o.to && o.to !== v1.telefono && o.to !== v2.telefono), 'Envió a otro destinatario')
  } finally { Deno.serve = originalServe; globalThis.fetch = originalFetch }
})

await admin.end()
console.log(fail ? `${fail} fallas` : 'Todas pasan.')
if (fail) Deno.exit(1)
Deno.exit(0)
