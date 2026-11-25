import { preguntaIdentificador,preguntaLugar } from './evaluacion.ts'
import postgres from 'npm:postgres@3.4.5'
import * as db from '../../../functions/wa-webhook/db.ts'
import * as store from '../../../functions/wa-webhook/asistente-store.ts'
import { herramientasAsistente } from '../../../functions/wa-webhook/asistente-herramientas.ts'
import { ejecutarOperacion } from '../../../functions/wa-webhook/asistente-operaciones.ts'
import { abrirOriginal } from '../../../functions/wa-webhook/asistente-archivos.ts'
import { hoyAR } from '../../../functions/_shared/wa/texto.ts'
import type { PedidoModelo,RespuestaModelo } from '../../../functions/_shared/wa/asistente.ts'

if(Deno.env.get('WA_QA_ASISTENTE')!=='1'||!Deno.env.get('SUPABASE_DB_URL')?.includes('@127.0.0.1:55443/postgres')||Deno.env.get('SUPABASE_URL')!=='https://qa.invalid')
  throw Error('Sólo PostgreSQL local descartable y canales simulados')
const admin=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,onnotice:()=>{}})
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const E1=id(1),E2=id(2),U1=id(11),U2=id(12),U3=id(13),C1=id(21),C2=id(22),P9=id(31),P8=id(32),PX=id(33),A48=id(51),A49=id(52),A048=id(53),AX=id(54),CAT=id(61)
const v1:db.Vinculo={id:id(41),telefono:'5491111111101',user_id:U1,empresa_id:E1,pendiente:null,pendiente_at:null}
const v2:db.Vinculo={...v1,id:id(42),telefono:'5491111111102',user_id:U2,empresa_id:E2}
const v3:db.Vinculo={...v1,id:id(43),telefono:'5491111111103',user_id:U3}
for(const [u,nombre,phone] of [[U1,'Productor A',v1.telefono],[U2,'Productor B',v2.telefono],[U3,'Encargado A',v3.telefono]])
  await admin`insert into auth.users(id,raw_user_meta_data,phone,phone_confirmed_at) values(${u},${admin.json({nombre})},${phone},now())`
await admin`insert into empresa values(${E1},'Empresa A'),(${E2},'Empresa B')`
await admin`insert into miembro_empresa(user_id,empresa_id,rol,niveles,acceso) values
  (${U1},${E1},'dueno',null,'app'),(${U2},${E2},'dueno',null,'app'),
  (${U3},${E1},'encargado',${admin.json({campos:'solo_manda',hacienda:'no',plata:'no'})},'whatsapp')`
await admin`insert into campo values(${C1},${E1},'La Porteña'),(${C2},${E2},'Campo Y')`
const pol=[[-36,-59.30],[-36,-59.29],[-36.01,-59.29],[-36.01,-59.30]]
await admin`insert into potrero(id,empresa_id,campo_id,nombre,poligono) values
  (${P9},${E1},${C1},'9B',${admin.json(pol)}),(${P8},${E1},${C1},'8B',${admin.json(pol.map(([lat,lng])=>[lat,lng+0.01]))}),
  (${PX},${E2},${C2},'9B',${admin.json(pol)})`
for(const v of [v1,v2,v3])await admin`insert into wa_vinculo(id,telefono,user_id,empresa_id) values(${v.id},${v.telefono},${v.user_id},${v.empresa_id})`
await admin`insert into animal(id,empresa_id,potrero_id,estado,categoria) values
  (${A48},${E1},${P9},'activo','vaca'),(${A49},${E1},${P9},'activo','vaca'),(${A048},${E1},${P8},'activo','vaca'),(${AX},${E2},${PX},'activo','vaca')`
await admin`insert into caravana(empresa_id,animal_id,numero_visual,numero_rfid) values
  (${E1},${A48},'48','RFID-A48'),(${E1},${A49},'49','RFID-A49'),(${E1},${A048},'048','RFID-A048'),(${E2},${AX},'48','RFID-B48')`
await admin`insert into evento(empresa_id,animal_id,tipo,nota) values(${E2},${AX},'nota','PRIVADO_PRODUCTOR_B')`
await admin`insert into categoria_movimiento(id,empresa_id,nombre) values(${CAT},${E1},'Sanidad')`

const assert:(ok:unknown,m?:string)=>asserts ok=(ok,m='Assertion falló')=>{if(!ok)throw Error(m)}
let fallas=0,casos=0
const resultados:{caso:string;estado:string;error?:string}[]=[],fallidas:unknown[]=[]
async function limpiarChat(){
  await admin`delete from interno.wa_asistente_propuesta`
  await admin`delete from interno.wa_asistente_evidencia`
  await admin`delete from interno.wa_asistente_turno`
  await admin`delete from captura`
  await admin`delete from interno.wa_cola`
  await admin`delete from wa_mensaje`
  await admin`update wa_vinculo set pendiente=null,pendiente_at=null`
}
async function test(nombre:string,fn:()=>Promise<void>){casos++;try{await limpiarChat();await fn();resultados.push({caso:nombre,estado:'pasa'});console.log('PASA',nombre)}catch(e){fallas++;resultados.push({caso:nombre,estado:'falla',error:String(e)});console.error('FALLA',nombre,e)}}
async function denegado(fn:()=>Promise<unknown>){let fallo=false;try{await fn()}catch{fallo=true}assert(fallo,'Debía denegarse')}
async function directo(v:db.Vinculo,texto:string,ubicacion?:{latitude:number;longitude:number}){
  const mensaje=await db.guardarEntrante({wamid:'qa-'+crypto.randomUUID(),telefono:v.telefono,tipo:'text',cuerpo:{text:{body:texto}},vinculo:v})
  assert(mensaje)
  const m={id:mensaje}
  await store.iniciarTurno(v,m.id,texto,'texto')
  const ctx=await db.contexto(v,hoyAR())
  const herramientas=herramientasAsistente(v,ctx,m.id,{mensaje:texto,ubicacion,historial:await store.historial(v,m.id),
    consultar:async b=>JSON.stringify(await db.hacienda(v,b)),leer:async()=>({estado:'leido'}),mapa:async()=>({estado:'generado'})})
  await herramientas.contexto()
  return {id:m.id,t:herramientas,ctx}
}
async function propuestaDe(v:db.Vinculo,mensaje:string,entrada:Record<string,unknown>){
  const d=await directo(v,mensaje)
  const r=await d.t.ejecutar('proponer_registro',{fuente:mensaje,...entrada}) as {estado:string}
  assert(r.estado==='propuesta',JSON.stringify(r))
  const [p]=await store.propuestas(v)
  assert(p)
  return {p,d}
}
const confirmar=(v:db.Vinculo,p:store.PropuestaAsistente)=>store.confirmarPropuesta(v,p.id,p.revision,(tx,p)=>ejecutarOperacion(tx,v,p))

