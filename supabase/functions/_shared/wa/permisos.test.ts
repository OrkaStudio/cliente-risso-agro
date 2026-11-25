import { describe, expect, it } from 'vitest'
import { permiso, permisoInfra, soloManda } from './permisos'

const dueno = null
const vet = { hacienda: 'carga', campos: 'no', plata: 'no' } as const
const encargado = { hacienda: 've', campos: 'carga', plata: 'solo_manda' } as const

describe('el bot respeta lo que el dueño habilitó (permisos, 13/11)', () => {
  it('el dueño puede todo', () => {
    expect(permiso(dueno, 'consulta_gastos').ok).toBe(true)
    expect(permiso(dueno, 'gasto').ok).toBe(true)
  })
  it('sin la plata no contesta gastos: lo dice, no responde «no hay gastos»', () => {
    const r = permiso(vet, 'consulta_gastos')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.texto).toContain('la plata la maneja el dueño del campo')
    expect(permiso(vet, 'consulta_vencimientos').ok).toBe(false)
  })
  it('sin Campos no carga lluvias ni recorridas, ni las consulta', () => {
    expect(permiso(vet, 'lluvia').ok).toBe(false)
    expect(permiso(vet, 'recorrida').ok).toBe(false)
    expect(permiso(vet, 'consulta_lluvia').ok).toBe(false)
  })
  it('con Hacienda «ve» consulta pero no carga hacienda; con «carga» sí', () => {
    expect(permiso(encargado, 'consulta_hacienda').ok).toBe(true)
    expect(permiso(vet, 'consulta_hacienda').ok).toBe(true)
  })
  it('«solo manda» carga gastos pero no ve totales', () => {
    expect(permiso(encargado, 'gasto').ok).toBe(true)
    const r = permiso(encargado, 'consulta_gastos')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.texto).toContain('los totales y lo que cargaron otros los ve el dueño')
    expect(soloManda(encargado, 'plata')).toBe(true)
  })
  it('sus propias cargas por WhatsApp las puede consultar cualquiera', () => {
    expect(permiso(vet, 'consulta_cargas').ok).toBe(true)
  })
  it('infraestructura: cargar con Campos para cargar o mandar; borrar, sólo con «Ve y carga»', () => {
    expect(permisoInfra(encargado, 'cargar').ok).toBe(true)
    expect(permisoInfra(encargado, 'borrar').ok).toBe(true)
    expect(permisoInfra({ campos: 'solo_manda' }, 'borrar').ok).toBe(false)
    expect(permisoInfra(vet, 'cargar').ok).toBe(false)
  })
})

describe('comandos del piloto', () => {
  it('ver problemas pide ver Campos; reportar, cargar o mandar', async () => {
    const { permisoPiloto } = await import('./permisos')
    expect(permisoPiloto({ campos: 'no' }, 'problemas').ok).toBe(false)
    expect(permisoPiloto({ campos: 've' }, 'problemas').ok).toBe(true)
    expect(permisoPiloto({ campos: 've' }, 'incidencia').ok).toBe(false)
    expect(permisoPiloto({ campos: 'solo_manda' }, 'incidencia').ok).toBe(true)
    expect(permisoPiloto({ campos: 'no' }, 'ajustar').ok).toBe(true)
  })
})

describe('el resumen semanal muestra sólo lo que ve quien lo recibe', () => {
  it('sin la plata no hay gastos ni vencimientos en el resumen', async () => {
    const { lineasSemana } = await import('./semanal')
    const base = { empresa: 'X', periodo: { desde: '2026-11-07', hasta: '2026-11-13', corte: '2026-11-14', vencimientosHasta: '2026-11-21' }, lluvia: [], recorridas: [], observaciones: [], gastos: [], hacienda: [], vencimientos: [] }
    const textos = (ve?: { campos: boolean; hacienda: boolean; plata: boolean }) => lineasSemana({ ...base, ve } as never).map((l) => l.texto).join('\n')
    expect(textos()).toContain('Gastos por devengo')
    const sinPlata = textos({ campos: true, hacienda: true, plata: false })
    expect(sinPlata).not.toContain('Gastos')
    expect(sinPlata).not.toContain('vencimientos')
    expect(sinPlata).toContain('Lluvia medida')
  })
})

describe('la ayuda ofrece sólo lo habilitado', () => {
  it('al veterinario no le ofrece gastos ni lluvias; al dueño, lo de siempre', async () => {
    const { ayuda } = await import('./conversacion')
    const vet = ayuda('Paula', { niveles: { hacienda: 'carga', campos: 'no', plata: 'no' } })
    expect(vet).not.toMatch(/gasto|lluvia/i)
    expect(vet).toContain('Podés consultar la hacienda')
    expect(ayuda('Daniel', {})).toContain('gasto')
  })
})

describe('unión con la rama de Fran (18/11)', () => {
  it('la nota libre se mide en la sección que trae', async () => {
    const { permisoBorrador } = await import('./permisos')
    expect(permisoBorrador(vet, { tipo: 'nota', seccionNota: 'hacienda' }).ok).toBe(true)
    expect(permisoBorrador(vet, { tipo: 'nota', seccionNota: 'plata' }).ok).toBe(false)
    // Sin sección, Campos: el veterinario no carga Campos.
    expect(permisoBorrador(vet, { tipo: 'nota' }).ok).toBe(false)
    expect(permisoBorrador(encargado, { tipo: 'nota', seccionNota: 'plata' }).ok).toBe(true)
  })
  it('la consulta de campos pide ver Campos', () => {
    expect(permiso(vet, 'consulta_campos').ok).toBe(false)
    expect(permiso(encargado, 'consulta_campos').ok).toBe(true)
  })
  it('sólo el que ve todo recibe el historial completo', async () => {
    const { veTodo } = await import('./permisos')
    expect(veTodo(dueno)).toBe(true)
    expect(veTodo(encargado)).toBe(false)
    expect(veTodo({ hacienda: 've', campos: 've', plata: 'carga' })).toBe(true)
  })
  it('«tiene algo» en la sección: ve o manda, no «No ve»', async () => {
    const { tieneSeccion } = await import('./permisos')
    expect(tieneSeccion(encargado, 'plata')).toBe(true)
    expect(tieneSeccion(vet, 'campos')).toBe(false)
    expect(tieneSeccion({}, 'hacienda')).toBe(false)
  })
  it('sin membresía no es dueño: un invitado sin niveles no tiene nada', async () => {
    const { nivelesDe, cargaSeccion, veSeccion } = await import('./permisos')
    expect(nivelesDe({ rol: 'dueno', niveles: { plata: 'no' } })).toBe(null)
    const nada = nivelesDe({ rol: 'invitado', niveles: undefined })
    expect(veSeccion(nada, 'campos') || cargaSeccion(nada, 'plata')).toBe(false)
  })
  it('el texto por sección es el mismo que el de un borrador', async () => {
    const { noHabilitado } = await import('./permisos')
    expect(noHabilitado(vet, 'plata', 'ver')).toBe((permiso(vet, 'consulta_gastos') as { texto: string }).texto)
    expect(noHabilitado(encargado, 'plata', 'ver')).toContain('los ve el dueño')
    expect(noHabilitado(vet, 'campos', 'cargar')).toBe((permiso(vet, 'lluvia') as { texto: string }).texto)
  })
})
