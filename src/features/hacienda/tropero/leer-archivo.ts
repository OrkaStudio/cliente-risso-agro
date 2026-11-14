import { leerCsv, type Hoja } from './planilla'

/** Lee un Excel (todas sus hojas) o un CSV. El lector de Excel se carga recién cuando hace falta. */
export async function leerArchivo(f: File): Promise<Hoja[]> {
  if (/\.(csv|txt)$/i.test(f.name)) return [{ nombre: f.name, filas: leerCsv(await f.text()) }]
  const { default: leerHojas } = await import('read-excel-file/browser')
  return (await leerHojas(f)).map((h) => ({ nombre: h.sheet, filas: h.data as Hoja['filas'] }))
}
