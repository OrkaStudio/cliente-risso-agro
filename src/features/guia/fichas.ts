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
    chip: 'Quiero traer mi campo',
    respuesta:
      'Se trae del catastro con la nomenclatura: partido y parcela. La encontrás en la boleta del Inmobiliario Rural de ARBA o en la escritura. El contorno aparece solo; después dibujás los potreros adentro.',
    accion: { label: 'Traer del catastro', ruta: '/campos', ancla: 'campos-catastro' },
  },
  {
    id: 'dibujar-potreros',
    categoria: 'campos',
    chip: '¿Cómo dibujo los potreros?',
    respuesta:
      'En Campos, vista satelital: usá la herramienta de polígono (arriba a la izquierda del mapa) para marcar cada potrero y ponerle su número. Los botones de la derecha son para acercarte y ubicarte.',
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
