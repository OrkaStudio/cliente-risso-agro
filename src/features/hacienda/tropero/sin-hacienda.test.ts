import { describe, expect, it } from 'vitest'
import { caraSinHacienda } from './sin-hacienda'

const p = (cultivo: string | null, hectareas: number, estadoCiclo = cultivo ? 'cultivo' : 'descanso') => ({ cultivo, hectareas, estadoCiclo })

describe('Hacienda sin animales', () => {
  it('con todos los campos, falta cargarla', () => {
    expect(caraSinHacienda(null)).toEqual({ tipo: 'cargar' })
  })

  it('un campo marcado agrícola dice qué tiene sembrado, de más a menos', () => {
    const c = caraSinHacienda({ actividad: 'agricola', hectareas: 500, potreros: [p('soja', 200), p('trigo', 300), p(null, 0)] })
    expect(c).toEqual({ tipo: 'agricola', hectareas: 500, sembrado: [{ cultivo: 'Trigo', hectareas: 300 }, { cultivo: 'Soja', hectareas: 200 }] })
  })

  it('sin marcar, es agrícola si todos sus potreros están sembrados', () => {
    expect(caraSinHacienda({ actividad: null, hectareas: null, potreros: [p('maíz', 60), p('maíz', 40)] })).toMatchObject({ tipo: 'agricola', hectareas: 100, sembrado: [{ cultivo: 'Maíz', hectareas: 100 }] })
  })

  it('ganadero, mixto o con algún potrero sin sembrar: falta cargar la hacienda', () => {
    expect(caraSinHacienda({ actividad: 'ganadera', hectareas: 100, potreros: [p('trigo', 100)] })).toEqual({ tipo: 'cargar' })
    expect(caraSinHacienda({ actividad: null, hectareas: 100, potreros: [p('trigo', 60), p(null, 40)] })).toEqual({ tipo: 'cargar' })
    expect(caraSinHacienda({ actividad: null, hectareas: 100, potreros: [] })).toEqual({ tipo: 'cargar' })
  })
})
