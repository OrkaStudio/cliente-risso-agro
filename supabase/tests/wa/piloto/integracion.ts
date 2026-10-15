import postgres from 'npm:postgres@3.4.5'
import * as db from '../../../functions/wa-webhook/db.ts'
import * as store from '../../../functions/wa-webhook/piloto-store.ts'
import { atenderPiloto } from '../../../functions/wa-webhook/piloto.ts'
import { tomarTrabajo,terminarTrabajo } from '../../../functions/wa-webhook/cola.ts'
import { hoyAR,sumarDias } from '../../../functions/_shared/wa/texto.ts'
import type { Contexto,Mensaje } from '../../../functions/_shared/wa/tipos.ts'

if(Deno.env.get('WA_QA_LOCAL_DB')!=='1'||!Deno.env.get('SUPABASE_DB_URL')?.includes('@127.0.0.1:55441/postgres'))throw Error('Sólo base local descartable')
const admin=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,onnotice:()=>{}})
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const E1=id(1),E2=id(2),U1=id(11),U2=id(12),U3=id(13),C1=id(21),C2=id(22),P1=id(31),P2=id(32),P3=id(33),V1=id(41),V2=id(42),V3=id(43)
Deno.env.set('WA_PILOT_TENANTS',E1)
const hoy=hoyAR(),ayer=sumarDias(hoy,-1)
const v1:db.Vinculo={id:V1,telefono:'5491111111101',user_id:U1,empresa_id:E1,pendiente:null,pendiente_at:null}
const v2:db.Vinculo={...v1,id:V2,telefono:'5491111111102',user_id:U2,empresa_id:E2}
const v3:db.Vinculo={...v1,id:V3,telefono:'5491111111103',user_id:U3}
await admin`insert into auth.users values(${U1},'{}'),(${U2},'{}'),(${U3},'{"nombre":"Juan"}')`
await admin`insert into empresa values(${E1},'QA Uno'),(${E2},'QA Dos')`
await admin`insert into miembro_empresa values(${U1},${E1}),(${U2},${E2}),(${U3},${E1})`
await admin`insert into campo values(${C1},${E1},'Campo QA'),(${C2},${E2},'Campo Ajeno')`
await admin`insert into potrero(id,empresa_id,campo_id,nombre,poligono) values
 (${P1},${E1},${C1},'7B','[[-36,-59],[-36,-58.99],[-36.01,-58.99],[-36.01,-59]]'),
 (${P2},${E2},${C2},'7B',null),(${P3},${E1},${C1},'8B',null)`
