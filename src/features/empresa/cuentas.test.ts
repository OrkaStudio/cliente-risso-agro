import { describe, expect, it } from 'vitest'
import { claveDeCuenta, fijarCuentaDelPedido } from './cuenta-activa'
import { puedeSumarSuCampo, queEsEnLaCuenta, textoSinSubir } from './cuentas'
import { cuentaActiva, type Membresia } from './use-empresa'

const cuenta = (id: string, rol = 'vet', acceso = 'app'): Membresia => ({
  empresa_id: id,
  rol,
  acceso,
  niveles: rol === 'dueno' ? null : { hacienda: 've', campos: 'no', plata: 'no' },
  empresa: { id, nombre: id },
})

describe('cuentaActiva (varias cuentas, 14/11)', () => {
  it('con una sola cuenta es ésa, aunque no haya elegido', () => {
    expect(cuentaActiva([cuenta('a')], null)?.empresa_id).toBe('a')
  })
  it('con varias y ninguna elegida, no elige sola', () => {
    expect(cuentaActiva([cuenta('a'), cuenta('b')], null)).toBeNull()
  })
  it('con varias, la que eligió en este equipo', () => {
    expect(cuentaActiva([cuenta('a'), cuenta('b')], 'b')?.empresa_id).toBe('b')
  })
  it('si la elegida ya no es suya (lo sacaron), vuelve a preguntar', () => {
    expect(cuentaActiva([cuenta('a'), cuenta('b')], 'c')).toBeNull()
  })
  it('sin cuentas, ninguna', () => {
    expect(cuentaActiva([], 'a')).toBeNull()
  })
})

describe('lo que se dice de cada cuenta', () => {
  it('el campo propio y el rol en las otras', () => {
    expect(queEsEnLaCuenta(cuenta('a', 'dueno'))).toBe('Tu campo')
    expect(queEsEnLaCuenta(cuenta('a', 'vet', 'whatsapp'))).toMatch(/· por WhatsApp$/)
  })
  it('sumar el campo propio sólo si no lo tiene', () => {
    expect(puedeSumarSuCampo([cuenta('a'), cuenta('b')])).toBe(true)
    expect(puedeSumarSuCampo([cuenta('a'), cuenta('b', 'dueno')])).toBe(false)
    expect(puedeSumarSuCampo([])).toBe(false)
  })
  it('lo que falta subir, en singular y plural', () => {
    expect(textoSinSubir(1)).toBe('Tenés una carga hecha sin señal que todavía no subió. Cuando suba, vas a poder cambiar de cuenta.')
    expect(textoSinSubir(3)).toMatch(/^Tenés 3 cargas hechas sin señal que todavía no subieron\./)
  })
})

describe('claves del equipo por cuenta', () => {
  it('cada cuenta recuerda lo suyo', () => {
    fijarCuentaDelPedido(null)
    expect(claveDeCuenta('x')).toBe('x')
    fijarCuentaDelPedido('e1')
    expect(claveDeCuenta('x')).toBe('x:e1')
    fijarCuentaDelPedido(null)
  })
})
