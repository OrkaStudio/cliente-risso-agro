import type postgres from 'npm:postgres@3.4.5'
import {
  documentoLabel, fechaDocumento, mostrarProtocolo, pesos, resumenDocumento,
  type DocumentoVeterinario,
} from '../_shared/wa/documento-veterinario.ts'
import { empresaEnPiloto } from '../_shared/wa/servicios.ts'
import { hoyAR, norm } from '../_shared/wa/texto.ts'
import { pedidoVeterinario } from '../_shared/wa/consulta-veterinaria.ts'
import { buscarDocumentosVeterinarios } from '../_shared/wa/consulta-veterinaria-db.ts'
import type { Mensaje } from '../_shared/wa/tipos.ts'
import { guardarSaliente, sql, type Vinculo } from './db.ts'
import { enviarDocumento, subirDocumento } from './meta.ts'
import { descargarPdfVeterinario, mensajeTotalesEnConflicto } from './leer-pdf.ts'
type Estado = 'borrador' | 'guardado' | 'descartado'
type Doc = { id: string; datos: DocumentoVeterinario; estado: Estado }
type Tx = postgres.TransactionSql
type Responder = (m: Mensaje) => Promise<void>

async function productor(tx: Tx | typeof sql, v: Vinculo, bloquear = false): Promise<string | undefined> {
  const [a] = await tx<{ empresa: string }[]>`
    select e.nombre as empresa from public.wa_vinculo w
    join public.miembro_empresa m on m.empresa_id = w.empresa_id and m.user_id = w.user_id
    join auth.users u on u.id = w.user_id
    join public.empresa e on e.id = w.empresa_id
    where w.id = ${v.id} and w.empresa_id = ${v.empresa_id} and w.user_id = ${v.user_id}
      and w.activo and w.telefono = ${v.telefono}
      and u.phone_confirmed_at is not null and regexp_replace(u.phone, '\\D', '', 'g') = w.telefono
      and m.rol = 'dueno' ${bloquear ? tx`for share of w, m, u` : tx``}`
  return a?.empresa
}

function alcance(tx: Tx | typeof sql, v: Vinculo) {
  return tx`empresa_id = ${v.empresa_id} and (estado = 'guardado' or (estado = 'borrador' and actor_id = ${v.user_id}))`
}

async function relacion(v: Vinculo, doc: Doc): Promise<string> {
  const d = doc.datos
  if (d.tipo === 'factura' && d.referencias.length) {
    const presentes = await sql<{ protocolo: string }[]>`select distinct datos->>'protocolo' as protocolo
      from interno.wa_documento_veterinario where empresa_id = ${v.empresa_id} and estado = 'guardado'
      and datos->>'tipo' = 'protocolo' and datos->>'protocolo' = any(${d.referencias}::text[])`
    const falta = d.referencias.filter(p => !presentes.some(x => x.protocolo === p))
    return [
      'Protocolos que cita la factura: ' + d.referencias.map(mostrarProtocolo).join(', ') + '.',
      falta.length ? 'Informes pendientes de adjuntar: ' + falta.map(mostrarProtocolo).join(', ') + '.' : 'Ya tenés guardados los informes citados.',
    ].join('\n')
  }
  if (d.tipo === 'factura' || d.tipo === 'visita') {
    const condiciones = d.tipo === 'factura'
      ? sql`datos->>'tipo' = 'visita' and datos->>'emitido' = ${d.fecha} and datos->>'total' = ${String(d.neto)}`
      : sql`datos->>'tipo' = 'factura' and datos->>'fecha' = ${d.emitido} and datos->>'neto' = ${String(d.total)}`
    const otros = await sql`select id from interno.wa_documento_veterinario where empresa_id = ${v.empresa_id}
      and estado = 'guardado' and ${condiciones} limit 2`
    if (otros.length === 1) return 'Hay un posible respaldo: coinciden el neto de la factura y la fecha de emisión. Revisá ambos PDF.'
  }
  if (d.tipo === 'constancia') {
    const [protocolo] = await sql`select id from interno.wa_documento_veterinario where empresa_id = ${v.empresa_id}
      and estado = 'guardado' and datos->>'tipo' = 'protocolo' and datos->>'protocolo' = ${d.protocolo} limit 1`
    if (protocolo) return 'Ya tenés guardado un informe con este número de protocolo.'
  }
  return ''
}