for(const v of[v1,v2,v3])await admin`insert into wa_vinculo(id,telefono,user_id,empresa_id)values(${v.id},${v.telefono},${v.user_id},${v.empresa_id})`
const ctx:Contexto={hoy,nombre:'QA',campos:[{id:C1,nombre:'Campo QA',potreros:[{id:P1,nombre:'7B'},{id:P3,nombre:'8B'}]}],categoriasGasto:[],pilotoHabilitado:true}
const assert=(ok:unknown,m='Assertion falló')=>{if(!ok)throw Error(m)}
const results:{caso:string;resultado:string}[]=[]
let fail=0
async function test(caso:string,run:()=>Promise<void>){try{await run();results.push({caso,resultado:'PASA'});console.log('PASA',caso)}catch(e){fail++;results.push({caso,resultado:'FALLA'});console.error('FALLA',caso,e)}}
async function denied(run:()=>Promise<unknown>){let rejected=false;try{await run()}catch{rejected=true}assert(rejected,'Debía rechazarse')}
async function message(v=v1,texto='QA'){return (await db.guardarEntrante({wamid:'qa-'+crypto.randomUUID(),telefono:v.telefono,tipo:'text',cuerpo:{type:'text',text:{body:texto}},vinculo:v}))!}
let incidenciaId='',tareaId=''
await test('Incidencia: propuesta no escribe, confirmar guarda y repetir no duplica',async()=>{
 const out:Mensaje[]=[]
 const mensajeId=await message()
 const io={responder:async(m:Mensaje)=>{out.push(m)},avanzar:async()=>{throw Error('No corresponde')},limpiarPendiente:async()=>{throw Error('No debe tocar la carga pendiente')}}
 assert(await atenderPiloto({v:v1,ctx,mensajeId,texto:'reportar problema en 7B: molino roto',pendiente:null},io))
 assert((await store.incidencias(v1)).length===0)
 const button=out.at(-1)!.botones![0].id;incidenciaId=button.split('@')[1]
 await atenderPiloto({v:v1,ctx,mensajeId:await message(),texto:'',botonId:button,pendiente:null},io)
 await atenderPiloto({v:v1,ctx,mensajeId:await message(),texto:'',botonId:button,pendiente:null},io)
 assert((await store.incidencias(v1)).length===1);assert(out.at(-1)!.texto.includes('ya quedó guardada'))
 assert((await store.incidencias(v2)).length===0)
 assert((await store.potrerosConProblemas(v1,C1)).includes(P1))
})
await test('Resolver conserva historial y saca la alerta; botón de otra empresa no sirve',async()=>{
 const before=(await store.buscarIncidencia(v1,incidenciaId))[0]
 const msg=await message(),p=await store.proponer(v1,msg,{k:'resolver',id:before.id,version:before.version})
 assert(!(await store.confirmar(v2,p.id)).includes('resuelto'))
 assert((await store.incidencias(v1)).length===1)
 await store.confirmar(v1,p.id)
 assert((await store.incidencias(v1)).length===0)
 assert((await store.potrerosConProblemas(v1,C1)).length===0)
 assert((await admin`select 1 from wa_piloto_evento where objeto_id=${incidenciaId}`).length===2)
})
await test('RLS y relaciones rechazan empresa/campo/potrero cruzados incluso con doble membresía',async()=>{
 await admin`insert into miembro_empresa values(${U1},${E2})`
 await denied(()=>store.aplicar(v1,crypto.randomUUID(),{k:'incidencia',campoId:C2,potreroId:P2,descripcion:'No cruza'}))
 await denied(()=>store.aplicar(v1,crypto.randomUUID(),{k:'incidencia',campoId:C1,potreroId:P2,descripcion:'No cruza'}))
 await denied(()=>db.escribirRecorrida(v1,hoy,[{id:crypto.randomUUID(),campoId:C1,potreroId:P2,agua:'seca',pasto:null,electrico:null,conteo:null,novedad:'No cruza'}]))
 await denied(()=>db.escribirLluvia(v1,{tipo:'lluvia',campoId:C2,fecha:hoy,mm:10},crypto.randomUUID()))
 await admin`delete from miembro_empresa where user_id=${U1} and empresa_id=${E2}`
 await denied(()=>store.aplicar({...v1,empresa_id:E2},crypto.randomUUID(),{k:'incidencia',campoId:C2,potreroId:P2,descripcion:'Sin permiso'}))
})
await test('Tareas: responsable de la empresa, aceptación propia y cierre con historial',async()=>{
 await denied(()=>store.aplicar(v1,crypto.randomUUID(),{k:'tarea',campoId:C1,potreroId:P1,descripcion:'No',responsableId:U2,fecha:hoy}))
 tareaId=crypto.randomUUID()
 await store.aplicar(v1,tareaId,{k:'tarea',campoId:C1,potreroId:P1,descripcion:'Revisar bomba',responsableId:U3,fecha:hoy})
 assert((await store.tareas(v3)).length===1);assert((await store.tareas(v2)).length===0)
 await denied(()=>store.aplicar(v1,crypto.randomUUID(),{k:'tarea_estado',id:tareaId,version:1,estado:'aceptada'}))
 await store.aplicar(v3,crypto.randomUUID(),{k:'tarea_estado',id:tareaId,version:1,estado:'aceptada'})
 await store.aplicar(v3,crypto.randomUUID(),{k:'tarea_estado',id:tareaId,version:2,estado:'completa'})
 assert((await store.tareas(v1)).length===0)
})
await test('Corregir gasto es atómico, auditable e idempotente; anular sale de totales',async()=>{
 const row=id(80),captura=id(81)
 await admin`insert into movimiento_financiero(id,empresa_id,campo_id,tipo,monto,fecha_devengo,estado)values(${row},${E1},${C1},'gasto',35000,${hoy},'liquidado')`
 await admin`insert into captura(id,empresa_id,user_id,estado,escrito_tabla,escrito_id)values(${captura},${E1},${U1},'confirmada','movimiento_financiero',${row})`
 const carga=(await store.ultimaCarga(v1))!,op=crypto.randomUUID()
 const a:store.Accion={k:'ajustar',id:row,tabla:carga.tabla,antes:carga.datos,valor:25000,anular:false}
 await store.aplicar(v1,op,a);await store.aplicar(v1,op,a)
 assert(Number((await admin`select monto from movimiento_financiero where id=${row}`)[0].monto)===25000)
 assert((await admin`select 1 from wa_piloto_evento where operacion_id=${op}`).length===1)
 await denied(()=>store.aplicar(v1,crypto.randomUUID(),{...a,valor:20000}))
 const actual=(await store.ultimaCarga(v1))!
 await store.aplicar(v1,crypto.randomUUID(),{...a,antes:actual.datos,anular:true})
 assert((await db.resumenGastos(v1,hoy,hoy,null,null)).length===0)
})
await test('Anular lluvia conserva antes y rechaza modificar un dato ajeno',async()=>{
 const row=id(82)
 await admin`insert into lluvia values(${row},${E1},${C1},${hoy},12,'manual')`
 await admin`insert into captura(id,empresa_id,user_id,estado,escrito_tabla,escrito_id)values(${id(83)},${E1},${U1},'confirmada','lluvia',${row})`
 const carga=(await store.ultimaCarga(v1))!,op=crypto.randomUUID()
 await denied(()=>store.aplicar(v2,crypto.randomUUID(),{k:'ajustar',id:row,tabla:'lluvia',antes:carga.datos,valor:100,anular:false}))
 await store.aplicar(v1,op,{k:'ajustar',id:row,tabla:'lluvia',antes:carga.datos,anular:true})
 assert((await admin`select 1 from lluvia where id=${row}`).length===0)
 assert(Number((await admin`select antes from wa_piloto_evento where operacion_id=${op}`)[0].antes.mm)===12)
 await denied(()=>db.comoUsuario(U1,tx=>tx`update wa_piloto_evento set tipo='falso' where operacion_id=${op}`))
 await denied(()=>db.comoUsuario(U1,tx=>tx`insert into wa_piloto_evento(operacion_id,empresa_id,tipo,objeto_id)values(${crypto.randomUUID()},${E1},'anular',${row})`))
 await denied(()=>db.comoUsuario(U1,async tx=>{await tx.unsafe('create temporary table intento_falso(id uuid) on commit drop');await tx.unsafe('create trigger falsificar after insert on intento_falso for each row execute function public.wa_piloto_auditar()')}))
})
await test('Sesión persiste al pausar/retomar, rechaza repetidos y no escribe observaciones antes de cerrar',async()=>{
 const s=await store.abrirSesion(v1,C1,ayer),m=await message()
 const b={...s.borrador,sesionId:s.id,observaciones:[{potreroId:P1,campoId:C1,agua:'baja' as const,pasto:null,electrico:null,conteo:null,novedad:'Molino roto'}]}
 const ajenoMensaje=await message()
 await denied(()=>store.guardarSesion(v1,s,{...b,observaciones:[{...b.observaciones[0],potreroId:P2}]},ajenoMensaje))
 assert(await store.guardarSesion(v1,s,b,m))
 assert(!await store.guardarSesion(v1,s,b,m))
 assert((await admin`select 1 from observacion_potrero`).length===0)
 assert(await store.sesionActiva(v2)===null)
 await store.estadoSesion(v1,s.id,'pausada');assert(await store.sesionActiva(v1)===null)
 const again=(await store.retomarSesion(v1))!;assert(again.fecha===ayer);assert(again.borrador.observaciones?.length===1)
 await store.estadoSesion(v1,s.id,'cerrada')
})
await test('Comparación usa dos días distintos y hace visibles potreros sin historia',async()=>{
 await db.escribirRecorrida(v1,ayer,[{id:crypto.randomUUID(),campoId:C1,potreroId:P1,agua:'normal',pasto:null,electrico:null,conteo:null,novedad:null}])
 await db.escribirRecorrida(v1,hoy,[{id:crypto.randomUUID(),campoId:C1,potreroId:P1,agua:'seca',pasto:null,electrico:null,conteo:null,novedad:null}])
 const rows=await store.comparar(v1),p=rows.find(r=>r.potrero==='7B')!
 assert(p.fecha===hoy&&p.anterior_fecha===ayer&&p.agua==='seca'&&p.anterior_agua==='normal')
 assert(rows.some(r=>r.potrero==='8B'&&r.fecha===null));assert((await store.comparar(v2)).every(r=>r.campo==='Campo Ajeno'))
})
await test('Cola transaccional: un solo consumidor, orden y pausa ante resultado incierto',async()=>{
 await admin`update interno.wa_cola set estado='completo'`
 const a=await message(v1,'primero'),b=await message(v1,'segundo')
 const claims=await Promise.all([tomarTrabajo(V1),tomarTrabajo(V1)])
 assert(claims.filter(Boolean).length===1);const job=claims.find(Boolean)!;assert(job.mensajeId===a)
 await terminarTrabajo(a,job.token)
 const next=(await tomarTrabajo(V1))!;assert(next.mensajeId===b)
 await terminarTrabajo(b,next.token,true)
 await message(v1,'tercero');assert(await tomarTrabajo(V1)===null)
 const recibido=await message(v1,'recibido antes de medianoche')
 await admin`update wa_mensaje set created_at='2026-10-15 02:59:58+00' where id=${recibido}`
 assert(await db.fechaDeEntrada(v1,recibido)==='2026-10-14')
 await denied(()=>db.fechaDeEntrada(v2,recibido))
 await admin`update interno.wa_cola set estado='completo'`
})

