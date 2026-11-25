import { PDFDocument } from 'npm:pdf-lib@1.17.1'
import { pdfSemana } from '../../../functions/wa-resumen-semanal/pdf.ts'
import { demo } from './fixture.ts'

const filename=Deno.args[0]
if(!filename) throw new Error('Indicá la ruta del PDF sintético')
const bytes=await pdfSemana(demo)
await Deno.writeFile(filename,bytes)
const doc=await PDFDocument.load(bytes)
if(doc.getPageCount()<1 || doc.getTitle()!=='Tropero - Resumen semanal - 2026-10-16') throw new Error('PDF demo inválido')
const long=structuredClone(demo)
long.observaciones=Array.from({length:150},(_,i)=>({...demo.observaciones[0],potrero:String(i),novedad:'REGISTRO-'+i+' '+ 'URLsinEspacio'.repeat(50)+' ñ á é í ó ú'}))
const large=await pdfSemana(long)
const many=await PDFDocument.load(large)
if(many.getPageCount()<10) throw new Error('Se truncó el informe largo')
await Deno.writeFile(filename.replace(/\.pdf$/, '-largo.pdf'),large)
console.log(JSON.stringify({demo_pages:doc.getPageCount(),long_pages:many.getPageCount(),long_observations:150,output:filename}))
