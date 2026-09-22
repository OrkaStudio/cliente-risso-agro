/**
 * Puntitos del asistente — curiosidad, no lección (TASK-063).
 *
 * En vez de un recorrido por sección, cada panel tiene la primera vez un
 * punto chiquito del asistente. Tocarlo dice en UNA línea para qué sirve, y
 * el punto se va para siempre (`spot.<ancla>` en guia_vista). Ignorarlo no
 * cuesta nada. Máximo tres a la vez por pantalla, para que no parezca un
 * árbol de navidad.
 *
 * Redacción: ≤ 12 palabras, un verbo o un "para qué". Nada de describir lo
 * que se ve.
 */
export const SPOTS: Record<string, string> = {
  'inicio-kpis': 'Cabezas, plata del mes e IVA. Salen solos de lo que cargás.',
  'inicio-vencimientos': 'Cheques y cuotas con fecha. Lo vencido, primero.',
  'inicio-rodeo': 'Vientres, toro:vaca y destete, de un vistazo.',
  'inicio-atender': 'Lo que la Recorrida vio mal en el campo.',
  'hacienda-acciones': 'Uno con caravana entra por acá. Muchos sin caravana, desde el potrero.',
  'hacienda-stock': 'Cuántos de cada categoría. Se actualiza solo.',
  'hacienda-senales': 'Preñadas, en tratamiento, para vender. Tocá una y la lista filtra.',
  'hacienda-tabla': 'Buscá por caravana o entrá a la ficha del animal.',
  'campos-vista': 'Mapa o tarjetas: lo mismo, de dos formas.',
  'campos-acciones': '¿Otro campo? Acá. Cada uno con su color.',
  'campos-mapa': 'Tocá un potrero: qué tiene, cargarle animales, mover la tropa.',
  'agenda-vistas': 'Mes, lista o cuotas.',
  'agenda-contenido': 'Tocá un vencimiento y marcalo pagado.',
  'analitica-cargar': 'Cada gasto o venta entra por acá.',
  'analitica-alquiler': 'El alquiler como está en el contrato: kilos, quintales, dólares.',
  'analitica-rentabilidad': 'Qué rinde cada campo por hectárea.',
  'analitica-flujo': 'La plata que viene, mes a mes.',
  'analitica-iva': 'Débito menos crédito: lo que vas pagando o tenés a favor.',
}

/** Cuántos puntitos a la vez por pantalla. */
export const MAX_SPOTS = 3
