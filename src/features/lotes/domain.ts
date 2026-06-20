// Dominio de LOTES de hacienda (multi-especie). Por ahora alimenta la vista
// visual con datos mock (ver mock.ts); más adelante se mapea al modelo de datos
// real (tablas lote / lote_potrero / animal). Spec:
// orka-brain/clientes/risso-agro/especificaciones/
//   2026-06-19-lote-hacienda-multiespecie-existencias.md

export type Especie = 'bovino' | 'ovino' | 'equino'
export type Sexo = 'macho' | 'hembra'
export type PropositoLote =
  | 'cria'
  | 'recria'
  | 'invernada'
  | 'engorde'
  | 'general'

export const especieLabel: Record<Especie, string> = {
  bovino: 'Bovino',
  ovino: 'Ovino',
  equino: 'Equino',
}

/** Acento de color por especie (tokens del tema). */
export const especieColor: Record<Especie, string> = {
  bovino: 'var(--field)',
  ovino: 'var(--sky)',
  equino: 'var(--tierra)',
}

export const sexoLabelMap: Record<Sexo, string> = {
  macho: 'Macho',
  hembra: 'Hembra',
}

export const propositoLabel: Record<PropositoLote, string> = {
  cria: 'Cría',
  recria: 'Recría',
  invernada: 'Invernada',
  engorde: 'Engorde',
  general: 'General',
}

/** Categoría de animal dentro de una especie. `sexo` ayuda a la carga en manga. */
export type CategoriaDef = { id: string; label: string; sexo?: Sexo }

export const categoriasPorEspecie: Record<Especie, CategoriaDef[]> = {
  bovino: [
    { id: 'vaca', label: 'Vaca', sexo: 'hembra' },
    { id: 'vaquillona', label: 'Vaquillona', sexo: 'hembra' },
    { id: 'ternera', label: 'Ternera', sexo: 'hembra' },
    { id: 'toro', label: 'Toro', sexo: 'macho' },
    { id: 'torito', label: 'Torito', sexo: 'macho' },
    { id: 'novillo', label: 'Novillo', sexo: 'macho' },
    { id: 'ternero', label: 'Ternero', sexo: 'macho' },
  ],
  ovino: [
    { id: 'oveja', label: 'Oveja', sexo: 'hembra' },
    { id: 'borrega', label: 'Borrega', sexo: 'hembra' },
    { id: 'cordera', label: 'Cordera', sexo: 'hembra' },
    { id: 'carnero', label: 'Carnero', sexo: 'macho' },
    { id: 'borrego', label: 'Borrego', sexo: 'macho' },
    { id: 'cordero', label: 'Cordero', sexo: 'macho' },
  ],
  equino: [
    { id: 'yegua', label: 'Yegua', sexo: 'hembra' },
    { id: 'potranca', label: 'Potranca', sexo: 'hembra' },
    { id: 'padrillo', label: 'Padrillo', sexo: 'macho' },
    { id: 'caballo', label: 'Caballo', sexo: 'macho' },
    { id: 'potrillo', label: 'Potrillo', sexo: 'macho' },
  ],
}

const labelIndex: Record<string, string> = Object.fromEntries(
  Object.values(categoriasPorEspecie)
    .flat()
    .map((c) => [c.id, c.label]),
)
export function categoriaLabel(id: string): string {
  return labelIndex[id] ?? id
}

/** Color de la barra de composición por categoría (paleta de gráficos g1–g5). */
export const categoriaColor: Record<string, string> = {
  // bovino
  vaca: 'var(--g1)',
  vaquillona: 'var(--g3)',
  ternera: 'var(--g2)',
  toro: 'var(--g5)',
  torito: 'var(--g5)',
  novillo: 'var(--g4)',
  ternero: 'var(--g2)',
  // ovino
  oveja: 'var(--g1)',
  borrega: 'var(--g3)',
  cordera: 'var(--g2)',
  carnero: 'var(--g5)',
  borrego: 'var(--g4)',
  cordero: 'var(--g2)',
  // equino
  yegua: 'var(--g1)',
  potranca: 'var(--g3)',
  padrillo: 'var(--g5)',
  caballo: 'var(--g4)',
  potrillo: 'var(--g2)',
}

export function colorCategoria(id: string): string {
  return categoriaColor[id] ?? 'var(--g4)'
}