await test('Misma caravana en dos productores: búsquedas concurrentes sólo devuelven su cuenta',async()=>{
  const [a,b]=await Promise.all([directo(v1,'Buscá la 48'),directo(v2,'Buscá la 48')])
  const [ra,rb]=await Promise.all([a.t.ejecutar('buscar_animal',{identificador:'48'}),b.t.ejecutar('buscar_animal',{identificador:'48'})])
  assert(JSON.stringify(ra).includes('La Porteña')&&!JSON.stringify(ra).includes('Campo Y'))
  assert(JSON.stringify(rb).includes('Campo Y')&&!JSON.stringify(rb).includes('La Porteña'))
  assert(!JSON.stringify(ra).includes('048'),'Se equipararon ceros')
  const x=await a.t.ejecutar('buscar_animal',{identificador:'048'})
  assert(JSON.stringify(x).includes('8B')&&!JSON.stringify(x).includes('9B'))
})
await test('Historial, archivos y propuestas son privados incluso entre dos personas de la misma empresa',async()=>{
  const a=await directo(v1,'PRIVADO_PRODUCTOR_A'),b=await directo(v2,'PRIVADO_PRODUCTOR_B'),c=await directo(v3,'PRIVADO_ENCARGADO')
  await store.guardarEvidencia(v1,a.id,{media:'documentoA',nombre:'FACTURA_PRIVADA_A.pdf',estado:'recibida'})
  await store.guardarEvidencia(v2,b.id,{media:'documentoB',nombre:'FACTURA_PRIVADA_B.pdf',estado:'recibida'})
  await store.guardarEvidencia(v3,c.id,{media:'documentoC',nombre:'FACTURA_PRIVADA_C.pdf',estado:'recibida'})
  const siguiente=await directo(v1,'¿Qué te pasé?')
  const historia=JSON.stringify(await store.historial(v1,siguiente.id))
  assert(historia.includes('PRIVADO_PRODUCTOR_A')&&!historia.includes('PRIVADO_PRODUCTOR_B')&&!historia.includes('PRIVADO_ENCARGADO'))
  const archivos=JSON.stringify(await store.evidencias(v1))
  assert(archivos.includes('FACTURA_PRIVADA_A')&&!archivos.includes('FACTURA_PRIVADA_B')&&!archivos.includes('FACTURA_PRIVADA_C'))
  const [ajeno]=await store.evidencias(v2)
  await denegado(()=>abrirOriginal(v1,ajeno))
})
await test('Punto compartido: consulta geométrica privada sin asociar un aviso ni modificar el stock',async()=>{
  const d=await directo(v1,'Te comparto este punto',{latitude:-36.005,longitude:-59.295})
  const r=await d.t.ejecutar('ubicar_punto_compartido',{}) as {estado:string;campo:string;potrero:string;relacion_con_hecho:string}
  assert(r.estado==='ubicado'&&r.campo==='La Porteña'&&r.potrero==='9B',JSON.stringify(r))
  assert(r.relacion_con_hecho==='no_confirmada')
  assert(!(await store.propuestas(v1)).length)
  assert((await admin`select estado from animal where id=${A48}`)[0].estado==='activo')
  assert(!JSON.stringify(r).includes('Campo Y'))
})
await test('Ubicación no recibida, coordenadas inventadas, límites y permiso de mapa no habilitan una ubicación',async()=>{
  const d=await directo(v1,'No sé dónde fue')
  assert((await d.t.ejecutar('ubicar_punto_compartido',{}) as {estado:string}).estado==='sin_punto_compartido')
  assert((await d.t.ejecutar('ubicar_punto_compartido',{latitude:-36.005,longitude:-59.295}) as {estado:string}).estado==='entrada_invalida')
  const borde=await directo(v1,'Punto en el límite',{latitude:-36.005,longitude:-59.29})
  assert((await borde.t.ejecutar('ubicar_punto_compartido',{}) as {estado:string}).estado==='sin_coincidencia_unica')
  const otro=await directo(v2,'Punto de otra cuenta',{latitude:-36.005,longitude:-59.285})
  assert((await otro.t.ejecutar('ubicar_punto_compartido',{}) as {estado:string}).estado==='sin_coincidencia_unica')
  const sinPermiso=await directo(v3,'Ubicación compartida',{latitude:-36.005,longitude:-59.295})
  assert((await sinPermiso.t.ejecutar('ubicar_punto_compartido',{}) as {estado:string}).estado==='sin_permiso')
})
await test('Aviso sin potrero conserva fecha y relato al ubicarlo después, sin duplicarlo ni ejecutar la carga',async()=>{
  const d=await directo(v1,'Encontré una vaquillona muerta en La Porteña, no sé el potrero')
  const r=await d.t.ejecutar('proponer_registro',{tipo:'observacion',fuente:'Encontré una vaquillona muerta',campo:'La Porteña',descripcion:'Encontré una vaquillona muerta, cerca del molino'}) as {estado:string;puede_confirmar:boolean}
  assert(r.estado==='incompleta'&&r.puede_confirmar===false,JSON.stringify(r))
  const [original]=await store.propuestas(v1)
  const entrada=original.datos.entrada as Record<string,unknown>
  assert(entrada.fecha===d.ctx.fechaMensaje||entrada.fecha===d.ctx.hoy,'La propuesta incompleta perdió la fecha resuelta')
  assert((await confirmar(v1,original)).estado==='no_disponible')
  const siguiente=await directo(v1,'Ya lo ubiqué, fue en el 9B')
  siguiente.ctx.fechaMensaje='2099-01-01';siguiente.ctx.hoy='2099-01-01'
  const referencia=(await siguiente.t.ejecutar('ver_pendientes',{}) as {propuestas:{referencia:string}[]}).propuestas[0].referencia
  await siguiente.t.ejecutar('proponer_registro',{tipo:'observacion',referencia_propuesta:referencia,fuente:'fue en el 9B',potrero:'9B'})
  const pendientes=await store.propuestas(v1)
  assert(pendientes.length===1&&pendientes[0].id===original.id&&pendientes[0].estado==='propuesta',JSON.stringify(pendientes))
  assert(pendientes[0].datos.fecha===entrada.fecha&&String(pendientes[0].datos.descripcion).includes('vaquillona'))
  assert(pendientes[0].datos.potreroId===P9)
  const stock=await siguiente.t.ejecutar('resolver_lugar',{campo:'La Porteña',potrero:'9B'}) as {hacienda:{alcance:{tipo:string;campo:string;potrero:string}}}
  assert(stock.hacienda.alcance.tipo==='potrero'&&stock.hacienda.alcance.potrero==='9B'&&stock.hacienda.alcance.campo==='La Porteña')
  assert(!(await admin`select 1 from observacion_potrero where id=${original.id}`).length)
})
await test('Una operación sobre Hacienda sin identidades no se prepara como baja, movimiento o vacunación',async()=>{
  for(const tipo of ['muerte','movimiento','vacunacion']){
    const d=await directo(v1,'El empleado informó un hecho del campo, sin caravana')
    const r=await d.t.ejecutar('proponer_registro',{tipo,fuente:'El empleado informó un hecho del campo',campo:'La Porteña'}) as {estado:string}
    assert(r.estado==='requiere_animal_identificado',JSON.stringify(r))
    assert(!(await store.propuestas(v1)).length)
  }
})
await test('Completar una propuesta no puede convertir una observación en una operación distinta',async()=>{
  const d=await directo(v1,'Encontré una vaquillona muerta en La Porteña, todavía no sé el potrero')
  await d.t.ejecutar('proponer_registro',{tipo:'observacion',fuente:'Encontré una vaquillona muerta',campo:'La Porteña'})
  const [original]=await store.propuestas(v1)
  const siguiente=await directo(v1,'El hecho fue en el 9B')
  const ref=(await siguiente.t.ejecutar('ver_pendientes',{}) as {propuestas:{referencia:string}[]}).propuestas[0].referencia
  const r=await siguiente.t.ejecutar('proponer_registro',{tipo:'muerte',fuente:'El hecho fue en el 9B',referencia_propuesta:ref,potrero:'9B'}) as {estado:string}
  assert(r.estado==='requiere_propuesta_distinta',JSON.stringify(r))
  const [actual]=await store.propuestas(v1)
  assert(actual.id===original.id&&actual.revision===original.revision&&actual.estado==='incompleta')
  assert((actual.datos.entrada as Record<string,unknown>).tipo==='observacion')
})
await test('Argumentos del modelo no pueden cambiar empresa, usuario, vínculo o SQL',async()=>{
  const {t}=await directo(v1,'Buscá la 48')
  for(const extra of [{empresa_id:E2},{user_id:U2},{vinculo_id:v2.id},{sql:'select * from animal'}]){
    const r=await t.ejecutar('buscar_animal',{identificador:'48',...extra}) as {estado:string}
    assert(r.estado==='entrada_invalida',JSON.stringify(r))
  }
  const r=await t.ejecutar('proponer_registro',{tipo:'muerte',fuente:'Buscá la 48',animales:['animal:1']})
  assert(JSON.stringify(r).includes('referencia_animal_invalida'))
})
await test('Un vínculo o una membresía falsificados no recuperan historial ni evidencias',async()=>{
  const a=await directo(v1,'Privado A')
  await denegado(()=>store.historial({...v1,user_id:U2},a.id))
  await denegado(()=>store.historial({...v1,empresa_id:E2},a.id))
  await denegado(()=>store.historial({...v1,telefono:v2.telefono},a.id))
  await denegado(()=>db.comoUsuario(v1,tx=>tx`select * from interno.wa_asistente_turno`))
})
await test('Lectura denegada no obtiene Hacienda por otro nombre de herramienta',async()=>{
  const {t}=await directo(v3,'Decime cuántos animales hay y buscá la 48')
  for(const [nombre,entrada] of [['buscar_animal',{identificador:'48'}],['consultar_registros',{tipo:'hacienda'}]] as const){
    const r=await t.ejecutar(nombre,entrada)
    assert(JSON.stringify(r).includes('sin_permiso'),JSON.stringify(r))
  }
  const actor=await directo(v1,'Buscá la 48')
  await admin`update miembro_empresa set rol='invitado',niveles='{}' where user_id=${U1} and empresa_id=${E1}`
  try{assert(JSON.stringify(await actor.t.ejecutar('buscar_animal',{identificador:'48'})).includes('sin_permiso'))}
  finally{await admin`update miembro_empresa set rol='dueno',niveles=null where user_id=${U1} and empresa_id=${E1}`}
})
await test('Proponer no escribe; confirmar en paralelo ejecuta una sola vez y nadie ajeno puede aprobar',async()=>{
  const {p}=await propuestaDe(v1,'Anotá 17 mm en La Porteña',{tipo:'lluvia',campo:'La Porteña',mm:17})
  assert(!(await admin`select 1 from lluvia where id=${p.id}`).length)
  assert((await confirmar(v2,p)).estado==='no_disponible')
  assert((await confirmar(v3,p)).estado==='no_disponible')
  const r=await Promise.all([confirmar(v1,p),confirmar(v1,p),confirmar(v1,p)])
  assert(r.filter(x=>x.estado==='confirmada').length===1)
  assert((await admin`select 1 from lluvia where id=${p.id} and empresa_id=${E1} and mm=17`).length===1)
})
await test('Revocar permiso después de proponer impide guardar con un botón anterior',async()=>{
  const {p}=await propuestaDe(v1,'Anotá 18 mm en La Porteña',{tipo:'lluvia',campo:'La Porteña',mm:18})
  await admin`update miembro_empresa set rol='invitado',niveles=${admin.json({campos:'ve'})} where user_id=${U1} and empresa_id=${E1}`
  try{assert((await confirmar(v1,p)).estado==='sin_permiso');assert(!(await admin`select 1 from lluvia where id=${p.id}`).length)}
  finally{await admin`update miembro_empresa set rol='dueno',niveles=null where user_id=${U1} and empresa_id=${E1}`}
})
await test('Una corrección recupera datos pendientes e invalida la versión anterior',async()=>{
  const {p}=await propuestaDe(v1,'Anotá 19 mm en La Porteña',{tipo:'lluvia',campo:'La Porteña',mm:19})
  const siguiente=await directo(v1,'Eran 21 mm')
  const contexto=await siguiente.t.contexto()
  const ref=contexto.propuestas.find(x=>x.datos.fuente==='Anotá 19 mm en La Porteña')!.referencia
  const r=await siguiente.t.ejecutar('proponer_registro',{tipo:'lluvia',fuente:'Eran 21 mm',mm:21,referencia_propuesta:ref})
  assert(JSON.stringify(r).includes('propuesta'))
  const actual=(await store.propuestas(v1)).find(x=>x.id===p.id)!
  assert(actual.revision!==p.revision)
  assert((await confirmar(v1,p)).estado==='version_anterior')
  assert((await confirmar(v1,actual)).estado==='confirmada')
  assert((await admin`select mm::float8 as mm from lluvia where id=${p.id}`)[0].mm===21)
})
await test('Una falla dentro de la confirmación revierte la escritura y la propuesta juntas',async()=>{
  const {p}=await propuestaDe(v1,'Anotá 22 mm en La Porteña',{tipo:'lluvia',campo:'La Porteña',mm:22})
  await denegado(()=>store.confirmarPropuesta(v1,p.id,p.revision,async(tx,p)=>{await ejecutarOperacion(tx,v1,p);throw Error('Corte antes del commit')}))
  assert(!(await admin`select 1 from lluvia where id=${p.id}`).length)
  assert((await store.resultadoPropuesta(v1,p.id,p.revision))?.estado==='propuesta')
})
await test('Muerte identificada usa la RPC real, sin dar de baja antes de confirmar ni duplicar el evento',async()=>{
  const d=await directo(v1,'La vaca 48 está muerta en La Porteña')
  await d.t.ejecutar('buscar_animal',{identificador:'48'})
  const r=await d.t.ejecutar('proponer_registro',{tipo:'muerte',fuente:'La vaca 48 está muerta en La Porteña',animales:['animal:1']})
  assert(JSON.stringify(r).includes('propuesta'))
  assert((await admin`select estado from animal where id=${A48}`)[0].estado==='activo')
  const [p]=await store.propuestas(v1)
  await confirmar(v1,p);await confirmar(v1,p)
  assert((await admin`select estado from animal where id=${A48}`)[0].estado==='muerto')
  assert((await admin`select 1 from evento where animal_id=${A48} and tipo='baja'`).length===1)
  await admin`update animal set estado='activo' where id=${A48}`
})
await test('Revalidar caravana y potrero impide ejecutar una ficha que cambió',async()=>{
  const d=await directo(v1,'La 49 está muerta')
  await d.t.ejecutar('buscar_animal',{identificador:'49'})
  await d.t.ejecutar('proponer_registro',{tipo:'muerte',fuente:'La 49 está muerta',animales:['animal:1']})
  const [p]=await store.propuestas(v1)
  await admin`update animal set potrero_id=${P8} where id=${A49}`
  try{await denegado(()=>confirmar(v1,p));assert((await admin`select estado from animal where id=${A49}`)[0].estado==='activo')}
  finally{await admin`update animal set potrero_id=${P9} where id=${A49}`}
})
await test('Movimientos y altas usan las RPC reales dentro de la transacción',async()=>{
  const d=await directo(v1,'Pasá la 49 al 8B')
  await d.t.ejecutar('buscar_animal',{identificador:'49'})
  await d.t.ejecutar('proponer_registro',{tipo:'movimiento',fuente:'Pasá la 49 al 8B',animales:['animal:1'],destino:'8B'})
  const [p]=await store.propuestas(v1)
  assert((await confirmar(v1,p)).estado==='confirmada')
  assert((await admin`select potrero_id from animal where id=${A49}`)[0].potrero_id===P8)
  const cantidad=(await admin`select count(*)::int as n from animal where empresa_id=${E1}`)[0].n
  const alta=await propuestaDe(v1,'Ingresaron dos terneras al 8B',{tipo:'alta',potrero:'8B',categoria_animal:'ternera',cantidad:2})
  await confirmar(v1,alta.p)
  assert((await admin`select count(*)::int as n from animal where empresa_id=${E1}`)[0].n===cantidad+2)
  await admin`update animal set potrero_id=${P9} where id=${A49}`
})