async function vista(v: Vinculo, doc: Doc, empresa: string): Promise<Mensaje> {
  const id = (accion: string) => `vetdoc:${accion}:${doc.id}`
  const enlace = await relacion(v, doc)
  const destino = doc.estado === 'borrador' ? `¿Querés que guarde el original en ${empresa}?` : 'Guardado en ' + empresa + '.'
  const muestras = doc.datos.tipo === 'protocolo' && doc.datos.muestras.length > 0
  return {
    texto: [resumenDocumento(doc.datos), enlace, destino].filter(Boolean).join('\n\n'),
    botones: [
      ...(doc.estado === 'borrador' ? [{ id: id('guardar'), titulo: 'Guardar' }, { id: id('descartar'), titulo: 'Descartar' }] : []),
      muestras ? { id: id('muestras'), titulo: 'Ver muestras' } : { id: id('original'), titulo: 'Ver PDF' },
    ],
  }
}

async function recibirPdf(v: Vinculo, empresa: string, id: string, media: string, responder: Responder): Promise<void> {
  let pdf: Awaited<ReturnType<typeof descargarPdfVeterinario>>
  try {
    pdf = await descargarPdfVeterinario(media)
  } catch {
    await responder({ texto: 'No pude abrir el PDF. Reenviame el original, sin contraseña y de hasta 5 MB.' })
    return
  }
  const { bytes, doc: datos } = pdf
  if (!datos) {
    await responder({ texto: 'Abrí el PDF, pero no pude leer los datos con seguridad. Si es un escaneo, ¿me mandás una foto de la página donde aparece el total o el resultado?' })
    return
  }
  if (datos.tipo === 'totales_en_conflicto') {
    await responder({ texto: mensajeTotalesEnConflicto(datos.totales) })
    return
  }
  const d = datos
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))].map(b => b.toString(16).padStart(2, '0')).join('')
  const doc = await sql.begin(async tx => {
    if (!(await productor(tx, v, true))) return null
    const [nuevo] = await tx<Doc[]>`insert into interno.wa_documento_veterinario (id, empresa_id, actor_id, sha256, identidad, datos, original)
      values (${id}, ${v.empresa_id}, ${v.user_id}, ${hash}, ${d.identidad}, ${tx.json(d)}, ${bytes})
      on conflict do nothing returning id, datos, estado`
    if (nuevo) return nuevo
    const [anterior] = await tx<Doc[]>`select id, datos, estado from interno.wa_documento_veterinario
      where ${alcance(tx, v)} and (sha256 = ${hash} or identidad = ${d.identidad})
      order by (sha256 = ${hash}) desc limit 1`
    return anterior ?? null
  })
  if (!doc) {
    await responder({ texto: 'No pude abrir una propuesta para este PDF. Revisá los documentos veterinarios de tu cuenta.' })
    return
  }
  if (d.tipo === 'factura' && doc.datos.tipo === 'factura' && (d.total !== doc.datos.total || d.neto !== doc.datos.neto)) {
    await responder({ texto: 'Ya hay una factura con ese mismo número y otro importe. Revisá los originales antes de cargarla.' })
    return
  }
  const m = await vista(v, doc, empresa)
  if (doc.id !== id) m.texto = 'Ya recibí este documento.\n\n' + m.texto
  await responder(m)
}

async function resolver(v: Vinculo, id: string, guardar: boolean): Promise<string> {
  return await sql.begin(async tx => {
    if (!(await productor(tx, v, true))) return 'Tu acceso cambió. Revisá el vínculo de WhatsApp.'
    const [doc] = await tx<Doc[]>`select id, datos, estado from interno.wa_documento_veterinario
      where id = ${id} and empresa_id = ${v.empresa_id} and actor_id = ${v.user_id} for update`
    if (doc?.estado === 'guardado') return 'Este PDF ya está guardado.'
    if (doc?.estado !== 'borrador') return 'Esta propuesta ya no está disponible.'
    await tx`update interno.wa_documento_veterinario set estado = ${guardar ? 'guardado' : 'descartado'}, actualizado_at = now(),
      original = case when ${guardar} then original else null end where id = ${id}`
    return guardar ? 'Guardé el PDF. Lo podés consultar con «documentos veterinarios».' : 'Descarté el PDF.'
  })
}

