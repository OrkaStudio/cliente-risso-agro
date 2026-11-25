/**
 * Términos, privacidad y el resumen «en simple» de Troppero (Lau, 12/11).
 *
 * BORRADOR: falta que lo revise un abogado. Mientras sea borrador, a quien ya
 * tenía cuenta no se le pide aceptar de nuevo.
 *
 * 25/11 (Lau): mientras Troppero sea gratis no hace falta sociedad ni CUIT; los
 * responsables son Lautaro Risso y Francisco Lerra. La videollamada del alta se graba.
 *
 * Al cambiar algo que importe, subir `VERSION_LEGALES`: a todos se les pide
 * aceptar la versión nueva la próxima vez que entran.
 */

export const VERSION_LEGALES = '2026-11-25'
export const FECHA_LEGALES = '25 de noviembre de 2026'
export const BORRADOR = true

/** Lo que falta decidir. null = «a definir». */
export const DATOS: Record<string, string | null> = {
  responsables: 'Lautaro Risso y Francisco Lerra',
  mail: 'info@troppero.com',
  diasBorrado: '30',
}

export const ETIQUETAS: Record<string, string> = {
  responsables: 'responsables',
  mail: 'mail de contacto',
  diasBorrado: 'días',
}

/** Un párrafo (texto) o una lista (varios textos). `{dato}` se reemplaza por DATOS. */
export type Bloque = string | string[]
export type Seccion = { id: string; titulo: string; bloques: Bloque[] }

export const RESUMEN = {
  hacemos: [
    { titulo: 'Guardamos y cuidamos tus datos', texto: 'Con acceso por permisos y conexión cifrada. Ningún sistema es infalible, pero lo tomamos en serio.' },
    { titulo: 'Los usamos para que Troppero funcione', texto: 'Anotar lo que cargás, mostrártelo, mandarte avisos y ayudarte cuando nos escribís.' },
    { titulo: 'Trabajamos con proveedores de confianza', texto: 'Para guardar los datos, mandar los WhatsApp y que la IA entienda tus mensajes. Sólo para eso.' },
    { titulo: 'Te los devolvemos cuando quieras', texto: 'Pedinos una copia y te la mandamos en un formato que puedas abrir, como Excel.' },
    { titulo: 'Sacamos números generales, sin nombres', texto: 'Promedios de muchos campos juntos, sin que se pueda saber de quién son, para mejorar Troppero.' },
  ],
  noHacemos: [
    { titulo: 'No vendemos tus datos', texto: 'Ni lo que producís, ni tu plata, ni dónde está tu campo.' },
    { titulo: 'No hay publicidad', texto: 'No le pasamos tus datos a anunciantes ni te mostramos avisos.' },
    { titulo: 'No entrenan IA con tus datos', texto: 'Los proveedores de IA que usamos, según sus condiciones, no entrenan sus modelos con lo que les mandamos.' },
    { titulo: 'No le escribimos a nadie por vos', texto: 'Troppero sólo le escribe a quien se vinculó o a quien invitaste.' },
  ],
  saber: [
    'La IA puede equivocarse: revisá lo que anota antes de decidir con eso.',
    'Los mapas y las hectáreas son aproximados: sirven para manejar el campo, no para una mensura.',
    'El dueño de la cuenta decide quién entra y responde por lo que hace su gente.',
    'Si te das de baja, tenés {diasBorrado} días para pedir tu copia; después borramos todo.',
  ],
}

