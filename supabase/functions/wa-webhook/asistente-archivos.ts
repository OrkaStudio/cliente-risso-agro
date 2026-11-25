import { extractTextItems,getDocumentProxy } from 'npm:unpdf@2.1.0'
import leerExcel from 'npm:read-excel-file@9.3.12/universal'
import { parse } from 'npm:csv-parse@5.6.0/sync'
import type { BloqueAsistente } from '../_shared/wa/asistente.ts'
import type { Vinculo } from './db.ts'
import { descargarMedia } from './meta.ts'
import { leerPdfVeterinario } from './leer-pdf.ts'
import * as store from './asistente-store.ts'

const MAX_BYTES=25*1024*1024
const credenciales=()=>{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url||!key) throw Error('Archivo privado no configurado')
  return {url,key}
}
const base64=(bytes:Uint8Array)=>{
  let s=''
  for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000))
  return btoa(s)
}
const prefijo=(v:Vinculo)=>`${v.empresa_id}/${v.user_id}/${v.id}/`

export async function recibirOriginal(v:Vinculo,mensajeId:string,media:string,nombre:string) {
  const seguro=nombre.replace(/[\u0000-\u001f]/g,'').slice(0,140)||'Archivo'
  await store.guardarEvidencia(v,mensajeId,{media,nombre:seguro,estado:'recibida'})
  let datos:{bytes:Uint8Array;mime:string}|undefined
  try {
    datos=await descargarMedia(media,MAX_BYTES)
    const mime=datos.mime.split(';')[0].trim().toLowerCase()
    const hash=await crypto.subtle.digest('SHA-256',datos.bytes as Uint8Array<ArrayBuffer>)
    const sha=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')
    const ruta=`${prefijo(v)}${mensajeId}/${sha}`
    const {url,key}=credenciales()
    const r=await fetch(`${url}/storage/v1/object/wa-evidencias/${ruta}`,{method:'POST',
      headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':mime,'x-upsert':'true'},
      body:datos.bytes as Uint8Array<ArrayBuffer>,signal:AbortSignal.timeout(30_000)})
    if(!r.ok){await r.body?.cancel();throw Error('No se pudo archivar el original')}
    const evidencia=await store.guardarEvidencia(v,mensajeId,{media,nombre:seguro,mime,ruta,sha256:sha,tamano:datos.bytes.length,estado:'archivada'})
    return {...datos,mime,evidencia,archivado:true}
  }catch{
    const evidencia=await store.guardarEvidencia(v,mensajeId,{media,nombre:seguro,mime:datos?.mime,estado:'error'})
    return {...datos,evidencia,archivado:false}
  }
}

export async function abrirOriginal(v:Vinculo,e:store.EvidenciaAsistente) {
  // El modelo nunca puede proporcionar la ruta. Resolver la fila de nuevo.
  const propio=await store.evidenciaPorId(v,e.id)
  if(!propio||!propio.ruta||!propio.ruta.startsWith(prefijo(v))||propio.ruta.includes('..'))throw new store.AccesoAsistente()
  const {url,key}=credenciales()
  const r=await fetch(`${url}/storage/v1/object/authenticated/wa-evidencias/${propio.ruta}`,{
    headers:{Authorization:`Bearer ${key}`,apikey:key},signal:AbortSignal.timeout(30_000)})
  if(!r.ok)throw Error('Original no disponible')
  if(Number(r.headers.get('content-length'))>MAX_BYTES){await r.body?.cancel();throw Error('Original demasiado grande')}
  const bytes=new Uint8Array(await r.arrayBuffer())
  if(bytes.length>MAX_BYTES)throw Error('Original demasiado grande')
  return {bytes,mime:propio.mime??r.headers.get('content-type')??'application/octet-stream',nombre:propio.nombre}
}

