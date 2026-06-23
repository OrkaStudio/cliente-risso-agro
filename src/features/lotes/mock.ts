// Datos MOCK de campos + lotes, tomados del Excel real del padre
// ("Campos Arrendados y Propios.xlsx", análisis en orka-brain). Sirven para
// terminar la vista visualmente; se reemplazan por hooks contra Supabase
// cuando se construya el modelo de datos.
import type { Especie, PropositoLote } from '@/features/lotes/domain'

export type Tenencia = 'propio' | 'arrendado'

export type CampoColor = { nombre: string; hex: string; letra: string }

export type Campo = {
  id: string
  nombre: string
  tenencia: Tenencia
  hectareas: number
  potreros: number
  color: CampoColor
}

export type ComposicionItem = { categoria: string; cantidad: number }

export type Lote = {
  id: string
  nombre: string
  campoId: string
  especie: Especie
  proposito: PropositoLote
  /** Un lote puede ocupar más de un potrero (Excel: "Potrero 9 y 10"). */
  potreros: string[]
  composicion: ComposicionItem[]
}

export const campos: Campo[] = [
  {
    id: 'la-portena',
    nombre: 'La Porteña',
    tenencia: 'arrendado',
    hectareas: 453,
    potreros: 11,
    color: { nombre: 'Amarillo', hex: '#e7b41f', letra: 'A' },
  },
  {
    id: 'toimil',
    nombre: 'Toimil',
    tenencia: 'propio',
    hectareas: 72,
    potreros: 2,
    color: { nombre: 'Azul', hex: '#3b7dd8', letra: 'Z' },
  },
  {
    id: 'don-gilberto',
    nombre: 'Don Gilberto',
    tenencia: 'propio',
    hectareas: 27,
    potreros: 2,
    color: { nombre: 'Marrón', hex: '#8a5a33', letra: 'M' },
  },
  {
    id: 'los-pampas',
    nombre: 'Los Pampas',
    tenencia: 'arrendado',
    hectareas: 165,
    potreros: 3,
    color: { nombre: 'Verde', hex: '#3f9d52', letra: 'V' },
  },
]

export const lotes: Lote[] = [
  // ===== La Porteña =====
  {
    id: 'lp-1',
    nombre: 'Lote 1',
    campoId: 'la-portena',
    especie: 'bovino',
    proposito: 'cria',
    potreros: ['9', '10'],
    composicion: [
      { categoria: 'vaca', cantidad: 87 },
      { categoria: 'ternero', cantidad: 86 },
      { categoria: 'toro', cantidad: 3 },
    ],
  },
  {
    id: 'lp-2',
    nombre: 'Lote 2',
    campoId: 'la-portena',
    especie: 'bovino',
    proposito: 'cria',
    potreros: ['1A'],
    composicion: [
      { categoria: 'vaca', cantidad: 76 },
      { categoria: 'ternero', cantidad: 3 },
      { categoria: 'toro', cantidad: 1 },
    ],
  },
  {
    id: 'lp-3',
    nombre: 'Lote 3',
    campoId: 'la-portena',
    especie: 'bovino',
    proposito: 'cria',
    potreros: ['11'],
    composicion: [
      { categoria: 'vaca', cantidad: 208 },
      { categoria: 'ternero', cantidad: 7 },
    ],
  },
  {
    id: 'lp-4',
    nombre: 'Lote 4',
    campoId: 'la-portena',
    especie: 'bovino',
    proposito: 'general',
    potreros: ['2'],
    composicion: [
      { categoria: 'vaca', cantidad: 1 },
      { categoria: 'toro', cantidad: 1 },
    ],
  },
  {
    id: 'lp-5',
    nombre: 'Lote 5',
    campoId: 'la-portena',
    especie: 'bovino',
    proposito: 'general',
    potreros: ['7'],
    composicion: [{ categoria: 'toro', cantidad: 2 }],
  },
  {
    id: 'lp-6',
    nombre: 'Lote 6',
    campoId: 'la-portena',
    especie: 'bovino',
    proposito: 'general',
    potreros: ['5'],
    composicion: [{ categoria: 'toro', cantidad: 5 }],
  },
  {
    id: 'lp-7',
    nombre: 'Lote 7',
    campoId: 'la-portena',
    especie: 'ovino',
    proposito: 'general',
    potreros: ['3'],
    composicion: [
      { categoria: 'oveja', cantidad: 14 },
      { categoria: 'carnero', cantidad: 2 },
    ],
  },
  {
    id: 'lp-8',
    nombre: 'Lote 8',
    campoId: 'la-portena',
    especie: 'equino',
    proposito: 'general',
    potreros: ['6'],
    composicion: [
      { categoria: 'yegua', cantidad: 7 },
      { categoria: 'potranca', cantidad: 1 },
      { categoria: 'padrillo', cantidad: 1 },
    ],
  },
  {
    id: 'lp-9',
    nombre: 'Lote 9',
    campoId: 'la-portena',
    especie: 'equino',
    proposito: 'general',
    potreros: ['1B'],
    composicion: [
      { categoria: 'yegua', cantidad: 3 },
      { categoria: 'caballo', cantidad: 2 },
      { categoria: 'potrillo', cantidad: 2 },
    ],
  },
  // ===== Toimil =====
  {
    id: 'to-1',
    nombre: 'Lote 1',
    campoId: 'toimil',
    especie: 'bovino',
    proposito: 'cria',
    potreros: ['1'],
    composicion: [
      { categoria: 'vaca', cantidad: 30 },
      { categoria: 'ternero', cantidad: 18 },
    ],
  },
  // ===== Don Gilberto =====
  {
    id: 'dg-1',
    nombre: 'Lote 1',
    campoId: 'don-gilberto',
    especie: 'bovino',
    proposito: 'recria',
    potreros: ['1'],
    composicion: [
      { categoria: 'vaquillona', cantidad: 14 },
      { categoria: 'toro', cantidad: 1 },
    ],
  },
  {
    id: 'dg-2',
    nombre: 'Lote 2',
    campoId: 'don-gilberto',
    especie: 'equino',
    proposito: 'general',
    potreros: ['2'],
    composicion: [{ categoria: 'yegua', cantidad: 4 }],
  },
  {
    id: 'dg-3',
    nombre: 'Lote 3',
    campoId: 'don-gilberto',
    especie: 'ovino',
    proposito: 'general',
    potreros: ['1'],
    composicion: [{ categoria: 'cordero', cantidad: 8 }],
  },
  // ===== Los Pampas =====
  {
    id: 'pa-1',
    nombre: 'Lote 1',
    campoId: 'los-pampas',
    especie: 'bovino',
    proposito: 'cria',
    potreros: ['2'],
    composicion: [
      { categoria: 'vaca', cantidad: 26 },
      { categoria: 'ternero', cantidad: 18 },
    ],
  },
]