export const TERMINOS: Seccion[] = [
  {
    id: 'quienes',
    titulo: 'Quiénes somos',
    bloques: [
      'Troppero es una aplicación para manejar un campo: hacienda, potreros, lluvias, plata y tareas, desde la compu, el celular y WhatsApp. La crean y la prestan {responsables}, a quienes en estos términos llamamos «Troppero» o «nosotros».',
      'Si más adelante Troppero pasa a una sociedad formada por nosotros, te avisamos y este acuerdo sigue con ella, en las mismas condiciones.',
      'Estos términos son el acuerdo entre vos y nosotros para usar Troppero. La Política de privacidad, que explica qué hacemos con tus datos, es parte de este acuerdo.',
    ],
  },
  {
    id: 'aceptacion',
    titulo: 'Cuándo los aceptás',
    bloques: [
      'Los aceptás al crear tu cuenta, al entrar por una invitación o al usar Troppero de cualquier forma, incluso si sólo le escribís a nuestro WhatsApp. Si no estás de acuerdo, no uses el servicio.',
      'Para usar Troppero tenés que ser mayor de 18 años y, si lo usás para una empresa, tener permiso para aceptarlos en su nombre.',
    ],
  },
  {
    id: 'cuenta',
    titulo: 'Tu cuenta y tu celular',
    bloques: [
      'Entrás con un código que te mandamos por WhatsApp; no hay contraseñas. Por eso tu celular es la llave de tu cuenta: cuidalo, no compartas el código con nadie y avisanos enseguida si lo perdiste o si alguien entró sin tu permiso.',
      'Sos responsable de lo que se haga desde tu cuenta mientras no nos avises de un uso indebido. Los datos que cargás al registrarte tienen que ser verdaderos y estar al día.',
    ],
  },
  {
    id: 'equipo',
    titulo: 'El dueño y su gente',
    bloques: [
      'Quien crea la empresa en Troppero es su dueño en la aplicación. El dueño invita a otras personas (encargado, peones, veterinario, contador), decide qué ve y qué hace cada una, y puede sacarlas cuando quiera.',
      'El dueño responde ante nosotros por lo que hacen las personas que invitó y se compromete a contarles que sus datos (nombre, celular, lo que cargan) quedan guardados en Troppero.',
    ],
  },
  {
    id: 'datos',
    titulo: 'Tus datos son tuyos',
    bloques: [
      'Todo lo que cargás (animales, potreros, lluvias, movimientos de plata, fotos, audios) es tuyo. Nos das permiso para guardarlo y usarlo sólo para prestarte el servicio, como explica la Política de privacidad.',
      'También podemos usar datos combinados de muchos campos, sin nombres ni nada que permita saber de quién son, para hacer estadísticas, mejorar Troppero y crear funciones nuevas. No vamos a intentar volver a identificar a nadie con esos datos.',
      'Vos sos responsable de que lo que cargás sea correcto y de tener derecho a cargarlo.',
    ],
  },
  {
    id: 'whatsapp',
    titulo: 'WhatsApp, audios y fotos',
    bloques: [
      'Podés cargar datos mandándole mensajes, audios y fotos al WhatsApp de Troppero. Los audios se pasan a texto y las fotos (por ejemplo, de una boleta) se leen para anotar lo que dicen. Nada se guarda en tu cuenta sin que lo confirmes.',
      'Si en un audio o una foto aparece otra persona, sos responsable de tener su permiso. WhatsApp es un servicio de Meta y se rige también por sus propias condiciones.',
    ],
  },
  {
    id: 'ia',
    titulo: 'Inteligencia artificial',
    bloques: [
      'Troppero usa inteligencia artificial para entender tus mensajes, leer comprobantes y planillas, responder preguntas y sugerirte cosas. Usamos proveedores externos para eso y los podemos cambiar.',
      'La IA puede equivocarse: entender mal un número, confundir un potrero o dar una respuesta que no aplica a tu caso. Por eso te mostramos lo que entendió antes de guardarlo, y vos sos responsable de revisarlo.',
      'Lo que muestra Troppero (cálculos, sugerencias, alertas, respuestas de la IA) es información para ayudarte a decidir. No reemplaza el consejo de tu veterinario, tu ingeniero agrónomo, tu contador o tu abogado, y no respondemos por decisiones tomadas sólo en base a eso.',
    ],
  },
  {
    id: 'mapas',
    titulo: 'Mapas, superficies y clima',
    bloques: [
      'Las imágenes satelitales vienen de proveedores externos y pueden estar desactualizadas. Las hectáreas se calculan con lo que dibujás y son aproximadas: sirven para manejar el campo, no reemplazan una mensura ni un plano oficial.',
    ],
  },
  {
    id: 'uso',
    titulo: 'Cómo no se puede usar',
    bloques: [
      'No podés usar Troppero para algo ilegal, cargar datos de otros sin permiso, intentar entrar a cuentas ajenas, copiar o desarmar la aplicación, sobrecargarla a propósito o revenderla sin nuestro acuerdo.',
    ],
  },
  {
    id: 'plan',
    titulo: 'Es gratis',
    bloques: [
      'Por ahora Troppero es gratis y no te pedimos tarjeta.',
      'Si en algún momento empezamos a cobrar, te avisamos antes, te contamos el precio y qué incluye, y sólo pagás si lo aceptás. Si no, podés pedir la copia de tus datos y darte de baja sin costo.',
    ],
  },
  {
    id: 'baja',
    titulo: 'Baja y tu copia',
    bloques: [
      'Podés darte de baja cuando quieras, sin dar explicaciones, desde la aplicación (Configuración → Plan → Dar de baja), escribiéndonos a {mail} o por WhatsApp. Te damos un número de trámite.',
      'Después de la baja, tenés {diasBorrado} días para pedirnos una copia de tus datos. Pasado ese plazo los borramos, salvo lo que la ley nos obligue a guardar.',
    ],
  },
  {
    id: 'servicio',
    titulo: 'Disponibilidad y sin señal',
    bloques: [
      'Hacemos lo posible para que Troppero ande siempre, pero puede haber cortes por mantenimiento, por fallas de proveedores o de internet. Te avisamos con anticipación de los cortes programados.',
      'En el campo, parte de la aplicación anda sin señal y guarda lo que cargás en el celular hasta que vuelve la conexión. Si el celular se pierde, se rompe o se borra antes de sincronizar, eso se puede perder.',
      'Troppero va a cambiar con el tiempo: podemos sumar, mejorar o sacar funciones. Si sacamos algo importante, te avisamos antes.',
    ],
  },
  {
    id: 'responsabilidad',
    titulo: 'Hasta dónde respondemos',
    bloques: [
      'Respondemos por los daños que causemos por no cumplir este acuerdo. Lo que no podemos garantizar es que Troppero no tenga nunca errores ni que sirva para todo lo que te propongas.',
      'En lo que la ley permita, no respondemos por ganancias que dejaste de tener ni por daños indirectos. Esto no limita tus derechos como consumidor ni lo que la ley no permite excluir, como el daño causado con intención o culpa grave.',
    ],
  },
  {
    id: 'suspension',
    titulo: 'Suspensión de una cuenta',
    bloques: [
      'Si alguien usa Troppero de una forma que no está permitida o que pone en riesgo a otros, podemos suspender su acceso. Salvo que sea urgente, primero avisamos y damos un plazo para corregirlo. En cualquier caso, el dueño puede pedir la copia de sus datos.',
    ],
  },
  {
    id: 'propiedad',
    titulo: 'La marca y la aplicación',
    bloques: [
      'Troppero, su marca, su diseño y su software son nuestros. Usarlos no te da ningún derecho sobre ellos más allá de usar el servicio. Si nos mandás ideas o sugerencias, las podemos usar libremente.',
    ],
  },
  {
    id: 'cambios',
    titulo: 'Cambios en estos términos',
    bloques: [
      'Si cambiamos algo importante, te avisamos por WhatsApp, por mail o dentro de la aplicación antes de que rija, y te pedimos que aceptes la versión nueva. Si no estás de acuerdo, podés darte de baja sin costo. Los cambios menores, como corregir una palabra, rigen al publicarse.',
    ],
  },
  {
    id: 'ley',
    titulo: 'Ley y tribunales',
    bloques: [
      'Este acuerdo se rige por las leyes de la República Argentina. Ante un conflicto, primero tratemos de resolverlo hablando; si no se puede, intervienen los tribunales ordinarios de tu domicilio.',
      'Si alguna parte de estos términos no fuera válida, el resto sigue vigente.',
    ],
  },
  {
    id: 'contacto',
    titulo: 'Contacto',
    bloques: ['Para cualquier consulta sobre estos términos, escribinos a {mail}.'],
  },
]

