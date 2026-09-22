/**
 * Fichas del Asistente — Fase 1: respuestas guionadas, en criollo, SIN IA.
 *
 * Son la base de conocimiento inicial (spec del asistente): cada chip responde
 * con una ficha escrita por nosotros. En Fase 2 estas mismas fichas son la
 * única fuente de hechos del modelo. Regla de redacción: corto, práctico y
 * con el dato físico cuando existe (dónde encontrar la nomenclatura, etc.).
 */

export type CategoriaFicha = 'hacienda' | 'campos' | 'plata' | 'celular'

export type Ficha = {
  id: string
  /** Grupo temático — el panel muestra las preguntas por categoría. */
  categoria: CategoriaFicha
  /** Texto del chip (la "pregunta"). */
  chip: string
  /** Respuesta del asistente. */
  respuesta: string
  /** Acción opcional al pie de la respuesta: navegar y/o clickear un ancla. */
  accion?: { label: string; ruta: string; ancla: string | null }
}

export const CATEGORIAS: { id: CategoriaFicha; label: string }[] = [
  { id: 'hacienda', label: 'Hacienda' },
  { id: 'campos', label: 'Campos' },
  { id: 'plata', label: 'Plata' },
  { id: 'celular', label: 'En el campo' },
]

export const FICHAS: Ficha[] = [
  {
    id: 'cargar-animales',
    categoria: 'hacienda',
    chip: '¿Cómo cargo animales?',
    respuesta:
      'Con caravana van de a uno desde «+ Nuevo animal» en Hacienda: número, categoría y potrero. Si son muchos sin caravana, entrá al potrero desde Campos y usá «Cargar animales»: categoría y cantidad, listo.',
    accion: { label: 'Abrir el formulario de alta', ruta: '/hacienda', ancla: 'hacienda-acciones' },
  },
  {
    id: 'ubicar-sin-potrero',
    categoria: 'hacienda',
    chip: 'Cargué animales sin potrero, ¿cómo los ubico?',
    respuesta:
      'Pasa cuando cargás la hacienda antes que los potreros. En Hacienda aparece un aviso con «Ubicar en un potrero»: elegís el campo, el potrero y cuántos de cada categoría van ahí. Los que quedan sin ubicar siguen contando en el stock.',
    accion: { label: 'Ubicarlos', ruta: '/hacienda', ancla: 'hacienda-ubicar' },
  },
  {
    id: 'mover-tropa',
    categoria: 'hacienda',
    chip: '¿Cómo muevo una tropa?',
    respuesta:
      'Desde el mapa: tocá el potrero de origen, elegí «Mover», y después tocá el potrero de destino — puede ser de otro campo. Elegís cuántos animales van y confirmás. Todo queda en el historial de cada animal.',
    accion: { label: 'Ir al mapa', ruta: '/campos', ancla: null },
  },
  {
    id: 'senales',
    categoria: 'hacienda',
    chip: '¿Qué son las señales?',
    respuesta:
      'Avisos que se prenden solos con lo que registrás: preñadas, en tratamiento, para vender o para destetar. Tocás una señal y la lista de animales se filtra.',
    accion: { label: 'Ver las señales', ruta: '/hacienda', ancla: null },
  },
  {
    id: 'traer-campo',
    categoria: 'campos',
    chip: '¿Cómo traigo el contorno de mi campo?',
    respuesta:
      'En Buenos Aires se trae del catastro con la nomenclatura: partido, circunscripción y parcela. La encontrás en la boleta del Inmobiliario Rural de ARBA o en la escritura. El contorno aparece solo. En otras provincias se marca sobre el satélite: clic en cada esquina y cerrás en la primera. Después dibujás los potreros adentro.',
    accion: { label: 'Ir a mi campo', ruta: '/campos', ancla: 'campos-catastro' },
  },
  {
    id: 'dibujar-potreros',
    categoria: 'campos',
    chip: '¿Cómo dibujo los potreros?',
    respuesta:
      'En Campos, vista satelital: los potreros que cargaste están en la lista; elegís uno y marcás sus esquinas sobre el satélite con los botones de la izquierda. Los de la derecha son para acercarte y ubicarte. Se dibujan una sola vez.',
    accion: { label: 'Ir al mapa', ruta: '/campos', ancla: null },
  },
  {
    id: 'ver-potrero',
    categoria: 'campos',
    chip: '¿Qué veo al tocar un potrero?',
    respuesta:
      'Todo lo del potrero: qué tropa tiene, cuántos animales, la superficie y su uso. Desde ahí también le cargás animales o movés la tropa.',
    accion: { label: 'Ir al mapa', ruta: '/campos', ancla: null },
  },
  {
    id: 'cargar-plata',
    categoria: 'plata',
    chip: '¿Dónde cargo gastos e ingresos?',
    respuesta:
      'En Analítica, con el botón «+ Cargar»: monto, categoría y a qué campo va. Si tiene vencimiento (cheque, cuota), aparece solo en la Agenda. Desde el celular también podés cargar en el momento con foto del comprobante.',
    accion: { label: 'Ir a Analítica', ruta: '/analitica', ancla: 'analitica-cargar' },
  },
  {
    id: 'vencimientos',
    categoria: 'plata',
    chip: '¿Cómo sigo los vencimientos?',
    respuesta:
      'En la Agenda: el calendario muestra cheques, cuotas y pagos con fecha. Lo vencido aparece primero. Tocá un vencimiento para ver el detalle y marcarlo como pagado cuando lo saldés.',
    accion: { label: 'Ir a la Agenda', ruta: '/agenda', ancla: null },
  },
  {
    id: 'alquiler',
    categoria: 'plata',
    chip: '¿Cómo cargo el alquiler del campo?',
    respuesta:
      'En Analítica, con «Cargar un alquiler»: elegís el campo y lo cargás como está en el contrato — kilos de novillo, quintales de soja o maíz, dólares o pesos; por hectárea o total; y cada cuánto se paga. Cada pago queda en la Agenda y, cuando lo pagás, se anota lo que pagaste de verdad.',
    accion: { label: 'Cargar el alquiler', ruta: '/analitica', ancla: 'analitica-alquiler' },
  },
  {
    id: 'precio-novillo',
    categoria: 'plata',
    chip: '¿De dónde sale el precio del novillo?',
    respuesta:
      'Del Mercado Agroganadero de Cañuelas, todos los días hábiles. Es el que ves arriba en el ticker y el que se usa para pasar a pesos un alquiler pactado en kilos. No hay que cargarlo a mano.',
  },
  {
    id: 'corregir-onboarding',
    categoria: 'campos',
    chip: '¿Puedo corregir lo que cargué al empezar?',
    respuesta:
      'Sí, todo. El campo y sus potreros se editan desde Campos (hectáreas, nombre, actividad); los animales desde Hacienda (categoría, potrero, baja). Nada de lo del comienzo quedó fijo.',
    accion: { label: 'Ir a Campos', ruta: '/campos', ancla: null },
  },
  {
    id: 'recorrida',
    categoria: 'celular',
    chip: '¿Qué es la Recorrida?',
    respuesta:
      'Es la vuelta al campo desde tu celular: potrero por potrero marcás el estado del pasto, las aguadas y el eléctrico, y dejás notas de voz. Funciona sin señal — solo abrila una vez con internet para que baje tus potreros.',
  },
  {
    id: 'manga',
    categoria: 'celular',
    chip: '¿Cómo caravaneo en la manga?',
    respuesta:
      'Desde tu celular, en Manga: pasás el lector o escribís el número de caravana, elegís la categoría y listo, uno atrás del otro. Funciona sin señal y sube todo solo cuando vuelve la conexión.',
  },
]
