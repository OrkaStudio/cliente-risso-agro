import postgres from 'npm:postgres@3.4.5'
import * as db from '../../../functions/wa-webhook/db.ts'
import * as store from '../../../functions/wa-resumen-semanal/store.ts'
import { periodoSemana } from '../../../functions/_shared/wa/semanal.ts'
if(Deno.env.get('WA_QA_WEEKLY_LOCAL_DB')!=='1' || !Deno.env.get('SUPABASE_DB_URL')?.includes('@127.0.0.1:55440/postgres'))throw Error('Sólo el fixture semanal local')
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,onnotice:()=>{}})
const id=(prefix:string,n:number)=>`${prefix}000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const E=id('e1',1),X=id('e2',1),U=id('a1',1),UX=id('a2',1),C=id('c1',1),CX=id('c2',1),P=id('b1',1),PX=id('b2',1),V=id('d1',1),VX=id('d2',1),CAT=id('f1',1)
const v:db.Vinculo={id:V,telefono:'54911111111',empresa_id:E,user_id:U,pendiente:null,pendiente_at:null}
const vx:db.Vinculo={...v,id:VX,telefono:'54922222222',empresa_id:X,user_id:UX}
const period=periodoSemana(new Date('2026-10-17T12:00:00Z'))
await sql`insert into auth.users values(${U}),(${UX})`
await sql`insert into empresa values(${E},'Orka Pruebas'),(${X},'Otra empresa')`
await sql`insert into miembro_empresa values(${U},${E}),(${UX},${X})`
await sql`insert into campo values(${C},${E},'Don Gilberto'),(${CX},${X},'Ajeno')`
await sql`insert into potrero values(${P},${E},${C},'1A',null),(${PX},${X},${CX},'1X',null)`
await sql`insert into wa_vinculo(id,telefono,user_id,empresa_id) values(${V},${v.telefono},${U},${E}),(${VX},${vx.telefono},${UX},${X})`
let failures=0,count=0
function equal(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`)}
async function test(name:string,run:()=>Promise<void>){
  await sql`truncate interno.wa_resumen_config,interno.wa_resumen_envio,observacion_potrero,recorrida,lluvia,movimiento_financiero,animal,categoria_movimiento`
  await sql`update wa_vinculo set activo=true`
  await sql`delete from miembro_empresa`;await sql`insert into miembro_empresa values(${U},${E}),(${UX},${X})`
  count++
  try{await run();console.log('PASA',name)}catch(e){failures++;console.log('FALLA',name,String(e))}
}
await test('ningún número vinculado queda suscripto por defecto',async()=>equal(await store.destinatarios(period),[]))
await test('activar es individual y desactivar deja de seleccionar el vínculo',async()=>{
  await store.configurar(v,true);equal((await store.destinatarios(period)).map(r=>r.id),[V]);await store.configurar(v,false);equal(await store.destinatarios(period),[])
})
await test('no se puede activar con empresa/usuario ajenos al vínculo',async()=>{
  let denied=false;try{await store.configurar({...v,empresa_id:X,user_id:UX},true)}catch{denied=true}equal(denied,true)
})
await test('cuatro jobs simultáneos reclaman una sola entrega de la semana',async()=>{
  await store.configurar(v,true);const claims=await Promise.all(Array.from({length:4},()=>store.reclamar(v,period)));equal(claims.filter(Boolean).length,1)
})
await test('un documento aceptado por Meta no vuelve a reclamarse',async()=>{
  await store.configurar(v,true);const lease=(await store.reclamar(v,period))!;equal(Boolean(lease),true);await store.estado(v,period,lease,'enviado','wamid.real');equal(await store.reclamar(v,period),null);equal(await store.destinatarios(period),[])
})
await test('resultado incierto o envío en curso no se repite',async()=>{
  await store.configurar(v,true);const lease=(await store.reclamar(v,period))!;await store.estado(v,period,lease,'enviando');equal(await store.reclamar(v,period),null)
  await store.estado(v,period,lease,'incierto');equal(await store.reclamar(v,period),null);equal(await store.destinatarios(period),[])
})
await test('preparación fallida tiene hasta tres intentos, no ilimitados',async()=>{
  await store.configurar(v,true)
  for(let i=0;i<3;i++){const lease=(await store.reclamar(v,period))!;equal(Boolean(lease),true);await store.estado(v,period,lease,'error_preparacion')}
  equal(await store.reclamar(v,period),null);equal(await store.destinatarios(period),[])
})
await test('baja durante preparación cancela el documento',async()=>{
  await store.configurar(v,true);const lease=(await store.reclamar(v,period))!;await store.configurar(v,false);equal(await store.sigueActivo(v,period,lease),false)
  equal((await sql`select estado from interno.wa_resumen_envio`)[0].estado,'cancelado')
})
await test('una preparación vieja no puede enviar después de perder su turno',async()=>{
  await store.configurar(v,true);const old=(await store.reclamar(v,period))!
  await sql`update interno.wa_resumen_envio set actualizado_at=now()-interval '11 minutes'`
  const current=(await store.reclamar(v,period))!
  equal(Boolean(current)&&current!==old,true)
  equal(await store.marcarEnviando(v,period,old),false)
  equal(await store.marcarEnviando(v,period,current),true)
  await store.estado(v,period,old,'error_preparacion')
  equal((await sql`select estado from interno.wa_resumen_envio`)[0].estado,'enviando')
})
await test('la baja al tomar el turno de envío impide pasar a Meta',async()=>{
  await store.configurar(v,true);const lease=(await store.reclamar(v,period))!;await store.configurar(v,false)
  equal(await store.marcarEnviando(v,period,lease),false)
})
await test('revocar membresía impide destinatario y lectura del informe',async()=>{
  await store.configurar(v,true);await sql`delete from miembro_empresa where user_id=${U}`;equal(await store.destinatarios(period),[])
  let denied=false;try{await db.datosSemana(v,period)}catch{denied=true}equal(denied,true)
})
await test('lluvia sólo manual de sábado-viernes y RLS entre empresas',async()=>{
  for(const [n,e,c,date,source,mm] of [[1,E,C,'2026-10-10','manual',3],[2,E,C,'2026-10-16','manual',10],[3,E,C,'2026-10-17','manual',99],[4,E,C,'2026-10-09','manual',99],[5,E,C,'2026-10-12','open-meteo',99],[6,X,CX,'2026-10-12','manual',99]] as const)
    await sql`insert into lluvia values(${id('b3',n)},${e},${c},${date},${mm},${source})`
  equal((await db.datosSemana(v,period)).lluvia,[{campo:'Don Gilberto',mediciones:2,mm:13}]);equal((await db.datosSemana(vx,period)).lluvia,[{campo:'Ajeno',mediciones:1,mm:99}])
})
await test('observaciones incluyen app y bot sin límite de 10 ni mezclar semanas',async()=>{
  for(const [n,date] of [[1,'2026-10-12'],[2,'2026-10-13'],[3,'2026-10-17']] as const){
    await sql`insert into recorrida(id,empresa_id,campo_id,fecha,created_by)values(${id('a3',n)},${E},${C},${date},${U})`
    await sql`insert into observacion_potrero(empresa_id,recorrida_id,potrero_id,novedad)values(${E},${id('a3',n)},${P},${'nota '+n})`
  }
  const d=await db.datosSemana(v,period);equal(d.recorridas,[{campo:'Don Gilberto',dias:2,observaciones:2,potreros:1}]);equal(d.observaciones.map(r=>r.novedad),['nota 1','nota 2']);equal((await db.datosSemana(vx,period)).observaciones,[])
})
await test('gastos por devengo excluyen ingreso/anulado/otros períodos y conservan centavos',async()=>{
  await sql`insert into categoria_movimiento values(${CAT},null,'Combustible')`
  for(const [n,type,state,date,amount] of [[1,'gasto','liquidado','2026-10-12',1200.5],[2,'gasto','anulado','2026-10-12',999],[3,'ingreso','liquidado','2026-10-12',999],[4,'gasto','liquidado','2026-10-17',999]] as const)
    await sql`insert into movimiento_financiero(id,empresa_id,campo_id,categoria_id,tipo,monto,fecha_devengo,estado)values(${id('c3',n)},${E},${C},${CAT},${type},${amount},${date},${state})`
  equal((await db.datosSemana(v,period)).gastos,[{campo:'Don Gilberto',categoria:'Combustible',cantidad:1,total:1200.5}]);equal((await db.datosSemana(vx,period)).gastos,[])
})
await test('hacienda incluye animales sin potrero y excluye bajas/empresa ajena',async()=>{
  await sql`insert into animal values(${id('d3',1)},${E},${P},'vaca','activo'),(${id('d3',2)},${E},null,'vaca','activo'),(${id('d3',3)},${E},${P},'vaca','muerto'),(${id('d3',4)},${X},${PX},'ternero','activo')`
  equal((await db.datosSemana(v,period)).hacienda.map(r=>[r.campo,r.cabezas]),[['Don Gilberto',1],['Sin potrero asignado',1]])
})
await test('vencimientos incluye vencidos y próximos siete días sin truncar',async()=>{
  for(let n=1;n<=18;n++)await sql`insert into movimiento_financiero(id,empresa_id,tipo,monto,fecha_devengo,estado,fecha_vencimiento)values(${id('e3',n)},${E},'gasto',100,'2026-09-01','pendiente','2026-10-01')`
  await sql`insert into movimiento_financiero(id,empresa_id,tipo,monto,fecha_devengo,estado,fecha_vencimiento)values(${id('e3',19)},${E},'ingreso',500,'2026-10-19','pendiente','2026-10-23'),(${id('e3',20)},${E},'gasto',500,'2026-10-19','pendiente','2026-10-24')`
  equal((await db.datosSemana(v,period)).vencimientos.length,19);equal((await db.datosSemana(vx,period)).vencimientos,[])
})
await sql.end();console.log(JSON.stringify({tests:count,passed:count-failures,failed:failures}));Deno.exit(failures?1:0)
