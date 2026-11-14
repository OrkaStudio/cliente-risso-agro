import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useEstadoPuestaAPunto } from '@/features/guia/checklist'
import { registrar, setEmpresaTelemetria } from '@/lib/telemetria'

/**
 * Telemetría de uso y de la puesta a punto. Spec:
 * [[clientes/risso-agro/especificaciones/2026-09-19-telemetria-onboarding-activacion]]
 * (ampliada el 30/09 hasta que terminan los tutoriales).
 */

/**
 * La pantalla de una ruta, sin ids: "hacienda/ficha", no la ficha de un
 * animal puntual. Lo que se mide es por dónde anda, no qué animal miró.
 */
export function pantallaDeRuta(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/') return 'inicio'
  if (p === '/campo') return 'campo/inicio'
  const partes = p.slice(1).split('/')
  const [a, b] = partes
  if (a === 'campo') return `campo/${b}`
  if (b) {
    if (a === 'hacienda') return 'hacienda/ficha'
    if (a === 'campos') return 'campos/detalle'
    if (a === 'potrero') return 'potrero/detalle'
  }
  return a ?? 'inicio'
}

/** Oficina y Campo: la pantalla en la que entra, y la empresa en cada evento. */
export function useMedirUso(): void {
  const { pathname } = useLocation()
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? null
  const ultima = useRef<string | null>(null)

  useEffect(() => {
    setEmpresaTelemetria(empresaId)
  }, [empresaId])

  useEffect(() => {
    const pantalla = pantallaDeRuta(pathname)
    if (pantalla === ultima.current) return
    ultima.current = pantalla
    registrar('pantalla_vista', { pantalla })
  }, [pathname])
}

/**
 * Los ítems que pasaron a hechos entre dos lecturas del checklist. La primera
 * lectura es la base: lo que ya estaba hecho al abrir no se cuenta de nuevo.
 */
export function nuevosHechos(antes: Set<string> | null, ahora: Set<string>): string[] {
  if (antes === null) return []
  return [...ahora].filter((id) => !antes.has(id))
}

/** Oficina: cuándo se tilda cada paso de "Tu campo, en marcha" y el final. */
export function useMedirPuestaAPunto(): void {
  const estado = useEstadoPuestaAPunto()
  const antes = useRef<Set<string> | null>(null)
  const items = estado.data?.items

  useEffect(() => {
    if (!items) return
    const hechos = new Set(items.filter((i) => i.hecho).map((i) => i.id))
    const nuevos = nuevosHechos(antes.current, hechos)
    for (const item of nuevos) {
      registrar('puesta_a_punto_item', { item, hechos: hechos.size, total: items.length })
    }
    if (nuevos.length > 0 && hechos.size === items.length) {
      registrar('puesta_a_punto_completa', { total: items.length })
    }
    antes.current = hechos
  }, [items])
}
