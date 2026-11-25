import * as db from '../wa-webhook/db.ts'
import * as meta from '../wa-webhook/meta.ts'
import * as store from './store.ts'
import { pdfSemana } from './pdf.ts'
import { ejecutarEnvioSemana, type PeriodoSemana } from '../_shared/wa/semanal.ts'
import { norm } from '../_shared/wa/texto.ts'

// Con el nombre de la cuenta: quien atiende varios campos recibe uno de cada uno (varias cuentas, 14/11).
const archivo = (empresa: string, p: PeriodoSemana) =>
  `Troppero-resumen-${norm(empresa).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campo'}-${p.hasta}.pdf`

export async function enviarSolicitado(v: db.Vinculo, p: PeriodoSemana) {
  const datos = await db.datosSemana(v,p)
  const bytes = await pdfSemana(datos)
  const filename = archivo(datos.empresa,p)
  const id = await meta.subirDocumento(bytes,filename)
  const result = await meta.enviarDocumento(v.telefono,id,filename,`${v.cuenta ? `*${v.cuenta}*\n` : ''}Tu resumen del ${p.desde} al ${p.hasta}.`)
  await db.guardarSaliente({ ...result, telefono:v.telefono,vinculo:v })
}

export async function enviarProgramado(v: db.Vinculo, p: PeriodoSemana, template: string) {
  let filename = ''
  let mediaId = ''
  let lease = ''
  return await ejecutarEnvioSemana({
    reclamar: async () => { lease = await store.reclamar(v,p) ?? ''; return Boolean(lease) },
    preparar: async () => {
      const datos = await db.datosSemana(v,p)
      filename = archivo(datos.empresa,p)
      const bytes = await pdfSemana(datos)
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
