import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setCampoContorno } from '@/features/campos/api'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from '@/features/mapa/api'
import { bordeDesdePotreros } from '@/features/mapa/reglas'

/**
 * Un campo sin borde pero con todos sus potreros dibujados (Daniel: La Porteña
 * y Los Pampas) se completa solo: el borde es el contorno de sus potreros (Lau,
 * 30/10). Lo hace el dueño al entrar, una vez por campo; así no lo traba el
 * «primero el mapa» por algo que el dibujo ya dice.
 */
export function useCompletarBordes() {
  const { data: m } = useEmpresa()
  const dueno = m?.rol === 'dueno'
  const { data: campos } = useMapa(dueno ? m?.empresa_id : undefined)
  const qc = useQueryClient()
  const hechos = useRef(new Set<string>())
  useEffect(() => {
    if (!dueno || !campos) return
    const aCompletar = campos.flatMap((c) => {
      if (c.contorno || hechos.current.has(c.id)) return []
      const borde = bordeDesdePotreros(c.potreros)
      return borde ? [{ id: c.id, borde }] : []
    })
    if (aCompletar.length === 0) return
    for (const c of aCompletar) hechos.current.add(c.id)
    void Promise.all(aCompletar.map((c) => setCampoContorno(c.id, c.borde)))
      .then(() => qc.invalidateQueries({ queryKey: ['mapa'] }))
      .catch(() => {
        // Sin red o sin permiso: se vuelve a intentar la próxima vez que entre.
        for (const c of aCompletar) hechos.current.delete(c.id)
      })
  }, [dueno, campos, qc])
}