// Canal WhatsApp y archivo privado simulados. Sólo Anthropic puede salir a red en modo real.
const modeloReal=Deno.env.get('WA_QA_MODELO_REAL')==='1'
let realActivo=false
for(const [k,v] of Object.entries({WA_APP_SECRET:'qa_asistente_secret',WA_TOKEN:'qa_meta_only',WA_PHONE_NUMBER_ID:'qa_phone',OPENAI_API_KEY:'qa_transcribe_only',
  WA_QUEUE_ENABLED:'true',WA_PILOT_TENANTS:E1+','+E2,WA_ASISTENTE_EMPRESAS:E1+','+E2}))Deno.env.set(k,v)
if(!modeloReal)Deno.env.set('ANTHROPIC_API_KEY','qa_model_only')
let handler:((r:Request)=>Promise<Response>)|undefined
const originalServe=Deno.serve,originalFetch=globalThis.fetch
Deno.serve=((fn:unknown)=>{handler=fn as typeof handler;return {}}) as typeof Deno.serve
const salidas:Record<string,unknown>[]=[],peticiones:Record<string,unknown>[]=[],estadosModelo:number[]=[],respuestasDiagnostico:unknown[]=[]
const archivosPrivados=new Map<string,{bytes:Uint8Array;mime:string}>()
const mediaEntrante=new Map<string,{bytes:Uint8Array;mime:string}>([
  ['qa-audio',{bytes:new Uint8Array([79,103,103,83]),mime:'audio/ogg'}],
  ['qa-csv',{bytes:new TextEncoder().encode('Animal;Producto;Día\n48;Aftosa;'+hoyAR()+'\n49;Aftosa;'+hoyAR()),mime:'text/csv'}],
])
let transcripcion='',seq=0,fallarEnvio=false
let ultimaRespuestaSimulada:RespuestaModelo|undefined
let responderModelo:(p:Record<string,unknown>)=>RespuestaModelo=()=>({stop_reason:'end_turn',content:[{type:'text',text:'¿Qué necesitás revisar del campo?'}]})
const pedirHerramientas=(...h:{nombre:string;entrada:unknown}[]):RespuestaModelo=>({stop_reason:'tool_use',content:h.map((x,i)=>({type:'tool_use',id:'qa_tool_'+(++seq)+'_'+i,name:x.nombre,input:x.entrada}))})
const finalizar=(texto:string):RespuestaModelo=>({stop_reason:'end_turn',content:[{type:'text',text:texto}]})
const ultimosResultados=(p:Record<string,unknown>)=>{
  const mensajes=p.messages as {content:{type:string;content?:unknown}[]}[]
  return mensajes.at(-1)!.content.filter(c=>c.type==='tool_result').map(c=>typeof c.content==='string'?JSON.parse(c.content):c.content)
}
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input)
  if(url==='https://api.anthropic.com/v1/messages'){
    const p=JSON.parse(String(init?.body));peticiones.push(p)
    assert(p.model==='claude-haiku-5-5'&&!('temperature'in p)&&['auto','none'].includes(p.tool_choice.type),'El asistente no usa el contrato nuevo')
    if(realActivo){const r=await originalFetch(input,init);estadosModelo.push(r.status);const j=await r.clone().json();respuestasDiagnostico.push({status:r.status,stop:j.stop_reason,uso:j.usage,textos:j.content?.filter((b:{type:string})=>b.type==='text').map((b:{text:string})=>b.text),error:j.error?.type});return r}
    if(Array.isArray(p.tools)&&p.tools.length===0){
      assert(ultimaRespuestaSimulada?.stop_reason==='end_turn','El cierre debe seguir al turno con herramientas')
      return Response.json(ultimaRespuestaSimulada)
    }
    ultimaRespuestaSimulada=responderModelo(p)
    return Response.json(ultimaRespuestaSimulada)
  }
  if(url.includes('api.openai.com/v1/audio/transcriptions'))return Response.json({text:transcripcion})
  if(url.startsWith('https://qa.invalid/storage/v1/object/wa-evidencias/')){
    const ruta=url.split('/wa-evidencias/')[1]
    archivosPrivados.set(ruta,{bytes:new Uint8Array(init?.body as Uint8Array),mime:new Headers(init?.headers).get('Content-Type')??'application/octet-stream'})
    return Response.json({Key:ruta})
  }
  if(url.startsWith('https://qa.invalid/storage/v1/object/authenticated/wa-evidencias/')){
    const f=archivosPrivados.get(url.split('/wa-evidencias/')[1])
    return f?new Response(f.bytes as Uint8Array<ArrayBuffer>,{headers:{'Content-Type':f.mime}}):new Response('',{status:404})
  }
  if(url.startsWith('https://qa.invalid/media/')){
    const f=mediaEntrante.get(url.split('/').at(-1)!)
    return f?new Response(f.bytes as Uint8Array<ArrayBuffer>):new Response('',{status:404})
  }
  if(url.includes('graph.facebook.com')){
    const media=mediaEntrante.get(url.split('/').at(-1)!)
    if(media)return Response.json({url:'https://qa.invalid/media/'+url.split('/').at(-1),mime_type:media.mime})
    if(url.endsWith('/media'))return Response.json({id:'qa-file-out-'+(++seq)})
    const cuerpo=JSON.parse(String(init?.body))
    if(cuerpo.status!=='read'){
      if(fallarEnvio)throw Error('Fallo de entrega simulado')
      salidas.push(cuerpo)
    }
    return Response.json({messages:[{id:'qa-out-'+(++seq)}]})
  }
  if(url.includes('arcgisonline.com'))return new Response('',{status:503})
  throw Error('Red externa bloqueada en QA: '+url)
}) as typeof fetch
await import('../../../functions/wa-webhook/index.ts')
async function firmado(v:db.Vinculo,contenido:Record<string,unknown>,wamid='qa-'+crypto.randomUUID()){
  const body=JSON.stringify({entry:[{changes:[{value:{messages:[{id:wamid,from:v.telefono,...contenido}]}}]}]})
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('qa_asistente_secret'),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))].map(x=>x.toString(16).padStart(2,'0')).join('')
  const antes=salidas.length
  const r=await handler!(new Request('https://qa.invalid/functions/v1/wa-webhook',{method:'POST',headers:{'x-hub-signature-256':'sha256='+sig},body}))
  assert(r.status===200,'Webhook no aceptó la solicitud: '+r.status)
  return salidas.slice(antes)
}
const enviarTexto=(v:db.Vinculo,body:string)=>firmado(v,{type:'text',text:{body}})
const textoSalida=(salida:Record<string,unknown>[])=>salida.map(s=>(s.text as {body:string}|undefined)?.body??(s.interactive as {body:{text:string}}|undefined)?.body.text??'').filter(Boolean).join('\n')
const botonesSalida=(salida:Record<string,unknown>[])=>salida.flatMap(s=>{
  const i=s.interactive as {action?:{buttons?:{reply:{id:string}}[];sections?:{rows:{id:string}[]}[]}}|undefined
  return [...(i?.action?.buttons?.map(b=>b.reply.id)??[]),...(i?.action?.sections?.flatMap(x=>x.rows.map(r=>r.id))??[])]
})
const pulsar=(v:db.Vinculo,boton:string)=>firmado(v,{type:'interactive',interactive:{button_reply:{id:boton,title:'Guardar'}}})

