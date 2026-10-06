import { describe, expect, it } from 'vitest'
import {
  cabezasDe,
  despuesDePotrero,
  desdeCorto,
  especiesDe,
  estadoDe,
  haceDias,
  faltaEnContenido,
  leerHectareas,
  filasRepetidas,
  nombresPrevistos,
  siguienteNumero,
  numeroDePaso,
  pasoAnterior,
  pasoDesdeLaBase,
  sumaDePotreros,
  totales,
  type CampoOnb,
} from './modelo'

const campo = (potreros: CampoOnb['potreros'], extra: Partial<CampoOnb> = {}): CampoOnb => ({
  id: 'c1',
  nombre: 'La Porteña',
  localidad: 'Chascomús',
  provincia: 'Buenos Aires',
  lat: -35.5,
  lon: -58,
  tipo: 'propio',
  hectareas: 353,
  colorIdx: 1,
  potreros,
  ...extra,
})

describe('las hectáreas de los potreros contra el campo (B3)', () => {
  it('cierran justo', () => {
    expect(sumaDePotreros(353, [116, 45, 192])).toEqual({ estado: 'cierran', suma: 353 })
  })
  it('sobran: dice cuántas', () => {
    expect(sumaDePotreros(353, [116, 45, 200])).toEqual({ estado: 'sobran', suma: 361, diferencia: 8 })
  })
  it('faltan: dice cuántas (quedan para el mapa)', () => {
    expect(sumaDePotreros(353, [116, 45])).toEqual({ estado: 'faltan', suma: 161, diferencia: 192 })
  })
  it('con decimales no se equivoca por redondeo', () => {
    expect(sumaDePotreros(10, [3.3, 3.3, 3.4]).estado).toBe('cierran')
  })
  it('una fila sin hectáreas: todavía no se puede decir', () => {
    expect(sumaDePotreros(353, [116, null]).estado).toBe('incompleto')
    expect(sumaDePotreros(353, []).estado).toBe('incompleto')
    expect(sumaDePotreros(353, [0]).estado).toBe('incompleto')
  })
  it('las hectáreas se leen con coma o con punto', () => {
    expect(leerHectareas('21,5')).toBe(21.5)
    expect(leerHectareas('21.5')).toBe(21.5)
    expect(leerHectareas('')).toBeNull()
    expect(leerHectareas('abc')).toBeNull()
  })
})

describe('qué hay en cada potrero (B4)', () => {
  it('hacienda: suma las cabezas de todas las especies', () => {
    expect(cabezasDe({ tipo: 'hacienda', cabezas: { vaca: 26, ternero: 18, oveja: 10 } })).toBe(54)
    expect(cabezasDe({ tipo: 'sembrado', cultivo: 'Trigo' })).toBe(0)
  })
  it('lo que va a la base', () => {
    expect(estadoDe({ tipo: 'hacienda', cabezas: {} })).toEqual({ estadoCiclo: 'ganadero', cultivo: null })
    expect(estadoDe({ tipo: 'sembrado', cultivo: ' Trigo ' })).toEqual({ estadoCiclo: 'cultivo', cultivo: 'Trigo' })
    expect(estadoDe({ tipo: 'descanso', desde: '2026-09-05' })).toEqual({ estadoCiclo: 'descanso', cultivo: null })
  })
  it('no se guarda sin elegir, ni un sembrado sin cultivo («Otro» vacío)', () => {
    expect(faltaEnContenido(null)).not.toBeNull()
    expect(faltaEnContenido({ tipo: 'sembrado', cultivo: '  ' })).not.toBeNull()
    expect(faltaEnContenido({ tipo: 'sembrado', cultivo: 'Cebada' })).toBeNull()
    expect(faltaEnContenido({ tipo: 'hacienda', cabezas: {} })).toBeNull()
  })
  it('desde cuándo descansa: atajos y cómo se lee', () => {
    const hoy = new Date(2026, 9, 5, 23, 30) // 5/10 a las 23:30: no corre el día
    expect(haceDias(0, hoy)).toBe('2026-10-05')
    expect(haceDias(7, hoy)).toBe('2026-09-28')
    expect(haceDias(30, hoy)).toBe('2026-09-05')
    expect(desdeCorto('2026-09-05')).toBe('desde el 5/9')
    expect(faltaEnContenido({ tipo: 'descanso', desde: '' })).not.toBeNull()
  })
  it('un ícono por cada especie que hay', () => {
    expect(especiesDe({ tipo: 'hacienda', cabezas: { vaca: 3, oveja: 2, padrillo: 1 } })).toEqual(['bovino', 'ovino', 'equino'])
    expect(especiesDe({ tipo: 'hacienda', cabezas: { yegua: 2, vaca: 0 } })).toEqual(['equino'])
    expect(especiesDe({ tipo: 'sembrado', cultivo: 'Trigo' })).toEqual([])
  })
})

