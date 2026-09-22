import {
  catastroAutomatico,
  plural,
  type Resumen,
} from '@/features/guia/estado'

/**
 * Contenido de los recorridos por sección (Modo Oficina).
 *
 * Reglas de redacción (público 40+, poco acostumbrado a software):
 * - Lenguaje de productor, no de contador ni de programador.
 * - Breve: título corto + 1-2 frases. Cada paso dice PARA QUÉ sirve la cosa,
 *   no describe la pantalla.
 * - Le habla a LO SUYO: los pasos se arman con el `Resumen` de la empresa
 *   (TASK-063). Con hacienda cargada dice "tus 120 cabezas"; sin nada dice
 *   "acá vas a cargar…". Nunca "este gráfico muestra tus datos".
 * - Un paso sólo entra cuando hay un botón real que lo cumple (lección del
 *   18/09: la guía prometía ubicar tropas y ninguna pantalla podía).
 *
 * `ancla` referencia un atributo `data-guia` en la UI real. `null` = paso sin
 * spotlight (narración centrada, para abrir o cerrar la sección). Si un ancla
 * no está en el DOM (panel que no renderiza sin datos), el paso se saltea solo.
 */

export type PasoGuia = {
  /** Valor de data-guia del elemento a resaltar; null = narración centrada. */
  ancla: string | null
  titulo: string
  texto: string
  /** Acción del paso (asistente): botón que cierra la guía y clickea el
   *  elemento `data-guia` (abre el formulario / dispara la herramienta).
   *  `ruta` navega antes, cuando el botón vive en otra sección. */
  accion?: { label: string; click: string; ruta?: string }
}

export type SeccionGuia = 'inicio' | 'hacienda' | 'campos' | 'agenda' | 'analitica'

export const NOMBRE_SECCION: Record<SeccionGuia, string> = {
  inicio: 'Inicio',
  hacienda: 'Hacienda',
  campos: 'Campos',
  agenda: 'Agenda',
  analitica: 'Analítica',
}

/** Los pasos de una sección para ESTA empresa. `r` null = todavía no se
 *  sabe qué hay (sin red): textos genéricos. */
export function pasosDe(seccion: SeccionGuia, r: Resumen | null): PasoGuia[] {
  switch (seccion) {
    case 'inicio':
      return inicio(r)
    case 'hacienda':
      return hacienda(r)
    case 'campos':
      return campos(r)
    case 'agenda':
      return agenda()
    case 'analitica':
      return analitica(r)
  }
}

