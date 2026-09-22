import { plural, type EstadoPuestaAPunto } from '@/features/guia/estado'
import type { PasoGuia } from '@/features/guia/pasos'

/** Los dos pasos, armados con lo que hay. Exportado para probarlo. */
export function pasosRecibimiento(
  estado: EstadoPuestaAPunto,
  nombre: string | null,
  empresa: string | null,
): PasoGuia[] {
  const r = estado.resumen
  const partes = [
    r.campos > 0 ? plural(r.campos, 'campo', 'campos') : null,
    r.potreros > 0 ? plural(r.potreros, 'potrero', 'potreros') : null,
    r.cabezas > 0 ? plural(r.cabezas, 'cabeza', 'cabezas') : null,
  ].filter((p): p is string => p !== null)
  const lista =
    partes.length > 1
      ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
      : (partes[0] ?? null)

  const saludo = nombre ? `¡Bienvenido, ${nombre}!` : '¡Bienvenido!'
  const quien = empresa ? `${empresa} ya está` : 'Tu empresa ya está'
  const primero: PasoGuia = {
    ancla: null,
    titulo: saludo,
    texto: lista
      ? `${quien}: ${lista}. Todo lo que cargaste se corrige desde cada sección; nada quedó fijo.`
      : `${quien}. Todo lo que cargues se corrige desde cada sección; nada queda fijo.`,
  }

  const siguiente = estado.items.find((i) => !i.hecho) ?? null
  if (!siguiente) {
    return [
      primero,
      {
        ancla: null,
        titulo: 'Tu web está lista',
        texto:
          'Campo, potreros, hacienda y recorrida: está todo. Si querés que te muestre una sección, tocá el asistente abajo a la derecha.',
      },
    ]
  }

  return [
    primero,
    {
      // Con el botón en esta pantalla, la luz va sobre él; si no, la narración
      // queda centrada y el CTA navega hasta él (el recorrido saltea los
      // pasos sin ancla, así que la ausencia se resuelve al vuelo).
      ancla: siguiente.accion && anclaEnPantalla(siguiente.accion) ? siguiente.accion : null,
      titulo: `Lo que sigue: ${minuscula(siguiente.titulo)}`,
      texto: siguiente.movil
        ? `${siguiente.detalle} Se hace desde tu celular: abrí la aplicación ahí y entrá a Recorrida.`
        : `${siguiente.detalle} Después, el asistente te acompaña en el resto.`,
      ...(siguiente.movil
        ? {}
        : {
            accion: {
              label: siguiente.cta,
              click: siguiente.accion ?? '',
              ruta: siguiente.ruta,
            },
          }),
    },
  ]
}

function anclaEnPantalla(ancla: string): boolean {
  if (typeof document === 'undefined') return false
  return document.querySelector(`[data-guia="${ancla}"]`) !== null
}

function minuscula(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}