await test('Webhook de audio: una respuesta reúne lluvia y eléctrico; la confirmación es independiente',async()=>{
  transcripcion='Anotá 25 mm en La Porteña y en el 9B encontré el eléctrico cortado'
  let ronda=0
  responderModelo=()=>++ronda===1?pedirHerramientas(
    {nombre:'proponer_registro',entrada:{tipo:'lluvia',fuente:'Anotá 25 mm en La Porteña',campo:'La Porteña',mm:25}},
    {nombre:'proponer_registro',entrada:{tipo:'observacion',fuente:'en el 9B encontré el eléctrico cortado',potrero:'9B',electrico:'cortado',descripcion:'El eléctrico estaba cortado'}},
  ):finalizar('Entendí los 25 mm en La Porteña y el eléctrico cortado en el 9B. Te dejo las dos cargas para revisar y confirmar.')
  const salida=await firmado(v1,{type:'audio',audio:{id:'qa-audio'}})
  assert(salida.filter(s=>s.type!=='image').length===1,JSON.stringify(salida))
  assert(textoSalida(salida).includes('25 mm')&&textoSalida(salida).includes('eléctrico cortado'))
  const p=await store.propuestas(v1)
  assert(p.length===2&&p.every(p=>p.estado==='propuesta'))
  assert(!(await admin`select 1 from lluvia where id=any(${p.map(x=>x.id)}::uuid[])`).length)
  assert((await store.evidencias(v1)).some(e=>e.estado==='archivada'&&e.texto===transcripcion))
})
await test('Un webhook duplicado no repite el razonamiento ni crea otra propuesta',async()=>{
  let llamadas=0
  responderModelo=()=>{llamadas++;return finalizar('Hola, ¿cómo viene el campo?')}
  const wamid='qa-duplicado-'+crypto.randomUUID()
  await firmado(v1,{type:'text',text:{body:'Hola'}},wamid)
  await firmado(v1,{type:'text',text:{body:'Hola'}},wamid)
  assert(llamadas===1)
  assert((await admin`select 1 from interno.wa_asistente_turno`).length===1)
})
await test('Un fallo del proveedor conserva audio y transcripción sin pasar al intérprete anterior',async()=>{
  transcripcion='Encontré una caja sin etiqueta junto al molino'
  responderModelo=()=>{throw Error('Proveedor de QA caído')}
  const salida=await firmado(v1,{type:'audio',audio:{id:'qa-audio'}})
  const [turno]=await admin`select estado,texto from interno.wa_asistente_turno`
  assert(turno.estado==='error'&&turno.texto===transcripcion)
  assert((await store.evidencias(v1))[0].estado==='archivada')
  assert(!textoSalida(salida).includes('Me quedó por aclarar'))
  assert(!(await store.propuestas(v1)).length)
})


