import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))
vi.mock('@/lib/query-client', () => ({ queryClient: { invalidateQueries: vi.fn() } }))

import { cambioElAcceso, queCambio } from './cambio-de-acceso'
import type { Membresia } from './use-empresa'

const vet = (niveles: Membresia['niveles'], empresa_id = 'e1'): Membresia => ({ empresa_id, rol: 'vet', niveles, empresa: null })

describe('cambio de acceso (Lau, 19/11)', () => {
  it('habilitarle la Agenda al veterinario se lo dice', () => {
    expect(queCambio(vet({ hacienda: 'carga', plata: 'no' }), vet({ hacienda: 'carga', plata: 've' }))).toEqual(['Ahora ves la Plata y la Agenda.'])
  })
  it('sacársela también, y pasar de ver a cargar', () => {
    expect(queCambio(vet({ plata: 've', campos: 've' }), vet({ plata: 'no', campos: 'carga' }))).toEqual([
      'Ahora podés cargar en los Campos.',
      'Ya no ves la Plata y la Agenda.',
    ])
  })
  it('de nada a ver y cargar, y de cargar a sólo mirar', () => {
    expect(queCambio(vet({ hacienda: 'no', campos: 'carga' }), vet({ hacienda: 'carga', campos: 've' }))).toEqual([
      'Ahora ves la Hacienda y podés cargar.',
      'En los Campos ahora sólo mirás.',
    ])
  })
  it('solo manda: lo manda por WhatsApp', () => {
    expect(queCambio(vet({ plata: 'carga' }), vet({ plata: 'solo_manda' }))).toEqual(['Ya no ves la Plata y la Agenda.'])
    expect(queCambio(vet({ plata: 'no' }), vet({ plata: 'solo_manda' }))).toEqual(['Lo de la Plata y la Agenda ahora lo mandás por WhatsApp.'])
  })
  it('sólo cuenta como cambio de acceso en la misma cuenta', () => {
    expect(cambioElAcceso(vet({ plata: 'no' }), vet({ plata: 've' }))).toBe(true)
    expect(cambioElAcceso(vet({ plata: 'no' }), vet({ plata: 'no' }))).toBe(false)
    expect(cambioElAcceso(vet({ plata: 'no' }), vet({ plata: 've' }, 'e2'))).toBe(false)
    expect(cambioElAcceso(null, vet({ plata: 've' }))).toBe(false)
  })
})
