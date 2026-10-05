import { describe, expect, it } from 'vitest'
import {
  codigoDeLoPegado,
  errorAlPedir,
  estadoDelCodigo,
  limpiarCodigo,
  mailValido,
  mostrarCodigo,
  relojMinutos,
  segundosParaReenviar,
  separarNombre,
  VENCE_MS,
} from './reglas'

const T0 = 1_000_000

describe('estadoDelCodigo', () => {
  it('recién mandado: esperando, con 3 intentos', () => {
    expect(estadoDelCodigo(T0, 0, T0 + 1000)).toEqual({ tipo: 'esperando', quedan: 3 })
  })
  it('un error: incorrecto, quedan 2', () => {
    expect(estadoDelCodigo(T0, 1, T0 + 1000)).toEqual({ tipo: 'incorrecto', quedan: 2 })
  })
  it('tres errores: vencido por intentos', () => {
    expect(estadoDelCodigo(T0, 3, T0 + 1000)).toEqual({ tipo: 'vencido', motivo: 'intentos' })
  })
  it('a los 10 minutos: vencido por tiempo, aunque no haya errores', () => {
    expect(estadoDelCodigo(T0, 0, T0 + VENCE_MS)).toEqual({ tipo: 'vencido', motivo: 'tiempo' })
    expect(estadoDelCodigo(T0, 0, T0 + VENCE_MS - 1).tipo).toBe('esperando')
  })
})

describe('reenvío', () => {
  it('cuenta 60 segundos y después habilita', () => {
    expect(segundosParaReenviar(T0, T0)).toBe(60)
    expect(segundosParaReenviar(T0, T0 + 18_000)).toBe(42)
    expect(segundosParaReenviar(T0, T0 + 60_000)).toBe(0)
    expect(segundosParaReenviar(T0, T0 + 90_000)).toBe(0)
  })
  it('se muestra como reloj', () => {
    expect(relojMinutos(42)).toBe('0:42')
    expect(relojMinutos(60)).toBe('1:00')
    expect(relojMinutos(5)).toBe('0:05')
  })
})

describe('pegar el código', () => {
  it('toma el código solo, con o sin espacio', () => {
    expect(codigoDeLoPegado('482913')).toBe('482913')
    expect(codigoDeLoPegado(' 482 913 ')).toBe('482913')
    expect(codigoDeLoPegado('482-913')).toBe('482913')
  })
  it('toma el código del mensaje entero de WhatsApp', () => {
    expect(
      codigoDeLoPegado('482 913 es tu código para entrar a Tropero. Vence en 10 minutos.'),
    ).toBe('482913')
  })
  it('toma el código del mensaje real de la plantilla de Meta', () => {
    expect(
      codigoDeLoPegado(
        'Tu código de verificación es 482913. Por tu seguridad, no lo compartas. Este código caduca en 10 minutos.',
      ),
    ).toBe('482913')
  })
  it('no pega si no hay un código claro', () => {
    expect(codigoDeLoPegado('hola')).toBeNull()
    expect(codigoDeLoPegado('12345')).toBeNull()
    expect(codigoDeLoPegado('1234567')).toBeNull()
    expect(codigoDeLoPegado('111111 y 222222')).toBeNull()
  })
  it('el campo deja sólo 6 números', () => {
    expect(limpiarCodigo('48a2 9137')).toBe('482913')
    expect(mostrarCodigo('482913')).toBe('482 913')
    expect(mostrarCodigo('48')).toBe('48')
  })
})

describe('errores al pedir el código', () => {
  it('número sin cuenta', () => {
    expect(errorAlPedir({ code: 'otp_disabled', message: 'Signups not allowed for otp' })).toEqual({
      tipo: 'sin-cuenta',
    })
  })
  it('pidió otro antes de tiempo: dice cuánto esperar', () => {
    expect(
      errorAlPedir({
        code: 'over_sms_send_rate_limit',
        status: 429,
        message: 'For security purposes, you can only request this after 48 seconds.',
      }),
    ).toEqual({ tipo: 'esperar', segundos: 48 })
  })
  it('sin señal', () => {
    expect(errorAlPedir({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' })).toEqual({
      tipo: 'sin-senal',
    })
  })
  it('cualquier otro error: mensaje en castellano', () => {
    expect(errorAlPedir({ status: 500, message: 'boom' }).tipo).toBe('otro')
  })
})

describe('crear cuenta', () => {
  it('el mail es opcional, pero si se escribe tiene que ser válido', () => {
    expect(mailValido('')).toBe(true)
    expect(mailValido('  ')).toBe(true)
    expect(mailValido('daniel@rissoagro.com.ar')).toBe(true)
    expect(mailValido('daniel@')).toBe(false)
    expect(mailValido('daniel rissoagro.com')).toBe(false)
  })
  it('separa nombre y apellido del campo único del celular', () => {
    expect(separarNombre('Daniel Risso')).toEqual({ nombre: 'Daniel', apellido: 'Risso' })
    expect(separarNombre('María José Pérez')).toEqual({ nombre: 'María José', apellido: 'Pérez' })
    expect(separarNombre('Daniel')).toEqual({ nombre: 'Daniel', apellido: '' })
  })
})
