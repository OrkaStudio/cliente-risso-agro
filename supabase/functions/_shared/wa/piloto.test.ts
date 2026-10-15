import { describe,it,expect } from 'vitest'
import { arrancar,ayuda,corregir,siguientePaso } from './conversacion.ts'
import { EntradaIncompleta,limpiarInterpretacion,MAX_TEXTO,promptInterpretar } from './interpretar.ts'
import { comandoPiloto,fusionarRecorrida,textoComparacion } from './piloto.ts'
import { Turnos,leerServicio,empresaEnPiloto,secretoValido } from './servicios.ts'
import { geometriaMapa,svgMapa } from './mapa-svg.ts'
import { comandoMapa } from './mapa.ts'
import { resolverReferenciaPotrero } from './resolver.ts'
import type { Borrador } from './tipos.ts'

const ctx={hoy:'2026-10-15',nombre:'QA',campos:[{id:'c',nombre:'La Porteña',potreros:[{id:'p',nombre:'7B'}]}],categoriasGasto:[]}
const novedad=()=>limpiarInterpretacion({intent:'novedad',fecha:'2026-10-14',observaciones:[{potrero:'7B',agua:'baja'}]})
const b=(extra:Partial<Borrador>={}):Borrador=>({tipo:'recorrida',campoId:'c',fecha:ctx.hoy,observaciones:[],...extra})
describe('regresiones de la auditoría y voz',()=>{
  it('el final de un audio de 2348 caracteres llega al intérprete',()=>{
    const text='Recorrí y estaba todo normal. '.repeat(80)+'AL_FINAL_MOLINO_ROTO'
    expect(text.length).toBeGreaterThan(1500)
    expect(promptInterpretar(text,ctx)).toContain('AL_FINAL_MOLINO_ROTO')
    expect(()=>promptInterpretar('x'.repeat(MAX_TEXTO+1),ctx)).toThrow(EntradaIncompleta)
  })
  it('conserva la fecha de ayer desde interpretación hasta propuesta',()=>{
    const start=arrancar(novedad(),ctx,'Ayer en el 7B había poca agua')
    if(!('borrador'in start))throw Error()
    const paso=siguientePaso('qa',start.borrador,ctx)
    expect(paso).toMatchObject({k:'proponer',borrador:{fecha:'2026-10-14'}})
  })
  it('ayer y hoy refieren a la fecha recibida aunque la cola cruce medianoche',()=>{
    const recibido={...ctx,fechaMensaje:'2026-10-14'}
    const start=arrancar({...novedad(),fecha:null},recibido,'Ayer en el 7B había poca agua')
    if(!('borrador'in start))throw Error()
    expect(siguientePaso('qa',start.borrador,recibido)).toMatchObject({k:'proponer',borrador:{fecha:'2026-10-13'}})
    const sinFecha=arrancar({...novedad(),fecha:null},recibido,'En el 7B había poca agua')
    if(!('borrador'in sinFecha))throw Error()
    // Sin fecha dicha no la fija al arrancar: una recorrida por partes abierta decide la suya.
    expect(sinFecha.borrador.fecha).toBeFalsy()
    expect(siguientePaso('qa',sinFecha.borrador,recibido)).toMatchObject({k:'proponer',borrador:{fecha:'2026-10-14'}})
  })
  it('una fecha futura se pregunta y una respuesta de fecha conserva las observaciones',()=>{
    const start=arrancar({...novedad(),fecha:'2026-10-16'},ctx)
    if(!('borrador'in start))throw Error()
    expect(siguientePaso('qa',start.borrador,ctx)).toMatchObject({k:'preguntar',pendiente:{tipo:'corregir'}})
    const fixed=corregir(start.borrador,limpiarInterpretacion({intent:'novedad'}),ctx,'fue ayer')
    expect(siguientePaso('qa',fixed,ctx)).toMatchObject({k:'proponer',borrador:{fecha:'2026-10-14',observaciones:[{agua:'baja'}]}})
  })
  it('no pierde observaciones ni acepta un resultado parcial por encima del límite',()=>{
    const rows=Array.from({length:13},(_,i)=>({potrero:String(i+1),novedad:`dato ${i}`}))
    expect(limpiarInterpretacion({intent:'novedad',observaciones:rows}).observaciones.at(-1)?.novedad).toBe('dato 12')
    expect(()=>limpiarInterpretacion({intent:'novedad',observaciones:Array.from({length:61},()=>rows[0])})).toThrow(EntradaIncompleta)
  })
  it('no ofrece el PDF apagado y no procesa sólo la primera operación mezclada',()=>{
    expect(ayuda('QA')).not.toContain('resumen semanal')
    expect(ayuda('QA',{semanalHabilitado:true})).toContain('resumen semanal')
    expect(arrancar(limpiarInterpretacion({intent:'lluvia',mm:20,otros_registros:['gasto']}),ctx)).toMatchObject({estado:'respondida',respuesta:expect.stringContaining('No guardé')})
  })
  it('sólo reintenta un error temporal, no un rechazo permanente',async()=>{
    let n=0
    const result=await leerServicio<{text:string}>({pedir:async()=>++n===1?new Response('',{status:503}):Response.json({text:'7B'}),esperar:async()=>{}})
    expect(result.text).toBe('7B');expect(n).toBe(2)
    n=0
    await expect(leerServicio({pedir:async()=>{n++;return new Response('',{status:401})},esperar:async()=>{}})).rejects.toThrow('401')
    expect(n).toBe(1)
  })
  it('dos audios se ordenan aunque el primero tarde y un fallo no bloquee el siguiente',async()=>{
    const turns=new Turnos(),trace:string[]=[]
    let release!:()=>void
    const wait=new Promise<void>(r=>{release=r})
    const a=turns.ejecutar('a',async()=>{trace.push('audio1');await wait;throw Error('ruido')})
    const rejected=expect(a).rejects.toThrow('ruido')
    const other=turns.ejecutar('b',async()=>{trace.push('otra empresa')})
    const next=turns.ejecutar('a',async()=>{trace.push('audio2')})
    await other;expect(trace).not.toContain('audio2');release();await rejected;await next
    expect(trace.indexOf('audio2')).toBeGreaterThan(trace.indexOf('audio1'))
  })
})
describe('mapa compacto y acercamiento',()=>{
  const data={id:'c',nombre:'La Porteña',potreros:[{id:'p',nombre:'12B',poligono:[[-36,-59],[-36,-58.9999],[-36.01,-58.9999],[-36.01,-59]]},{id:'q',nombre:'Otro',poligono:[[-36,-59.1],[-36,-59.099],[-36.01,-59.099],[-36.01,-59.1]]}]}
  it('un potrero estrecho conserva nombre real y la foto domina el lienzo',()=>{
    const r=svgMapa(data,ctx.hoy)!,g=geometriaMapa(data)!
    expect(r.svg).toContain('12B');expect(r.svg).not.toContain('<circle');expect(g.mapW*g.mapH/(g.width*g.height)).toBeGreaterThan(.9)
    expect(r.svg).toContain('clipPath');expect(r.svg).not.toContain('1242')
  })
  it('el detalle cambia el encuadre y un ID que no pertenece al campo se rechaza',()=>{
    const a=geometriaMapa(data)!,z=geometriaMapa(data,'p')!
    expect(z.extent[2]-z.extent[0]).toBeLessThan(a.extent[2]-a.extent[0])
    expect(()=>geometriaMapa(data,'ajeno')).toThrow()
    expect(comandoMapa('acercá el 12B')).toEqual({potrero:'12b'})
    expect(resolverReferenciaPotrero('7B de La Porteña',ctx.campos)).toMatchObject({ok:{potrero:{id:'p'}}})
    const f=svgMapa(data,ctx.hoy,{dataUri:'data:image/jpeg;base64,/9j/2Q==',atribucion:'Esri',extent:a.extent},'p')!
    const image=f.svg.match(/<image x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/)!
    const [x,y,w,h]=image.slice(1).map(Number)
    expect(x).toBeLessThanOrEqual(.001);expect(y).toBeLessThanOrEqual(z.mapY+.001)
    expect(x+w).toBeGreaterThanOrEqual(z.mapW-.001);expect(y+h).toBeGreaterThanOrEqual(z.mapY+z.mapH-.001)
  })
})
describe('funciones nuevas',()=>{
  it('sólo habilita empresas elegidas y rechaza un token de trabajo ausente o corto',()=>{
    expect(empresaEnPiloto('empresa1, empresa2','empresa2')).toBe(true)
    expect(empresaEnPiloto(undefined,'empresa2')).toBe(false)
    expect(empresaEnPiloto('empresa1','empresa2')).toBe(false)
    expect(secretoValido('x'.repeat(32),'x'.repeat(32))).toBe(true)
    expect(secretoValido('x'.repeat(32),'y'.repeat(32))).toBe(false)
    expect(secretoValido('corto','corto')).toBe(false)
  })
  it.each([
    ['corregir última carga a 25 mil','ajustar'],['deshacer última carga','ajustar'],['reportar problema en 7B: molino roto','incidencia'],
    ['resolver problema 1234abcd','resolver'],['crear tarea en 7B para mí mañana: revisar bomba','tarea'],['aceptar tarea 1234abcd','tarea_estado'],
    ['Se rompió el molino del 7B','incidencia'],['Ya arreglé el molino del 7B','resolver_lugar'],['Que Juan revise la bomba mañana','tarea'],
    ['empezar recorrida en La Porteña','sesion'],['retomar recorrida','sesion'],['cerrar recorrida','sesion'],['comparar recorridas','comparar']
  ])('reconoce %s sin inventar datos', (text,k)=>expect(comandoPiloto(text,ctx.hoy)?.k).toBe(k))
  it('los listados permiten recorrer páginas',()=>expect(comandoPiloto('problemas página 2',ctx.hoy)).toEqual({k:'problemas',pagina:2}))
  it('los audios de una sesión suman y preservan lo que no se volvió a decir',()=>{
    const old=novedad().observaciones[0]
    const a=b({observaciones:[{...old,potreroId:'p',agua:'seca',novedad:'Molino roto'}]})
    const result=fusionarRecorrida(a,b({observaciones:[{...old,potreroId:'p',agua:null,pasto:'escaso',novedad:'Faltan dos'}]}))
    expect(result.observaciones).toHaveLength(1)
    expect(result.observaciones?.[0]).toMatchObject({agua:'seca',pasto:'escaso',novedad:'Molino roto; Faltan dos'})
    expect(a.observaciones?.[0].novedad).toBe('Molino roto')
  })
  it('comparar usa fechas y no llama normal a un potrero sin datos',()=>{
    const texto=textoComparacion([{campo:'La Porteña',potrero:'7B',fecha:'2026-10-15',anterior_fecha:'2026-10-14',agua:'seca',anterior_agua:'normal',pasto:null,anterior_pasto:null,electrico:null,anterior_electrico:null},{campo:'La Porteña',potrero:'8B',fecha:null,anterior_fecha:null,agua:null,anterior_agua:null,pasto:null,anterior_pasto:null,electrico:null,anterior_electrico:null}])
    expect(texto).toContain('normal → seca');expect(texto).toContain('1 no tienen dos fechas');expect(texto).toContain('Sin datos no significa')
  })
})
