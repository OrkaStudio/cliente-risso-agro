import { describe, it, expect, vi } from 'vitest'
import { comandoSemanal, ejecutarEnvioSemana, horarioSemanal, lineasSemana, periodoSemana, type EnvioSemanaDeps, type SemanaCampo } from './semanal'
import { payloadDocumento } from '../../wa-webhook/meta'

const sample = (): SemanaCampo => ({ empresa:'Orka Pruebas',periodo:periodoSemana(new Date('2026-10-17T12:00:00Z')),
  lluvia:[],recorridas:[],observaciones:[],gastos:[],hacienda:[],vencimientos:[] })
const deps = (): EnvioSemanaDeps => ({ reclamar:vi.fn(async()=>true),preparar:vi.fn(async()=>{}),listoParaEnviar:vi.fn(async()=>true),
  marcarEnviando:vi.fn(async()=>true),enviar:vi.fn(async()=>'wamid.real'),guardarEnviado:vi.fn(async()=>{}),fallo:vi.fn(async()=>{}) })

describe('semana y horario de Argentina',()=>{
  it('sábado a las 09:00 resume los siete días sábado-viernes',()=>{
    expect(periodoSemana(new Date('2026-10-17T12:00:00Z'))).toEqual({desde:'2026-10-10',hasta:'2026-10-16',corte:'2026-10-17',vencimientosHasta:'2026-10-23'})
  })
  it('antes de medianoche AR no toma el día UTC siguiente',()=>{
    expect(periodoSemana(new Date('2026-10-17T02:30:00Z')).corte).toBe('2026-10-16')
  })
  it('cruza mes y año sin perder siete días',()=>{
    expect(periodoSemana(new Date('2027-01-02T12:00:00Z')).desde).toBe('2026-12-26')
  })
  it('sábado 08:59 aún no envía',()=>expect(horarioSemanal(new Date('2026-10-17T11:59:59Z'))).toBe(false))
  it('sábado 09:00 comienza el envío',()=>expect(horarioSemanal(new Date('2026-10-17T12:00:00Z'))).toBe(true))
  it('sábado 09:50 permite reintento de preparación',()=>expect(horarioSemanal(new Date('2026-10-17T12:50:00Z'))).toBe(true))
  it('sábado 10:00 y otros días no envía',()=>{
    expect(horarioSemanal(new Date('2026-10-17T13:00:00Z'))).toBe(false)
    expect(horarioSemanal(new Date('2026-10-16T12:00:00Z'))).toBe(false)
  })
})
describe('comandos explícitos del resumen',()=>{
  for (const [text,expected] of [['Activame el resumen semanal','activar'],['quiero recibir resumen semanal','activar'],
    ['desactivar resumen semanal','desactivar'],['no quiero recibir el resumen semanal','desactivar'],
    ['resumen semanal','ver'],['Mandame mi resumen semanal','ver'],['Mostrame el resumen de esta semana','ver'],['Quiero el resumen semanal del campo','ver']] as const)
    it(text,()=>expect(comandoSemanal(text)).toBe(expected))
  it('no confunde cancelar una carga ni una novedad que menciona el resumen',()=>{
    expect(comandoSemanal('cancelar')).toBe(null)
    expect(comandoSemanal('En el resumen semanal me falta el potrero 5')).toBe(null)
  })
})
describe('contenido factual del documento',()=>{
  it('ausencia de datos no afirma que no pasó nada en el campo',()=>{
    const t=lineasSemana(sample()).map(l=>l.texto).join('\n')
    expect(t).toContain('datos ausentes no significan')
    expect(t).toContain('Sin mediciones manuales registradas')
    expect(t).toContain('Sin recorridas registradas')
  })
  it('la lluvia no suma todos los campos como un pluviómetro único',()=>{
    const s=sample();s.lluvia=[{campo:'Don Gilberto',mediciones:2,mm:12.5},{campo:'Toimil',mediciones:1,mm:30}]
    const t=lineasSemana(s).map(l=>l.texto).join('\n')
    expect(t).toContain('Don Gilberto: 12,5 mm')
    expect(t).toContain('Toimil: 30 mm')
    expect(t).not.toContain('42,5 mm')
  })
  it('incluye estados y novedad sin realizar una baja de animales',()=>{
    const s=sample();s.observaciones=[{fecha:'2026-10-12',campo:'La Porteña',potrero:'3B',agua:'baja',pasto:null,electrico:'cortado',conteo:0,novedad:'vaca muerta, caravana 4521'}]
    const t=lineasSemana(s).map(l=>l.texto).join('\n')
    expect(t).toContain('conteo 0')
    expect(t).toContain('caravana 4521')
    expect(t).toContain('no realiza la baja')
  })
  it('gastos conservan centavos y declaran devengo',()=>{
    const s=sample();s.gastos=[{campo:'Don Gilberto',categoria:'Combustible',cantidad:1,total:1200.5}]
    const t=lineasSemana(s).map(l=>l.texto).join('\n')
    expect(t).toContain('$1.200,50')
    expect(t).toContain('no equivale al flujo de caja')
  })
  it('hacienda es un estado al corte, no un movimiento neto semanal',()=>{
    const s=sample();s.hacienda=[{campo:'Sin potrero asignado',categoria:'vaca',cabezas:2}]
    expect(lineasSemana(s).map(l=>l.texto).join('\n')).toContain('No representa altas, bajas')
  })
  it('incluye vencidos y próximos cobros/pagos',()=>{
    const s=sample();s.vencimientos=[{fecha:'2026-10-01',tipo:'gasto',monto:900,descripcion:'Veterinario',contraparte:null,categoria:null},{fecha:'2026-10-20',tipo:'ingreso',monto:3000,descripcion:'Venta',contraparte:null,categoria:null}]
    const t=lineasSemana(s).map(l=>l.texto).join('\n')
    expect(t).toContain('01/10/2026 (vencido): Veterinario')
    expect(t).toContain('$3.000,00 a cobrar')
  })
  it('no trunca novedades largas ni una semana con muchos registros',()=>{
    const s=sample();s.observaciones=Array.from({length:150},(_,i)=>({fecha:'2026-10-12',campo:'La Porteña',potrero:String(i),agua:null,pasto:null,electrico:null,conteo:null,novedad:'nota '+i+' '+ 'detalle '.repeat(20)}))
    expect(lineasSemana(s).map(l=>l.texto).join('\n')).toContain('nota 149')
  })
})
describe('documento de Meta',()=>{
  it('el pedido del usuario usa documento privado por media ID',()=>{
    const p=payloadDocumento('549000','media-id','resumen.pdf','Tu resumen')
    expect(p.type).toBe('document');expect(p.document).toEqual({id:'media-id',filename:'resumen.pdf',caption:'Tu resumen'})
  })
  it('el envío automático usa plantilla con encabezado DOCUMENT',()=>{
    const p=payloadDocumento('549000','media-id','resumen.pdf','','tropero_resumen_semanal')
    expect(p.type).toBe('template')
    expect(p.template).toEqual({name:'tropero_resumen_semanal',language:{code:'es_AR'},components:[{type:'header',parameters:[{type:'document',document:{id:'media-id',filename:'resumen.pdf'}}]}]})
  })
})
describe('envío sin duplicar',()=>{
  it('una ejecución ya reclamada no envía nada',async()=>{
    const d=deps();d.reclamar=vi.fn(async()=>false)
    expect(await ejecutarEnvioSemana(d)).toBe('ocupado');expect(d.enviar).not.toHaveBeenCalled()
  })
  it('guarda wamid tras enviar una sola vez',async()=>{
    const d=deps();expect(await ejecutarEnvioSemana(d)).toBe('enviado')
    expect(d.enviar).toHaveBeenCalledTimes(1);expect(d.guardarEnviado).toHaveBeenCalledWith('wamid.real')
  })
  it('una falla de PDF/media queda como preparación reintentable',async()=>{
    const d=deps();d.preparar=vi.fn(async()=>{throw Error('pdf')})
    expect(await ejecutarEnvioSemana(d)).toBe('fallo');expect(d.enviar).not.toHaveBeenCalled();expect(d.fallo).toHaveBeenCalledWith('preparacion',expect.any(Error))
  })
  it('baja durante preparación evita el envío',async()=>{
    const d=deps();d.listoParaEnviar=vi.fn(async()=>false)
    expect(await ejecutarEnvioSemana(d)).toBe('baja');expect(d.enviar).not.toHaveBeenCalled()
  })
  it('si se pierde el turno o hay baja al marcar el envío no entrega el documento',async()=>{
    const d=deps();d.marcarEnviando=vi.fn(async()=>false)
    expect(await ejecutarEnvioSemana(d)).toBe('baja');expect(d.enviar).not.toHaveBeenCalled()
  })
  it('un timeout al enviar no habilita repetición automática',async()=>{
    const d=deps();d.enviar=vi.fn(async()=>{throw Error('network timeout')})
    expect(await ejecutarEnvioSemana(d)).toBe('fallo');expect(d.fallo).toHaveBeenCalledWith('envio',expect.any(Error))
  })
  it('si se pierde la confirmación de registro tras enviar el resultado sigue incierto',async()=>{
    const d=deps();d.guardarEnviado=vi.fn(async()=>{throw Error('db')})
    expect(await ejecutarEnvioSemana(d)).toBe('fallo');expect(d.enviar).toHaveBeenCalledTimes(1);expect(d.fallo).toHaveBeenCalledWith('envio',expect.any(Error))
  })
})
