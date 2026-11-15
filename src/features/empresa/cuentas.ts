import { useState } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { guardarCuentaElegida } from './cuenta-activa'
import { nombreRol } from './secciones'
import { useCuentas, type Membresia } from './use-empresa'

// Lo que comparten las pantallas de elegir y cambiar de cuenta (`elegir-cuenta.tsx`).

/** Qué es en esa cuenta, en una línea: «Tu campo», «Veterinario · por WhatsApp». */
export function queEsEnLaCuenta(c: Membresia): string {
  if (c.rol === 'dueno') return 'Tu campo'
  return [nombreRol(c.rol), c.acceso === 'whatsapp' ? 'por WhatsApp' : null].filter(Boolean).join(' · ')
}

/** Quien todavía no tiene la cuenta de su propio campo puede sumarla. */
export function puedeSumarSuCampo(cuentas: Membresia[]): boolean {
  return cuentas.length > 0 && !cuentas.some((c) => c.rol === 'dueno')
}

type Cambio = { tipo: 'nada' } | { tipo: 'revisando' } | { tipo: 'sin_subir'; cuantas: number } | { tipo: 'entrando'; nombre: string }

/**
 * Cambiar de cuenta ya adentro. Antes de cambiar se revisa que no quede nada
 * cargado sin señal sin subir (es de la cuenta actual y se perdería al vaciar
 * el teléfono); después la app arranca de nuevo con la otra cuenta, así nada
 * de la anterior queda en pantalla.
 */
export function useCambiarCuenta() {
  const { user } = useAuth()
  const { data } = useCuentas()
  const [cambio, setCambio] = useState<Cambio>({ tipo: 'nada' })

  const cambiar = async (c: Membresia) => {
    if (!user || c.empresa_id === data?.activa?.empresa_id || cambio.tipo === 'revisando' || cambio.tipo === 'entrando') return
    setCambio({ tipo: 'revisando' })
    try {
      const { cargasSinSubir } = await import('@/features/campo/cuenta-del-equipo')
      const cuantas = await cargasSinSubir()
      if (cuantas > 0) {
        setCambio({ tipo: 'sin_subir', cuantas })
        return
      }
    } catch {
      // Sin acceso a lo guardado en el teléfono no se puede asegurar que no se pierda nada.
      setCambio({ tipo: 'sin_subir', cuantas: 0 })
      return
    }
    guardarCuentaElegida(user.id, c.empresa_id)
    setCambio({ tipo: 'entrando', nombre: c.empresa?.nombre ?? 'la otra cuenta' })
    // Que se vea el pase antes de arrancar de nuevo.
    window.setTimeout(() => window.location.assign('/'), 420)
  }

  return {
    cuentas: data?.cuentas ?? [],
    activa: data?.activa ?? null,
    cambio,
    cambiar,
    olvidarAviso: () => setCambio({ tipo: 'nada' }),
  }
}

/** Lo que dice el cambio cuando no se pudo: qué pasa y qué hacer. */
export function textoSinSubir(cuantas: number): string {
  if (cuantas === 0) return 'No pudimos revisar lo cargado en este teléfono. Volvé a intentar en un rato.'
  return `Tenés ${cuantas === 1 ? 'una carga hecha' : `${cuantas} cargas hechas`} sin señal que todavía no ${cuantas === 1 ? 'subió' : 'subieron'}. Cuando ${cuantas === 1 ? 'suba' : 'suban'}, vas a poder cambiar de cuenta.`
}
