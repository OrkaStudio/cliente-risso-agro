import { comoUsuario, sql, type Vinculo } from './db.ts'

export type Adjunto = { id: string; media: string; nombre: string; tipo: 'pdf' | 'planilla'; fecha: string; esUltimaEntrada: boolean }

export async function adjuntosDelTurno(v: Vinculo, mensajeId: string, respuestaA?: string): Promise<Adjunto[]> {
  const filas = await sql<{ id: string; media: string; nombre: string; mime: string | null; fecha: string; esUltimaEntrada: boolean }[]>`
    select a.id, a.cuerpo #>> '{document,id}' as media,
      coalesce(a.cuerpo #>> '{document,filename}', 'Documento') as nombre,
      a.cuerpo #>> '{document,mime_type}' as mime,
      to_char(a.created_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') as fecha,
      coalesce(a.id=previo.id and a.created_at >= m.created_at - interval '5 minutes', false) as "esUltimaEntrada"
    from wa_mensaje m join wa_mensaje a on a.vinculo_id=m.vinculo_id and a.empresa_id=m.empresa_id
    left join lateral (
      select p.id from wa_mensaje p where p.vinculo_id=m.vinculo_id and p.empresa_id=m.empresa_id
        and p.direccion='entrante' and p.created_at < m.created_at and p.created_at >= m.created_at - interval '5 minutes'
      order by p.created_at desc, p.id desc limit 1
    ) previo on true
    where m.id=${mensajeId} and m.vinculo_id=${v.id} and m.empresa_id=${v.empresa_id}
      and a.direccion='entrante' and a.tipo='document' and a.cuerpo #>> '{document,id}' is not null
      and (a.id=m.id or a.wamid=${respuestaA ?? null} or (${respuestaA ?? null}::text is null
        and a.created_at < m.created_at and a.created_at >= m.created_at - interval '15 minutes'))
      and (a.cuerpo #>> '{document,mime_type}'='application/pdf'
        or a.cuerpo #>> '{document,filename}' ~* '\.(pdf|xlsx|csv)$')
    order by (a.id=m.id) desc, (a.wamid=${respuestaA ?? null}) desc nulls last, a.created_at desc, a.id desc limit 6`
  return filas.flatMap(a => {
    const tipo = a.mime === 'application/pdf' || /\.pdf$/i.test(a.nombre) ? 'pdf' : /\.(xlsx|csv)$/i.test(a.nombre) ? 'planilla' : null
    return tipo ? [{ ...a, tipo }] : []
  })
}

export async function contextoDelArchivo(v: Vinculo, mensajeId: string): Promise<{ texto: string; fecha: string } | undefined> {
  const [previo] = await sql<{ texto: string | null; fecha: string }[]>`
    select coalesce(anterior.cuerpo #>> '{text,body}', (
      select c.texto from captura c where c.mensaje_id=anterior.id and c.empresa_id=anterior.empresa_id
        and c.user_id=${v.user_id} and c.entrada='audio' and c.texto is not null
      order by c.created_at, c.id limit 1)) as texto,
      to_char(anterior.created_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') as fecha
    from wa_mensaje m join wa_mensaje anterior on anterior.vinculo_id=m.vinculo_id and anterior.empresa_id=m.empresa_id
    where m.id=${mensajeId} and m.vinculo_id=${v.id} and m.empresa_id=${v.empresa_id}
      and anterior.direccion='entrante' and anterior.created_at < m.created_at
      and anterior.created_at >= m.created_at - interval '5 minutes'
    order by anterior.created_at desc, anterior.id desc limit 1`
  return previo?.texto ? { texto: previo.texto.slice(0, 1000), fecha: previo.fecha } : undefined
}

export async function ultimaVacunacionIncompleta(v: Vinculo, ids: string[]) {
  const [previa] = await sql<{ estado: string; propuesta: { archivo: string; campo?: string; vacuna?: string; fecha?: string } }[]>`
    select c.propuesta, c.estado from captura c join wa_mensaje m on m.id=c.mensaje_id
    where m.vinculo_id=${v.id} and m.empresa_id=${v.empresa_id}
      and c.user_id=${v.user_id} and c.empresa_id=${v.empresa_id}
      and c.propuesta->>'tipo'='vacunacion_planilla' and c.propuesta->>'archivo'=any(${ids}::text[])
    order by c.created_at desc, c.id desc limit 1`
  // Una propuesta resuelta o lista para confirmar no se reabre por una consulta lateral.
  return previa?.estado === 'incompleta' ? previa.propuesta : undefined
}

export type Coincidencia = { rfid: string; animal: string; campo: string | null; potrero: string | null }

export function cruzarCaravanas(v: Vinculo, rfids: string[], fecha: string | null) {
  return comoUsuario(v, tx => tx<Coincidencia[]>`
    select c.numero_rfid as rfid, a.id as animal, p.campo_id as campo, p.id as potrero
    from caravana c join animal a on a.id=c.animal_id and a.empresa_id=c.empresa_id
    left join potrero p on p.id=a.potrero_id and p.empresa_id=a.empresa_id
    where c.empresa_id=${v.empresa_id} and c.numero_rfid=any(${rfids}::text[]) and a.estado='activo'
      and (case when ${fecha}::date is null then c.vigente
        else c.fecha_alta <= ${fecha}::date and (c.fecha_baja is null or c.fecha_baja >= ${fecha}::date) end)`)
}