export function totalLote(l: Lote): number {
  return l.composicion.reduce((s, c) => s + c.cantidad, 0)
}

/** Potrero (la tierra). `numero` es el identificador que usan los lotes en su
 *  campo (Lote.potreros referencia estos números). Hectáreas aproximadas del
 *  plano para dibujar el mapa de superficie. */
export type Potrero = {
  id: string
  campoId: string
  numero: string
  hectareas: number
  /** Si el potrero está sembrado (uso agrícola). Sin lote ni cultivo = vacío. */
  cultivo?: string
}

export const potreros: Potrero[] = [
  // ===== La Porteña (453 ha · 11 potreros) =====
  { id: 'lp-p11', campoId: 'la-portena', numero: '11', hectareas: 120 },
  { id: 'lp-p9', campoId: 'la-portena', numero: '9', hectareas: 45 },
  { id: 'lp-p10', campoId: 'la-portena', numero: '10', hectareas: 53 },
  { id: 'lp-p1a', campoId: 'la-portena', numero: '1A', hectareas: 30 },
  { id: 'lp-p1b', campoId: 'la-portena', numero: '1B', hectareas: 40 },
  { id: 'lp-p2', campoId: 'la-portena', numero: '2', hectareas: 8 },
  { id: 'lp-p3', campoId: 'la-portena', numero: '3', hectareas: 35 },
  { id: 'lp-p4', campoId: 'la-portena', numero: '4', hectareas: 55, cultivo: 'Trigo' },
  { id: 'lp-p5', campoId: 'la-portena', numero: '5', hectareas: 27 },
  { id: 'lp-p6', campoId: 'la-portena', numero: '6', hectareas: 22 },
  { id: 'lp-p7', campoId: 'la-portena', numero: '7', hectareas: 18 },
  // ===== Toimil (72 ha · 2 potreros) =====
  { id: 'to-p1', campoId: 'toimil', numero: '1', hectareas: 50 },
  { id: 'to-p2', campoId: 'toimil', numero: '2', hectareas: 22 },
  // ===== Don Gilberto (27 ha · 2 potreros) =====
  { id: 'dg-p1', campoId: 'don-gilberto', numero: '1', hectareas: 15 },
  { id: 'dg-p2', campoId: 'don-gilberto', numero: '2', hectareas: 12 },
  // ===== Los Pampas (165 ha · 3 potreros) =====
  { id: 'pa-p2', campoId: 'los-pampas', numero: '2', hectareas: 80 },
  { id: 'pa-p1', campoId: 'los-pampas', numero: '1', hectareas: 50, cultivo: 'Soja' },
  { id: 'pa-p3', campoId: 'los-pampas', numero: '3', hectareas: 35 },
]
