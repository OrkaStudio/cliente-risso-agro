import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Checklist de puesta a punto — el corazón de la Fase 1 del Asistente.
 *
 * "Web lista" se deriva de la BASE, no de flags: cada ítem es una query
 * liviana vía RLS (count/head). Cero IA, cero migraciones, siempre exacto —
 * los ticks los marca la realidad de los datos, no el asistente.
 * Spec: [[clientes/risso-agro/especificaciones/2026-07-16-asistente-conversacional-operativo]].
 */

export type ItemChecklist = {
  id: 'campo' | 'potreros' | 'hacienda' | 'tropas' | 'recorrida'
  titulo: string
  /** Qué es y por qué importa, en criollo — el productor lee y entiende. */
  detalle: string
  /** Qué pasa al tocar el botón del paso. */
  cta: string
  /** Sección de la app donde se resuelve (para navegar). */
  ruta: string
  /** Ancla data-guia a clickear para abrir la herramienta (null = solo navegar). */
  accion: string | null
  /** Se hace desde el teléfono, no desde la Oficina. */
  movil?: boolean
  hecho: boolean
}

function head(count: number | null, error: { message: string } | null): number {
  if (error) throw new Error(error.message)
  return count ?? 0
}

export function useChecklist() {
  return useQuery({
    queryKey: ['asistente-checklist'],
    // offlineFirst: sin red falla rápido y el panel muestra el aviso (mismo
    // criterio que el guard de empresa, TASK-042).
    networkMode: 'offlineFirst',
    staleTime: 15_000,
    queryFn: async (): Promise<ItemChecklist[]> => {
      const [campos, potreros, activos, ubicados, recorridas, provincias] = await Promise.all([
        supabase
          .from('campo')
          .select('id', { count: 'exact', head: true })
          .not('contorno', 'is', null)
          .then((r) => head(r.count, r.error)),
        supabase
          .from('potrero')
          .select('id', { count: 'exact', head: true })
          .not('poligono', 'is', null)
          .then((r) => head(r.count, r.error)),
        supabase
          .from('animal')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'activo')
          .then((r) => head(r.count, r.error)),
        supabase
          .from('animal')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'activo')
          .not('potrero_id', 'is', null)
          .then((r) => head(r.count, r.error)),
        supabase
          .from('recorrida')
          .select('id', { count: 'exact', head: true })
          .then((r) => head(r.count, r.error)),
        // Provincias de los campos sin contorno: el consejo del catastro
        // depende de dónde está el campo (no de dónde vive el dueño).
        supabase
          .from('campo')
          .select('provincia')
          .is('contorno', null)
          .then((r) => {
            if (r.error) throw new Error(r.error.message)
            return (r.data ?? []).map((c) => c.provincia)
          }),
      ])

      // Hoy el catastro automático es Buenos Aires (ARBA). Para el resto no se
      // promete: el contorno se marca sobre el satélite. Con campos en las dos
      // situaciones, gana la explicación de BA (el resto lo dice el diálogo).
      const hayBuenosAires = provincias.some((p) => p === 'Buenos Aires')
      const hayOtras = provincias.some((p) => p && p !== 'Buenos Aires')
      const detalleCampo = hayBuenosAires
        ? 'Con los tres números de la boleta de ARBA, el mapa se arma solo.'
        : hayOtras
          ? 'Ubicalo en el satélite y marcá el contorno.'
          : 'Con la boleta de ARBA, el mapa se arma solo.'

      return [
        {
          id: 'campo',
          titulo: 'Traé tu campo',
          // Una línea. La explicación larga vive en la ficha y en el diálogo real.
          detalle: detalleCampo,
          cta: hayBuenosAires || !hayOtras ? 'Traer mi campo' : 'Marcar mi campo',
          ruta: '/campos',
          accion: 'campos-catastro',
          hecho: campos >= 1,
        },
        {
          id: 'potreros',
          titulo: 'Dibujá los potreros',
          detalle: 'Marcalos en el mapa y poneles su número.',
          cta: 'Ir al mapa',
          ruta: '/campos',
          accion: null,
          // Umbral del spec: con 2 potreros dibujados el mapa ya trabaja.
          hecho: potreros >= 2,
        },
        {
          id: 'hacienda',
          titulo: 'Cargá tu hacienda',
          detalle: 'Con o sin caravana, en un minuto.',
          cta: 'Cargar animales',
          ruta: '/hacienda',
          accion: 'hacienda-acciones',
          hecho: activos >= 1,
        },
        {
          id: 'tropas',
          titulo: 'Ubicá las tropas',
          // Con animales sin potrero (cargados en el onboarding antes que los
          // potreros) el camino es Hacienda → "Ubicar en un potrero"; el mapa
          // sólo mueve desde un potrero de origen.
          detalle:
            activos > ubicados
              ? `${activos - ubicados} ${activos - ubicados === 1 ? 'animal' : 'animales'} sin potrero: poné cada uno en el suyo.`
              : 'Cada tropa en su potrero, tocando el mapa.',
          cta: activos > ubicados ? 'Ubicarlos' : 'Ver el mapa',
          ruta: activos > ubicados ? '/hacienda' : '/campos',
          accion: activos > ubicados ? 'hacienda-ubicar' : null,
          hecho: activos >= 1 && ubicados === activos,
        },
        {
          id: 'recorrida',
          titulo: 'Probá la Recorrida',
          detalle: 'Una vez con señal, y queda lista para el campo.',
          cta: '',
          ruta: '/campo/recorrida',
          accion: null,
          movil: true,
          hecho: recorridas >= 1,
        },
      ]
    },
  })
}
