import type postgres from 'npm:postgres@3.4.5'
import {
  documentoLabel, fechaDocumento, mostrarProtocolo, resumenDocumento, type DocumentoVeterinario,
} from './documento-veterinario.ts'
import { coincideFecha, type PedidoVeterinario, type RespuestaVeterinaria } from './consulta-veterinaria.ts'

type Tx = postgres.TransactionSql
type Doc = { id: string; datos: DocumentoVeterinario }
type Factura = Extract<DocumentoVeterinario, { tipo: 'factura' }>

function motivoFactura(factura: Factura, trabajos: Doc[]): string {
  const protocolos = trabajos.flatMap(({ datos }) => datos.tipo === 'protocolo' && factura.referencias.includes(datos.protocolo)
    ? [mostrarProtocolo(datos.protocolo)] : [])
  if (protocolos.length) return 'Referencia en la factura: ' + [...new Set(protocolos)].join(', ') + '.'
  const partes = trabajos.filter(({ datos }) => datos.tipo === 'visita' && datos.emitido === factura.fecha && datos.total === factura.neto)
  if (partes.length) return 'Posible respaldo de la visita. Coinciden el neto y la fecha de emisión del resumen.'
  return 'Coincide la fecha de emisión.'
}

export async function buscarDocumentosVeterinarios(tx: Tx, empresa: string, pedido: PedidoVeterinario): Promise<RespuestaVeterinaria> {
  const { fecha, porEmision, tipo } = pedido
  if (!fecha) return { texto: '¿De qué fecha querés los documentos del veterinario? Probá «factura del veterinario del 20/08/2026».' }
  const condicion = fecha.anio
    ? tx`datos->>'fecha' = ${fecha.dia}`
    : tx`right(datos->>'fecha', 5) = ${fecha.dia.slice(5)}`
  const documentos = await tx<Doc[]>`with del_dia as (
    select id, datos from interno.wa_documento_veterinario
    where empresa_id = ${empresa} and estado = 'guardado' and ${condicion}
  )
  select d.id, d.datos from interno.wa_documento_veterinario d
  where d.empresa_id = ${empresa} and d.estado = 'guardado'
    and (exists (select 1 from del_dia where id = d.id)
      or (not ${porEmision} and exists (
        select 1 from del_dia dia
        where (d.datos->>'tipo' = 'factura' and (
          (dia.datos->>'tipo' = 'protocolo' and (d.datos->'referencias') ? (dia.datos->>'protocolo'))
          or (dia.datos->>'tipo' = 'visita' and d.datos->>'fecha' = dia.datos->>'emitido' and d.datos->>'neto' = dia.datos->>'total')
        )) or (d.datos->>'tipo' = 'constancia' and dia.datos->>'tipo' = 'protocolo' and d.datos->>'protocolo' = dia.datos->>'protocolo')
      )))
  order by d.datos->>'fecha', d.id
  limit 21`
  if (documentos.length > 20) return { texto: 'Hay varios documentos para esa fecha. Probá con el día, mes y año completos.' }
  const delDia = documentos.filter(d => coincideFecha(d.datos.fecha, fecha))
  const trabajos = delDia.filter(d => d.datos.tipo === 'visita' || d.datos.tipo === 'protocolo')
  const fechas = [...new Set((porEmision ? delDia.filter(d => d.datos.tipo === 'factura') : delDia).map(d => d.datos.fecha))]
  if (fechas.length > 1) return { texto: 'Encontré documentos de más de un año para ese día. Decime cuál querés: ' + fechas.map(fechaDocumento).join(', ') + '.' }
  const relacion = (d: Doc) => d.datos.tipo === 'factura' ? motivoFactura(d.datos, trabajos) : ''
  const encontrados = documentos.filter(d => tipo === 'facturas' ? d.datos.tipo === 'factura'
    && (porEmision || !trabajos.length || relacion(d) !== 'Coincide la fecha de emisión.')
    : d.datos.tipo !== 'factura' || relacion(d) !== 'Coincide la fecha de emisión.')
  const dia = fechas[0] ? fechaDocumento(fechas[0]) : fechaDocumento(fecha.dia).slice(0, fecha.anio ? 10 : 5)
  if (!encontrados.length) return { texto: 'No encontré ' + (tipo === 'facturas' ? 'facturas guardadas para ' : 'informes guardados del ') + dia + ' en tu empresa.' }
  const lineas: string[] = []
  for (const d of encontrados) {
    const r = relacion(d)
    lineas.push(resumenDocumento(d.datos) + (r ? '\n' + r : ''))
    if (tipo === 'muestras' && d.datos.tipo !== 'factura') {
      if (d.datos.tipo === 'protocolo' && d.datos.muestras.length)
        lineas.push('Identificadores y resultados informados:\n' + d.datos.muestras.join('\n'))
      else lineas.push('Este documento trae cantidades. No detalla resultados por animal.')
    }
  }
  return {
    texto: [`Documentos veterinarios del ${dia}`, ...lineas].join('\n\n'),
    archivos: encontrados.slice(0, 10).map(({ id, datos }) => ({
      id, etiqueta: datos.tipo === 'factura' ? 'Factura ' + datos.numero
        : datos.tipo === 'protocolo' || datos.tipo === 'constancia' ? documentoLabel[datos.tipo] + ' ' + mostrarProtocolo(datos.protocolo)
          : documentoLabel[datos.tipo],
    })),
  }
}
