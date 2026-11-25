import { horarioSemanal, periodoSemana } from '../_shared/wa/semanal.ts'
import * as meta from '../wa-webhook/meta.ts'
import * as store from './store.ts'
import { enviarProgramado } from './servicio.ts'

Deno.serve(async req => {
  if (req.method!=='POST') return new Response('method not allowed',{status:405})
  const expected=Deno.env.get('WA_WEEKLY_JOB_TOKEN'),received=req.headers.get('authorization')?.replace(/^Bearer /,'')
  if (!expected || !received || received.length!==expected.length) return new Response('forbidden',{status:401})
  let diff=0
  for(let i=0;i<expected.length;i++) diff |= expected.charCodeAt(i)^received.charCodeAt(i)
  if(diff) return new Response('forbidden',{status:401})
  if(Deno.env.get('WA_WEEKLY_ENABLED')!=='true') return Response.json({status:'desactivado'})
  const now=new Date()
  if(!horarioSemanal(now)) return Response.json({status:'fuera_de_horario',timezone:'America/Argentina/Buenos_Aires'})
  const template=Deno.env.get('WA_WEEKLY_TEMPLATE_NAME') || 'tropero_resumen_semanal'
  try {
    if(!await meta.plantillaSemanalAprobada(template)) return Response.json({status:'requiere_plantilla_aprobada'},{status:503})
    const periodo=periodoSemana(now),recipients=await store.destinatarios(periodo)
    const results=[]
    for(const v of recipients) results.push({vinculo_id:v.id,result:await enviarProgramado(v,periodo,template)})
    return Response.json({periodo,results})
  } catch {
    console.error('semanal: ejecución fallida; revisar estados internos')
    return Response.json({error:'resumen semanal no completado'},{status:500})
  }
})
