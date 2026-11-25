import { ejecutarAsistente,FalloAsistente,pedidoCierreAsistente,type PasoAsistente,type PedidoModelo,type RespuestaModelo } from '../_shared/wa/asistente.ts'
import { empresaEnPiloto,leerServicio } from '../_shared/wa/servicios.ts'
import { pistaTranscripcion } from '../_shared/wa/interpretar.ts'
import { veSeccion,type Seccion } from '../_shared/wa/permisos.ts'
import type { Borrador,Contexto,Mensaje } from '../_shared/wa/tipos.ts'
import type { Vinculo } from './db.ts'
import * as db from './db.ts'
import * as meta from './meta.ts'
import * as store from './asistente-store.ts'
import { herramientasAsistente } from './asistente-herramientas.ts'
import { recibirOriginal,abrirOriginal,leerOriginal } from './asistente-archivos.ts'
import { ejecutarOperacion } from './asistente-operaciones.ts'
import { imagenMapa } from './mapa-imagen.ts'
import { transcribir } from './llm.ts'
import { enLaCuenta } from '../_shared/wa/cuentas.ts'
import { canalOriginal } from './asistente-medios.ts'

export const MODELO_ASISTENTE='claude-haiku-5-5'
export const asistenteHabilitado=(empresa:string)=>empresaEnPiloto(Deno.env.get('WA_ASISTENTE_EMPRESAS'),empresa)
export type EntradaAsistente={
  id:string;from:string;type:string;text?:{body:string}
  interactive?:{button_reply?:{id:string;title:string};list_reply?:{id:string;title:string}}
  button?:{payload:string;text:string};audio?:{id:string};image?:{id:string;caption?:string;mime_type?:string}
  document?:{id:string;filename?:string;caption?:string;mime_type?:string}
  video?:{id:string;caption?:string};sticker?:{id:string}
  location?:{latitude:number;longitude:number;name?:string;address?:string}
}
const boton=(m:EntradaAsistente)=>m.interactive?.button_reply?.id??m.interactive?.list_reply?.id??m.button?.payload
export const botonAsistente=(m:EntradaAsistente)=>boton(m)?.startsWith('waas|')??false
const idValido=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

type RespuestaGuardada={mensaje:Mensaje;mapas?:{campoId:string;potreroId?:string}[];archivos?:string[];secciones:Seccion[]}
function botonesPropuestas(texto:string,propuestas:store.PropuestaAsistente[]):Mensaje {
  const listas=propuestas.filter(p=>p.estado==='propuesta')
  if(listas.length===1){const p=listas[0];return {texto,botones:[
    {id:`waas|si|${p.id}|${p.revision}`,titulo:'Guardar'},{id:`waas|no|${p.id}|${p.revision}`,titulo:'Descartar'},
  ]}}
  if(listas.length>1)return {texto,lista:{boton:'Revisar cargas',filas:listas.slice(0,10).map((p,i)=>({
    id:`waas|ver|${p.id}|${p.revision}`,titulo:`Carga ${i+1}`,detalle:p.resumen.slice(0,72),
  }))}}
  return {texto}
}

async function devolverOriginal(v:Vinculo,id:string) {
  const e=await store.evidenciaPorId(v,id)
  if(!e)throw new store.AccesoAsistente()
  const canal=canalOriginal(e.mime,e.tamano)
  if(!canal)throw Error('Formato no habilitado para reenvío')
  const f=await abrirOriginal(v,e),caption=enLaCuenta({texto:f.nombre},v.cuenta).texto
  const media=canal==='image'?await meta.subirImagen(f.bytes,f.nombre):await meta.subirDocumento(f.bytes,f.nombre,f.mime)
  const r=canal==='image'?await meta.enviarImagen(v.telefono,media,caption):await meta.enviarDocumento(v.telefono,media,f.nombre,caption)
  await db.guardarSaliente({wamid:r.wamid,telefono:v.telefono,vinculo:v,cuerpo:r.cuerpo})
}
async function pedidoModelo(p:PedidoModelo,signal:AbortSignal):Promise<RespuestaModelo> {
  const key=Deno.env.get('ANTHROPIC_API_KEY')
  if(!key)throw new FalloAsistente('proveedor')
  return leerServicio<RespuestaModelo>({pedir:()=>fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'},
    body:JSON.stringify({...p,model:MODELO_ASISTENTE,thinking:{type:'adaptive'},output_config:{effort:'medium'}}),signal,
  })})
}

