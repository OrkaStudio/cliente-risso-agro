// Dependencia sólo del servidor: PDF vectorial, sin servicio externo ni datos enviados a un modelo.
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import { lineasSemana, type SemanaCampo } from '../_shared/wa/semanal.ts'

export async function pdfSemana(datos: SemanaCampo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.075, 0.106, 0.086), terracota = rgb(0.72, 0.36, 0.18), bone = rgb(0.957, 0.945, 0.914)
  const W = 595.28, H = 841.89, margin = 44, width = W - margin * 2
  const printable = (value: string) => [...value.normalize('NFC')].map(c => {
    try { normal.encodeText(c); return c } catch { return '?' }
  }).join('')
  let page = pdf.addPage([W, H]), y = H - 145
  function addPage() {
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bone })
    page.drawText('TROPERO', { x: margin, y: H - 54, font: bold, size: 24, color: terracota })
    page.drawText('Tu campo, a mano.', { x: margin, y: H - 75, font: normal, size: 10, color: ink })
    page.drawText('RESUMEN SEMANAL', { x: margin, y: H - 111, font: bold, size: 16, color: ink })
    page.drawLine({ start: { x: margin, y: 38 }, end: { x: W - margin, y: 38 }, color: terracota, thickness: 0.6 })
    page.drawText(`Tropero | ${datos.periodo.desde} al ${datos.periodo.hasta} | Página ${pdf.getPageCount()}`, { x: margin, y: 24, font: normal, size: 8, color: ink })
  }
  addPage()
  function draw(text: string, title: boolean) {
    const font = title ? bold : normal, size = title ? 12 : 10, step = title ? 17 : 14
    const clean = printable(text)
    const words = clean.split(/\s+/)
    const wrapped: string[] = []
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue }
      if (line) wrapped.push(line)
      // Una palabra/URL extensa también se parte; nunca sale del margen.
      let chunk = ''
      for (const c of word) {
        if (font.widthOfTextAtSize(chunk + c, size) > width) { wrapped.push(chunk); chunk = '' }
        chunk += c
      }
      line = chunk
    }
    if (line) wrapped.push(line)
    if (title) { if (y < 100) { page = pdf.addPage([W, H]); y = H - 145; addPage() }; y -= 7 }
    for (const content of wrapped) {
      if (y < 62) { page = pdf.addPage([W, H]); y = H - 145; addPage() }
      page.drawText(content, { x: margin, y, font, size, color: title ? terracota : ink })
      y -= step
    }
    y -= 3
  }
  for (const line of lineasSemana(datos)) draw(line.texto, line.tipo === 'titulo')
  pdf.setTitle(`Tropero - Resumen semanal - ${datos.periodo.hasta}`)
  pdf.setAuthor('Tropero')
  pdf.setSubject('Registros del campo: lluvia, recorridas, novedades, gastos, hacienda y vencimientos')
  return await pdf.save()
}