export const PRIVACIDAD: Seccion[] = [
  {
    id: 'responsable',
    titulo: 'Quién cuida tus datos',
    bloques: [
      'Tus datos personales los cuidan {responsables}, creadores de Troppero y responsables de sus datos. Para cualquier consulta o pedido sobre tus datos, escribinos a {mail}.',
      'Esta política explica qué datos usamos cuando usás Troppero (la aplicación o su WhatsApp), para qué, con quién los compartimos y qué derechos tenés. Cumple la Ley 25.326 de Protección de los Datos Personales.',
    ],
  },
  {
    id: 'que-datos',
    titulo: 'Qué datos usamos',
    bloques: [
      [
        'Tu cuenta: nombre, apellido, celular, mail si lo diste, y la empresa a la que pertenecés con tu rol.',
        'Tu campo: lo que cargás o nos mandás (campos, potreros y sus límites en el mapa, hacienda, sanidad, lluvias, movimientos de plata, comprobantes, tareas).',
        'WhatsApp: tu número y los mensajes, fotos y audios que le mandás a Troppero, y lo que nos escribís para coordinar el alta.',
        'La videollamada para armar tu campo: la grabamos, y te avisamos al empezar, para no perder nada de lo que nos contás y cargarlo bien. La grabación la ve sólo nuestro equipo y la borramos cuando nos lo pidas.',
        'Tu ubicación: sólo cuando usás la recorrida en el celular y le das permiso, para saber en qué potrero estás. No la seguimos en segundo plano.',
        'Datos técnicos: tipo de dispositivo y navegador, dirección IP, cuándo entrás y qué errores aparecen, para que la aplicación funcione y sea segura.',
      ],
    ],
  },
  {
    id: 'para-que',
    titulo: 'Para qué los usamos',
    bloques: [
      [
        'Prestarte el servicio: guardar lo que cargás, mostrártelo, calcular, mandarte el código para entrar y los avisos que elegiste.',
        'Entender tus mensajes de WhatsApp y tus comprobantes con inteligencia artificial, y mostrarte lo que entendió para que lo confirmes.',
        'Ayudarte cuando nos escribís y avisarte cambios importantes del servicio.',
        'Cuidar la seguridad de las cuentas y prevenir abusos.',
        'Mejorar Troppero, con estadísticas de muchos campos juntos y sin datos que te identifiquen.',
      ],
      'Usamos tus datos porque los necesitamos para prestarte el servicio que contrataste y porque nos diste tu consentimiento al aceptar esta política. No los usamos para publicidad.',
    ],
  },
  {
    id: 'proveedores',
    titulo: 'Quién más los procesa',
    bloques: [
      'Para funcionar, Troppero usa estos proveedores, que procesan datos en nuestro nombre y sólo para lo que les pedimos:',
      [
        'Supabase: base de datos, archivos e inicio de sesión.',
        'Vercel: publica la aplicación web.',
        'Google: la videollamada para armar tu campo, su grabación y nuestro mail.',
        'Meta (WhatsApp Business): transporta los mensajes y los códigos para entrar.',
        'Anthropic: entiende los mensajes y lee las fotos de comprobantes y planillas.',
        'OpenAI: pasa a texto los audios.',
        'Google y Esri: muestran las imágenes satelitales; reciben qué zona del mapa estás mirando, no tus datos.',
        'OpenStreetMap: busca la localidad cuando ubicás un campo; recibe sólo el texto que buscás.',
      ],
      'Varios de estos proveedores procesan los datos fuera de la Argentina, principalmente en los Estados Unidos. Al aceptar esta política, consentís esa transferencia. Elegimos proveedores con medidas de seguridad reconocidas y, según sus condiciones comerciales, los proveedores de IA no usan lo que les mandamos para entrenar sus modelos.',
      'Fuera de estos proveedores, sólo compartimos datos si lo pide una autoridad con una orden válida, o si nos lo pedís vos.',
    ],
  },
  {
    id: 'no-hacemos',
    titulo: 'Lo que no hacemos',
    bloques: [
      [
        'No vendemos ni alquilamos tus datos.',
        'No se los damos a anunciantes ni te mostramos publicidad.',
        'No le escribimos por WhatsApp a quien no se vinculó a Troppero ni fue invitado.',
      ],
      'Si nos escribe un número que no está vinculado a ninguna cuenta, guardamos sólo el registro técnico de que llegó un mensaje, sin su contenido, y le respondemos una única vez cómo vincularse.',
    ],
  },
  {
    id: 'tiempo',
    titulo: 'Cuánto tiempo los guardamos',
    bloques: [
      'Mientras tu cuenta esté activa. Si te das de baja, tenés {diasBorrado} días para pedir una copia y después los borramos, salvo lo que una ley nos obligue a conservar, por el plazo que esa ley indique.',
    ],
  },
  {
    id: 'seguridad',
    titulo: 'Cómo los cuidamos',
    bloques: [
      'Los datos viajan cifrados, cada persona ve sólo lo que su rol le permite y el acceso a la cuenta depende de un código que llega a tu celular. Ningún sistema es completamente seguro: si pasara algo que afecte tus datos, te avisamos y te contamos qué hicimos.',
    ],
  },
  {
    id: 'derechos',
    titulo: 'Tus derechos',
    bloques: [
      'Podés pedirnos ver qué datos tuyos tenemos, corregirlos, actualizarlos o borrarlos, y retirar tu consentimiento. Escribinos a {mail}: te respondemos en un plazo máximo de 10 días corridos para el acceso y de 5 días hábiles para corregir o borrar, como fija la ley.',
      'El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326.',
      'La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.',
    ],
  },
  {
    id: 'equipo',
    titulo: 'Personas que invita el dueño',
    bloques: [
      'Cuando el dueño de una empresa invita a alguien (un encargado, un peón, un veterinario), carga su nombre y su celular. El dueño se compromete a contarle a esa persona que sus datos quedan en Troppero y para qué. Quien fue invitado puede pedirnos lo mismo que cualquier usuario: ver, corregir o borrar sus datos.',
    ],
  },
  {
    id: 'menores',
    titulo: 'Menores de edad',
    bloques: ['Troppero es para mayores de 18 años. No juntamos a propósito datos de menores; si nos enteramos de que pasó, los borramos.'],
  },
  {
    id: 'cambios',
    titulo: 'Cambios en esta política',
    bloques: [
      'Si cambiamos algo importante, te avisamos antes por WhatsApp, por mail o dentro de la aplicación, y te pedimos que aceptes la versión nueva. Siempre vas a ver arriba la fecha de la versión vigente.',
    ],
  },
]
