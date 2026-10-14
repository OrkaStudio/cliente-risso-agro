// Pruebas del guardado de la recorrida contra un Postgres descartable con el
// esquema y la RLS copiados de producción. Usa el db.ts real del bot.
// Correr con SUPABASE_DB_URL apuntando al contenedor wa-recorrida-test.
import postgres from 'npm:postgres@3.4.5'
import * as db from '../../functions/wa-webhook/db.ts'
import { potreroEnPunto } from '../../functions/_shared/wa/resolver.ts'

if (Deno.env.get('WA_QA_LOCAL_DB') !== '1' || !Deno.env.get('SUPABASE_DB_URL')?.includes('@127.0.0.1:55439/postgres')) throw new Error('Sólo permitido en el contenedor local de run.py')
const admin = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, onnotice: () => {} })
const id = (pre: string, n: number) => `${pre}000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const E1 = id('e1', 1), E2 = id('e2', 2), U1 = id('a1', 1), U2 = id('a2', 2)
const LP = id('c1', 1), TO = id('c1', 2), X = id('c2', 1)
const P2B = id('b1', 2), P5B = id('b1', 5), P7B = id('b1', 7), P2C = id('b2', 2), P1X = id('b3', 1)
const HOY = '2026-10-12', AYER = '2026-10-11'
const v1: db.Vinculo = { id: 'v1', telefono: '549', user_id: U1, empresa_id: E1, pendiente: null, pendiente_at: null }
const v2: db.Vinculo = { ...v1, id: 'v2', user_id: U2, empresa_id: E2 }

await admin`insert into empresa values (${E1}, 'Orka Pruebas'), (${E2}, 'Otra')`
await admin`insert into miembro_empresa values (${U1}, ${E1}), (${U2}, ${E2})`
await admin`insert into campo values (${LP}, ${E1}, 'La Porteña'), (${TO}, ${E1}, 'Toimil'), (${X}, ${E2}, 'Ajeno')`
await admin`insert into potrero (id, empresa_id, campo_id, nombre) values
  (${P2B}, ${E1}, ${LP}, '2B'), (${P5B}, ${E1}, ${LP}, '5B'), (${P7B}, ${E1}, ${LP}, '7B'),
  (${P2C}, ${E1}, ${TO}, '2C'), (${P1X}, ${E2}, ${X}, '1X')`

const obs = (potreroId: string, campoId: string, o: Partial<db.ObsEscrita> = {}): db.ObsEscrita => ({
  id: crypto.randomUUID(), potreroId, campoId, agua: null, pasto: null, electrico: null, conteo: null, novedad: null, ...o,
})
/** La app abre la recorrida y guarda como el usuario, igual que src/features/campo/recorrida/api.ts. */
async function comoLaApp(campoId: string, fecha: string, potreroId: string, o: Record<string, unknown>) {
  const [r] = await admin`insert into recorrida (empresa_id, campo_id, fecha, created_by) values (${E1}, ${campoId}, ${fecha}, ${U1}) returning id`
  const [ob] = await admin`insert into observacion_potrero (empresa_id, recorrida_id, potrero_id, pasto, novedad)
    values (${E1}, ${r.id}, ${potreroId}, ${o.pasto ?? null}, ${o.novedad ?? null}) returning id`
  return { recorrida: r.id as string, obs: ob.id as string }
}
const recorridas = () => admin`select campo_id, fecha::text, created_by from recorrida order by fecha, campo_id`
const observaciones = () => admin`select o.id, o.potrero_id, o.agua::text, o.pasto::text, o.electrico::text, o.conteo, o.novedad, r.fecha::text
  from observacion_potrero o join recorrida r on r.id = o.recorrida_id order by r.fecha, o.potrero_id`

let fallas = 0
async function prueba(nombre: string, fn: () => Promise<void>) {
  await admin`truncate observacion_potrero, recorrida, captura, lluvia, movimiento_financiero, categoria_movimiento, wa_mensaje`
  await admin`update potrero set poligono = null`
  try {
    await fn()
    console.log('PASA ', nombre)
  } catch (e) {
    fallas++
    console.log('FALLA', nombre, '→', e instanceof Error ? e.message : e)
  }
}
function igual(a: unknown, b: unknown, que: string) {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)]
  if (x !== y) throw new Error(`${que}: ${x} ≠ ${y}`)
}

await prueba('crea la recorrida de hoy con la primera observación, a nombre del usuario', async () => {
  const o = [obs(P2B, LP, { novedad: 'mucha agua' }), obs(P5B, LP, { conteo: 80 })]
  const ids = await db.escribirRecorrida(v1, HOY, o)
  igual(ids, o.map((x) => x.id), 'ids elegidos antes')
  igual((await recorridas()).map((r) => [r.campo_id, r.fecha, r.created_by]), [[LP, HOY, U1]], 'una recorrida')
  igual((await observaciones()).map((r) => [r.potrero_id, r.novedad, r.conteo]), [[P2B, 'mucha agua', null], [P5B, null, 80]], 'observaciones')
})

await prueba('usa la recorrida que la app ya abrió hoy en ese campo: no crea otra', async () => {
  await comoLaApp(LP, HOY, P5B, { pasto: 'normal' })
  await db.escribirRecorrida(v1, HOY, [obs(P7B, LP, { novedad: 'faltan 2 terneros' })])
  igual((await recorridas()).length, 1, 'sigue habiendo una recorrida')
  igual((await observaciones()).map((r) => r.potrero_id), [P5B, P7B], 'la observación nueva va a esa recorrida')
})

await prueba('completa la observación que la app ya tenía: pisa sólo lo que dijo y suma la novedad', async () => {
  const app = await comoLaApp(TO, HOY, P2C, { pasto: 'normal', novedad: 'tranquera abierta' })
  const ids = await db.escribirRecorrida(v1, HOY, [obs(P2C, TO, { agua: 'baja', novedad: 'molino roto' })])
  igual(ids, [app.obs], 'devuelve el id de la fila de la app')
  const [o] = await observaciones()
  igual([o.pasto, o.agua, o.novedad], ['normal', 'baja', 'tranquera abierta · molino roto'], 'fila completada')
  igual((await observaciones()).length, 1, 'una sola fila por potrero')
})

await prueba('el mismo potrero dos veces en un mensaje queda en una sola fila', async () => {
  await db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { agua: 'llena' }), obs(P2B, LP, { novedad: 'alambrado cortado' })])
  const filas = await observaciones()
  igual(filas.map((r) => [r.agua, r.novedad]), [['llena', 'alambrado cortado']], 'una fila con las dos cosas')
})

await prueba('mandar la misma novedad de nuevo no la duplica', async () => {
  await db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { novedad: 'molino roto' })])
  await db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { novedad: 'molino roto' })])
  igual((await observaciones()).map((r) => r.novedad), ['molino roto'], 'sin repetir')
})

await prueba('dos campos en un mensaje: una recorrida por campo, y el avance de cada uno', async () => {
  await db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { novedad: 'a' }), obs(P5B, LP, { novedad: 'b' }), obs(P2C, TO, { novedad: 'c' })])
  igual((await recorridas()).map((r) => r.campo_id).sort(), [LP, TO].sort(), 'una por campo')
  const avance = await db.avanceRecorrida(v1, HOY, [LP, TO])
  igual(avance, [{ campo: 'La Porteña', recorridos: 2, total: 3 }, { campo: 'Toimil', recorridos: 1, total: 1 }], 'avance')
})

await prueba('si una observación falla, no queda nada escrito (todo o nada)', async () => {
  let fallo = false
  try {
    await db.escribirRecorrida(v1, HOY, [obs(P7B, LP, { novedad: 'ok' }), obs(id('b9', 9), LP, { novedad: 'potrero inexistente' })])
  } catch {
    fallo = true
  }
  igual(fallo, true, 'tira error')
  igual([(await recorridas()).length, (await observaciones()).length], [0, 0], 'ni recorrida ni observación')
})

await prueba('verificar encuentra lo escrito y no lo que nunca se escribió', async () => {
  const o = [obs(P2B, LP, { agua: 'baja', novedad: 'molino roto' })]
  await db.escribirRecorrida(v1, HOY, o)
  igual(await db.verificarRecorrida(v1, HOY, o), true, 'lo escrito')
  igual(await db.verificarRecorrida(v1, HOY, [obs(P7B, LP, { novedad: 'nunca' })]), false, 'lo no escrito')
  igual(await db.verificarRecorrida(v1, HOY, [obs(P2B, LP, { agua: 'seca' })]), false, 'otro estado')
})

await prueba('otra empresa no ve ni cuenta la recorrida ajena (RLS como el usuario)', async () => {
  const o = [obs(P2B, LP, { novedad: 'molino roto' })]
  await db.escribirRecorrida(v1, HOY, o)
  igual(await db.verificarRecorrida(v2, HOY, o), false, 'no la ve')
  igual(await db.avanceRecorrida(v2, HOY, [LP]), [], 'no ve el campo')
  igual(await db.campoRecorridoHoy(v2, HOY), null, 'no tiene campo de hoy')
})

await prueba('el campo que recorre hoy: sólo si tiene recorrida hoy en un único campo', async () => {
  igual(await db.campoRecorridoHoy(v1, HOY), null, 'sin recorrida')
  await db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { novedad: 'a' })])
  igual(await db.campoRecorridoHoy(v1, HOY), LP, 'La Porteña')
  await db.escribirRecorrida(v1, HOY, [obs(P2C, TO, { novedad: 'b' })])
  igual(await db.campoRecorridoHoy(v1, HOY), null, 'dos campos: no desempata')
})

await prueba('la recorrida de ayer no se mezcla con la de hoy', async () => {
  const app = await comoLaApp(LP, AYER, P2B, { novedad: 'de ayer' })
  await db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { novedad: 'de hoy' })])
  const filas = await observaciones()
  igual(filas.map((r) => [r.fecha, r.novedad]), [[AYER, 'de ayer'], [HOY, 'de hoy']], 'dos días, dos filas')
  igual(filas[0].id, app.obs, 'la de ayer intacta')
})

await prueba('ubicación: lee los dibujos de la empresa y encuentra el potrero', async () => {
  const cuadrado = [[-35.9, -59.37], [-35.9, -59.36], [-35.91, -59.36], [-35.91, -59.37]]
  await admin`update potrero set poligono = ${admin.json(cuadrado)} where id = ${P5B}`
  await admin`update potrero set poligono = ${admin.json(cuadrado)} where id = ${P1X}`
  const dibujados = await db.potrerosDibujados(v1)
  igual(dibujados.map((p) => [p.nombre, p.campo, p.poligono.length]), [['5B', 'La Porteña', 4]], 'sólo los de su empresa')
  igual(potreroEnPunto(-35.905, -59.365, dibujados)?.id, P5B, 'adentro del 5B')
})


await prueba('concurrencia: cuatro capturas del mismo potrero crean una sola recorrida y observación', async () => {
  await admin.unsafe("create or replace function qa_delay() returns trigger language plpgsql as $$ begin perform pg_sleep(0.1); return new; end $$; create trigger qa_delay before insert on recorrida for each row execute function qa_delay();")
  try {
    await Promise.all(Array.from({ length: 4 }, (_, i) => db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { novedad: `nota ${i}` })])))
    igual((await recorridas()).length, 1, 'una recorrida')
    const filas = await observaciones()
    igual(filas.length, 1, 'una observación')
    for (let i = 0; i < 4; i++) if (!filas[0].novedad?.includes(`nota ${i}`)) throw new Error('Se perdió una novedad concurrente')
  } finally { await admin.unsafe('drop trigger qa_delay on recorrida; drop function qa_delay()') }
})

await prueba('dos campos en orden inverso no se bloquean ni se duplican', async () => {
  await Promise.all([
    db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { agua: 'normal' }), obs(P2C, TO, { agua: 'baja' })]),
    db.escribirRecorrida(v1, HOY, [obs(P2C, TO, { novedad: 'molino roto' }), obs(P2B, LP, { novedad: 'alambrado' })]),
  ])
  igual((await recorridas()).length, 2, 'una por campo')
  igual((await observaciones()).length, 2, 'una por potrero')
})

await prueba('resumen: lista pendientes y cuenta observaciones, no supuestas visitas', async () => {
  await db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { agua: 'llena' })])
  const filas = await db.resumenRecorrida(v1, HOY, LP)
  igual(filas.map(f => [f.campo, f.recorridos, f.total, f.pendientes]), [['La Porteña', 1, 3, ['5B', '7B']]], 'resumen')
  igual(await db.resumenRecorrida(v2, HOY, LP), [], 'empresa ajena no ve resumen')
})

await prueba('última observación: elige el día más reciente y respeta RLS', async () => {
  await db.escribirRecorrida(v1, AYER, [obs(P2B, LP, { agua: 'seca', novedad: 'ayer' })])
  await db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { agua: 'llena', novedad: 'hoy' })])
  igual((await db.ultimaObservacion(v1, P2B))?.novedad, 'hoy', 'última correcta')
  igual(await db.ultimaObservacion(v2, P2B), null, 'empresa ajena no ve observación')
  igual(await db.ultimaObservacion(v1, P5B), null, 'sin observaciones')
})

await prueba('novedades: sólo texto en el período/campo solicitado', async () => {
  await db.escribirRecorrida(v1, AYER, [obs(P2B, LP, { novedad: 'viejo' })])
  await db.escribirRecorrida(v1, HOY, [obs(P2B, LP, { novedad: 'hoy' }), obs(P5B, LP, { agua: 'llena' }), obs(P2C, TO, { novedad: 'otro campo' })])
  igual((await db.novedades(v1, HOY, HOY, LP)).map(f => f.novedad), ['hoy'], 'filtrado por fecha y campo')
  igual(await db.novedades(v2, AYER, HOY, LP), [], 'sin acceso cruzado')
})

await prueba('gastos: total por campo/categoría, excluye anulados e ingresos y otros períodos', async () => {
  const cat = id('d1', 1)
  await admin`insert into categoria_movimiento values (${cat}, null, 'Combustible')`
  for (const [n, campo, tipo, estado, fecha, monto] of [[1,LP,'gasto','liquidado',HOY,45000],[2,LP,'gasto','anulado',HOY,99999],[3,LP,'ingreso','liquidado',HOY,90000],[4,TO,'gasto','liquidado',HOY,1000],[5,LP,'gasto','liquidado','2026-09-01',10000]] as const)
    await admin`insert into movimiento_financiero values (${id('f1',n)},${E1},${campo},${cat},${tipo},${monto},${fecha},${estado})`
  igual(await db.resumenGastos(v1, '2026-10-01', HOY, LP, cat), [{ campo: 'La Porteña', categoria: 'Combustible', cantidad: 1, total: 45000 }], 'total solicitado')
  igual(await db.resumenGastos(v2, '2026-10-01', HOY, LP, cat), [], 'sin acceso cruzado')
})

await prueba('historial: sólo cargas propias confirmadas con fila existente', async () => {
  const lluvia = id('f1', 1), ausente = id('f1', 2)
  await admin`insert into lluvia values (${lluvia},${E1},${LP},${HOY},10,'manual')`
  await admin`insert into captura (id,empresa_id,user_id,estado,escrito_tabla,escrito_id) values
    (${id('d1',1)},${E1},${U1},'confirmada','lluvia',${lluvia}),
    (${id('d1',2)},${E1},${U1},'confirmada','lluvia',${ausente}),
    (${id('d1',3)},${E1},${U2},'confirmada','lluvia',${lluvia}),
    (${id('d1',4)},${E1},${U1},'error','lluvia',${lluvia})`
  igual(await db.cargasRecientes(v1, LP), [{ fecha: HOY, tipo: 'lluvia', campo: 'La Porteña', cantidad: 10 }], 'sólo la propia comprobable')
  igual(await db.cargasRecientes(v2, LP), [], 'sin acceso cruzado')
})

await prueba('mapa: lee nombres y geometría del campo autorizado bajo RLS', async () => {
  const poly = [[-36,-59],[-36,-58.99],[-36.01,-59]]
  await admin`update potrero set poligono=${admin.json(poly)} where id=${P2B}`
  const mapa = await db.datosMapa(v1, LP)
  igual(mapa?.nombre, 'La Porteña', 'nombre de campo')
  igual(mapa?.potreros.map(p => p.nombre), ['2B','5B','7B'], 'sólo este campo')
  igual(mapa?.potreros[0].poligono, poly, 'coordenadas guardadas')
})
await prueba('mapa: otra empresa no ve polígonos ni nombres ajenos', async () => {
  igual(await db.datosMapa(v2, LP), null, 'RLS ajena')
  igual(await db.datosMapa(v1, X), null, 'campo de otra empresa')
  igual(await db.datosMapa({ ...v1, empresa_id: E2 }, X), null, 'no basta cambiar empresa del vínculo')
})
await prueba('mapa: revocar membresía impide la lectura aun con referencia previa', async () => {
  await admin`delete from miembro_empresa where user_id=${U1}`
  try { igual(await db.datosMapa(v1, LP), null, 'membresía revocada') }
  finally { await admin`insert into miembro_empresa values (${U1},${E1})` }
})
await prueba('mapa: referencia reciente aislada por vínculo y empresa, vence a las 12 horas', async () => {
  const payload = { tropero_mapa: { campo_id: LP, captura_id: 'captura-qa' } }
  await admin`insert into wa_mensaje(vinculo_id,empresa_id,direccion,tipo,cuerpo,created_at) values
    ('v1',${E1},'saliente','image',${admin.json(payload)},now()-interval '13 hours')`
  igual(await db.campoMapaReciente(v1), null, 'expirada')
  await admin`insert into wa_mensaje(vinculo_id,empresa_id,direccion,tipo,cuerpo) values ('v1',${E1},'saliente','image',${admin.json(payload)})`
  igual(await db.campoMapaReciente(v1), LP, 'vigente')
  igual(await db.campoMapaReciente(v2), null, 'otro vínculo')
  igual(await db.campoMapaReciente({ ...v1, empresa_id: E2 }), null, 'otra empresa')
})
await prueba('mapa: evita repetir imagen de la misma captura sin afectar otras', async () => {
  const payload = { tropero_mapa: { campo_id: LP, captura_id: 'captura-qa' } }
  await admin`insert into wa_mensaje(vinculo_id,empresa_id,direccion,tipo,cuerpo) values ('v1',${E1},'saliente','image',${admin.json(payload)})`
  igual(await db.mapaEnviadoParaCaptura(v1, 'captura-qa', LP), true, 'enviada')
  igual(await db.mapaEnviadoParaCaptura(v1, 'otra', LP), false, 'otra captura')
  igual(await db.mapaEnviadoParaCaptura(v1, 'captura-qa', TO), false, 'otro campo')
  igual(await db.mapaEnviadoParaCaptura(v2, 'captura-qa', LP), false, 'otro vínculo')
})

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodas pasan.')
await admin.end()
Deno.exit(fallas ? 1 : 0)
