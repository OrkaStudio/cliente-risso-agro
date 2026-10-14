import { categoriaLabel, categoriasPorEspecie } from '../labels'

// La planilla de ejemplo para bajar (página 35, «Bajar una planilla de
// ejemplo»): un Excel de verdad, con los potreros del productor y una hoja
// que explica cada columna. El que la abre entiende qué poner sin preguntar.

const TERRACOTA = '#B85C2E'
const TRIGO = '#FCF2DA'
const TINTA = '#131B16'
const GRIS = '#6E675C'

type Cell = { value?: string | number; [k: string]: unknown } | null

export async function bajarPlanillaEjemplo(potreros: string[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const [p1, p2] = [potreros[0] ?? '1A', potreros[1] ?? potreros[0] ?? '2A']
  const titulo = (value: string, columnSpan: number): Cell[] => [{ value, columnSpan, fontWeight: 'bold', fontSize: 16, textColor: TINTA, height: 28, alignVertical: 'center' }, ...Array(columnSpan - 1).fill(null)]
  const nota = (value: string, columnSpan: number): Cell[] => [{ value, columnSpan, textColor: GRIS, wrap: true, height: 32, alignVertical: 'top' }, ...Array(columnSpan - 1).fill(null)]
  const cab = (value: string): Cell => ({ value, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: TERRACOTA, height: 24, alignVertical: 'center', borderColor: TERRACOTA, borderStyle: 'thin' })
  const ej = (value: string, extra: object = {}): Cell => ({ value, type: String, format: '@', backgroundColor: TRIGO, borderColor: '#E8DCC0', borderStyle: 'thin', ...extra })
  const vacia: Cell = { value: '', type: String, format: '@', borderColor: '#E8DCC0', borderStyle: 'thin' }

  const caravanas: Cell[][] = [
    titulo('Caravanas para Tropero', 6),
    nota('Una fila por animal. Las filas amarillas son de ejemplo: borralas o escribí encima. Guardá y subila en Hacienda › Caravanas por Excel.', 6),
    [],
    ['Caravana visible', 'Categoría', 'Potrero', 'Electrónica', 'Nacimiento', 'Raza'].map(cab),
    [ej('1161'), ej('Ternero'), ej(p1), ej('032530055581161'), ej('03/02/2026'), ej('Angus')],
    [ej('1040'), ej('Vaca'), ej(p1), ej('032530055581040'), ej(''), ej('Angus')],
    [ej('1172'), ej('Ternera'), ej(p2), ej(''), ej(''), ej('')],
    ...Array.from({ length: 12 }, () => Array(6).fill(vacia)),
  ]

  const fila = (col: string, que: string, ejemplo: string, oblig: string): Cell[] => [
    { value: col, fontWeight: 'bold', textColor: TINTA, alignVertical: 'top', borderColor: '#E8DCC0', borderStyle: 'thin' },
    { value: que, wrap: true, alignVertical: 'top', borderColor: '#E8DCC0', borderStyle: 'thin' },
    { value: ejemplo, type: String, format: '@', textColor: GRIS, alignVertical: 'top', borderColor: '#E8DCC0', borderStyle: 'thin' },
    { value: oblig, fontWeight: oblig === 'Sí' ? 'bold' : undefined, textColor: oblig === 'Sí' ? TERRACOTA : GRIS, alignVertical: 'top', borderColor: '#E8DCC0', borderStyle: 'thin' },
  ]
  const categorias = (Object.keys(categoriasPorEspecie) as (keyof typeof categoriasPorEspecie)[]).map(
    (e) => `${{ bovino: 'Vacunos', ovino: 'Ovinos', equino: 'Equinos' }[e]}: ${categoriasPorEspecie[e].map((c) => categoriaLabel[c]).join(', ')}`,
  )
  const como: Cell[][] = [
    titulo('Cómo llenarla', 4),
    nota('Tropero le pone la caravana a los animales que ya cargaste por categoría. No crea animales nuevos: si entraron animales, sumalos antes con «Entraron».', 4),
    [],
    ['Columna', 'Qué poner', 'Ejemplo', '¿Hace falta?'].map(cab),
    fila('Caravana visible', 'El número grande de la caravana, el que se lee de lejos.', '1161', 'Sí'),
    fila('Categoría', 'Qué es el animal. Sirve en singular o en plural.', 'Ternero', 'Sí'),
    fila('Potrero', `El nombre del potrero, como está en Tropero (por ejemplo ${p1}). Si lo dejás vacío, va al campo que elijas al subirla.`, p1, 'No'),
    fila('Electrónica', 'Los 15 números del chip. Si falta, la caravana se pone igual y la electrónica se suma después.', '032530055581161', 'No'),
    fila('Nacimiento', 'Día/mes/año. Si no se sabe, vacío.', '03/02/2026', 'No'),
    fila('Raza', 'Si la sabés.', 'Angus', 'No'),
    [],
    [{ value: 'Categorías que entendemos', fontWeight: 'bold', textColor: TINTA, columnSpan: 4 }, null, null, null],
    ...categorias.map((t): Cell[] => [{ value: t, columnSpan: 4, wrap: true, textColor: GRIS }, null, null, null]),
    [],
    [{ value: 'Los títulos de las columnas pueden estar en cualquier orden. Si una fila tiene un error, Tropero te dice cuál y por qué, y pone el resto.', columnSpan: 4, wrap: true, textColor: GRIS, height: 32 }, null, null, null],
  ]

  await writeExcelFile([
    { data: caravanas as never, sheet: 'Caravanas', columns: [{ width: 18 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 14 }, { width: 14 }], stickyRowsCount: 4 },
    { data: como as never, sheet: 'Cómo llenarla', columns: [{ width: 18 }, { width: 60 }, { width: 18 }, { width: 14 }] },
  ]).toFile('caravanas-tropero.xlsx')
}