export async function atenderAsistente(m:EntradaAsistente,mensajeId:string,v:Vinculo,ctx:Contexto,io:{
  responder:(m:Mensaje)=>Promise<void>
  consultar:(b:Borrador)=>Promise<string>
  enviarImagen:(bytes:Uint8Array,caption:string,campoId:string)=>Promise<void>
  textoPrevio?:string|null
}):Promise<void> {
  if(m.from!==v.telefono)throw new store.AccesoAsistente()
  if(botonAsistente(m)){
    const partes=boton(m)!.split('|'),[_,accion,id,revision]=partes
    if(partes.length!==4||!idValido(id)||!idValido(revision)){await io.responder({texto:'Ese botón no corresponde a una propuesta disponible.'});return}
    if(accion==='ver'){
      const p=(await store.propuestas(v)).find(p=>p.id===id&&p.revision===revision)
      await io.responder(p?botonesPropuestas(p.resumen,[p]):{texto:'Esa propuesta cambió. Pedime que te muestre las cargas pendientes.'})
      return
    }
    if(accion==='no'){
      const ok=await store.descartarPropuesta(v,id,revision)
      await io.responder({texto:ok?'Listo, descarté esa propuesta. Los registros del campo siguen igual.':'Esa propuesta ya cambió o no está disponible para esta cuenta.'})
      return
    }
    if(accion!=='si'){await io.responder({texto:'Ese botón ya no está disponible.'});return}
    try{
      const r=await store.confirmarPropuesta(v,id,revision,(tx,p)=>ejecutarOperacion(tx,v,p))
      const texto=r.estado==='confirmada'?`Listo, quedó registrado: ${r.detalle}.`
        :r.estado==='ya_confirmada'?'Esa carga ya estaba confirmada. No la repetí.'
        :r.estado==='sin_permiso'?'Cambió tu permiso para esa carga. La propuesta quedó sin ejecutar.'
        :r.estado==='version_anterior'?'Ese botón es anterior a la corrección. Revisá la propuesta más reciente.'
        :'Esa propuesta ya no está disponible para confirmar en esta cuenta.'
      await io.responder({texto})
    }catch{
      const confirmado=await store.resultadoPropuesta(v,id,revision).catch(()=>null)
      await io.responder({texto:confirmado?.estado==='confirmada'
        ?`La carga quedó registrada: ${confirmado.resumen}.`
        :confirmado?'No se confirmó esa carga. Revisemos la propuesta y los datos actuales antes de intentarlo de nuevo.'
        :'No pude comprobar el resultado de esa confirmación. Conservé su referencia para revisarla sin duplicar la carga.'})
    }
    return
  }
  let texto=m.text?.body??m.document?.caption??m.image?.caption??m.video?.caption??(m.type==='location'?'Compartí un punto en el mapa por WhatsApp.':'')
  const porAudio=m.type==='audio',entrada=porAudio?'audio':m.type==='image'?'foto':'texto'
  const turno=await store.iniciarTurno(v,mensajeId,texto,entrada)
  if(!turno.nuevo){
    // Nunca reejecutar automáticamente un turno con resultado o envío ambiguo.
    if(turno.respuesta&&turno.salida_estado==='pendiente'){
      const r=turno.respuesta as unknown as RespuestaGuardada
      const permite=await store.conAlcance(v,async(_tx,n)=>r.secciones.every(s=>veSeccion(n,s)))
      if(!permite)return
      if(await store.tomarSalida(v,mensajeId)){
        let ok=false
        try{
          await io.responder(r.mensaje)
          for(const pedido of r.mapas??[]){
            const n=await store.conAlcance(v,async(_tx,n)=>n)
            if(!veSeccion(n,'campos'))throw new store.AccesoAsistente()
            const datos=await db.datosMapa(v,pedido.campoId,veSeccion(n,'hacienda'))
            const imagen=datos&&await imagenMapa(datos,ctx.hoy,fetch,pedido.potreroId)
            if(!imagen)throw Error('La imagen requiere revisión')
            await io.enviarImagen(imagen.bytes,`${datos!.nombre}. ${imagen.satelital?'Vista satelital':'Croquis sin fondo satelital'}.`,pedido.campoId)
          }
          for(const id of r.archivos??[])await devolverOriginal(v,id)
          ok=true
        }finally{await store.terminarSalida(v,mensajeId,ok)}
      }
    }
    return
  }
  let originalArchivado=false
  let respuesta:RespuestaGuardada
  const imagenes=new Map<string,{bytes:Uint8Array;caption:string;campoId:string;potreroId?:string}>()
  let herramientas:ReturnType<typeof herramientasAsistente>|undefined
  try{
    const media=m.audio??m.image??m.document??m.video??m.sticker
    const archivo=media?await recibirOriginal(v,mensajeId,media.id,m.document?.filename??
      (porAudio?'Audio.ogg':m.type==='image'?'Foto.jpg':m.type==='video'?'Video.mp4':'Adjunto')):null
    originalArchivado=archivo?.archivado??false
    if(porAudio){
      if(io.textoPrevio)texto=io.textoPrevio
      else if(archivo?.bytes&&archivo.mime)texto=await transcribir(archivo.bytes,archivo.mime,pistaTranscripcion(ctx))
      if(!texto.trim())throw new FalloAsistente('respuesta_invalida')
      await store.transcripcionGuardada(v,mensajeId,texto)
      if(archivo)await store.guardarEvidencia(v,mensajeId,{media:media!.id,nombre:archivo.evidencia.nombre,
        texto,estado:archivo.archivado?'archivada':'error'})
    }
    const historia=await store.historial(v,mensajeId)
    herramientas=herramientasAsistente(v,ctx,mensajeId,{mensaje:texto,ubicacion:m.type==='location'?m.location:undefined,historial:historia,consultar:io.consultar,
      leer:(e,desde)=>leerOriginal(v,e,desde),
      mapa:async(campoId,potreroId)=>{
        const niveles=await store.conAlcance(v,async(_tx,n)=>n)
        if(!veSeccion(niveles,'campos'))return {estado:'sin_permiso'}
        const datos=await db.datosMapa(v,campoId,veSeccion(niveles,'hacienda'))
        if(!datos)return {estado:'campo_no_disponible'}
        const imagen=await imagenMapa(datos,ctx.hoy,fetch,potreroId)
        if(!imagen)return {estado:'sin_geometria',potreros:datos.potreros.map(p=>p.nombre)}
        if(veSeccion(niveles,'hacienda'))herramientas?.seccionesLeidas.add('hacienda')
        const potrero=datos.potreros.find(p=>p.id===potreroId)?.nombre
        const caption=`${datos.nombre}${potrero?' · Potrero '+potrero:''}. ${imagen.satelital?'Vista satelital':'Croquis: no se pudo obtener el fondo satelital'}.`
          +(imagen.faltantes.length?' Sin dibujo: '+imagen.faltantes.join(', ')+'.':'')
        imagenes.set(campoId+':'+(potreroId??''),{bytes:imagen.bytes,caption,campoId,potreroId})
        return {estado:'generado',satelital:imagen.satelital,faltantes:imagen.faltantes,
          potreros:datos.potreros.map(p=>p.nombre),referencias:(datos.infraestructura??[]).slice(0,60).map(e=>({tipo:e.tipo,nombre:e.apodo??e.nombre}))}
      },
    })
    const contexto=await herramientas.contexto()
    const limiteModelo=AbortSignal.timeout(60_000)
    const contenido=[{type:'text',text:JSON.stringify({mensaje:texto,ubicacion_compartida:m.type==='location'&&!!m.location,tipo:porAudio?'audio transcripto':m.type,
      archivoActual:archivo?{nombre:archivo.evidencia.nombre,archivado:archivo.archivado}:null})}]
    const resultadosTurno:PasoAsistente['llamadas']=[]
    let cierreRedactado=false
    const resultado=await ejecutarAsistente({
      contenido,
      objetivoCaracteres:420,
      limiteCaracteres:()=>Math.max(1,(herramientas!.propuestasMostradas.size?950:3500)-enLaCuenta({texto:''},v.cuenta).texto.length-(archivo&&!archivo.archivado?150:0)),
      herramientas:herramientas.herramientas,pedir:async p=>{
        const limite=Math.max(1,950-enLaCuenta({texto:''},v.cuenta).texto.length-(archivo&&!archivo.archivado?150:0))
        const solicitud=cierreRedactado&&p.tool_choice.type==='none'?pedidoCierreAsistente(contenido,resultadosTurno,limite,ctx.fechaMensaje??ctx.hoy):p
        if(solicitud!==p)solicitud.messages.push(p.messages.at(-1)!)
        const r=await pedidoModelo(solicitud,limiteModelo)
        const preparoCarga=resultadosTurno.some(h=>h.herramienta==='proponer_registro'&&['propuesta','incompleta'].includes(String((h.resultado as {estado?:string})?.estado)))
        if(r.stop_reason!=='end_turn'||p.tool_choice.type==='none'||!preparoCarga||cierreRedactado)return r
        cierreRedactado=true
        const cierre=await pedidoModelo(pedidoCierreAsistente(contenido,resultadosTurno,limite,ctx.fechaMensaje??ctx.hoy),limiteModelo)
        return {...cierre,usage:{input_tokens:(r.usage?.input_tokens??0)+(cierre.usage?.input_tokens??0),output_tokens:(r.usage?.output_tokens??0)+(cierre.usage?.output_tokens??0)}}
      },
      ejecutar:herramientas.ejecutar,registrar:async p=>{await store.registrarPaso(v,mensajeId,p);resultadosTurno.push(...p.llamadas)},
      contexto:{hoy:ctx.fechaMensaje??ctx.hoy,productor:ctx.nombre,cuenta:v.cuenta??null,
        campos:ctx.campos.map(c=>({nombre:c.nombre,potreros:c.potreros.map(p=>p.nombre)})),
        categoriasGasto:ctx.categoriasGasto.map(c=>c.nombre),historial:historia,archivos:contexto.archivos},
    })
    const pendientes=await store.propuestas(v)
    const propuestas=pendientes.filter(p=>herramientas!.propuestasMostradas.has(p.id))
    let mensaje=botonesPropuestas(resultado.texto,propuestas)
    if(archivo&&!archivo.archivado)mensaje={...mensaje,texto:mensaje.texto+'\n\nEl original todavía no pudo archivarse. Su referencia y lo que recibí quedan para revisión.'}
    respuesta={mensaje,mapas:[...imagenes.values()].map(i=>({campoId:i.campoId,potreroId:i.potreroId})),
      archivos:herramientas.devoluciones.map(a=>a.id),secciones:[...herramientas.seccionesLeidas]}
    await store.finalizarTurno(v,mensajeId,respuesta as unknown as Record<string,unknown>)
  }catch(e){
    if(e instanceof store.AccesoAsistente)throw e
    const pendientes=await store.propuestas(v).catch(()=>[])
    const propias=pendientes.filter(p=>herramientas?.propuestasMostradas.has(p.id))
    const asunto=porAudio?(texto.trim()?'La transcripción del audio quedó recibida.':'Recibí el audio, pero no pude obtener una transcripción legible.'):'No pude terminar esta respuesta.'
    const original=porAudio?(originalArchivado?' El original está archivado.':' El original todavía está pendiente de archivar.'):''
    const detalle=propias.length?' Las propuestas que alcancé a preparar siguen disponibles para revisar.':''
    respuesta={mensaje:botonesPropuestas(`${asunto}${original}${porAudio?' No pude terminar de revisar este turno.':''}${detalle} No hice cambios en los datos del campo.`,propias),secciones:[]}
    await store.finalizarTurno(v,mensajeId,{...respuesta,error:e instanceof FalloAsistente?e.codigo:'interno'} as unknown as Record<string,unknown>,true)
  }
  // Si se revocó un permiso mientras razonaba, no enviar resultados viejos.
  const autorizado=await store.conAlcance(v,async(_tx,n)=>respuesta.secciones.every(s=>veSeccion(n,s)))
  if(!autorizado){
    respuesta={mensaje:{texto:'Cambió tu acceso mientras revisaba el mensaje. Conservé lo recibido; revisemos los permisos antes de mostrar esos datos.'},secciones:[]}
    await store.finalizarTurno(v,mensajeId,{...respuesta,error:'permiso_cambio'} as unknown as Record<string,unknown>,true)
    imagenes.clear()
  }
  if(!await store.tomarSalida(v,mensajeId))return
  let enviado=false
  try{
    await io.responder(respuesta.mensaje)
    for(const pedido of respuesta.mapas??[]){
      const imagen=imagenes.get(pedido.campoId+':'+(pedido.potreroId??''))
      if(!imagen)throw Error('La imagen preparada requiere revisión')
      await io.enviarImagen(imagen.bytes,imagen.caption,imagen.campoId)
    }
    for(const id of respuesta.archivos??[])await devolverOriginal(v,id)
    enviado=true
  }finally{await store.terminarSalida(v,mensajeId,enviado)}
}