/**
 * Contenido de la guía asistida por sección (Modo Oficina).
 *
 * Reglas de redacción (público 40+, poco acostumbrado a software):
 * - Lenguaje de productor, no de contador ni de programador.
 * - Breve: título corto + 1-2 frases. Cada paso dice PARA QUÉ sirve la cosa,
 *   no describe la pantalla.
 * - Pensado para pantalla VACÍA (usuario recién registrado): "acá vas a
 *   cargar…", nunca "este gráfico muestra tus datos".
 *
 * `ancla` referencia un atributo `data-guia` en la UI real. `null` = paso sin
 * spotlight (tarjeta centrada, para abrir o cerrar la sección). Si un ancla no
 * está en el DOM (panel que no renderiza sin datos), el paso se saltea solo.
 */

export type PasoGuia = {
  /** Valor de data-guia del elemento a resaltar; null = tarjeta centrada. */
  ancla: string | null
  titulo: string
  texto: string
  /** Acción del paso (asistente): botón que cierra la guía y clickea el
   *  elemento anclado (abre el formulario / dispara la herramienta). */
  accion?: { label: string; click: string }
}

export type SeccionGuia = 'inicio' | 'hacienda' | 'campos' | 'agenda' | 'analitica'

export const GUIAS: Record<SeccionGuia, { nombre: string; pasos: PasoGuia[] }> = {
  inicio: {
    nombre: 'Inicio',
    pasos: [
      {
        ancla: null,
        titulo: 'El pantallazo de tu campo',
        texto:
          'Inicio junta todo de un vistazo: la hacienda, la plata y lo que hay que atender. Arranca vacío y se va llenando solo con lo que cargues.',
      },
      {
        ancla: 'inicio-kpis',
        titulo: 'Los números de hoy',
        texto:
          'Cabezas totales, plata que entró y salió este mes, e IVA. No se cargan acá: salen solos de lo que registrás en el resto de la aplicación.',
      },
      {
        ancla: 'inicio-vencimientos',
        titulo: 'Cobros y pagos que se vienen',
        texto:
          'Cheques, cuotas y pagos con fecha, ordenados. Lo vencido aparece primero. Tocá una tarjeta para ver el detalle.',
      },
      {
        ancla: 'inicio-rodeo',
        titulo: 'Estructura del rodeo',
        texto:
          'La forma de tu rodeo: vientres, relación toro:vaca y destete. Los indicadores de manejo, de un vistazo.',
      },
      {
        ancla: 'inicio-atender',
        titulo: 'Para atender en el campo',
        texto:
          'Avisos que salen de las recorridas: una aguada seca, un eléctrico cortado, un potrero hace días sin recorrer.',
      },
    ],
  },

  hacienda: {
    nombre: 'Hacienda',
    pasos: [
      {
        ancla: null,
        titulo: 'Tu hacienda, animal por animal',
        texto:
          'Acá vive el stock: cada animal con su caravana, su potrero y su historia. Es la base de todo lo demás.',
      },
      {
        ancla: 'hacienda-acciones',
        titulo: 'Cargar animales',
        texto:
          '«+ Nuevo animal» abre el formulario de alta: número de caravana, categoría (vaca, ternero…) y potrero. ¿Tenés muchos sin caravana? Entrá al potrero desde Campos y usá «Cargar animales»: categoría y cantidad, listo.',
        accion: { label: 'Cargar mi primer animal', click: 'hacienda-acciones' },
      },
      {
        ancla: 'hacienda-stock',
        titulo: 'Stock por categoría',
        texto:
          'Cuántas vacas, terneros y toros tenés. Se actualiza solo con cada alta, baja o movimiento.',
      },
      {
        ancla: 'hacienda-senales',
        titulo: 'Señales del rodeo',
        texto:
          'Los animales que piden atención: en tratamiento, preñadas, listos para vender o para destetar. Tocá una señal y la lista se filtra.',
      },
      {
        ancla: 'hacienda-tabla',
        titulo: 'La lista completa',
        texto:
          'Buscá por caravana, entrá a la ficha de cada animal o registrale una baja desde la misma fila.',
      },
    ],
  },

  campos: {
    nombre: 'Campos',
    pasos: [
      {
        ancla: null,
        titulo: 'Tus campos y potreros',
        texto:
          'El plano real de tu campo. Acá se dibujan los potreros, se cargan animales y se mueven las tropas.',
      },
      {
        ancla: 'campos-vista',
        titulo: 'Mapa o lista',
        texto:
          'Dos formas de ver lo mismo: el plano con los potreros dibujados, o tarjetas con el detalle de cada uno.',
      },
      {
        ancla: 'campos-catastro',
        titulo: 'Traé tu campo del catastro',
        texto:
          'Poné el partido y la parcela de tu campo y el contorno real aparece solo, sin dibujar nada. La nomenclatura catastral está en la boleta del Inmobiliario Rural de ARBA o en la escritura. Después dibujás los potreros adentro.',
        accion: { label: 'Traer mi campo del catastro', click: 'campos-catastro' },
      },
      {
        ancla: 'campos-mapa',
        titulo: 'El mapa trabaja',
        texto:
          'Tocá un potrero para ver qué tiene, cargarle animales o mover una tropa. En la vista satelital: con los botones de la izquierda dibujás y corregís los potreros; con los de la derecha hacés zoom y te ubicás.',
      },
      {
        ancla: 'campos-acciones',
        titulo: 'Más de un campo',
        texto:
          'Si trabajás varios campos, agregalos acá. Cada campo tiene sus potreros y su propio color en el mapa.',
      },
    ],
  },

  agenda: {
    nombre: 'Agenda',
    pasos: [
      {
        ancla: null,
        titulo: 'La agenda de la plata',
        texto:
          'Todo lo que vence: cheques, cuotas y pagos con fecha. Para que nada te agarre desprevenido.',
      },
      {
        ancla: 'agenda-vistas',
        titulo: 'Calendario, lista o cuotas',
        texto:
          'El calendario muestra el mes; la lista, lo que viene en orden; cuotas, tus planes en marcha.',
      },
      {
        ancla: 'agenda-contenido',
        titulo: 'Los vencimientos',
        texto:
          'Cada día con plata comprometida se marca. Tocá un vencimiento para ver el detalle y marcarlo como pagado cuando lo saldés. Los cobros y pagos se cargan desde Analítica.',
      },
    ],
  },

  analitica: {
    nombre: 'Analítica',
    pasos: [
      {
        ancla: null,
        titulo: 'Los números finos',
        texto:
          'Qué te deja plata y qué te la lleva: rentabilidad por campo y actividad, flujo de fondos e IVA.',
      },
      {
        ancla: 'analitica-cargar',
        titulo: 'Cargá gastos e ingresos acá',
        texto:
          'Cada compra, venta o gasto se registra desde este botón: monto, categoría y a qué campo va. Si tiene vencimiento (un cheque, una cuota), aparece solo en la Agenda. Con esto se arman todos los números.',
        accion: { label: 'Cargar un movimiento', click: 'analitica-cargar' },
      },
      {
        ancla: 'analitica-rentabilidad',
        titulo: 'Rentabilidad por campo',
        texto: 'Cuánto rinde cada campo y cada potrero por hectárea.',
      },
      {
        ancla: 'analitica-flujo',
        titulo: 'Flujo de fondos',
        texto:
          'La plata proyectada mes a mes: lo que va a entrar y salir según lo que ya cargaste.',
      },
      {
        ancla: 'analitica-iva',
        titulo: 'Posición de IVA',
        texto:
          'Débito menos crédito del período: cuánto IVA vas pagando o cuánto tenés a favor.',
      },
    ],
  },
}

/**
 * Sección de guía para una ruta de Oficina. Sólo las páginas principales
 * (las subrutas como la ficha del animal no tienen tour — sus anclas no
 * existen ahí).
 */
export function seccionDeRuta(pathname: string): SeccionGuia | null {
  if (pathname === '/') return 'inicio'
  if (pathname === '/hacienda') return 'hacienda'
  if (pathname === '/campos') return 'campos'
  if (pathname === '/agenda') return 'agenda'
  if (pathname === '/analitica') return 'analitica'
  return null
}
