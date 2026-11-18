import { leerPdfVeterinario } from '../../../functions/wa-webhook/leer-pdf.ts'

type Valor = string | number
type Caso = {
  id: string
  grupo: 'control' | 'evaluacion'
  esperado: Record<string, Valor | number[]> | null
  variantes: { metodo: string; archivo: string }[]
}

const casos: Caso[] = JSON.parse(await Deno.readTextFile(Deno.args[0]))
for (const { id, grupo, esperado, variantes } of casos) {
  for (const { metodo, archivo } of variantes) {
    const inicio = performance.now()
    const documento = await leerPdfVeterinario(await Deno.readFile(archivo))
    const obtenido: Record<string, unknown> | null = documento && {
      ...documento,
      ...(documento.tipo === 'factura' ? { cuit: documento.identidad?.split(':')[1] } : {}),
    }
    const campos = Object.entries(esperado ?? {}).map(([campo, valor]) => {
      const recibido = obtenido?.[campo] ?? null
      const coincide = Array.isArray(valor) && Array.isArray(recibido)
        ? valor.length === recibido.length && valor.every(n => recibido.includes(n))
        : recibido === valor
      return { campo, esperado: valor, obtenido: recibido, coincide }
    })
    const estado = esperado === null ? obtenido ? 'aceptacion_indebida' : 'rechazo_correcto'
      : !obtenido ? 'rechazo' : obtenido.tipo !== esperado.tipo ? 'tipo_incorrecto'
      : campos.every(c => c.coincide) ? 'correcto' : 'campos_incorrectos'
    const aceptacionIndebida = esperado === null && documento
      ? { tipo: documento.tipo, ...('total' in documento ? { total: documento.total } : {}) }
      : undefined
    console.log(JSON.stringify({ id, grupo, metodo, estado, ms: Math.round(performance.now() - inicio),
      campos, aceptacionIndebida }))
  }
}
