import { describe, expect, it } from 'vitest'
import { hoyEnArgentina, leerTiempo } from './api'
import { lluviaDelMes } from '@/features/inicio/tropero/dia'

const respuesta = {
  current: { temperature_2m: 13.4, weather_code: 61, wind_speed_10m: 22.6, is_day: 1 },
  daily: {
    time: ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
    weather_code: [3, 63, 61, 0],
    temperature_2m_max: [18.2, 15.6, 16.4, 21.5],
    temperature_2m_min: [9.1, 8.0, 2.6, 7.7],
    precipitation_probability_max: [10, 90, 70, 5],
    precipitation_sum: [null, 12.4, 3.9, 0],
  },
}

describe('leerTiempo', () => {
  const t = leerTiempo(respuesta, '2026-10-10')

  it('el pronóstico arranca hoy y el pasado termina ayer', () => {
    expect(t.dias.map((d) => d.fecha)).toEqual(['2026-10-10', '2026-10-11'])
    expect(t.pasado.map((d) => d.fecha)).toEqual(['2026-10-09'])
  })

  it('un día sin dato del modelo no se cuenta como cero: se saca', () => {
    expect(t.pasado).toEqual([{ fecha: '2026-10-09', mm: 12.4 }])
  })

  it('el clima de ahora toma la máxima, la mínima y la lluvia de hoy de la misma corrida', () => {
    expect(t.ahora).toMatchObject({ temp: 13, code: 61, descripcion: 'Lluvia leve', max: 16, min: 3, lluviaProb: 70, lluviaMm: 3.9, helada: true, viento: 23, dia: true })
  })

  it('la lluvia del mes sale del pasado, sin lo que falta de hoy', () => {
    expect(lluviaDelMes(t.pasado, '2026-10-10')).toBe(12)
  })
})

describe('hoyEnArgentina', () => {
  it('a las 23 h de Buenos Aires ya es otro día en UTC, pero sigue siendo hoy', () => {
    expect(hoyEnArgentina(new Date('2026-10-11T02:30:00Z'))).toBe('2026-10-10')
  })
})
