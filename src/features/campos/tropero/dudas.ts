import type { Duda } from './acompanante'

// Lo que el asistente contesta cuando lo tocan, según el paso del mapa (Lau,
// 22/10: el asistente es también la vía para las dudas). Cada respuesta dice
// qué tocar en ESTA pantalla: nada que la pantalla no tenga. Si no alcanza, la
// ayuda ofrece una persona por WhatsApp.

const SE_GUARDA: Duda = {
  pregunta: '¿Se guarda si corto?',
  respuesta: 'Sí. El borde y cada potrero quedan guardados cuando los confirmás. Si cortás, la próxima vez seguís donde quedaste.',
}
const PARA_QUE: Duda = {
  pregunta: '¿Para qué sirve el mapa?',
  respuesta: 'Para ver cada potrero con su hacienda, qué tiene y cuándo se recorrió. Con el mapa armado se abre el resto de la app.',
}

export function dudasDe(e: string, movil: boolean): Duda[] {
  const toca = movil ? 'Tocá' : 'Hacé clic en'
  const acercate = movil ? 'Acercate con dos dedos' : 'Acercate con la rueda del mouse'
  switch (e) {
    case 'bienvenida':
      return [
        PARA_QUE,
        { pregunta: '¿Qué necesito tener a mano?', respuesta: 'Saber dónde queda. En Buenos Aires el borde se trae del catastro tocando adentro del campo; si no aparece, sirve la boleta del Inmobiliario Rural de ARBA.' },
        SE_GUARDA,
      ]
    case 'encontrar':
      return [
        { pregunta: 'No encuentro mi campo', respuesta: `${toca} «¿No lo encontrás? Buscá un camino» y escribí una ruta, un camino o un paraje cercano: el mapa va ahí. ${acercate} hasta ver los alambrados.` },
        { pregunta: 'No sé bien dónde queda', respuesta: 'Pedile a alguien que lo conozca que te muestre el lugar. Mientras, podés cortar acá: la próxima vez seguís donde quedaste.' },
        SE_GUARDA,
      ]
    case 'tocar':
    case 'parcela':
      return [
        { pregunta: '¿De dónde sale el borde?', respuesta: 'Del catastro de ARBA: es el dibujo oficial de la parcela, el mismo que figura en la boleta del Inmobiliario Rural.' },
        { pregunta: 'El borde no es el mío', respuesta: `${toca} «Lo marco a mano» y marcás las esquinas del alambrado sobre el satélite.` },
        { pregunta: 'Tengo varias parcelas', respuesta: 'Traé una y después corregí el borde moviendo los puntos hasta el alambrado, o marcalo entero a mano.' },
      ]
    case 'boleta':
      return [
        { pregunta: '¿Dónde están los números?', respuesta: 'En la boleta del Inmobiliario Rural de ARBA, arriba a la izquierda: partido, circunscripción y parcela. También figuran en la escritura.' },
        { pregunta: 'No tengo la boleta', respuesta: 'No pasa nada: volvé y marcá el borde a mano sobre el satélite, esquina por esquina.' },
      ]
    case 'marcar':
    case 'dibujar':
      return [
        { pregunta: 'Me equivoqué un punto', respuesta: `${toca} «Deshacer» y se borra el último. Para arrancar de cero, «Empezar de nuevo».` },
        { pregunta: '¿Cómo lo cierro?', respuesta: `Después de la última esquina, ${movil ? 'tocá' : 'hacé clic en'} el primer punto que marcaste.` },
        { pregunta: 'No veo el alambrado', respuesta: `${acercate}: con más zoom se ven los alambrados y las calles internas.` },
      ]
    case 'borde-listo':
    case 'borde':
      return [
        { pregunta: 'No cuadran las hectáreas', respuesta: 'Puede estar mal el alta o el borde. Si el dibujo sigue el alambrado, quedate con lo medido; si no, mové los puntos hasta el alambrado.' },
        { pregunta: '¿Cómo muevo un punto?', respuesta: `${movil ? 'Tocalo y arrastralo' : 'Agarralo con el mouse y arrastralo'} hasta el alambrado.` },
        SE_GUARDA,
      ]
    case 'sin-potreros':
      return [
        { pregunta: '¿Y si no lo divido?', respuesta: 'Queda como un solo potrero con todo el campo. Lo podés dividir cuando quieras, con una línea por donde va el alambrado.' },
        { pregunta: 'No sé dónde están', respuesta: `${toca} «No sé bien dónde están» y te ayuda una persona de Tropero por WhatsApp a ubicarlos.` },
      ]
    case 'inicio':
    case 'cual':
    case 'confirmar':
    case 'nuevo':
      return [
        { pregunta: '¿Hay que seguir un orden?', respuesta: 'No. Dibujá el que te quede más claro y después elegís cuál es de la lista que cargaste.' },
        { pregunta: 'Me falta uno en la lista', respuesta: 'Dibujalo igual: al final te pregunto cuál es y, si no está, lo cargamos nuevo con su número.' },
        { pregunta: 'No cuadran las hectáreas', respuesta: 'Mirá si seguiste el alambrado. Si el dibujo está bien, quedate con lo medido: corrige lo que pusiste en el alta.' },
      ]
    case 'potrero':
    case 'dividir':
    case 'revisar':
      return [
        { pregunta: '¿Cómo lo divido?', respuesta: 'Marcá una línea por donde va el alambrado nuevo: empezá afuera del potrero y terminá del otro lado, afuera. Quedan dos potreros.' },
        { pregunta: '¿Qué pasa con la hacienda?', respuesta: 'Queda en la parte que conserva el nombre. Si algún animal está en la otra parte, lo movés desde Hacienda.' },
      ]
    default:
      return [PARA_QUE, SE_GUARDA]
  }
}