export async function atenderDocumentosVeterinarios(
  v: Vinculo, mensajeId: string, entrada: { pdf?: string; texto?: string; boton?: string; hoy?: string }, responder: Responder,
): Promise<boolean> {
  if (!empresaEnPiloto(Deno.env.get('WA_DOCUMENTOS_VET_EMPRESAS'), v.empresa_id)) return false
  const boton = entrada.boton?.match(/^vetdoc:(abrir|original|muestras|guardar|descartar):([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i)
  const pedido = /^(?:ver )?documentos veterinarios$/.test(norm(entrada.texto ?? ''))
  const consulta = !entrada.boton && pedidoVeterinario(entrada.texto ?? '', entrada.hoy ?? hoyAR())
  if (!entrada.pdf && !boton && !pedido && !consulta) return false
  const empresa = await productor(sql, v)
  if (!empresa) {
    if (entrada.pdf) return false
    await responder({ texto: 'Los documentos veterinarios requieren un vínculo habilitado como productor de esta empresa.' })
    return true
  }
  if (entrada.pdf) {
    await recibirPdf(v, empresa, mensajeId, entrada.pdf, responder)
  } else if (boton) {
    const [, accion, id] = boton
    if (accion === 'guardar' || accion === 'descartar') {
      await responder({ texto: await resolver(v, id, accion === 'guardar') })
      return true
    }
    if (accion === 'original') {
      const [fila] = await sql<{ original: Uint8Array }[]>`select original from interno.wa_documento_veterinario
        where id = ${id} and ${alcance(sql, v)}`
      if (!fila) { await responder({ texto: 'Este PDF ya no está disponible.' }); return true }
      const nombre = 'documento-veterinario.pdf'
      const media = await subirDocumento(fila.original, nombre)
      const envio = await enviarDocumento(v.telefono, media, nombre, 'Original recibido en Troppero')
      await guardarSaliente({ wamid: envio.wamid, telefono: v.telefono, vinculo: v, cuerpo: envio.cuerpo })
      return true
    }
    const [doc] = await sql<Doc[]>`select id, datos, estado from interno.wa_documento_veterinario
      where id = ${id} and ${alcance(sql, v)}`
    if (!doc) { await responder({ texto: 'Este documento ya no está disponible.' }); return true }
    if (accion === 'muestras' && doc.datos.tipo === 'protocolo' && doc.datos.muestras.length) {
      await responder({ texto: ['Muestras del informe · ' + mostrarProtocolo(doc.datos.protocolo), ...doc.datos.muestras].join('\n'),
        botones: [{ id: `vetdoc:abrir:${id}`, titulo: 'Volver al resumen' }, { id: `vetdoc:original:${id}`, titulo: 'Ver PDF' }] })
    } else await responder(await vista(v, doc, empresa))
  } else if (consulta) {
    const r = await sql.begin(async tx => {
      if (!(await productor(tx, v, true))) return { texto: 'Tu acceso cambió. Revisá el vínculo de WhatsApp.' }
      return await buscarDocumentosVeterinarios(tx, v.empresa_id, consulta)
    })
    const archivos = 'archivos' in r ? r.archivos : undefined
    const abrir = (id: string) => 'vetdoc:original:' + id
    await responder({
      texto: r.texto,
      ...(archivos?.length === 1 ? { botones: [{ id: abrir(archivos[0].id), titulo: 'Ver PDF' }] }
        : archivos?.length ? { lista: { boton: 'Ver PDF', filas: archivos.map(a => ({ id: abrir(a.id), titulo: a.etiqueta })) } } : {}),
    })
  } else {
    const filas = await sql<Doc[]>`select id, datos, estado from interno.wa_documento_veterinario where ${alcance(sql, v)}
      order by actualizado_at desc limit 10`
    await responder(filas.length ? {
      texto: 'Últimos documentos veterinarios de ' + empresa,
      lista: { boton: 'Ver documentos', filas: filas.map(f => ({
        id: `vetdoc:abrir:${f.id}`, titulo: documentoLabel[f.datos.tipo],
        detalle: [f.estado === 'guardado' ? 'Guardado' : 'Para confirmar', fechaDocumento(f.datos.fecha),
          f.datos.tipo === 'factura' ? pesos(f.datos.total) : ''].filter(Boolean).join(' · '),
      })) },
    } : { texto: 'Todavía no hay documentos veterinarios. Reenviame un PDF y te muestro un resumen para revisar.' })
  }
  return true
}
