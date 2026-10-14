// Simulación local de las conversaciones mostradas en el video. Sin Meta ni escrituras.
import { arrancar, leer, siguientePaso } from '../../../functions/_shared/wa/conversacion.ts'
import { limpiarInterpretacion } from '../../../functions/_shared/wa/interpretar.ts'
import { corregir } from '../../../functions/_shared/wa/conversacion.ts'
import { comandoSemanal } from '../../../functions/_shared/wa/semanal.ts'
import type { Contexto, Pendiente } from '../../../functions/_shared/wa/tipos.ts'
const ctx:Contexto={hoy:'2026-10-12',nombre:'Productor',campos:[
  {id:'dg',nombre:'Don Gilberto',potreros:[{id:'1a',nombre:'1A'}]},
  {id:'lp',nombre:'La Porteña',potreros:[{id:'2b',nombre:'2B'},{id:'5b',nombre:'5B'},{id:'7b',nombre:'7B'}]},
],categoriasGasto:[{id:'comb',nombre:'Combustible'}]}
const output:unknown[]=[]
function scenario(title:string,model:unknown,text:string){
  const a=arrancar(limpiarInterpretacion(model),ctx,text)
  if(!('borrador'in a))throw Error('No armó borrador: '+title)
  const step=siguientePaso('demo-captura',a.borrador,ctx)
  output.push({title,text,step})
  return {b:'borrador' in step?step.borrador:a.borrador,step}
}
const rain=scenario('Lluvia sin campo',{intent:'lluvia',mm:10},'Llovieron 10 mm')
if(rain.step.k!=='preguntar'||rain.step.pendiente.tipo!=='campo'||!rain.step.pendiente.confirmaAlElegir)throw Error('El video debe respetar la confirmación al elegir campo')
const chosen=leer({texto:'Don Gilberto'},rain.step.pendiente,ctx)
if(chosen.k!=='confirmar')throw Error('Elegir campo no confirmó')
output.push({title:'Elección final de campo',chosen})
const gasto=scenario('Gasto por audio transcripto',{intent:'gasto',monto:45000,categoria:'Combustible',contraparte:'Don Gilberto'},'Gasté 45 mil en gasoil para Don Gilberto')
if(gasto.b.campoId!=='dg'||gasto.b.contraparte==='Don Gilberto')throw Error('Don Gilberto fue tomado como persona')
const recorrido=scenario('Tres observaciones en un mensaje',{intent:'novedad',campo:'La Porteña',observaciones:[
  {potrero:'2B',novedad:'hay agua'},{potrero:'5B',pasto:'escaso'},{potrero:'7B',electrico:'cortado'}]},'En el 2B hay agua, en el 5B falta pasto y en el 7B se cortó el eléctrico')
if(recorrido.b.observaciones?.length!==3)throw Error('Faltan observaciones')
scenario('Ubicación pendiente',{intent:'novedad',observaciones:[{aca:true,novedad:'molino no anda'}]},'Acá el molino no anda')
const corrected=corregir(gasto.b,limpiarInterpretacion({intent:'gasto',monto:35000}),ctx,'Eran 35 mil, no 30')
if(corrected.monto!==35000)throw Error('Corrección de monto no coincide')
const pending:Pendiente={tipo:'propuesta',capturaId:'demo-captura',borrador:corrected}
if(leer({texto:'cancelar'},pending,ctx).k!=='cancelar')throw Error('No canceló')
output.push({title:'Corrección y cancelación',monto:corrected.monto,result:'cancelar'})
for(const intent of ['consulta_recorrida','consulta_observacion','consulta_novedades','consulta_gastos','consulta_cargas','consulta_hacienda','consulta_lluvia','consulta_vencimientos','consulta_dias_potrero'])
  scenario(intent,{intent,campo:'La Porteña',potrero:'7B',periodo:'semana'},intent)
if(comandoSemanal('activar resumen semanal')!=='activar')throw Error('No reconoce activación')
output.push({title:'Activar resumen semanal',command:'activar',hora:'Sábados 09:00 Argentina'})
if(Deno.args[0])await Deno.writeTextFile(Deno.args[0],JSON.stringify({simulated:true,uses_real_conversation_modules:true,model_and_io:'simulados',cases:output},null,2))
console.log(JSON.stringify({simulated:true,scenarios:output.length,result:'PASS',network_calls:0,writes_to_database:0}))