mediaEntrante.set('qa-xlsx',{bytes:await Deno.readFile(new URL('./muestras/planilla-desconocida.xlsx',import.meta.url)),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
function pdfFicticio(personalizado?:string[]):Uint8Array {
  const lineas=personalizado??['Factura Veterinaria de Prueba','Fecha 23/11/2026','Aplicacion de vacunas','Total 35000','Importe final 42000']
  const contenido='BT /F1 12 Tf 50 780 Td 18 TL\n'+lineas.map((l,i)=>`${i?'T* ':''}(${l}) Tj`).join('\n')+'\nET\n'
  const objetos=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${contenido.length} >>\nstream\n${contenido}endstream`]
  let pdf='%PDF-1.4\n'
  const offsets=objetos.map((o,i)=>{const n=pdf.length;pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;return String(n).padStart(10,'0')+' 00000 n \n'})
  const xref=pdf.length
  pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}
mediaEntrante.set('qa-factura',{bytes:pdfFicticio(),mime:'application/pdf'})
mediaEntrante.set('qa-factura-simple',{bytes:pdfFicticio(['Factura veterinaria','Cliente: La Loma SRL','Fecha '+hoyAR(),'Visita profesional','Total 35000']),mime:'application/pdf'})
for(const tipo of ['csv','xlsx'])await test(`Planilla ${tipo.toUpperCase()} sin plantilla: lectura, caravanas y vacunación confirmada`,async()=>{
  let ronda=0
  responderModelo=p=>{
    if(++ronda===1)return pedirHerramientas({nombre:'leer_archivo',entrada:{referencia:'archivo:1'}})
    if(ronda===2){
      const [lectura]=ultimosResultados(p)
      assert(lectura.estado==='leido'&&lectura.tipo==='planilla'&&lectura.filas.length===3,JSON.stringify(lectura))
      return pedirHerramientas({nombre:'buscar_animales',entrada:{identificadores:['48','49'],campo:'La Porteña'}})
    }
    if(ronda===3){
      const [busqueda]=ultimosResultados(p)
      assert(busqueda.animales.length===2&&busqueda.sinCoincidencia.length===0)
      return pedirHerramientas({nombre:'proponer_registro',entrada:{tipo:'vacunacion',fuente:'archivo:1',campo:'La Porteña',vacuna:'Aftosa',
        animales:busqueda.animales.map((a:{referencia:string})=>a.referencia),fecha:hoyAR()}})
    }
    return finalizar('Leí la planilla y encontré las dos caravanas en La Porteña. La vacunación con Aftosa está lista para que la revises y confirmes.')
  }
  const salida=await firmado(v1,{type:'document',document:{id:'qa-'+tipo,filename:'Trabajo del veterinario.'+tipo,
    mime_type:mediaEntrante.get('qa-'+tipo)!.mime,caption:'Te paso lo que pinchamos hoy en La Porteña'}})
  const [p]=await store.propuestas(v1)
  assert(p?.datos.tipo==='vacunacion'&&Array.isArray(p.datos.animales)&&(p.datos.animales as unknown[]).length===2,JSON.stringify(salida))
  assert(typeof p.datos.archivoId==='string','Se perdió la procedencia del archivo')
  const boton=botonesSalida(salida).find(b=>b.startsWith('waas|si|'))
  assert(boton,JSON.stringify(salida))
  await pulsar(v1,boton);await pulsar(v1,boton)
  assert((await admin`select 1 from evento where empresa_id=${E1} and animal_id=any(${[A48,A49]}::uuid[]) and tipo='sanidad' and datos->>'vacuna_normalizada'='aftosa'`).length===2)
  assert(!(await admin`select 1 from evento where empresa_id=${E2} and tipo='sanidad'`).length)
  const [c]=await admin`select escrito_id,escrito_tabla from captura where id=${p.captura_id}`
  assert(c.escrito_tabla==='evento'&&(await admin`select 1 from evento where id=${c.escrito_id} and empresa_id=${E1}`).length===1,'La confirmación no apunta a un evento sanitario real')
})
await test('PDF con dos importes: lectura general y devolución del original sin crear gasto',async()=>{
  let ronda=0
  responderModelo=p=>{
    if(++ronda===1)return pedirHerramientas({nombre:'leer_archivo',entrada:{referencia:'archivo:1'}})
    const lectura=JSON.stringify(ultimosResultados(p))
    assert(lectura.includes('35000')&&lectura.includes('42000'),'No recibió los dos importes del PDF')
    return finalizar('El PDF trae un total de 35.000 y un importe final de 42.000. ¿Cuál corresponde al gasto?')
  }
  const recibido=await firmado(v1,{type:'document',document:{id:'qa-factura',filename:'Factura veterinaria desconocida.pdf',mime_type:'application/pdf',caption:'Te paso la factura del veterinario'}})
  assert(textoSalida(recibido).includes('35.000')&&textoSalida(recibido).includes('42.000'))
  assert(!(await store.propuestas(v1)).length)
  const [e]=await store.evidencias(v1)
  assert(e.estado==='archivada'&&e.ruta?.startsWith(E1+'/'+U1+'/'+v1.id))
  ronda=0
  responderModelo=()=>++ronda===1?pedirHerramientas({nombre:'enviar_archivo',entrada:{referencia:'archivo:1'}}):finalizar('Te paso el PDF original de esa factura.')
  const original=await enviarTexto(v1,'Pasame el PDF original de esa factura')
  assert(original.filter(x=>x.type==='document').length===1,JSON.stringify(original))
  assert(!(await store.evidencias(v2)).length)
})
mediaEntrante.set('qa-imagen',{bytes:new Uint8Array([137,80,78,71,13,10,26,10]),mime:'image/png'})
await test('Una foto original se devuelve como imagen privada, también al recuperar una salida pendiente',async()=>{
  responderModelo=()=>finalizar('Recibí la foto del campo.')
  await firmado(v1,{type:'image',image:{id:'qa-imagen',mime_type:'image/png',caption:'Foto del bebedero'}})
  let ronda=0
  responderModelo=()=>++ronda===1?pedirHerramientas({nombre:'enviar_archivo',entrada:{referencia:'archivo:1'}}):finalizar('Te paso la foto original del bebedero.')
  const original=await enviarTexto(v1,'Pasame la foto original del bebedero')
  assert(original.filter(x=>x.type==='image').length===1&&!original.some(x=>x.type==='document'),JSON.stringify(original))
  const [turno]=await admin`select t.mensaje_id,m.cuerpo from interno.wa_asistente_turno t join wa_mensaje m on m.id=t.mensaje_id where t.texto='Pasame la foto original del bebedero'`
  assert(turno)
  await admin`update interno.wa_asistente_turno set salida_estado='pendiente' where mensaje_id=${turno.mensaje_id}`
  const {atenderAsistente}=await import('../../../functions/wa-webhook/asistente.ts')
  const antes=salidas.length
  await atenderAsistente(turno.cuerpo as never,turno.mensaje_id,v1,await db.contexto(v1,hoyAR()),{
    responder:async()=>{},consultar:async()=>{throw Error('No debe reconsultar')},enviarImagen:async()=>{throw Error('No es un mapa')},
  })
  assert(salidas.slice(antes).filter(x=>x.type==='image').length===1)
  assert(!(await store.evidencias(v2)).length)
})
await test('Un original fuera de los formatos de salida se conserva sin prometer un envío',async()=>{
  const {t,id:mensajeId}=await directo(v1,'Guardá este original')
  await store.guardarEvidencia(v1,mensajeId,{media:'qa-webp',nombre:'campo.webp',mime:'image/webp',tamano:100,ruta:'privada',estado:'archivada'})
  await t.ejecutar('buscar_archivos',{})
  const r=await t.ejecutar('enviar_archivo',{referencia:'archivo:1'}) as {estado:string}
  assert(r.estado==='formato_no_disponible_para_devolver'&&t.devoluciones.length===0)
  assert((await store.evidencias(v1)).length===1)
})
await test('Una propuesta de gasto a pagar refleja vencimiento y se registra sólo al confirmar',async()=>{
  const {p}=await propuestaDe(v1,'El veterinario cobró 35000, falta pagarlo y vence en 30 días en La Porteña',{
    tipo:'gasto',campo:'La Porteña',monto:35000,categoria_gasto:'Sanidad',pago:'a_pagar',vence_dias:30})
  assert(!(await admin`select 1 from movimiento_financiero where id=${p.id}`).length)
  await confirmar(v1,p)
  const [g]=await admin`select monto::float8 as monto,estado,fecha_vencimiento::text as vence from movimiento_financiero where id=${p.id}`
  assert(g.monto===35000&&g.estado==='pendiente'&&g.vence>hoyAR())
})
await test('Las cantidades de un hecho no reemplazan el conteo de animales vivos',async()=>{
  await admin`delete from observacion_potrero where empresa_id=${E1}`
  await admin`delete from recorrida where empresa_id=${E1}`
  const {p}=await propuestaDe(v1,'Encontramos nueve ovejas muertas en el 9B de La Porteña',{
    tipo:'observacion',campo:'La Porteña',potrero:'9B',cantidad:9,categoria_animal:'oveja',descripcion:'Encontramos nueve ovejas muertas'})
  assert(p.datos.conteo===null&&(p.datos.reporte as {cantidad:number}).cantidad===9)
  await confirmar(v1,p)
  const [obs]=await admin`select conteo,novedad from observacion_potrero where id=${p.id}`
  assert(obs.conteo===null&&/nueve ovejas/.test(obs.novedad))
  const siguiente=await propuestaDe(v1,'Conté dos vacas vivas en el 9B de La Porteña',{
    tipo:'observacion',campo:'La Porteña',potrero:'9B',cabezas_vivas:2,descripcion:'Conté dos vacas vivas'})
  assert(siguiente.p.datos.conteo===2)
  await confirmar(v1,siguiente.p)
  assert((await admin`select conteo from observacion_potrero where id=${p.id}`)[0].conteo===2)
})
await test('Las notas con fecha futura conservan un trabajo fuera del catálogo',async()=>{
  const futuro=String(Number(hoyAR().slice(0,4))+1)+hoyAR().slice(4)
  const {p}=await propuestaDe(v1,'El herrero va a traer el portón en la fecha acordada',{tipo:'nota',fecha:futuro,descripcion:'El herrero trae el portón'})
  assert((await confirmar(v1,p)).estado==='confirmada')
  const cargas=await db.cargasRecientes(v1,null)
  assert(cargas.some(c=>c.contenido==='El herrero trae el portón'))
})
await test('Cambiar la cuenta del vínculo invalida referencias de la cuenta anterior aunque sea la misma persona',async()=>{
  const d=await directo(v1,'Buscá la 48')
  await d.t.ejecutar('buscar_animal',{identificador:'48'})
  await admin`insert into miembro_empresa(user_id,empresa_id,rol) values(${U1},${E2},'dueno')`
  await admin`update wa_vinculo set empresa_id=${E2} where id=${v1.id}`
  try{
    assert(JSON.stringify(await d.t.ejecutar('consultar_registros',{tipo:'animal_historial',referencia_animal:'animal:1'})).includes('sin_permiso'))
    await denegado(()=>store.historial(v1,d.id))
    const enOtra={...v1,empresa_id:E2}
    const actual=await directo(enOtra,'Buscá la 48')
    const r=JSON.stringify(await actual.t.ejecutar('buscar_animal',{identificador:'48'}))
    assert(r.includes('Campo Y')&&!r.includes('La Porteña'))
    assert(!(await store.historial(enOtra,actual.id)).some(m=>m.texto==='Buscá la 48'))
  }finally{await admin`update wa_vinculo set empresa_id=${E1} where id=${v1.id}`;await admin`delete from miembro_empresa where user_id=${U1} and empresa_id=${E2}`}
})

await test('Dos conversaciones firmadas en paralelo reciben sólo sus propios resultados',async()=>{
  responderModelo=p=>{
    const mensajes=p.messages as {content:{type:string;text?:string}[]}[]
    if(mensajes.length===1)return pedirHerramientas({nombre:'buscar_animal',entrada:{identificador:'48'}})
    const [r]=ultimosResultados(p)
    return finalizar(`La caravana 48 figura en ${r.animales[0].potrero_registrado} de ${r.animales[0].campo_registrado}.`)
  }
  await Promise.all([enviarTexto(v1,'Buscá la 48'),enviarTexto(v2,'Buscá la 48')])
  const a=textoSalida(salidas.filter(s=>s.to===v1.telefono).slice(-1)),b=textoSalida(salidas.filter(s=>s.to===v2.telefono).slice(-1))
  assert(a.includes('La Porteña')&&!a.includes('Campo Y'),a)
  assert(b.includes('Campo Y')&&!b.includes('La Porteña'),b)
})
await test('Revocar acceso entre la consulta y la respuesta impide publicar el dato leído',async()=>{
  let ronda=0
  responderModelo=()=>{
    if(++ronda===1)return pedirHerramientas({nombre:'buscar_animal',entrada:{identificador:'48'}})
    return finalizar('La 48 figura en el 9B de La Porteña.')
  }
  const pedirAnterior=responderModelo
  let cambiado=false
  // La mutación de permiso se hace en la frontera del proveedor simulado.
  responderModelo=p=>pedirAnterior(p)
  const fetchAnterior=globalThis.fetch
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input)==='https://api.anthropic.com/v1/messages'){
      const p=JSON.parse(String(init?.body))
      if(p.messages.length>1&&!cambiado){cambiado=true;await admin`update miembro_empresa set rol='invitado',niveles='{}' where user_id=${U1} and empresa_id=${E1}`}
    }
    return fetchAnterior(input,init)
  }) as typeof fetch
  try{
    const salida=await enviarTexto(v1,'Buscá la 48')
    assert(textoSalida(salida).includes('Cambió tu acceso')&&!textoSalida(salida).includes('9B de La Porteña'))
  }finally{globalThis.fetch=fetchAnterior;await admin`update miembro_empresa set rol='dueno',niveles=null where user_id=${U1} and empresa_id=${E1}`}
})
await test('La pregunta anterior se recupera, pero las respuestas con permiso revocado no vuelven al contexto',async()=>{
  const a=await directo(v1,'La 48 está muerta')
  await store.finalizarTurno(v1,a.id,{mensaje:{texto:'La 48 figura en 9B. ¿La encontraste ahí?'},secciones:['hacienda']})
  const b=await directo(v1,'Sí, ahí')
  assert((await store.historial(v1,b.id)).some(m=>m.autor==='tropero'&&m.texto.includes('¿La encontraste ahí?')))
  await admin`update miembro_empresa set rol='invitado',niveles=${admin.json({campos:'carga'})} where user_id=${U1} and empresa_id=${E1}`
  try{assert(!(await store.historial(v1,b.id)).some(m=>m.autor==='tropero'&&m.texto.includes('9B')))}
  finally{await admin`update miembro_empresa set rol='dueno',niveles=null where user_id=${U1} and empresa_id=${E1}`}
})
await test('Una entrega fallida queda para revisión y no repite propuestas al reenviar el mismo webhook',async()=>{
  let llamadas=0
  responderModelo=()=>{llamadas++;return finalizar('Hola, ¿cómo viene el campo?')}
  const wamid='qa-envio-fallido-'+crypto.randomUUID()
  fallarEnvio=true
  try{await firmado(v1,{type:'text',text:{body:'Hola'}},wamid)}finally{fallarEnvio=false}
  const [t]=await admin`select salida_estado from interno.wa_asistente_turno`
  assert(t.salida_estado==='revision')
  await firmado(v1,{type:'text',text:{body:'Hola'}},wamid)
  assert(llamadas===1)
})

await test('Reasignar el vínculo no entrega la conversación ni evidencias del titular anterior',async()=>{
  const anterior=await directo(v1,'SECRETO_TITULAR_ANTERIOR')
  const e=await store.guardarEvidencia(v1,anterior.id,{media:'archivo-anterior',nombre:'Anterior.pdf',estado:'recibida'})
  await admin`update wa_vinculo set user_id=${U3} where id=${v1.id}`
  try{
    const nuevo={...v1,user_id:U3}
    const actual=await directo(nuevo,'¿Qué había en la conversación?')
    assert(!(await store.historial(nuevo,actual.id)).some(m=>m.texto.includes('SECRETO_TITULAR_ANTERIOR')))
    assert(!await store.evidenciaPorId(nuevo,e.id))
    await denegado(()=>store.guardarEvidencia(nuevo,anterior.id,{media:'archivo-anterior',nombre:'Intento.pdf',estado:'error'}))
  }finally{await admin`update wa_vinculo set user_id=${U1} where id=${v1.id}`}
})

await test('Una referencia local vieja no cambia de animal al corregir otra propuesta',async()=>{
  const a=await directo(v1,'La 48 está muerta')
  await a.t.ejecutar('buscar_animal',{identificador:'48'})
  await a.t.ejecutar('proponer_registro',{tipo:'muerte',fuente:'La 48 está muerta',animales:['animal:1']})
  const b=await directo(v1,'Buscá la 49 y corregí la fecha de la propuesta anterior')
  const c=await b.t.contexto(),ref=c.propuestas[0].referencia
  await b.t.ejecutar('buscar_animal',{identificador:'49'})
  const r=await b.t.ejecutar('proponer_registro',{tipo:'muerte',fuente:'corregí la fecha de la propuesta anterior',referencia_propuesta:ref,fecha:hoyAR()})
  assert(JSON.stringify(r).includes('requiere_verificar_animales'))
  const p=(await store.propuestas(v1))[0]
  assert((p.datos.animales as {id:string}[])[0].id===A48)
})
await test('Caravanas repetidas en una cuenta requieren identificar el animal antes de proponer la muerte',async()=>{
  const otro=id(55)
  await admin`insert into animal(id,empresa_id,potrero_id,estado,categoria) values(${otro},${E1},${P8},'activo','vaca')`
  await admin`insert into caravana(empresa_id,animal_id,numero_visual,numero_rfid) values(${E1},${otro},'48','RFID-OTRO48')`
  try{
    const a=await directo(v1,'La 48 está muerta, fue en el 9B')
    const busqueda=await a.t.ejecutar('buscar_animal',{identificador:'48'})
    assert(JSON.stringify(busqueda).includes('ambiguo'))
    const r=await a.t.ejecutar('proponer_registro',{tipo:'muerte',fuente:'La 48 está muerta',animales:['animal:1']})
    assert(JSON.stringify(r).includes('requiere_identificar_animal'))
    const precisa=await a.t.ejecutar('buscar_animal',{identificador:'48',potrero:'9B'})
    assert(JSON.stringify(precisa).includes('encontrado'))
  }finally{await admin`delete from caravana where animal_id=${otro}`;await admin`delete from animal where id=${otro}`}
})
await test('La autoría fijada al recibir impide que un mensaje pendiente pase al nuevo titular',async()=>{
  const mensaje=await db.guardarEntrante({wamid:'qa-titular-'+crypto.randomUUID(),telefono:v1.telefono,tipo:'text',cuerpo:{text:{body:'PRIVADO_RECIBIDO_ANTES_DEL_CAMBIO'}},vinculo:v1})
  assert(mensaje)
  await admin`update wa_vinculo set user_id=${U3} where id=${v1.id}`
  try{await denegado(()=>store.iniciarTurno({...v1,user_id:U3},mensaje,'PRIVADO_RECIBIDO_ANTES_DEL_CAMBIO','texto'))}
  finally{await admin`update wa_vinculo set user_id=${U1} where id=${v1.id}`}
})
await test('Una firma inválida no abre un turno ni consulta el modelo',async()=>{
  const antes=peticiones.length
  const r=await handler!(new Request('https://qa.invalid/functions/v1/wa-webhook',{method:'POST',headers:{'x-hub-signature-256':'sha256=incorrecta'},body:JSON.stringify({entry:[{changes:[{value:{messages:[{id:'falso',from:v1.telefono,type:'text',text:{body:'Buscá la 48'}}]}}]}]})}))
  assert(r.status===401&&peticiones.length===antes)
  assert(!(await admin`select 1 from interno.wa_asistente_turno`).length)
})
await test('Un sí del nuevo asistente no confirma una carga pendiente del recorrido anterior',async()=>{
  await admin`update wa_vinculo set pendiente=${admin.json({tipo:'gasto',campoId:C1,monto:7777,fecha:hoyAR(),categoriaId:CAT,descripcion:'LEGADO_NO_CONFIRMAR'})},pendiente_at=now() where id=${v1.id}`
  responderModelo=()=>finalizar('Para guardar una propuesta usá su botón de confirmación.')
  const antes=peticiones.length
  await enviarTexto(v1,'Sí, confirmo')
  assert(peticiones.length>antes,'Se ejecutó el intérprete de confirmación anterior')
  assert(!(await admin`select 1 from movimiento_financiero where descripcion='LEGADO_NO_CONFIRMAR'`).length)
})
await test('Esquema anterior: dueño conserva acceso, invitado sin niveles no hereda permisos y varias cuentas exigen RLS de cuenta',async()=>{
  const niveles=await admin`select user_id,empresa_id,niveles from miembro_empresa`
  const [funcion]=await admin`select pg_get_functiondef('public.auth_empresa_ids()'::regprocedure) as ddl`
  try{
    await admin`alter table miembro_empresa rename column niveles to niveles_qa_temporal`
    await admin.unsafe("create or replace function public.auth_empresa_ids() returns setof uuid language sql stable set search_path=public as $$select empresa_id from miembro_empresa where user_id=auth.uid()$$")
    await admin`alter function public.cuenta_pedida() rename to cuenta_pedida_qa_temporal`
    assert((await db.vinculoDe(v1.telefono))?.user_id===U1)
    assert(await db.nivelesVinculados(v1)===null)
    assert((await db.contexto(v1,hoyAR())).campos.some(c=>c.nombre==='La Porteña'))
    assert(await store.conAlcance(v1,async(_tx,n)=>n)===null)
    assert(JSON.stringify(await db.nivelesVinculados(v3))==='{}')
    await admin`insert into miembro_empresa(user_id,empresa_id,rol) values(${U1},${E2},'invitado')`
    await denegado(()=>store.conAlcance(v1,async()=>true))
  }finally{
    await admin`delete from miembro_empresa where user_id=${U1} and empresa_id=${E2}`
    await admin`alter function public.cuenta_pedida_qa_temporal() rename to cuenta_pedida`
    await admin.unsafe(funcion.ddl)
    await admin`alter table miembro_empresa rename column niveles_qa_temporal to niveles`
    for(const n of niveles)await admin`update miembro_empresa set niveles=${n.niveles==null?null:admin.json(n.niveles)} where user_id=${n.user_id} and empresa_id=${n.empresa_id}`
  }
})
const mediciones:{caso:string;repeticion:number;ms:number;conversacion:unknown[];llamadas:unknown[]}[]=[]
async function prepararModelo(){
  await admin`delete from evento where empresa_id=${E1}`
  await admin`delete from animal where empresa_id=${E1} and id<>all(${[A48,A49,A048]}::uuid[])`
  await admin`update animal set estado='activo',potrero_id=case when id=${A048} then ${P8}::uuid else ${P9}::uuid end where empresa_id=${E1}`
  await admin`delete from lluvia where empresa_id=${E1}`
  await admin`delete from movimiento_financiero where empresa_id=${E1}`
  await admin`delete from observacion_potrero where empresa_id=${E1}`
  await admin`delete from recorrida where empresa_id=${E1}`
}
const llamadasDe=async()=>{
  const turnos=await admin<{pasos:{llamadas:unknown[]}[]}[]>`select pasos from interno.wa_asistente_turno where vinculo_id=${v1.id} and actor_id=${U1} and empresa_id=${E1} order by created_at`
  return turnos.flatMap(t=>t.pasos.flatMap(p=>p.llamadas)) as {herramienta:string;entrada:Record<string,unknown>;resultado:Record<string,unknown>}[]
}
async function casoReal(nombre:string,repeticion:number,fn:()=>Promise<void>){
  const filtro=Deno.env.get('WA_QA_CASO')??''
  if(filtro&&!new RegExp(filtro,'i').test(nombre))return
  await test(`Claude conectado ${repeticion}: ${nombre}`,async()=>{
    await prepararModelo();const inicio=performance.now();realActivo=true
    try{
      await fn()
      const filas=await admin<{estado:string;texto:string;respuesta:{mensaje?:{texto?:string}}}[]>`select estado,texto,respuesta from interno.wa_asistente_turno where vinculo_id=${v1.id} order by created_at`
      assert(filas.length&&filas.every(t=>t.estado==='respondido'),'El recorrido terminó en fallback o con error')
      const llamadas=await llamadasDe()
      mediciones.push({caso:nombre,repeticion,ms:Math.round(performance.now()-inicio),
        conversacion:filas.map(t=>({productor:t.texto,troppero:t.respuesta?.mensaje?.texto})),
        llamadas:llamadas.map(l=>({herramienta:l.herramienta,estado:l.resultado.estado}))})
    }catch(e){
      const filas=await admin`select estado,texto,respuesta,pasos from interno.wa_asistente_turno where vinculo_id=${v1.id} order by created_at`
      fallidas.push({caso:nombre,repeticion,turnos:filas.map(t=>({estado:t.estado,respuesta:t.respuesta,pasos:t.pasos})),modelo:respuestasDiagnostico.slice(-2)})
      console.error('DIAGNOSTICO',JSON.stringify({caso:nombre,repeticion,error:String(e)}))
      throw e
    }finally{realActivo=false}
  })
}
if(modeloReal){
  for(let repeticion=1;repeticion<=Number(Deno.env.get('WA_QA_REPETICIONES')??1);repeticion++){
    await casoReal('Consulta general del campo: breve, con datos consultados y sin anunciar guardado',repeticion,async()=>{
      const recorrida=crypto.randomUUID()
      await admin`insert into lluvia(id,empresa_id,campo_id,fecha,mm,fuente,canal) values(${crypto.randomUUID()},${E1},${C1},${hoyAR()},15,'manual','app')`
      await admin`insert into recorrida(id,empresa_id,campo_id,fecha,canal) values(${recorrida},${E1},${C1},${hoyAR()},'app')`
      await admin`insert into observacion_potrero(id,empresa_id,recorrida_id,potrero_id,novedad,canal) values(${crypto.randomUUID()},${E1},${recorrida},${P9},'Bebedero roto en el 9B','app')`
      const a=await enviarTexto(v1,'Cómo está el campo ?'),t=textoSalida(a)
      assert((await llamadasDe()).some(l=>l.herramienta==='consultar_registros'&&l.resultado.estado==='consultado'),'No consultó registros')
      assert(/15/.test(t)&&/bebedero/i.test(t),t)
      assert(t.length<=650&&!/mensaje quedó recibido|no pude terminar|guardé|me quedó por aclarar/i.test(t),t)
      assert(!(await store.propuestas(v1)).length,'Una consulta generó una carga')
    })
    await casoReal('Factura breve: no pide identidad fiscal por nombre distinto ni retoma otra tarea',repeticion,async()=>{
      await enviarTexto(v1,'La caravana 48 murió en el 9B de La Porteña')
      const a=await firmado(v1,{type:'document',document:{id:'qa-factura-simple',filename:'Factura nueva.pdf',mime_type:'application/pdf',caption:'Esta es la factura del veterinario de La Porteña. Queda para pagar dentro de 30 días.'}}),t=textoSalida(a)
      assert(/35[., ]?000|35 mil/.test(t)&&t.length<=650,t)
      assert(!/caravana|vaca|muerte|a tu nombre|gasto ajeno|otra persona/i.test(t),t)
      assert((await store.propuestas(v1)).some(p=>p.datos.tipo==='gasto'&&p.datos.monto===35000&&p.datos.pago==='a_pagar'))
    })
    await casoReal('Pausas, pedido de foto sin nombre y respuesta con el potrero',repeticion,async()=>{
      transcripcion='Hola, ¿cómo estás? ¿Todo bien? Prefiero... necesito que... necesito que... Mándame la foto del potrero.'
      const a=await firmado(v1,{type:'audio',audio:{id:'qa-audio'}})
      assert(!a.some(x=>x.type==='image')&&preguntaLugar(textoSalida(a),['8B','9B']),textoSalida(a))
      assert(!/qué querés que haga|mandame.*separad/i.test(textoSalida(a)),textoSalida(a))
      const b=await enviarTexto(v1,'El 9B de La Porteña')
      assert(b.some(x=>x.type==='image'),JSON.stringify(b))
    })
    await casoReal('Caravana ya indicada, muerte y mapa del mismo audio de seguimiento',repeticion,async()=>{
      transcripcion='Che, la caravana con la vaca con la caravana 48 está muerta. Se encontró en el potrero, en el campo La Porteña.'
      const a=await firmado(v1,{type:'audio',audio:{id:'qa-audio'}})
      const primera=await llamadasDe()
      assert(primera.some(l=>l.herramienta==='buscar_animal'&&l.entrada.identificador==='48'&&l.resultado.estado==='encontrado'),'No buscó la caravana antes de preguntar')
      assert(!preguntaIdentificador(textoSalida(a))&&!/en qué potrero.*en qué potrero/i.test(textoSalida(a)),textoSalida(a))
      transcripcion='Fíjate qué número la caravana, ya te lo dije. Ahí está el número de la caravana. Además, mostrame el campo La Porteña.'
      const b=await firmado(v1,{type:'audio',audio:{id:'qa-audio'}})
      assert(b.some(x=>x.type==='image'),JSON.stringify(b))
      assert(!preguntaIdentificador(textoSalida(b))&&!/me quedó por aclarar/i.test(textoSalida(b)),textoSalida(b))
      const pendientes=await store.propuestas(v1)
      assert(pendientes.filter(p=>p.datos.tipo==='muerte').length<=1,'Duplicó la misma muerte pendiente')
      assert((await admin`select estado from animal where id=${A48}`)[0].estado==='activo')
    })
    await casoReal('Audio con lluvia, agua, animales lastimados, especie fuera del rodeo y mapa',repeticion,async()=>{
      transcripcion='Llovieron 15 milímetros en La Porteña. En el 9B el bebedero estaba bajo y vi una vaca lastimada. En el 8B encontré tres perros muertos cerca del molino. Además mostrame el 9B.'
      const a=await firmado(v1,{type:'audio',audio:{id:'qa-audio'}}),t=textoSalida(a)
      assert(a.filter(x=>x.type!=='image').length===1&&a.some(x=>x.type==='image'),JSON.stringify(a))
      assert(/15/.test(t)&&/perr/i.test(t)&&/lastim|herid|lesion/i.test(t)&&/agua|bebedero/i.test(t),t)
      const propuestas=await store.propuestas(v1),s=JSON.stringify(propuestas)
      assert(propuestas.some(p=>p.datos.tipo==='lluvia'&&p.datos.mm===15)&&/perr/i.test(s)&&/lastim|herid|lesion/i.test(s),s)
    })
    await casoReal('Cantidad incompatible con stock, sin perder la lluvia del mismo audio',repeticion,async()=>{
      transcripcion='En el 9B de La Porteña encontramos nueve ovejas muertas. Además cayeron ocho milímetros en el campo.'
      const a=await firmado(v1,{type:'audio',audio:{id:'qa-audio'}}),t=textoSalida(a)
      assert((await llamadasDe()).some(l=>{
        if(l.herramienta==='consultar_registros'&&l.entrada.tipo==='hacienda'&&l.resultado.estado==='consultado')return true
        const h=(l.resultado.contextoVerificado as {hacienda?:{estado:string;categorias:{categoria:string;cabezas:number}[]}}|undefined)?.hacienda
          ??l.resultado.hacienda as {estado:string;categorias:{categoria:string;cabezas:number}[]}|undefined
        return h?.estado==='consultado'&&h.categorias.some(c=>c.categoria==='oveja'&&c.cabezas===0)
      }),'No contrastó el reporte con stock')
      assert(/ovej/i.test(t)&&/8|ocho/.test(t)&&/no (?:hay|figuran|aparecen|tengo|tiene|tenemos|muestra|registra)|ninguna|cero|0 ovej|sin\s+oveja/i.test(t),t)
      assert((await store.propuestas(v1)).some(p=>p.datos.tipo==='lluvia'&&p.datos.mm===8))
      assert((await store.propuestas(v1)).some(p=>['observacion','nota'].includes(String(p.datos.tipo))&&/ovej/i.test(JSON.stringify(p.datos))&&/9|nueve/.test(JSON.stringify(p.datos))),'No conservó el reporte como observación')
    })
    await casoReal('Excel con encabezados desconocidos y gasto pendiente del veterinario',repeticion,async()=>{
      const a=await firmado(v1,{type:'document',document:{id:'qa-xlsx',filename:'Trabajo de hoy.xlsx',
        mime_type:mediaEntrante.get('qa-xlsx')!.mime,caption:'Te paso lo que pinchamos en La Porteña. Además dejá los 35000 del veterinario para pagar dentro de 30 días.'}})
      const p=await store.propuestas(v1),llamadas=await llamadasDe()
      assert(llamadas.some(l=>l.herramienta==='leer_archivo'&&l.resultado.estado==='leido'),'No leyó la planilla')
      assert(p.some(p=>p.datos.tipo==='vacunacion'&&p.datos.vacuna==='Aftosa'&&Array.isArray(p.datos.animales)&&(p.datos.animales as unknown[]).length===2),JSON.stringify(p))
      assert(p.some(p=>p.datos.tipo==='gasto'&&p.datos.monto===35000&&p.datos.pago==='a_pagar'&&p.datos.venceDias===30),JSON.stringify(p))
      assert(a.filter(x=>x.type!=='image').length===1,JSON.stringify(a))
    })
    await casoReal('Factura nueva con dos importes contradictorios',repeticion,async()=>{
      const a=await firmado(v1,{type:'document',document:{id:'qa-factura',filename:'Comprobante nuevo.pdf',mime_type:'application/pdf',caption:'Esta es la factura del veterinario de La Porteña, revisala'}})
      const t=textoSalida(a)
      assert((await llamadasDe()).some(l=>l.herramienta==='leer_archivo'&&l.resultado.estado==='leido'))
      assert(/35[., ]?000|35 mil/.test(t)&&/42[., ]?000|42 mil/.test(t)&&t.includes('?'),t)
      assert(!(await store.propuestas(v1)).some(p=>p.datos.tipo==='gasto'&&p.estado==='propuesta'))
    })
    await casoReal('Corrección natural sin duplicar la lluvia pendiente',repeticion,async()=>{
      await enviarTexto(v1,'Anotá 30 milímetros en La Porteña')
      await enviarTexto(v1,'Pará, miré bien el pluviómetro y eran 18, corregí eso')
      const p=await store.propuestas(v1)
      assert(p.length===1&&p[0].datos.tipo==='lluvia'&&p[0].datos.mm===18,JSON.stringify(p))
      assert(!(await admin`select 1 from lluvia where empresa_id=${E1}`).length)
    })
    await casoReal('Aviso sin potrero: mapa para reconocerlo, pausa y corrección sin repetir el audio',repeticion,async()=>{
      transcripcion='Anotá que ayer el empleado encontró una vaquillona muerta en La Porteña, cerca del molino. No sé cómo se llama ese potrero. Mostrame el mapa para reconocerlo.'
      const a=await firmado(v1,{type:'audio',audio:{id:'qa-audio'}})
      assert(a.some(x=>x.type==='image'),'No mostró el mapa para ayudar a reconocer el potrero')
      const originales=await store.propuestas(v1)
      assert(originales.length===1&&originales[0].estado==='incompleta',JSON.stringify(originales))
      assert(!/bot[oó]n/i.test(textoSalida(a)),'Prometió confirmar un aviso todavía incompleto: '+textoSalida(a))
      const original=originales[0],entrada=original.datos.entrada as Record<string,unknown>
      assert(entrada.tipo==='observacion'&&/vaquillon/i.test(String(entrada.descripcion)))
      const fecha=entrada.fecha
      const pausa=await enviarTexto(v1,'No lo reconozco, lo ubicamos después. No me vuelvas a preguntar ahora.')
      assert(!pausa.some(x=>x.type==='image'),'Volvió a mandar un mapa sin que se lo pidieran')
      assert(!textoSalida(pausa).includes('?'),'Volvió a preguntar al pedir dejarlo para después: '+textoSalida(pausa))
      const lluvia=await enviarTexto(v1,'En La Porteña llovieron 12 milímetros hoy, anotá eso.')
      assert(!/vaquillon|molino|potrero.*\?/i.test(textoSalida(lluvia)),textoSalida(lluvia))
      await enviarTexto(v1,'Ya encontré dónde fue lo de la vaquillona de ayer: el potrero era el 9B. Completá ese mismo aviso.')
      const p=(await store.propuestas(v1)).filter(p=>p.id===original.id)
      assert(p.length===1&&p[0].estado==='propuesta'&&p[0].datos.potreroId===P9,JSON.stringify(await store.propuestas(v1)))
      assert(p[0].datos.fecha===fecha&&/vaquillon/i.test(String(p[0].datos.descripcion)),JSON.stringify(p))
      assert((await store.propuestas(v1)).filter(p=>/vaquillon/i.test(JSON.stringify(p.datos))).length===1,'Duplicó el aviso')
      assert((await admin`select estado from animal where id=${A48}`)[0].estado==='activo')
    })
    await casoReal('Punto compartido orienta pero no prueba dónde ocurrió un hecho pasado',repeticion,async()=>{
      const primerAviso=await enviarTexto(v1,'Ayer el empleado encontró una vaquillona muerta en La Porteña. No sabemos en qué potrero; dejá el aviso pendiente.')
      const [original]=await store.propuestas(v1)
      assert(original?.estado==='incompleta',JSON.stringify(original))
      assert(!/bot[oó]n/i.test(textoSalida(primerAviso)),'Ofreció un botón para una propuesta incompleta')
      const punto=await firmado(v1,{type:'location',location:{latitude:-36.005,longitude:-59.295}})
      assert((await llamadasDe()).some(l=>l.herramienta==='ubicar_punto_compartido'&&l.resultado.estado==='ubicado'))
      assert(/9B/i.test(textoSalida(punto))&&textoSalida(punto).includes('?'),textoSalida(punto))
      const [pendiente]=await store.propuestas(v1)
      assert(pendiente.id===original.id&&pendiente.estado==='incompleta'&&!pendiente.datos.potreroId,JSON.stringify(pendiente))
      await enviarTexto(v1,'Sí, el hecho fue ahí en el 9B. Completá el aviso que ya te pasé.')
      const p=await store.propuestas(v1)
      assert(p.length===1&&p[0].id===original.id&&p[0].datos.potreroId===P9&&p[0].estado==='propuesta',JSON.stringify(p))
      assert(!(await admin`select 1 from observacion_potrero where id=${original.id}`).length)
    })
    await casoReal('Punto fuera de los potreros se conserva como orientación incierta',repeticion,async()=>{
      const a=await firmado(v1,{type:'location',location:{latitude:-35,longitude:-58}})
      assert((await llamadasDe()).some(l=>l.herramienta==='ubicar_punto_compartido'&&l.resultado.estado==='sin_coincidencia_unica'))
      assert(!(await store.propuestas(v1)).length,'Inventó una carga al recibir una ubicación')
      assert(!/est[aá]s en el.*(?:9B|8B)|Campo Y/i.test(textoSalida(a)),textoSalida(a))
    })
    await casoReal('Saludo cotidiano no repite la vista anterior y una nota libre se conserva',repeticion,async()=>{
      await enviarTexto(v1,'Mostrame el campo La Porteña')
      const a=await enviarTexto(v1,'Hola cabezón, ¿todo bien?')
      assert(!a.some(x=>x.type==='image')&&/hola|bien|todo|buenas/i.test(textoSalida(a)),JSON.stringify(a))
      await enviarTexto(v1,'Recordá que el herrero trae el portón mañana a la mañana, no tiene nada que ver con los animales')
      assert((await store.propuestas(v1)).some(p=>p.datos.tipo==='nota'&&/herrero|port[oó]n/i.test(String(p.datos.descripcion))))
    })
  }
}
const informe={fecha:hoyAR(),modelo:'claude-haiku-5-5',sourceSha:Deno.env.get('WA_QA_SOURCE_SHA'),modo:modeloReal?'modelo conectado, ASR y Meta simulados':'integración con modelo simulado',casos,fallas,filtro:Deno.env.get('WA_QA_CASO')??null,mediciones,resultados,fallidas,diagnosticoModelo:respuestasDiagnostico}
const destino=new URL('../../../../output/wa-asistente/',import.meta.url)
await Deno.mkdir(destino,{recursive:true})
await Deno.writeTextFile(new URL(`resultado-${hoyAR()}-${modeloReal?'real':'simulado'}.json`,destino),JSON.stringify(informe,null,2))
// FIN_CASOS_ASISTENTE
Deno.serve=originalServe;globalThis.fetch=originalFetch
await admin.end();await db.sql.end()
console.log(JSON.stringify({casos,fallas,modeloReal,peticiones:peticiones.length,estadosModelo}))
if(fallas)Deno.exit(1)
Deno.exit(0)