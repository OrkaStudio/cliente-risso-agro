/** Formatos originales que este adaptador sabe devolver por WhatsApp. */
export function canalOriginal(mime:string|null,tamano?:number|null):'image'|'document'|null {
  if(mime==='image/jpeg'||mime==='image/png')return tamano!=null&&tamano<=5*1024*1024?'image':null
  return ['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv'].includes(mime??'')?'document':null
}