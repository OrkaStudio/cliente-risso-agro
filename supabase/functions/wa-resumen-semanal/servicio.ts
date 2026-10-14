import * as db from '../wa-webhook/db.ts'
import * as meta from '../wa-webhook/meta.ts'
import * as store from './store.ts'
import { pdfSemana } from './pdf.ts'
import { ejecutarEnvioSemana, type PeriodoSemana } from '../_shared/wa/semanal.ts'

export async function enviarSolicitado(v: db.Vinculo, p: PeriodoSemana) {
  const bytes = await pdfSemana(await db.datosSemana(v,p))
  const filename = `Tropero-resumen-${p.hasta}.pdf`
  const id = await meta.subirDocumento(bytes,filename)
  const result = await meta.enviarDocumento(v.telefono,id,filename,`Tu resumen del ${p.desde} al ${p.hasta}.`)
  await db.guardarSaliente({ ...result, telefono:v.telefono,vinculo:v })
}

export async function enviarProgramado(v: db.Vinculo, p: PeriodoSemana, template: string) {
  const filename = `Tropero-resumen-${p.hasta}.pdf`
  let mediaId = ''
  let lease = ''
  return await ejecutarEnvioSemana({
    reclamar: async () => { lease = await store.reclamar(v,p) ?? ''; return Boolean(lease) },
    preparar: async () => {
      const bytes = await pdfSemana(await db.datosSemana(v,p))
      mediaId = await meta.subirDocumento(bytes,filename)
    },
    listoParaEnviar: () => store.sigueActivo(v,p,lease),
    marcarEnviando: () => store.marcarEnviando(v,p,lease),
    enviar: async () => {
      const result = await meta.enviarDocumento(v.telefono,mediaId,filename,'',template)
      await store.estado(v,p,lease,'enviado',result.wamid)
      // Un fallo técnico al registrar el mensaje no cambia el envío a reintentable.
      await db.guardarSaliente({ ...result, telefono:v.telefono,vinculo:v }).catch(() => console.error('semanal: registro técnico pendiente'))
      return result.wamid
    },
    guardarEnviado: wamid => store.estado(v,p,lease,'enviado',wamid),
    fallo: async fase => { await store.estado(v,p,lease,fase==='envio'?'incierto':'error_preparacion',null,fase==='envio'?'Resultado de entrega no confirmado; revisar Meta antes de repetir.':'Fallo al preparar el informe; reintento limitado.'); },
  })
}
