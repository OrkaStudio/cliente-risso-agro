// Ejecuta el handler real sin abrir puerto y sin permisos de red/producción.
const originalServe=Deno.serve
let handler: (request:Request)=>Promise<Response>
Deno.serve=((...args:unknown[])=>{handler=args.at(-1) as typeof handler;return {} }) as unknown as typeof Deno.serve
Deno.env.set('SUPABASE_DB_URL','postgres://qa:qa@127.0.0.1:55440/postgres')
Deno.env.set('WA_WEEKLY_JOB_TOKEN','qa_local_test_token')
Deno.env.set('WA_WEEKLY_ENABLED','false')
await import('../../../functions/wa-resumen-semanal/index.ts')
Deno.serve=originalServe
async function check(method:string,auth:string|null,expected:number,status?:string,body?:unknown){
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(auth)headers.Authorization=auth
  const result=await handler(new Request('http://127.0.0.1/weekly',{method,headers,body:method==='POST'?JSON.stringify(body??{}):undefined}))
  if(result.status!==expected)throw Error(`${method}: ${result.status} != ${expected}`)
  if(status&&(await result.json()).status!==status)throw Error('Estado de respuesta inesperado')
}
await check('GET',null,405)
await check('POST',null,401)
await check('POST','Bearer invalid_token',401)
await check('POST','Bearer qa_local_test_token',200,'desactivado',{vinculo_id:'ajeno',fecha:'2000-01-01'})
const RealDate=Date
globalThis.Date=class extends RealDate{constructor(){super('2026-10-16T12:00:00Z')}} as unknown as DateConstructor
Deno.env.set('WA_WEEKLY_ENABLED','true')
await check('POST','Bearer qa_local_test_token',200,'fuera_de_horario',{vinculo_id:'ajeno',fecha:'2026-10-17T12:00:00Z'})
globalThis.Date=RealDate
console.log(JSON.stringify({cases:5,result:'PASS',network_calls:0,notes:'Método, autenticación, piloto desactivado y fecha del body ignorada'}))
