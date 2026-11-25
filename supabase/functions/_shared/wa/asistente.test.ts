import { describe, expect, it, vi } from 'vitest'
import { ejecutarAsistente, FalloAsistente, pedidoCierreAsistente, type PedidoModelo, type RespuestaModelo } from './asistente.ts'

const herramienta = { name: 'buscar_animal', description: 'Busca sólo en la cuenta vinculada', input_schema: { type: 'object' } }
const llamada = (id: string, nombre = 'buscar_animal'): RespuestaModelo => ({ stop_reason: 'tool_use', content: [
  { type: 'thinking', thinking: 'opaque', signature: 'firma-opaca' },
  { type: 'text', text: 'Voy a comprobarlo' }, { type: 'tool_use', id, name: nombre, input: { identificador: '48' } },
] })
const respuesta = (texto: string): RespuestaModelo => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: texto }] })
const base = () => ({ contenido: [{ type: 'text', text: 'La 48 está muerta' }], herramientas: [herramienta],
  contexto: { cuenta: 'productor A' }, registrar: vi.fn(async () => {}), ejecutar: vi.fn(async () => ({ estado: 'no_encontrado' })) })

describe('asistente con herramientas', () => {
  it('consulta antes de responder y conserva completos los bloques firmados entre rondas', async () => {
    const primero = llamada('a')
    const pedidos: PedidoModelo[] = []
    const io = base()
    const r = await ejecutarAsistente({ ...io, pedir: async p => {
      pedidos.push(structuredClone(p))
      return pedidos.length === 1 ? primero : respuesta('No encuentro la caravana 48 con ese número. ¿Tiene otro identificador?')
    } })
    expect(io.ejecutar).toHaveBeenCalledExactlyOnceWith('buscar_animal', { identificador: '48' })
    expect(pedidos[0].tool_choice).toEqual({ type: 'auto' })
    expect(pedidos[1].messages[1].content).toEqual(primero.content)
    expect(r.texto).toContain('48')
    expect(r.texto).not.toContain('Voy a comprobarlo')
    expect(io.registrar).toHaveBeenCalledTimes(2)
  })
  it('dos productores concurrentes no comparten contexto ni resultados de herramientas', async () => {
    const pedidos: PedidoModelo[] = []
    const correr = (nombre: string, secreto: string) => {
      let ronda = 0
      return ejecutarAsistente({ ...base(), contexto: { cuenta: nombre },
        ejecutar: async () => ({ estado: 'encontrado', nota: secreto }),
        pedir: async p => { pedidos.push(structuredClone(p)); return ++ronda === 1 ? llamada(nombre) : respuesta('¿La encontraste en el potrero registrado?') },
      })
    }
    await Promise.all([correr('A', 'privado-A'), correr('B', 'privado-B')])
    for (const p of pedidos) {
      const cuenta = JSON.parse(String(p.messages[0].content[0].text)).contexto.cuenta
      const otro = cuenta === 'A' ? 'privado-B' : 'privado-A'
      expect(JSON.stringify(p.messages)).not.toContain(otro)
    }
  })
  it('una herramienta inventada no se ejecuta y el modelo recibe un resultado explícito', async () => {
    const io = base()
    let rondas = 0
    await ejecutarAsistente({ ...io, pedir: async () => ++rondas === 1 ? llamada('a', 'sql_libre') : respuesta('¿Qué dato del animal querés consultar?') })
    expect(io.ejecutar).not.toHaveBeenCalled()
    expect(io.registrar.mock.calls[0][0].llamadas[0].resultado).toEqual({ estado: 'herramienta_no_disponible' })
  })
  it('no presenta una excepción de lectura como ausencia de datos', async () => {
    let ronda = 0
    const pedidos: PedidoModelo[] = []
    await ejecutarAsistente({ ...base(), ejecutar: async () => { throw Error('SQL privado del servidor') },
      pedir: async p => { pedidos.push(structuredClone(p)); return ++ronda === 1 ? llamada('a') : respuesta('La consulta del animal falló. El aviso sigue en este mensaje.') },
    })
    const ultimo = JSON.stringify(pedidos[1].messages.at(-1))
    expect(ultimo).toContain('error')
    expect(ultimo).not.toContain('SQL privado')
  })
  it('detiene un bucle sin repetir escrituras ni exponer razonamiento', async () => {
    let n = 0
    const io = base()
    await expect(ejecutarAsistente({ ...io, maxLlamadas: 2, pedir: async () => llamada(String(++n)) })).rejects.toMatchObject({ codigo: 'limite' })
    expect(io.ejecutar).toHaveBeenCalledTimes(2)
  })
  it('rechaza IDs de herramienta repetidos antes de repetir la ejecución', async () => {
    const io = base()
    await expect(ejecutarAsistente({ ...io, pedir: async () => llamada('repetido') })).rejects.toBeInstanceOf(FalloAsistente)
    expect(io.ejecutar).toHaveBeenCalledTimes(1)
  })
  it.each(['Guardé la muerte de la vaca.', 'Me quedó por aclarar esa parte.', 'Di de baja la 48.'])(
    'no envía un éxito de escritura o una aclaración inválida: %s', async texto => {
      await expect(ejecutarAsistente({ ...base(), pedir: async () => respuesta(texto) })).rejects.toMatchObject({ codigo: 'respuesta_invalida' })
    })
  it('un rechazo o un límite no se toma como respuesta completa', async () => {
    for (const [stop_reason, codigo] of [['refusal', 'rechazo'], ['max_tokens', 'limite']]) {
      await expect(ejecutarAsistente({ ...base(), pedir: async () => ({ ...respuesta('contenido parcial'), stop_reason }) })).rejects.toMatchObject({ codigo })
    }
  })
  it('no continúa después de fallar el registro durable de una herramienta', async () => {
    const pedir = vi.fn(async () => llamada('a'))
    await expect(ejecutarAsistente({ ...base(), pedir, registrar: async () => { throw Error('base no disponible') } })).rejects.toThrow('base no disponible')
    expect(pedir).toHaveBeenCalledTimes(1)
  })
})
it('manda imagen al modelo sin persistir el binario en las trazas de herramientas',async()=>{
  const io=base(),pedidos:PedidoModelo[]=[]
  let ronda=0
  await ejecutarAsistente({...io,ejecutar:async()=>({datos:{estado:'leido',archivo:'caravana.png'},
    contenidoModelo:[{type:'image',source:{type:'base64',media_type:'image/png',data:'BINARIO_SOLO_MODELO'}}]}),
    pedir:async p=>{pedidos.push(structuredClone(p));return ++ronda===1?llamada('archivo'):respuesta('La foto muestra una caravana. Voy a contrastar el número antes de preparar una carga.')},
  })
  expect(JSON.stringify(pedidos[1].messages)).toContain('BINARIO_SOLO_MODELO')
  expect(JSON.stringify(io.registrar.mock.calls)).not.toContain('BINARIO_SOLO_MODELO')
  expect(JSON.stringify(io.registrar.mock.calls)).toContain('caravana.png')
})
it('reformula una afirmación de guardado sin volver a ejecutar herramientas',async()=>{
  const io=base(),pedidos:PedidoModelo[]=[]
  let n=0
  const r=await ejecutarAsistente({...io,pedir:async p=>{pedidos.push(structuredClone(p));return ++n===1
    ?respuesta('Guardé la novedad del potrero.')
    :respuesta('La novedad está preparada para que la confirmes.')}})
  expect(r.texto).toContain('confirmes')
  expect(pedidos.map(p=>p.tool_choice.type)).toEqual(['auto','none'])
  expect(io.ejecutar).not.toHaveBeenCalled()
})
it('permite explicar que no hubo guardado sin confundir la negación con un éxito',async()=>{
  const r=await ejecutarAsistente({...base(),pedir:async()=>respuesta('No guardé la carga. La dejé preparada para confirmar.')})
  expect(r.texto).toContain('No guardé')
})
it('compacta un cierre demasiado largo sin repetir herramientas',async()=>{
  const io=base(),pedidos:PedidoModelo[]=[]
  let ronda=0
  const r=await ejecutarAsistente({...io,maxCaracteres:100,pedir:async p=>{pedidos.push(structuredClone(p));return ++ronda===1?respuesta('Detalle '.repeat(30)):respuesta('Lluvia y recorrida preparadas para confirmar.')}})
  expect(r.texto.length).toBeLessThanOrEqual(100)
  expect(pedidos[1].tool_choice).toEqual({type:'none'})
  expect(io.ejecutar).not.toHaveBeenCalled()
  expect(pedidos[1].messages.at(-1)?.content[0].text).toContain('100 caracteres')
})
it('una consulta válida no se descarta por superar el objetivo editorial después de compactar',async()=>{
  const io=base(),texto='Lluvia reciente: 15 mm. '.repeat(45)
  const pedir=vi.fn(async()=>respuesta(texto))
  const r=await ejecutarAsistente({...io,maxCaracteres:3500,objetivoCaracteres:420,pedir})
  expect(r.texto).toBe(texto.trim())
  expect(pedir).toHaveBeenCalledTimes(2)
  expect(io.ejecutar).not.toHaveBeenCalled()
  expect(io.registrar.mock.calls[0][0].cierre).toMatchObject({motivo:'extension',limite:3500})
})
it('registra el motivo de ambos cierres rechazados sin guardar el texto privado ni duplicar herramientas',async()=>{
  const io=base()
  await expect(ejecutarAsistente({...io,pedir:async()=>respuesta('Guardé la muerte de la 48.')})).rejects.toMatchObject({codigo:'respuesta_invalida'})
  expect(io.registrar.mock.calls.filter(c=>c[0].cierre)).toHaveLength(2)
  expect(JSON.stringify(io.registrar.mock.calls)).not.toContain('Guardé la muerte')
})


it('el cierre de una carga responde con sus hechos sin reinyectar el historial ni herramientas de escritura',()=>{
  const p=pedidoCierreAsistente([{type:'text',text:'Hoy llovieron 12 mm, anotá eso'}],[{id:'lluvia',herramienta:'proponer_registro',entrada:{tipo:'lluvia'},resultado:{estado:'propuesta',datos:{mm:12,fecha:'2026-11-25'}}}],950,'2026-11-25')
  expect(p.tools).toEqual([])
  expect(p.tool_choice).toEqual({type:'none'})
  expect(JSON.stringify(p.messages)).toContain('12')
  expect(JSON.stringify(p.messages)).not.toContain('historial')
  expect(JSON.stringify(p.messages)).not.toContain('thinking')
})
