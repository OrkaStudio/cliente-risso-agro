// Tipos del bot de WhatsApp. Spec:
// orka-brain/clientes/risso-agro/especificaciones/2026-09-24-whatsapp-captura-fase1.md

export type Potrero = { id: string; nombre: string }
export type Campo = { id: string; nombre: string; potreros: Potrero[] }
export type Categoria = { id: string; nombre: string }

/** Lo que el bot sabe de la empresa del número vinculado. */
export type Contexto = {
  hoy: string
  fechaMensaje?: string
  nombre: string | null
  campos: Campo[]
  categoriasGasto: Categoria[]
  semanalHabilitado?: boolean
  pilotoHabilitado?: boolean
}

export const INTENTS = [
  'lluvia',
  'novedad',
  'gasto',
  'consulta_hacienda',
  'consulta_lluvia',
  'consulta_vencimientos',
  'consulta_dias_potrero',
  'consulta_recorrida',
  'consulta_observacion',
  'consulta_novedades',
  'consulta_gastos',
  'consulta_cargas',
  'no_soportado',
  'ayuda_gasto',
  'ayuda_lluvia',
  'saludo',
  'otro',
] as const
export type Intent = (typeof INTENTS)[number]

export const AGUA = ['llena', 'normal', 'baja', 'seca'] as const
export const PASTO = ['abundante', 'normal', 'escaso', 'pelado'] as const
export const ELECTRICO = ['ok', 'cortado'] as const
export type Agua = (typeof AGUA)[number]
export type Pasto = (typeof PASTO)[number]
export type Electrico = (typeof ELECTRICO)[number]

/** Lo que vio en un potrero, como lo devuelve el modelo. Los estados son los enums de la base. */
export type ObsInterpretada = {
  potrero: string | null
  campo: string | null
  /** Dijo "acá", "en este" o "en el que estoy": el potrero sale de la ubicación. */
  aca: boolean
  agua: Agua | null
  pasto: Pasto | null
  electrico: Electrico | null
  /** Total de animales del potrero, sólo si contó todos. */
  conteo: number | null
  novedad: string | null
}

/** Lo que devuelve el modelo, ya limpio. Nunca se escribe tal cual: es una propuesta. */
export type Interpretacion = {
  intent: Intent
  campo: string | null
  potrero: string | null
  mm: number | null
  fecha: string | null
  fechaInvalida?: boolean
  monto: number | null
  categoria: string | null
  contraparte: string | null
  descripcion: string | null
  periodo: 'semana' | 'mes' | 'anio' | null
  /** Sólo en "novedad": una por potrero. */
  observaciones: ObsInterpretada[]
  otrosRegistros?: string[]
}

export type TipoBorrador =
  | 'recorrida'
  | 'lluvia'
  | 'gasto'
  | 'consulta_hacienda'
  | 'consulta_lluvia'
  | 'consulta_vencimientos'
  | 'consulta_dias_potrero'
  | 'consulta_recorrida'
  | 'consulta_observacion'
  | 'consulta_novedades'
  | 'consulta_gastos'
  | 'consulta_cargas'

/** Una observación de la recorrida mientras se resuelve su potrero. */
export type ObsBorrador = {
  potreroId?: string | null
  campoId?: string | null
  potreroMencion?: string | null
  campoMencion?: string | null
  aca?: boolean
  agua: Agua | null
  pasto: Pasto | null
  electrico: Electrico | null
  conteo: number | null
  novedad: string | null
}

/** Dónde dijo la ubicación compartida que está el productor. */
/** punto: la ubicación compartida, para cargar ahí un molino o un tanque. */
export type Ubicado = { potreroId: string; campoId: string; punto?: [number, number] }

export type IvaLinea = { concepto: string | null; neto: number; alicuota: number; iva: number }

/** Lo que se va juntando hasta poder proponer (o consultar). Vive en `wa_vinculo.pendiente`. */
export type Borrador = {
  tipo: TipoBorrador
  campoId?: string | null
  potreroId?: string | null
  /** Lo que escribió el productor y todavía no se resolvió contra la base. */
  campoMencion?: string | null
  potreroMencion?: string | null
  mm?: number | null
  fecha?: string | null
  fechaInvalida?: boolean
  monto?: number | null
  categoriaId?: string | null
  categoriaMencion?: string | null
  contraparte?: string | null
  descripcion?: string | null
  cuit?: string | null
  comprobanteTipo?: 'a' | 'b' | 'c' | 'otro' | null
  ivaLineas?: IvaLinea[]
  /** id del medio en Meta, para subir la foto al bucket al confirmar. */
  fotoMediaId?: string | null
  periodo?: 'semana' | 'mes' | 'anio' | null
  observaciones?: ObsBorrador[]
  sesionId?: string
  cerrarSesion?: boolean
}

/** Qué le preguntó el bot al productor y todavía espera. */
export type Pendiente =
  | { tipo: 'propuesta'; capturaId: string; borrador: Borrador }
  | { tipo: 'dato'; capturaId: string; borrador: Borrador; dato: 'mm' | 'monto' }
  | {
      tipo: 'campo'; capturaId: string; borrador: Borrador
      /** Sólo se guarda si la pregunta avisó explícitamente que elegir confirma. */
      confirmaAlElegir?: boolean
      camposOfrecidos?: string[]
    }
  | {
      tipo: 'potrero'; capturaId: string; borrador: Borrador; opciones?: string[]
      /** En una recorrida: a qué observación le falta el potrero. */
      obsIndex?: number
    }
  /** La recorrida espera la ubicación (o el nombre) del potrero donde está. */
  | { tipo: 'ubicacion'; capturaId: string; borrador: Borrador; obsIndex?: number; confirmaAlElegir?: boolean }
  /** Compartió la ubicación sin decir nada más: vale para el próximo mensaje. */
  | { tipo: 'ubicado'; capturaId: null; ubicado: Ubicado }
  | { tipo: 'categoria'; capturaId: string; borrador: Borrador }
  | { tipo: 'corregir'; capturaId: string; borrador: Borrador }

/** Inventario: elegir qué es lo de la ubicación, confirmar el alta o la baja.
 * Va aparte de Pendiente: el webhook lo separa al leerlo y el resto del flujo no lo ve. */
export type PendienteInfra =
  | { tipo: 'infra'; capturaId: string | null; paso: 'tipo'; punto: [number, number]; campoId: string }
  | { tipo: 'infra'; capturaId: string; paso: 'confirmar'; elemento: InfraNueva }
  | { tipo: 'infra'; capturaId: string; paso: 'borrar'; id: string; nombre: string }
  /** Dijo qué es antes de mandar la ubicación (sin señal salen juntas y llegan en cualquier orden). */
  | { tipo: 'infra'; capturaId: null; paso: 'ubicacion'; elemento: { tipo: InfraNueva['tipo']; apodo: string | null }; origen: { texto: string; entrada: 'texto' | 'audio' } }

export type InfraNueva = {
  campoId: string; tipo: 'molino' | 'tanque' | 'bebedero' | 'energizador' | 'tranquera' | 'electrico'
  apodo: string | null; lat: number; lng: number; linea: [number, number][] | null; nombre: string; focoId: string | null
}

export type Boton = { id: string; titulo: string; detalle?: string }

/** Un mensaje del bot. Con ≤3 opciones van botones; con más, una lista (máx. 10). */
export type Mensaje = {
  texto: string
  /** Botón de WhatsApp para compartir la ubicación. */
  pedirUbicacion?: boolean
  botones?: Boton[]
  lista?: { boton: string; filas: Boton[] }
}
