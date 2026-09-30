import { describe, expect, it } from 'vitest'
import { depurarResultados } from './geocoding'

const r = (name: string, admin1: string, feature_code?: string) => ({
  name,
  admin1,
  latitude: -33.1,
  longitude: -64.3,
  feature_code,
})

describe('depurarResultados', () => {
  it('deja sólo pueblos y ciudades, sin aeródromos', () => {
    const res = depurarResultados([
      r('Ciudad de Río Cuarto', 'Provincia de Córdoba', 'PPLA2'),
      r('Rio Cuarto', 'Provincia de Córdoba', 'AIRF'),
      r('Aeropuerto de Río Cuarto', 'Provincia de Córdoba', 'AIRP'),
    ])
    expect(res.map((l) => `${l.nombre}, ${l.provincia}`)).toEqual(['Río Cuarto, Córdoba'])
  })

  it('no repite la misma localidad', () => {
    const res = depurarResultados([
      r('Castelli', 'Buenos Aires', 'PPLA2'),
      r('Castelli', 'Buenos Aires', 'PPL'),
      r('Castelli', 'Provincia del Chaco', 'PPL'),
    ])
    expect(res.map((l) => l.provincia)).toEqual(['Buenos Aires', 'Chaco'])
  })

  it('si el proveedor no manda el tipo de lugar, no lo descarta', () => {
    expect(depurarResultados([r('Pehuajó', 'Buenos Aires')])).toHaveLength(1)
  })
})
