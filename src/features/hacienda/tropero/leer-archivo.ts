import { leerCsv } from './planilla'

type Celda = string | number | boolean | Date | null | undefined

/** Lee un Excel o un CSV a filas. El lector de Excel se carga recién cuando hace falta. */
export async function leerArchivo(f: File): Promise<Celda[][]> {
  if (/\.(csv|txt)$/i.test(f.name)) return leerCsv(await f.text())
  const { readSheet } = await import('read-excel-file/browser')
  return (await readSheet(f)) as Celda[][]
}