function inicio(r: Resumen | null): PasoGuia[] {
  const conHacienda = (r?.cabezas ?? 0) > 0
  return [
    {
      ancla: null,
      titulo: 'El pantallazo de tu campo',
      texto: conHacienda
        ? 'Inicio junta todo de un vistazo: tu hacienda, la plata y lo que hay que atender. Se va completando solo con lo que cargues en el resto de la aplicación.'
        : 'Inicio junta todo de un vistazo: la hacienda, la plata y lo que hay que atender. Arranca vacío y se va llenando solo con lo que cargues.',
    },
    {
      ancla: 'inicio-kpis',
      titulo: 'Los números de hoy',
      texto: conHacienda
        ? `Tus ${plural(r!.cabezas, 'cabeza', 'cabezas')}, la plata que entró y salió este mes, e IVA. No se cargan acá: salen solos de lo que registrás en el resto de la aplicación.`
        : 'Cabezas totales, plata que entró y salió este mes, e IVA. No se cargan acá: salen solos de lo que registrás en el resto de la aplicación.',
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
  ]
}

function hacienda(r: Resumen | null): PasoGuia[] {
  const cabezas = r?.cabezas ?? 0
  const sinPotrero = r?.sinPotrero ?? 0
  return [
    {
      ancla: null,
      titulo: cabezas > 0 ? 'Tu hacienda, animal por animal' : 'Acá va a vivir tu hacienda',
      texto:
        cabezas > 0
          ? `Tus ${plural(cabezas, 'cabeza', 'cabezas')}, cada una con su categoría, su potrero y su historia. Es la base de todo lo demás.`
          : 'Acá vive el stock: cada animal con su caravana, su potrero y su historia. Es la base de todo lo demás.',
    },
    // Animales cargados antes que los potreros: primero ubicarlos. Sólo
    // cuando hay sueltos — el ancla aparece con el aviso ámbar.
    ...(sinPotrero > 0
      ? [
          {
            ancla: 'hacienda-ubicar',
            titulo: `${plural(sinPotrero, 'animal', 'animales')} sin potrero`,
            texto:
              'Los cargaste antes de tener los potreros, así que todavía no están en ninguno. Con «Ubicar en un potrero» elegís el campo, el potrero y cuántos de cada categoría van ahí.',
            accion: { label: 'Ubicarlos ahora', click: 'hacienda-ubicar' },
          },
        ]
      : []),
    {
      ancla: 'hacienda-acciones',
      titulo: cabezas > 0 ? 'Sumar animales' : 'Cargar animales',
      texto:
        cabezas > 0
          ? '«+ Nuevo animal» da de alta uno con caravana: número, categoría y potrero. Para muchos sin caravana, entrá al potrero desde Campos y usá «Cargar animales»: categoría y cantidad, listo.'
          : '«+ Nuevo animal» abre el formulario de alta: número de caravana, categoría (vaca, ternero…) y potrero. ¿Tenés muchos sin caravana? Entrá al potrero desde Campos y usá «Cargar animales»: categoría y cantidad, listo.',
      accion: {
        label: cabezas > 0 ? 'Cargar un animal' : 'Cargar mi primer animal',
        click: 'hacienda-acciones',
      },
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
  ]
}

function campos(r: Resumen | null): PasoGuia[] {
  const sinContorno = r?.sinContorno[0] ?? null
  const auto = catastroAutomatico(sinContorno?.provincia ?? null)
  const potreros = r?.potreros ?? 0
  const sinDibujar = potreros - (r?.potrerosDibujados ?? 0)
  const nombre = sinContorno && (r?.campos ?? 0) > 1 ? ` de ${sinContorno.nombre}` : ''

  return [
    {
      ancla: null,
      titulo: 'Tus campos y potreros',
      texto:
        potreros > 0
          ? `El plano real de tu campo. Tus ${plural(potreros, 'potrero ya está cargado', 'potreros ya están cargados')}; acá se dibujan sobre el satélite, se les cargan animales y se mueven las tropas.`
          : 'El plano real de tu campo. Acá se dibujan los potreros, se cargan animales y se mueven las tropas.',
    },
    {
      ancla: 'campos-vista',
      titulo: 'Mapa o lista',
      texto:
        'Dos formas de ver lo mismo: el plano con los potreros dibujados, o tarjetas con el detalle de cada uno.',
    },
    {
      ancla: 'campos-catastro',
      titulo: auto ? `Traé el contorno${nombre}` : `Marcá el contorno${nombre}`,
      texto: auto
        ? 'Poné el partido y la parcela y el contorno real aparece solo, sin dibujar nada. Los tres números están en la boleta del Inmobiliario Rural de ARBA o en la escritura. Después dibujás los potreros adentro.'
        : `En ${sinContorno?.provincia ?? 'tu provincia'} el contorno se marca sobre el satélite: hacé clic en las esquinas del campo y cerrá en la primera. Después dibujás los potreros adentro.`,
      accion: {
        label: auto ? 'Traer el contorno' : 'Marcar el contorno',
        click: 'campos-catastro',
      },
    },
    {
      ancla: 'campos-mapa',
      titulo: sinDibujar > 0 ? 'Dibujar los potreros' : 'El mapa trabaja',
      texto:
        sinDibujar > 0
          ? `Te ${sinDibujar === 1 ? 'falta dibujar 1 potrero' : `faltan dibujar ${sinDibujar} potreros`}: elegí cada uno de la lista y marcá sus esquinas sobre el satélite. Con los botones de la izquierda dibujás y corregís; con los de la derecha hacés zoom y te ubicás.`
          : 'Tocá un potrero para ver qué tiene, cargarle animales o mover una tropa. En la vista satelital: con los botones de la izquierda dibujás y corregís los potreros; con los de la derecha hacés zoom y te ubicás.',
    },
    {
      ancla: 'campos-acciones',
      titulo: 'Más de un campo',
      texto:
        'Si trabajás varios campos, agregalos acá. Cada campo tiene sus potreros y su propio color en el mapa.',
    },
  ]
}

function agenda(): PasoGuia[] {
  return [
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
  ]
}

function analitica(r: Resumen | null): PasoGuia[] {
  const alquiler = r?.alquilerPendiente[0] ?? null
  return [
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
    // Campo alquilado sin el alquiler cargado: el gasto más grande y más
    // fijo. Sólo cuando falta — el botón vive en Analítica.
    ...(alquiler
      ? [
          {
            ancla: 'analitica-alquiler',
            titulo: `El alquiler de ${alquiler.nombre}`,
            texto:
              'Cargalo como está en el contrato: en kilos de novillo, quintales, dólares o pesos, por hectárea o total, y cada cuánto se paga. Cada pago queda en la Agenda y en la cuenta del campo.',
            accion: { label: 'Cargar el alquiler', click: 'analitica-alquiler' },
          },
        ]
      : []),
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
  ]
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
