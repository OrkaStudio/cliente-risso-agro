/**
 * Lectura de caravana RFID: normalización y análisis.
 *
 * El bastón se empareja como TECLADO Bluetooth (modo HID) y "teclea" el número
 * en el campo que tenga el foco. El problema es que cada marca teclea distinto
 * el MISMO animal: `982000123456789`, `982 000123456789`, `982.000123456789`,
 * con o sin Enter al final. Sin normalizar, el mismo bicho entra dos veces como
 * dos animales distintos — y eso no se ve hasta que el rodeo está mal contado.
 *
 * Regla de oro: normalizar es SACAR separadores, nunca reinterpretar el número.
 * Los ceros a la izquierda son significativos en ISO 11784/85 (el país va en los
 * primeros 3 dígitos: 032 = Argentina) → jamás se recortan.
 */

/** Separadores que mete un lector según marca/config. Incluye NBSP y tabs. */
const SEPARADORES = /[\s.\-_·:]/g

/**
 * Invisibles que algunos lectores mandan de yapa: control ASCII, DEL,
 * anchos-cero y BOM. Van escapados a proposito — pegados en literal son
 * imposibles de ver y de revisar en un diff.
 */
// Matchear caracteres de control ES el objetivo: son basura que mete
// el lector y hay que sacarla antes de guardar el numero.
// eslint-disable-next-line no-control-regex
const INVISIBLES = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g

/**
 * Forma canónica de un RFID: lo que se guarda y con lo que se compara.
 * Es IDENTIDAD sobre un string de dígitos limpio → seguro para los datos que
 * ya están cargados en producción (no los reescribe ni los deja huérfanos).
 */
export function normalizarRfid(crudo: string): string {
  return crudo
    .replace(INVISIBLES, '')
    .replace(SEPARADORES, '')
    .trim()
    .toLowerCase()
}

export type FormatoRfid =
  | 'iso-decimal' // 15 dígitos ISO 11784/85 (lo normal en ganadería)
  | 'hex' // 16 hex — algunos lectores escupen el crudo del transponder
  | 'numerico' // dígitos, pero no 15: visual o lector mal configurado
  | 'alfanumerico' // mezcla — casi siempre lector en modo raro
  | 'vacio'

export type AnalisisRfid = {
  crudo: string
  normalizado: string
  formato: FormatoRfid
  largo: number
  /** Se le sacó al menos un separador o invisible al normalizar. */
  tuvoRuido: boolean
  /** ISO 11784/85: código de país/fabricante (primeros 3 dígitos). */
  pais: string | null
  /** ISO 11784/85: identificador nacional (últimos 12 dígitos). */
  nacional: string | null
  /** Advertencias para mostrar en la pantalla de diagnóstico. */
  avisos: string[]
}

/** Código ICAR 032 = Argentina. 900-999 = fabricantes (caravana no nacional). */
function describirPais(pais: string): string | null {
  if (pais === '032') return null // Argentina — lo esperable, no avisa
  const n = Number(pais)
  if (n >= 900 && n <= 999) {
    return `País ${pais}: es un código de FABRICANTE (900-999), no de país. Normal en caravanas importadas.`
  }
  return `País ${pais}: no es Argentina (032). Verificá que sea la caravana correcta.`
}

/** Analiza una lectura cruda para la pantalla de diagnóstico del lector. */
export function analizarRfid(crudo: string): AnalisisRfid {
  const normalizado = normalizarRfid(crudo)
  const tuvoRuido = normalizado !== crudo.trim().toLowerCase()
  const avisos: string[] = []

  let formato: FormatoRfid
  if (normalizado === '') {
    formato = 'vacio'
  } else if (/^\d{15}$/.test(normalizado)) {
    formato = 'iso-decimal'
  } else if (/^[0-9a-f]{16}$/.test(normalizado) && /[a-f]/.test(normalizado)) {
    formato = 'hex'
  } else if (/^\d+$/.test(normalizado)) {
    formato = 'numerico'
  } else {
    formato = 'alfanumerico'
  }

  if (tuvoRuido) {
    avisos.push(
      'El lector mandó separadores o caracteres invisibles. La app los saca sola, pero anotá que este modelo lo hace.',
    )
  }

  let pais: string | null = null
  let nacional: string | null = null
  if (formato === 'iso-decimal') {
    pais = normalizado.slice(0, 3)
    nacional = normalizado.slice(3)
    const desc = describirPais(pais)
    if (desc) avisos.push(desc)
  } else if (formato === 'hex') {
    avisos.push(
      'El lector está mandando el código en HEXADECIMAL, no en decimal. Buscá en su menú la opción de salida decimal (ISO): si no, el mismo animal leído por otro lector no va a coincidir.',
    )
  } else if (formato === 'numerico') {
    avisos.push(
      `Son ${normalizado.length} dígitos, no 15. Una caravana ISO tiene 15. Puede ser una caravana visual, o el lector está recortando el número.`,
    )
  } else if (formato === 'alfanumerico') {
    avisos.push(
      'Llegaron letras y símbolos mezclados. Casi seguro el lector NO está en modo teclado (HID) estándar, o está mandando un encabezado. Revisá su configuración.',
    )
  }

  return {
    crudo,
    normalizado,
    formato,
    largo: normalizado.length,
    tuvoRuido,
    pais,
    nacional,
    avisos,
  }
}

export const FORMATO_LABEL: Record<FormatoRfid, string> = {
  'iso-decimal': 'ISO 15 dígitos',
  hex: 'Hexadecimal',
  numerico: 'Numérico',
  alfanumerico: 'Alfanumérico',
  vacio: 'Vacío',
}

/** Verde solo cuando la lectura es la que queremos; el resto avisa. */
export const FORMATO_OK: Record<FormatoRfid, boolean> = {
  'iso-decimal': true,
  hex: false,
  numerico: false,
  alfanumerico: false,
  vacio: false,
}
