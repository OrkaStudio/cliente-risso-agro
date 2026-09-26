// Tipos del bot de WhatsApp. Spec:
// orka-brain/clientes/risso-agro/especificaciones/2026-09-24-whatsapp-captura-fase1.md

export type Potrero = { id: string; nombre: string }
export type Campo = { id: string; nombre: string; potreros: Potrero[] }
export type Categoria = { id: string; nombre: string }

/** Lo que el bot sabe de la empresa del número vinculado. */
export type Contexto = {
  hoy: string
  nombre: string | null
  campos: Campo[]
  categoriasGasto: Categoria[]
}

export const INTENTS = [
  'lluvia',
  'novedad',
  'gasto',
  'consulta_hacienda',
  'consulta_lluvia',
  'consulta_vencimientos',
  'consulta_dias_potrero',
  'no_soportado',
  'saludo',
  'otro',
] as const
export type Intent = (typeof INTENTS)[number]

/** Lo que devuelve el modelo, ya limpio. Nunca se escribe tal cual: es una propuesta. */
export type Interpretacion = {
  intent: Intent
  campo: string | null
  potrero: string | null
  mm: number | null
  fecha: string | null
  monto: number | null
  categoria: string | null
  contraparte: string | null
  descripcion: string | null
  periodo: 'semana' | 'mes' | 'anio' | null
}

export type TipoBorrador =
  | 'lluvia'
  | 'gasto'
  | 'consulta_hacienda'
  | 'consulta_lluvia'
  | 'consulta_vencimientos'
  | 'consulta_dias_potrero'

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
  monto?: number | null
  categoriaId?: string | null
  contraparte?: string | null
  descripcion?: string | null
  cuit?: string | null
  comprobanteTipo?: 'a' | 'b' | 'c' | 'otro' | null
  ivaLineas?: IvaLinea[]
  /** id del medio en Meta, para subir la foto al bucket al confirmar. */
  fotoMediaId?: string | null
  periodo?: 'semana' | 'mes' | 'anio' | null
}

/** Qué le preguntó el bot al productor y todavía espera. */
export type Pendiente =
  | { tipo: 'propuesta'; capturaId: string; borrador: Borrador }
  | { tipo: 'dato'; capturaId: string; borrador: Borrador; dato: 'mm' | 'monto' }
  | { tipo: 'campo'; capturaId: string; borrador: Borrador }
  | { tipo: 'potrero'; capturaId: string; borrador: Borrador; opciones?: string[] }
  | { tipo: 'categoria'; capturaId: string; borrador: Borrador }
  | { tipo: 'corregir'; capturaId: string; borrador: Borrador }

export type Boton = { id: string; titulo: string; detalle?: string }

/** Un mensaje del bot. Con ≤3 opciones van botones; con más, una lista (máx. 10). */
export type Mensaje = {
  texto: string
  botones?: Boton[]
  lista?: { boton: string; filas: Boton[] }
}