describe('los pasos', () => {
  const tres = campo([
    { id: 'p1', nombre: '11B', hectareas: 116, contenido: null },
    { id: 'p2', nombre: '8B', hectareas: 45, contenido: null },
    { id: 'p3', nombre: '3B', hectareas: 192, contenido: null },
  ])
  it('Paso N de 4', () => {
    expect(numeroDePaso({ etapa: 'empresa' })).toBe(1)
    expect(numeroDePaso({ etapa: 'campo' })).toBe(2)
    expect(numeroDePaso({ etapa: 'potreros', campoId: 'c1' })).toBe(3)
    expect(numeroDePaso({ etapa: 'que-hay', campoId: 'c1', indice: 2 })).toBe(4)
    expect(numeroDePaso({ etapa: 'otro' })).toBe(4)
    expect(numeroDePaso({ etapa: 'cierre' })).toBeNull()
  })
  it('B4 va potrero por potrero y después pregunta por otro campo', () => {
    expect(despuesDePotrero(tres, 0)).toEqual({ etapa: 'que-hay', campoId: 'c1', indice: 1 })
    expect(despuesDePotrero(tres, 2)).toEqual({ etapa: 'otro' })
  })
  it('Atrás lleva al paso anterior', () => {
    expect(pasoAnterior({ etapa: 'empresa' }, [])).toBeNull()
    expect(pasoAnterior({ etapa: 'campo' }, [])).toBeNull()
    expect(pasoAnterior({ etapa: 'campo' }, [tres])).toEqual({ etapa: 'otro' })
    expect(pasoAnterior({ etapa: 'potreros', campoId: 'c1' }, [tres])).toEqual({ etapa: 'campo', campoId: 'c1' })
    expect(pasoAnterior({ etapa: 'que-hay', campoId: 'c1', indice: 0 }, [tres])).toEqual({
      etapa: 'potreros',
      campoId: 'c1',
    })
    expect(pasoAnterior({ etapa: 'que-hay', campoId: 'c1', indice: 2 }, [tres])).toEqual({
      etapa: 'que-hay',
      campoId: 'c1',
      indice: 1,
    })
    expect(pasoAnterior({ etapa: 'otro' }, [tres])).toEqual({ etapa: 'que-hay', campoId: 'c1', indice: 2 })
  })
  it('sin progreso en este equipo, retoma con lo que hay en la base', () => {
    expect(pasoDesdeLaBase([])).toEqual({ etapa: 'campo' })
    expect(pasoDesdeLaBase([campo([])])).toEqual({ etapa: 'potreros', campoId: 'c1' })
    expect(pasoDesdeLaBase([tres])).toEqual({ etapa: 'que-hay', campoId: 'c1', indice: 0 })
    const listo = campo(tres.potreros.map((p) => ({ ...p, contenido: { tipo: 'descanso' as const, desde: '2026-09-05' } })))
    expect(pasoDesdeLaBase([listo])).toEqual({ etapa: 'otro' })
  })
})

describe('totales', () => {
  it('suman todos los campos', () => {
    const a = campo([{ id: 'p1', nombre: '1B', hectareas: 353, contenido: { tipo: 'hacienda', cabezas: { vaca: 172 } } }])
    const b = campo(
      [{ id: 'p2', nombre: '1C', hectareas: 180, contenido: { tipo: 'hacienda', cabezas: { vaca: 46 } } }],
      { id: 'c2', hectareas: 180 },
    )
    expect(totales([a, b])).toEqual({ hectareas: 533, potreros: 2, cabezas: 218 })
  })
})

describe('nombres de los potreros mientras se escriben (B3)', () => {
  it('número + letra del campo; sin número, el siguiente libre', () => {
    expect(nombresPrevistos(['11', '8', '3'], 'B')).toEqual(['11B', '8B', '3B'])
    expect(nombresPrevistos(['', '', ''], 'A')).toEqual(['1A', '2A', '3A'])
    expect(nombresPrevistos(['2', '', ''], 'A')).toEqual(['2A', '1A', '3A'])
    expect(nombresPrevistos(['5B', ''], 'B')).toEqual(['5B', '1B'])
  })
})

describe('potreros sin nombres repetidos (B3)', () => {
  it('un potrero nuevo toma el siguiente número', () => {
    expect(siguienteNumero([])).toBe('1')
    expect(siguienteNumero(['1', '2'])).toBe('3')
    expect(siguienteNumero(['11', '', '3'])).toBe('12')
  })
  it('marca las filas que se repiten', () => {
    expect([...filasRepetidas(['1A', '1A', '1A'])]).toEqual([0, 1, 2])
    expect([...filasRepetidas(['1A', '2A', '1A'])]).toEqual([0, 2])
    expect(filasRepetidas(['1A', '2A', '3A']).size).toBe(0)
  })
})