await admin`delete from recorrida where empresa_id=${E1}`
await test('Webhook completo local: audio fallido conserva pendiente; sesión reúne dos audios y guarda con fecha correcta',async()=>{
 Deno.env.set('WA_APP_SECRET','qa_local_secret');Deno.env.set('WA_TOKEN','qa_local_token');Deno.env.set('WA_PHONE_NUMBER_ID','qa_local_phone');Deno.env.set('ANTHROPIC_API_KEY','qa_local');Deno.env.set('OPENAI_API_KEY','qa_local')
 let handler:((r:Request)=>Promise<Response>)|undefined
 const originalServe=Deno.serve,originalFetch=globalThis.fetch
 Deno.serve=((fn:unknown)=>{handler=fn as typeof handler;return {}}) as typeof Deno.serve
 const output:Record<string,unknown>[]=[],texts=new Map<string,unknown>(),audio=new Map<string,string>()
 let failAudio=false,recorte=false,outSeq=0
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=String(input)
   if(url.includes('api.openai.com')){if(failAudio)return Response.json({error:'QA'},{status:503});const f=(init!.body as FormData).get('file') as Blob;return Response.json({text:await f.text()})}
   if(url.includes('api.anthropic.com')){const body=JSON.parse(String(init!.body));const prompt=body.messages[0].content as string;const t=prompt.split('Mensaje del productor:\n"""\n')[1]?.split('\n"""')[0];const tool=texts.get(t);assert(tool,'Falta fixture de interpretación: '+t);return Response.json({content:[{type:'tool_use',input:tool}],stop_reason:recorte?'max_tokens':'tool_use',usage:{input_tokens:1,output_tokens:1}})}
   if(url.startsWith('https://qa-media/'))return new Response(audio.get(url.split('/').at(-1)!)!,{headers:{'content-type':'audio/ogg'}})
   if(url.includes('graph.facebook.com')){
     if(!init?.method||init.method==='GET'){const media=url.split('/').at(-1)!;return Response.json({url:'https://qa-media/'+media,mime_type:'audio/ogg'})}
     if(url.endsWith('/media'))return Response.json({id:'qa-media-out'})
     const body=JSON.parse(String(init.body));output.push(body);return Response.json({messages:[{id:'qa-out-'+(++outSeq)}]})
   }
   if(url.includes('arcgisonline.com'))return new Response('',{status:503})
   throw Error('Red externa no permitida en QA: '+url)
 }) as typeof fetch
 try{
   await import('../../../functions/wa-webhook/index.ts')
   const send=async(texto:string,porAudio=false)=>{
     const key='qa-audio-'+crypto.randomUUID();audio.set(key,texto)
     const m={id:'qa-webhook-'+crypto.randomUUID(),from:v1.telefono,type:porAudio?'audio':'text',...(porAudio?{audio:{id:key}}:{text:{body:texto}})}
     const body=JSON.stringify({entry:[{changes:[{value:{messages:[m]}}]}]})
     const cryptoKey=await crypto.subtle.importKey('raw',new TextEncoder().encode('qa_local_secret'),{name:'HMAC',hash:'SHA-256'},false,['sign'])
     const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(body)))].map(b=>b.toString(16).padStart(2,'0')).join('')
     const r=await handler!(new Request('https://local.invalid/functions/v1/wa-webhook',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+sig},body}))
     assert(r.status===200)
   }
   const pendiente={tipo:'dato' as const,capturaId:id(90),borrador:{tipo:'lluvia' as const,fecha:hoy},dato:'mm' as const}
   await db.guardarPendiente(V1,pendiente)
   failAudio=true;await send('ruido',true);failAudio=false
   const conservado=(await db.vinculoDe(v1.telefono))!.pendiente
   assert(conservado?.tipo==='dato' && conservado.capturaId===pendiente.capturaId && conservado.borrador.tipo==='lluvia','Se perdió el pendiente')
   await db.guardarPendiente(V1,null)
   await send('empezar recorrida en Campo QA ayer')
   const open=await store.sesionActiva(v1);assert(open?.fecha===ayer,'No abrió la sesión de ayer')
   texts.set('En el 7B de Campo QA hay poca agua',{intent:'novedad',observaciones:[{campo:'Campo QA',potrero:'7B',agua:'baja'}]})
   texts.set('En el 8B de Campo QA el eléctrico está cortado',{intent:'novedad',observaciones:[{campo:'Campo QA',potrero:'8B',electrico:'cortado'}]})
   await send('En el 7B de Campo QA hay poca agua',true)
   await send('En el 8B de Campo QA el eléctrico está cortado',true)
   assert((await store.sesionActiva(v1))!.borrador.observaciones?.length===2)
   assert((await admin`select 1 from observacion_potrero`).length===0,'Guardó antes de confirmar')
   await send('cerrar recorrida');await send('si')
   const saved=await admin`select r.fecha::text,o.potrero_id from recorrida r join observacion_potrero o on o.recorrida_id=r.id where r.empresa_id=${E1}`
   assert(saved.length===2&&saved.every(r=>r.fecha===ayer),'No guardó todos con fecha correcta')
   assert(await store.sesionActiva(v1)===null)
   texts.set('En Campo QA vi un eléctrico cortado, no recuerdo el potrero',{intent:'novedad',campo:'Campo QA',observaciones:[{campo:'Campo QA',electrico:'cortado',aca:true}]})
   await send('En Campo QA vi un eléctrico cortado, no recuerdo el potrero',true)
   const falta=(await db.vinculoDe(v1.telefono))!.pendiente
   assert(falta?.tipo==='ubicacion'&&falta.confirmaAlElegir,'La pregunta no declara que elegir confirma')
   const lastImage=output.filter(r=>r.type==='image').at(-1) as {image:{caption:string}}
   assert(lastImage.image.caption.includes('eléctrico cortado')&&lastImage.image.caption.includes('Al responder'))
   await send('7B')
   assert((await db.vinculoDe(v1.telefono))!.pendiente===null,'Pidió una segunda confirmación')
   assert((await admin`select 1 from observacion_potrero o join recorrida r on r.id=o.recorrida_id where r.fecha=${hoy} and o.potrero_id=${P1} and o.electrico='cortado'`).length===1)
   await db.guardarPendiente(V1,pendiente)
   texts.set('Llovió y además pagué gasoil',{intent:'lluvia',mm:10,otros_registros:['gasto']})
   await send('Llovió y además pagué gasoil')
   assert((await db.vinculoDe(v1.telefono))!.pendiente?.capturaId===pendiente.capturaId,'La mezcla borró el pendiente')
   texts.set('Mensaje que el proveedor recorta',{intent:'novedad',observaciones:[{potrero:'7B',agua:'baja'}]})
   recorte=true;await send('Mensaje que el proveedor recorta');recorte=false
   assert((await db.vinculoDe(v1.telefono))!.pendiente?.capturaId===pendiente.capturaId,'El recorte borró el pendiente')
   await db.guardarPendiente(V1,null)
   assert(!output.some(r=>(r as {to?:string}).to && r.to!==v1.telefono),'Envió a otro destinatario')
 }finally{Deno.serve=originalServe;globalThis.fetch=originalFetch}
})
await Deno.writeTextFile(Deno.env.get('WA_QA_REPORT') ?? new URL('./resultado.json',import.meta.url),JSON.stringify({entorno:'PostgreSQL local descartable, proveedores simulados; ningún mensaje real enviado',casos:results,fallas:fail},null,2))
await db.sql.end();await admin.end()
if(fail)Deno.exit(1)