export function contenidoVisual(bytes:Uint8Array,mime:string):BloqueAsistente[] {
  if(bytes.length>5*1024*1024)return []
  if(['image/jpeg','image/png','image/webp'].includes(mime))return [{type:'image',source:{type:'base64',media_type:mime,data:base64(bytes)}}]
  if(mime==='application/pdf'&&new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-')
    return [{type:'document',source:{type:'base64',media_type:'application/pdf',data:base64(bytes)}}]
  return []
}

async function tablas(bytes:Uint8Array,nombre:string,desde:number) {
  let hojas:{nombre:string;filas:unknown[][]}[]
  if(/\.xlsx$/i.test(nombre)){
    if(bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('El archivo no es XLSX')
    const xlsx=await leerExcel(Uint8Array.from(bytes).buffer)
    hojas=xlsx.map(h=>({nombre:h.sheet,filas:h.data as unknown[][]}))
  }else{
    const utf8=new TextDecoder('utf-8').decode(bytes)
    const csv=utf8.includes('\uFFFD')?new TextDecoder('windows-1252').decode(bytes):utf8
    const primeras=csv.split(/\r\n|\n|\r/).slice(0,25).join('\n')
    const separador=[';','\t',','].reduce((a,b)=>primeras.split(b).length>primeras.split(a).length?b:a)
    hojas=[{nombre,filas:parse(csv,{bom:true,delimiter:separador,relax_column_count:true,max_record_size:16384}) as string[][]}]
  }
  const total=hojas.reduce((n,h)=>n+h.filas.length,0)
  if(hojas.length>20||total>1500) return {estado:'requiere_revision',detalle:'La planilla excede 20 hojas o 1500 filas. El original sigue conservado.'}
  const filas=hojas.flatMap(h=>h.filas.map((f,i)=>({hoja:h.nombre,fila:i+1,celdas:f.slice(0,50).map(c=>
    c instanceof Date?c.toISOString():typeof c==='string'?c.slice(0,500):c),truncada:f.length>50})))
  const seleccion:typeof filas=[]
  let usados=0
  for(const fila of filas.slice(desde,desde+60)) {
    const n=JSON.stringify(fila).length
    if(usados+n>35000)break
    seleccion.push(fila);usados+=n
  }
  return {estado:'leido',tipo:'planilla',archivo:nombre,totalFilas:total,desde,filas:seleccion,
    siguiente:desde+seleccion.length<total?desde+seleccion.length:null,
    advertenciaNumeros:seleccion.some(f=>f.celdas.some(c=>typeof c==='number'&&Number.isInteger(c)&&!Number.isSafeInteger(c)))
      ?'Hay números que pueden haber perdido precisión en Excel. Revisar el original antes de usar identificadores.':null}
}

export async function leerOriginal(v:Vinculo,e:store.EvidenciaAsistente,desde=0):Promise<unknown> {
  const {bytes,mime,nombre}=await abrirOriginal(v,e)
  if(bytes.length>5*1024*1024)return {estado:'requiere_revision',detalle:'El original está conservado, pero supera el alcance de lectura de este turno.'}
  if(/\.(xlsx|csv)$/i.test(nombre))return tablas(bytes,nombre,desde)
  if(mime==='application/pdf'){
    if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('El original no es un PDF válido')
    const pdf=await getDocumentProxy(bytes.slice(),{useSystemFonts:false,maxImageSize:4_000_000})
    try{
      if(pdf.numPages>50)return {estado:'requiere_revision',detalle:'El PDF tiene más de 50 páginas. El original sigue conservado.'}
      const {items}=await extractTextItems(pdf)
      const paginas=items.map((p,i)=>({pagina:i+1,texto:p.map(x=>x.str).join(' ').slice(0,5000)}))
      const lectura=desde===0?await leerPdfVeterinario(bytes).catch(()=>null):null
      const datos={estado:'leido',tipo:'pdf',archivo:nombre,totalPaginas:pdf.numPages,paginas:paginas.slice(desde,desde+4),
        siguiente:desde+4<pdf.numPages?desde+4:null,lecturaEstructurada:lectura}
      const escaneado=!paginas.some(p=>p.texto.trim())
      const visual=escaneado?contenidoVisual(bytes,mime):[]
      if(escaneado&&!visual.length)return {estado:'requiere_revision',detalle:'El PDF no tiene texto legible y supera el alcance de lectura visual. El original sigue conservado.'}
      return visual.length?{datos,contenidoModelo:visual}:datos
    }finally{await pdf.loadingTask?.destroy?.()}
  }
  if(mime.startsWith('image/')){
    const visual=contenidoVisual(bytes,mime)
    return visual.length?{datos:{estado:'leido',tipo:'imagen',archivo:nombre},contenidoModelo:visual}
      :{estado:'requiere_revision',detalle:'El original está conservado; esta imagen requiere otra revisión.'}
  }
  if(mime.startsWith('audio/')){
    const turnos=await store.historial(v,e.mensaje_id)
    return {estado:'leido',tipo:'audio',archivo:nombre,transcripcion:e.texto??null,contextoAnterior:turnos.slice(0,2)}
  }
  return {estado:'conservado_sin_interpretar',tipo:mime,archivo:nombre}
}