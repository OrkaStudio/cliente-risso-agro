import { describe, expect, it } from 'vitest'
import { ahoraEnVarias, ayudaVariasCuentas, botonCuenta, cuentaPorTexto, deQueSeTrata, enLaCuenta, leerBotonCuenta, leerBotonInvitacion, loQueMando, preguntaCuenta } from './cuentas.ts'

const RISSO = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Risso Agro' }
const PEREZ = { id: '22222222-2222-4222-8222-222222222222', nombre: 'Estancia Pérez' }
const GOMEZ = { id: '33333333-3333-4333-8333-333333333333', nombre: 'Gómez Hnos' }
const REV = '99999999-9999-4999-8999-999999999999'

describe('la pregunta de la cuenta (varias cuentas, 14/11)', () => {
  it('botones en orden alfabético, ninguno marcado ni sugerido', () => {
    const m = preguntaCuenta([RISSO, PEREZ], ['«vacuné 12 vaquillonas»'], REV)
    expect(m.botones?.map((b) => b.titulo)).toEqual(['Estancia Pérez', 'Risso Agro'])
    expect(m.texto).toContain('¿De qué cuenta es «vacuné 12 vaquillonas»?')
    expect(m.texto).toContain('no cargo nada')
  })
  it('más de 3 cuentas o un nombre largo: lista', () => {
    const muchas = preguntaCuenta([RISSO, PEREZ, GOMEZ, { id: '44444444-4444-4444-8444-444444444444', nombre: 'Don Pedro' }], ['esto'], REV)
    expect(muchas.botones).toBeUndefined()
    expect(muchas.lista?.filas).toHaveLength(4)
    const larga = preguntaCuenta([RISSO, { id: PEREZ.id, nombre: 'Establecimiento La Esperanza del Sur' }], ['esto'], REV)
    expect(larga.lista?.filas[0]?.detalle).toBe('Establecimiento La Esperanza del Sur')
  })
  it('varias cosas sin cuenta: se nombran todas y la cuenta vale para todas', () => {
    const m = preguntaCuenta([RISSO, PEREZ], ['«vacuné 20 terneros»', '«desparasité 30»', 'la foto que mandaste'], REV)
    expect(m.texto).toContain('¿De qué cuenta son estos 3 mensajes?')
    expect(m.texto).toContain('1. «vacuné 20 terneros»\n2. «desparasité 30»\n3. la foto que mandaste')
    expect(m.texto).toContain('vale para todos')
    expect(m.texto).toContain('«cancelar»')
    expect(m.botones).toHaveLength(2)
    expect(loQueMando(['«a»', '«b»'])).toBe('esos 2 mensajes')
    expect(loQueMando(['«a»'])).toBe('«a»')
  })
  it('muchas cosas largas: la pregunta entra en un solo mensaje con botones', () => {
    const largos = Array.from({ length: 9 }, (_, i) => `«${'vacuné vaquillonas en el potrero del fondo '.repeat(3)}${i}»`)
    const m = preguntaCuenta([RISSO, PEREZ], largos, REV, 'No cargué «algo»: pasaron más de 12 horas. ')
    expect(m.texto.length).toBeLessThanOrEqual(1024)
    expect(m.texto).toContain('y 3 más')
  })
  it('el botón dice qué cuenta y de qué pregunta', () => {
    expect(leerBotonCuenta(botonCuenta(RISSO.id, REV))).toEqual({ empresaId: RISSO.id, revision: REV })
    expect(leerBotonCuenta('c=algo')).toBeNull()
    expect(leerBotonCuenta(undefined)).toBeNull()
  })
})

describe('la cuenta dicha por texto o audio', () => {
  const cuentas = [RISSO, PEREZ, GOMEZ]
  it('el nombre o una parte clara de él', () => {
    expect(cuentaPorTexto('Risso', cuentas)).toBe(RISSO)
    expect(cuentaPorTexto('la de perez', cuentas)).toBe(PEREZ)
    expect(cuentaPorTexto('Es para Gómez.', cuentas)).toBe(GOMEZ)
    expect(cuentaPorTexto('risso agro', cuentas)).toBe(RISSO)
  })
  it('si no es uno solo, no elige', () => {
    expect(cuentaPorTexto('Estancia', [PEREZ, { id: RISSO.id, nombre: 'Estancia Risso' }])).toBeNull()
    expect(cuentaPorTexto('la de', cuentas)).toBeNull()
    expect(cuentaPorTexto('sí', cuentas)).toBeNull()
  })
  it('un mensaje con más cosas es otra carga, no una respuesta', () => {
    expect(cuentaPorTexto('en lo de Risso vacuné 12 vaquillonas en el bajo hoy', cuentas)).toBeNull()
    expect(cuentaPorTexto('risso llovió 20', cuentas)).toBeNull()
  })
})

describe('el nombre de la cuenta arriba de cada respuesta', () => {
  it('con cuenta, en negrita arriba; sin cuenta, igual', () => {
    expect(enLaCuenta({ texto: 'Anoté 20 mm.' }, 'Risso Agro').texto).toBe('*Risso Agro*\nAnoté 20 mm.')
    expect(enLaCuenta({ texto: 'Hola' }, null).texto).toBe('Hola')
  })
})

describe('textos', () => {
  it('de qué se trata lo que mandó', () => {
    expect(deQueSeTrata({ tipo: 'audio', texto: 'llovieron 20' })).toBe('«llovieron 20»')
    expect(deQueSeTrata({ tipo: 'image', texto: null })).toBe('la foto que mandaste')
    // Un PDF también se pregunta (unión, 18/11): se nombra como archivo.
    expect(deQueSeTrata({ tipo: 'document', texto: null })).toBe('el archivo que mandaste')
    expect(deQueSeTrata({ tipo: 'document', texto: 'factura vete' })).toBe('el archivo «factura vete»')
    expect(deQueSeTrata({ tipo: 'location', texto: null })).toBe('la ubicación que mandaste')
    expect(deQueSeTrata({ tipo: 'text', texto: 'x'.repeat(200) })).toMatch(/…»$/)
  })
  it('la ayuda y la bienvenida nombran todas las cuentas', () => {
    expect(ayudaVariasCuentas('Juan', [RISSO, PEREZ])).toContain('· Estancia Pérez\n· Risso Agro')
    expect(ahoraEnVarias('Risso Agro', [RISSO, PEREZ])).toContain('2 cuentas: Estancia Pérez y Risso Agro')
  })
  it('los botones de la invitación', () => {
    expect(leerBotonInvitacion('inv:si@0123456789abcdef0123456789abcdef')).toEqual({ acepta: true, token: '0123456789abcdef0123456789abcdef' })
    expect(leerBotonInvitacion('inv:no@0123456789abcdef0123456789abcdef')?.acepta).toBe(false)
    expect(leerBotonInvitacion('inv:si@x')).toBeNull()
  })
})
