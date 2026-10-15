// Acceso a la base del bot.
//
// Dos modos, a propósito:
// · Tablas del bot (wa_vinculo, wa_mensaje, captura): como dueño, sin RLS.
// · Datos del productor (lluvia, gastos, hacienda...): SIEMPRE con
//   `comoUsuario`, que abre una transacción con el rol `authenticated` y los
//   claims del usuario vinculado. Rige RLS igual que en la app y created_by
//   queda con su id. Nunca con la clave de servicio.

import postgres from 'npm:postgres@3.4.5'
import { sumarDias,hoyAR } from '../_shared/wa/texto.ts'
import { empresaEnPiloto } from '../_shared/wa/servicios.ts'
import type { Agua, Borrador, Campo, Categoria, Contexto, Electrico, InfraNueva, Pasto, Pendiente, PendienteInfra } from '../_shared/wa/tipos.ts'
import type { PotreroDibujado } from '../_shared/wa/resolver.ts'
import type { FilaHacienda, FilaVencimiento } from '../_shared/wa/respuestas.ts'
import type { PeriodoSemana, SemanaCampo } from '../_shared/wa/semanal.ts'
import type { ElementoMapa, MapaCampo } from '../_shared/wa/mapa.ts'

// Pooler en modo transacción: sin prepared statements.
export const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 4, idle_timeout: 20 })
type Tx = postgres.TransactionSql

export type Vinculo = {
  id: string
  telefono: string
  user_id: string
  empresa_id: string
  /** Puede traer un PendienteInfra: el webhook lo separa antes de usarlo. */
  pendiente: Pendiente | PendienteInfra | null
  pendiente_at: string | null
}

export async function vinculoDe(telefono: string): Promise<Vinculo | null> {
  const [v] = await sql<Vinculo[]>`
    select id, telefono, user_id, empresa_id, pendiente, pendiente_at
    from wa_vinculo where telefono = ${telefono} and activo`
  return v ?? null
}

/** Guarda el mensaje entrante. null = ya estaba (Meta lo reenvió): no se procesa de nuevo. */
export async function guardarEntrante(m: {
  wamid: string
  telefono: string
  tipo: string
  cuerpo: unknown
  vinculo: Vinculo | null
}): Promise<string | null> {
  return await sql.begin(async tx => {
  const [r] = await tx<{ id: string }[]>`
    insert into wa_mensaje (wamid, direccion, telefono, vinculo_id, empresa_id, tipo, cuerpo)
    values (${m.wamid}, 'entrante', ${m.telefono}, ${m.vinculo?.id ?? null}, ${m.vinculo?.empresa_id ?? null},
            ${m.tipo}, ${sql.json(m.cuerpo as postgres.JSONValue)})
    on conflict (wamid) do nothing
    returning id`
  if (r && m.vinculo && Deno.env.get('WA_QUEUE_ENABLED') === 'true' && empresaEnPiloto(Deno.env.get('WA_PILOT_TENANTS'),m.vinculo.empresa_id))
    await tx`insert into interno.wa_cola(mensaje_id,vinculo_id) values(${r.id},${m.vinculo.id})`
  return r?.id ?? null
  }) as string | null
}

export async function guardarSaliente(m: {
  wamid: string
  telefono: string
  vinculo: Vinculo | null
  cuerpo: unknown
}): Promise<void> {
  const tipo = (m.cuerpo as { type?: string }).type ?? 'text'
  await sql`
    insert into wa_mensaje (wamid, direccion, telefono, vinculo_id, empresa_id, tipo, cuerpo, estado, estado_at)
    values (${m.wamid}, 'saliente', ${m.telefono}, ${m.vinculo?.id ?? null}, ${m.vinculo?.empresa_id ?? null},
            ${tipo}, ${sql.json(m.cuerpo as postgres.JSONValue)}, 'sent', now())
    on conflict (wamid) do nothing`
}

export async function actualizarEstado(wamid: string, estado: string, error: unknown): Promise<void> {
  await sql`
    update wa_mensaje set estado = ${estado}, estado_at = now(),
      error = ${error ? sql.json(error as postgres.JSONValue) : null}
    where wamid = ${wamid}`
}

export async function guardarPendiente(vinculoId: string, p: Pendiente | PendienteInfra | null): Promise<void> {
  await sql`
    update wa_vinculo set pendiente = ${p ? sql.json(p as unknown as postgres.JSONValue) : null},
      pendiente_at = ${p ? sql`now()` : null}
    where id = ${vinculoId}`
}

/** La fecha relativa del mensaje no cambia si el procesamiento cruza medianoche. */
export async function fechaDeEntrada(v:Vinculo,mensajeId:string):Promise<string>{
  const [r]=await sql<{created_at:string}[]>`select created_at::text from wa_mensaje where id=${mensajeId} and vinculo_id=${v.id} and empresa_id=${v.empresa_id} and direccion='entrante'`
  if(!r)throw Error('Mensaje no disponible para este vínculo')
  return hoyAR(new Date(r.created_at))
}

// ── Capturas ───────────────────────────────────────────────────────────

export async function crearCaptura(c: {
  vinculo: Vinculo
  mensajeId: string
  entrada: 'texto' | 'audio' | 'foto' | 'boton'
  texto: string | null
}): Promise<string> {
  const [r] = await sql<{ id: string }[]>`
    insert into captura (empresa_id, user_id, mensaje_id, entrada, texto)
    values (${c.vinculo.empresa_id}, ${c.vinculo.user_id}, ${c.mensajeId}, ${c.entrada}, ${c.texto})
    returning id`
  return r.id
}

export type CambioCaptura = {
  estado?: string
  interpretacion?: unknown
  interpretadoPor?: string
  propuesta?: unknown
  escritoTabla?: string
  escritoId?: string
  notas?: string[]
  tokensEntrada?: number
  tokensSalida?: number
}

export async function actualizarCaptura(id: string, c: CambioCaptura): Promise<void> {
  const j = (v: unknown) => (v === undefined ? null : sql.json(v as postgres.JSONValue))
  await sql`
    update captura set
      estado = coalesce(${c.estado ?? null}::estado_captura, estado),
      interpretacion = coalesce(${j(c.interpretacion)}, interpretacion),
      interpretado_por = coalesce(${c.interpretadoPor ?? null}, interpretado_por),
      propuesta = coalesce(${j(c.propuesta)}, propuesta),
      escrito_tabla = coalesce(${c.escritoTabla ?? null}, escrito_tabla),
      escrito_id = coalesce(${c.escritoId ?? null}::uuid, escrito_id),
      notas = notas || ${sql.array(c.notas ?? [])}::text[],
      tokens_entrada = coalesce(tokens_entrada, 0) + ${c.tokensEntrada ?? 0},
      tokens_salida = coalesce(tokens_salida, 0) + ${c.tokensSalida ?? 0},
      updated_at = now()
    where id = ${id}`
}

/**
 * Toma la propuesta para confirmarla. Si dos "Sí" llegan juntos, sólo uno la
 * toma: el otro recibe false y no escribe.
 */
export async function tomarPropuesta(id: string): Promise<boolean> {
  const r = await sql`update captura set estado = 'confirmada', updated_at = now()
                      where id = ${id} and estado = 'propuesta' returning id`
  return r.length === 1
}

export async function estadoCaptura(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const [r] = await sql<{ estado: string }[]>`select estado from captura where id = ${id}`
  return r?.estado ?? null
}

// ── Como el usuario ────────────────────────────────────────────────────

export async function comoUsuario<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`
    await tx.unsafe('set local role authenticated')
    return fn(tx)
  })) as T
}

/** Un snapshot consistente para el PDF; lee tanto registros de app como de WhatsApp. */
export async function datosSemana(v: Vinculo, periodo: PeriodoSemana): Promise<SemanaCampo> {
  return await sql.begin('isolation level repeatable read read only', async tx => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: v.user_id, role: 'authenticated' })}, true)`
    await tx.unsafe('set local role authenticated')
    const [empresa] = await tx<{ nombre: string }[]>`select nombre from empresa where id=${v.empresa_id}
      and exists(select 1 from miembro_empresa where user_id=${v.user_id} and empresa_id=${v.empresa_id})`
    if (!empresa) throw new Error('El vínculo no tiene acceso a esta empresa')
    const lluvia = await tx<SemanaCampo['lluvia']>`select c.nombre as campo,count(*)::int as mediciones,sum(l.mm)::float8 as mm
      from lluvia l join campo c on c.id=l.campo_id where l.empresa_id=${v.empresa_id}
      and l.fecha between ${periodo.desde} and ${periodo.hasta} and l.fuente='manual' group by c.id,c.nombre order by c.nombre`
    const recorridas = await tx<SemanaCampo['recorridas']>`select c.nombre as campo,count(distinct r.fecha)::int as dias,
      count(o.id)::int as observaciones,count(distinct o.potrero_id)::int as potreros
      from recorrida r join campo c on c.id=r.campo_id left join observacion_potrero o on o.recorrida_id=r.id
      where r.empresa_id=${v.empresa_id} and r.fecha between ${periodo.desde} and ${periodo.hasta}
      group by c.id,c.nombre order by c.nombre`
    const observaciones = await tx<SemanaCampo['observaciones']>`select r.fecha::text,c.nombre as campo,p.nombre as potrero,
      o.agua::text,o.pasto::text,o.electrico::text,o.conteo,o.novedad
      from observacion_potrero o join recorrida r on r.id=o.recorrida_id join campo c on c.id=r.campo_id join potrero p on p.id=o.potrero_id
      where o.empresa_id=${v.empresa_id} and r.fecha between ${periodo.desde} and ${periodo.hasta}
      order by r.fecha,c.nombre,p.nombre,o.id`
    const gastos = await tx<SemanaCampo['gastos']>`select coalesce(c.nombre,'Sin campo') as campo,coalesce(cat.nombre,'Sin categoría') as categoria,
      count(*)::int as cantidad,sum(m.monto)::float8 as total from movimiento_financiero m
      left join campo c on c.id=m.campo_id left join categoria_movimiento cat on cat.id=m.categoria_id
      where m.empresa_id=${v.empresa_id} and m.tipo='gasto' and m.estado<>'anulado'
      and m.fecha_devengo between ${periodo.desde} and ${periodo.hasta} group by c.nombre,cat.nombre order by c.nombre,cat.nombre`
    const hacienda = await tx<SemanaCampo['hacienda']>`select coalesce(c.nombre,'Sin potrero asignado') as campo,a.categoria::text,count(*)::int as cabezas
      from animal a left join potrero p on p.id=a.potrero_id left join campo c on c.id=p.campo_id
      where a.empresa_id=${v.empresa_id} and a.estado='activo' group by c.nombre,a.categoria order by c.nombre,a.categoria`
    const vencimientos = await tx<SemanaCampo['vencimientos']>`select m.fecha_vencimiento::text as fecha,m.tipo::text,m.monto::float8 as monto,
      m.descripcion,m.contraparte,cat.nombre as categoria from movimiento_financiero m
      left join categoria_movimiento cat on cat.id=m.categoria_id where m.empresa_id=${v.empresa_id} and m.estado='pendiente'
      and m.fecha_vencimiento is not null and m.fecha_vencimiento<=${periodo.vencimientosHasta} order by m.fecha_vencimiento,m.id`
    return { empresa: empresa.nombre, periodo, lluvia, recorridas, observaciones, gastos, hacienda, vencimientos }
  }) as SemanaCampo
}

export async function contexto(v: Vinculo, hoy: string): Promise<Contexto & { categoriasOcr: { id: string; nombre: string; grupo: string | null; aplica_a: string | null }[] }> {
  const [u] = await sql<{ nombre: string | null }[]>`
    select nullif(trim(raw_user_meta_data->>'nombre'), '') as nombre from auth.users where id = ${v.user_id}`
  return comoUsuario(v.user_id, async (tx) => {
    const filas = await tx<{ campo_id: string; campo: string; potrero_id: string | null; potrero: string | null }[]>`
      select c.id as campo_id, c.nombre as campo, p.id as potrero_id, p.nombre as potrero
      from campo c left join potrero p on p.campo_id = c.id
      where c.empresa_id = ${v.empresa_id}
      order by c.nombre, p.nombre`
    const campos: Campo[] = []
    for (const f of filas) {
      let c = campos.find((x) => x.id === f.campo_id)
      if (!c) campos.push((c = { id: f.campo_id, nombre: f.campo, potreros: [] }))
      if (f.potrero_id) c.potreros.push({ id: f.potrero_id, nombre: f.potrero! })
    }
    for (const c of campos) c.potreros.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
    const cats = await tx<{ id: string; nombre: string; grupo: string | null; aplica_a: string | null }[]>`
      select id, nombre, grupo::text, aplica_a::text from categoria_movimiento
      where (empresa_id is null or empresa_id = ${v.empresa_id})
      order by empresa_id nulls first, nombre`
    const categoriasGasto: Categoria[] = cats
      .filter((c) => c.aplica_a === null || c.aplica_a === 'gasto')
      .map((c) => ({ id: c.id, nombre: c.nombre }))
    return { hoy, nombre: u?.nombre ?? null, campos, categoriasGasto, categoriasOcr: cats }
  })
}

export type TablaCarga = 'lluvia' | 'movimiento_financiero' | 'observacion_potrero'

/** Comprueba el ID concreto con RLS y dentro de la empresa del vínculo. */
export function verificarCarga(v: Vinculo, tabla: TablaCarga, id: string): Promise<boolean> {
  return comoUsuario(v.user_id, async (tx) => {
    const filas = tabla === 'lluvia'
      ? await tx`select id from lluvia where id = ${id} and empresa_id = ${v.empresa_id}`
      : tabla === 'observacion_potrero'
      ? await tx`select id from observacion_potrero where id = ${id} and empresa_id = ${v.empresa_id}`
      : await tx`select id from movimiento_financiero where id = ${id} and empresa_id = ${v.empresa_id}`
    return filas.length === 1
  })
}

/** Una captura confirmada puede estar todavía escribiendo; su estado solo no prueba la carga. */
export async function verificarCargaDeCaptura(v: Vinculo, id: string): Promise<boolean | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const [c] = await sql<{ escrito_tabla: string | null; escrito_id: string | null }[]>`
    select escrito_tabla, escrito_id from captura
    where id = ${id} and empresa_id = ${v.empresa_id} and user_id = ${v.user_id}`
  const tablas: string[] = ['lluvia', 'movimiento_financiero', 'observacion_potrero']
  if (!c?.escrito_id || !c.escrito_tabla || !tablas.includes(c.escrito_tabla)) return null
  return verificarCarga(v, c.escrito_tabla as TablaCarga, c.escrito_id)
}

// ── Escrituras ─────────────────────────────────────────────────────────

export function escribirLluvia(v: Vinculo, b: Borrador, id: string): Promise<string> {
  return comoUsuario(v.user_id, async (tx) => {
    const campo = await tx`select 1 from campo where id=${b.campoId!} and empresa_id=${v.empresa_id}`
    if(campo.length!==1)throw new Error('Campo ajeno a la empresa')
    const [r] = await tx<{ id: string }[]>`
      insert into lluvia (id, empresa_id, campo_id, fecha, mm, fuente)
      values (${id}, ${v.empresa_id}, ${b.campoId!}, ${b.fecha!}, ${b.mm!}, 'manual')
      returning id`
    return r.id
  })
}

export function escribirGasto(v: Vinculo, b: Borrador, comprobanteUrl: string | null, id: string): Promise<string> {
  const lineas = (b.ivaLineas ?? []).filter((l) => l.neto || l.iva)
  const neto = lineas.reduce((s, l) => s + (l.neto || 0), 0)
  const iva = lineas.reduce((s, l) => s + (l.iva || 0), 0)
  return comoUsuario(v.user_id, async (tx) => {
    const campo = await tx`select 1 from campo where id=${b.campoId!} and empresa_id=${v.empresa_id}`
    const categoria = await tx`select 1 from categoria_movimiento where id=${b.categoriaId!} and (empresa_id is null or empresa_id=${v.empresa_id})`
    if(campo.length!==1 || categoria.length!==1)throw new Error('Campo o categoría ajenos a la empresa')
    // Pagado en el momento (un ticket): liquidado con su fecha de pago, como
    // "Ya está pagado" en el formulario de la app.
    await tx`
      insert into movimiento_financiero (
        id, empresa_id, tipo, categoria_id, campo_id, monto, fecha_devengo, fecha_cobro_pago,
        estado, descripcion, contraparte, cuit_contraparte, comprobante_tipo, comprobante_url,
        neto_total, iva_total)
      values (
        ${id}, ${v.empresa_id}, 'gasto', ${b.categoriaId!}, ${b.campoId!}, ${b.monto!}, ${b.fecha!}, ${b.fecha!},
        'liquidado', ${b.descripcion ?? null}, ${b.contraparte ?? null}, ${b.cuit ?? null},
        ${b.comprobanteTipo ?? null}, ${comprobanteUrl},
        ${lineas.length ? neto : null}, ${lineas.length ? iva : null})`
    for (const [i, l] of lineas.entries()) {
      await tx`
        insert into movimiento_iva_linea (empresa_id, movimiento_id, concepto, neto, alicuota, iva, orden)
        values (${v.empresa_id}, ${id}, ${l.concepto ?? null}, ${l.neto || 0}, ${l.alicuota}, ${l.iva || 0}, ${i})`
    }
    return id
  })
}

/** Sube la foto al bucket privado, con el mismo path que usa la app. */
export async function subirComprobante(empresaId: string, movimientoId: string, bytes: Uint8Array, mime: string): Promise<string> {
  const path = `${empresaId}/${movimientoId}.jpg`
  const clave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/comprobantes/${path}`, {
    method: 'POST',
    headers: {
      // La plataforma puede dar la clave nueva (sb_secret_…), que no es un JWT:
      // sólo en Authorization, Storage la rechaza ("Invalid Compact JWS"). Con
      // `apikey` el gateway la cambia por un JWT de servicio. Sirve para las dos.
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body: bytes as Uint8Array<ArrayBuffer>,
  })
  if (!res.ok) throw new Error(`Storage ${res.status}: ${await res.text()}`)
  return path
}

// ── Lecturas para las respuestas ───────────────────────────────────────

/** mm medidos (manual) en el mes de `hasta`, hasta ese día; y lo mismo un año antes. */
export function lluviaMes(v: Vinculo, campoId: string | null, hasta: string) {
  const desde = `${hasta.slice(0, 7)}-01`
  const antHasta = `${Number(hasta.slice(0, 4)) - 1}${hasta.slice(4)}`
  const antDesde = `${antHasta.slice(0, 7)}-01`
  return comoUsuario(v.user_id, (tx) =>
    tx<{ campo_id: string; campo: string; mes_mm: number; ant_mm: number | null }[]>`
      select c.id as campo_id, c.nombre as campo,
        coalesce(sum(l.mm) filter (where l.fecha between ${desde} and ${hasta}), 0)::float8 as mes_mm,
        case when count(l.id) filter (where l.fecha < ${desde}) = 0 then null
             else coalesce(sum(l.mm) filter (where l.fecha between ${antDesde} and ${antHasta}), 0)::float8 end as ant_mm
      from campo c
      left join lluvia l on l.campo_id = c.id and l.fuente = 'manual'
      where c.empresa_id = ${v.empresa_id} and (${campoId}::uuid is null or c.id = ${campoId})
      group by c.id, c.nombre
      order by c.nombre`,
  )
}

/** Total de la categoría en el mes de `fecha` (el del gasto, no el de hoy). */
export async function gastoMes(v: Vinculo, categoriaId: string, fecha: string) {
  const desde = `${fecha.slice(0, 7)}-01`
  const [r] = await comoUsuario(v.user_id, (tx) =>
    tx<{ total: number; cantidad: number }[]>`
      select coalesce(sum(monto), 0)::float8 as total, count(*)::int as cantidad
      from movimiento_financiero
      where empresa_id = ${v.empresa_id} and categoria_id = ${categoriaId} and tipo = 'gasto'
        and estado <> 'anulado'
        and fecha_devengo >= ${desde}::date and fecha_devengo < (${desde}::date + interval '1 month')`,
  )
  return r
}

export function hacienda(v: Vinculo, b: Borrador): Promise<FilaHacienda[]> {
  return comoUsuario(v.user_id, (tx) =>
    tx<FilaHacienda[]>`
      select c.nombre as campo, p.nombre as potrero, a.categoria::text as categoria, count(*)::int as cabezas
      from animal a join potrero p on p.id = a.potrero_id join campo c on c.id = p.campo_id
      where a.empresa_id = ${v.empresa_id} and a.estado = 'activo'
        and (${b.campoId ?? null}::uuid is null or c.id = ${b.campoId ?? null})
        and (${b.potreroId ?? null}::uuid is null or p.id = ${b.potreroId ?? null})
      group by c.nombre, p.nombre, a.categoria`,
  )
}

export async function vencimientos(v: Vinculo, hoy: string, dias: number): Promise<{ hasta: string; filas: FilaVencimiento[] }> {
  const hasta = sumarDias(hoy, dias)
  const filas = await comoUsuario(v.user_id, (tx) =>
    tx<FilaVencimiento[]>`
      select m.fecha_vencimiento::text as fecha, m.tipo::text as tipo, m.monto::float8 as monto,
             m.descripcion, m.contraparte, cat.nombre as categoria
      from movimiento_financiero m left join categoria_movimiento cat on cat.id = m.categoria_id
      where m.empresa_id = ${v.empresa_id} and m.estado = 'pendiente'
        and m.fecha_vencimiento is not null and m.fecha_vencimiento <= ${hasta}
      order by m.fecha_vencimiento
      limit 15`,
  )
  return { hasta, filas }
}

/** Cuándo llegó cada animal al potrero: su último movimiento (o su alta). */
export function diasEnPotrero(v: Vinculo, potreroId: string) {
  return comoUsuario(v.user_id, (tx) =>
    tx<{ desde: string; cabezas: number }[]>`
      select coalesce(ult.fecha, a.created_at::date)::text as desde, count(*)::int as cabezas
      from animal a
      left join lateral (
        select max(e.fecha)::date as fecha from evento e
        where e.animal_id = a.id and e.tipo in ('movimiento', 'alta')
      ) ult on true
      where a.empresa_id = ${v.empresa_id} and a.potrero_id = ${potreroId} and a.estado = 'activo'
      group by 1`,
  )
}

// ── Recorrida ──────────────────────────────────────────────────────────

/** Una observación lista para escribir: el id se elige antes, como en lluvia y gastos. */
export type ObsEscrita = {
  id: string
  potreroId: string
  campoId: string
  agua: Agua | null
  pasto: Pasto | null
  electrico: Electrico | null
  conteo: number | null
  novedad: string | null
}

/**
 * Las mismas reglas que la app (src/features/campo/recorrida/api.ts): una
 * recorrida por campo y día, y una observación por potrero en esa recorrida. Si
 * el potrero ya tenía observación hoy, se completa: lo nuevo pisa los estados
 * que dijo y la novedad se suma. Devuelve el id de cada observación.
 */
export function escribirRecorrida(v: Vinculo, hoy: string, obs: ObsEscrita[]): Promise<string[]> {
  return comoUsuario(v.user_id, async (tx) => {
    const filas=await tx<{id:string;campo_id:string}[]>`select p.id,p.campo_id from potrero p join campo c on c.id=p.campo_id
      where p.empresa_id=${v.empresa_id} and c.empresa_id=${v.empresa_id} and p.id=any(${sql.array(obs.map(o=>o.potreroId))}::uuid[])`
    const campos=new Map(filas.map(p=>[p.id,p.campo_id]))
    if(obs.some(o=>campos.get(o.potreroId)!==o.campoId))throw new Error('Potrero ajeno al campo o empresa')
    // Dos capturas diferentes pueden confirmar a la vez. Serializar los campos
    // en un orden fijo evita duplicados entre bots y bloqueos cruzados.
    for (const campoId of [...new Set(obs.map((o) => o.campoId))].sort())
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${v.empresa_id}|${campoId}|${hoy}`}, 0))`
    const recorridas = new Map<string, string>()
    const ids: string[] = []
    for (const o of obs) {
      let rec = recorridas.get(o.campoId)
      if (!rec) {
        const [r] = await tx<{ id: string }[]>`
          select id from recorrida
          where empresa_id = ${v.empresa_id} and campo_id = ${o.campoId} and fecha = ${hoy}
          order by created_at limit 1`
        rec = r?.id ?? (await tx<{ id: string }[]>`
          insert into recorrida (empresa_id, campo_id, fecha) values (${v.empresa_id}, ${o.campoId}, ${hoy})
          returning id`)[0].id
        recorridas.set(o.campoId, rec)
      }
      const [prev] = await tx<{ id: string; novedad: string | null }[]>`
        select id, novedad from observacion_potrero
        where recorrida_id = ${rec} and potrero_id = ${o.potreroId}
        order by created_at limit 1`
      if (prev) {
        const novedad = !o.novedad
          ? prev.novedad
          : !prev.novedad || prev.novedad === o.novedad
          ? o.novedad
          : prev.novedad.includes(o.novedad) ? prev.novedad : `${prev.novedad} · ${o.novedad}`
        await tx`
          update observacion_potrero set
            agua = coalesce(${o.agua}::agua_estado, agua),
            pasto = coalesce(${o.pasto}::pasto_estado, pasto),
            electrico = coalesce(${o.electrico}::electrico_estado, electrico),
            conteo = coalesce(${o.conteo}::int, conteo),
            novedad = ${novedad}
          where id = ${prev.id}`
        ids.push(prev.id)
      } else {
        await tx`
          insert into observacion_potrero (id, empresa_id, recorrida_id, potrero_id, agua, pasto, electrico, conteo, novedad)
          values (${o.id}, ${v.empresa_id}, ${rec}, ${o.potreroId}, ${o.agua}::agua_estado, ${o.pasto}::pasto_estado,
            ${o.electrico}::electrico_estado, ${o.conteo}::int, ${o.novedad})`
        ids.push(o.id)
      }
    }
    return ids
  })
}

// ── Consultas nuevas: datos del productor bajo el mismo RLS ──────────────

export function resumenRecorrida(v: Vinculo, fecha: string, campoId: string | null) {
  return comoUsuario(v.user_id, (tx) => tx<{ campo: string; recorridos: number; total: number; pendientes: string[] }[]>`
    select c.nombre as campo, count(p.id)::int as total,
      count(p.id) filter (where exists (select 1 from observacion_potrero o join recorrida r on r.id=o.recorrida_id
        where o.potrero_id=p.id and r.fecha=${fecha} and r.empresa_id=${v.empresa_id}))::int as recorridos,
      coalesce(array_agg(p.nombre order by p.nombre) filter (where p.id is not null and not exists
        (select 1 from observacion_potrero o join recorrida r on r.id=o.recorrida_id
         where o.potrero_id=p.id and r.fecha=${fecha} and r.empresa_id=${v.empresa_id})), '{}'::text[]) as pendientes
    from campo c left join potrero p on p.campo_id=c.id
    where c.empresa_id=${v.empresa_id} and (${campoId}::uuid is null or c.id=${campoId})
    group by c.id,c.nombre order by c.nombre`)
}

export type UltimaObservacion = { fecha: string; campo: string; potrero: string; agua: Agua | null; pasto: Pasto | null; electrico: Electrico | null; conteo: number | null; novedad: string | null }
export async function ultimaObservacion(v: Vinculo, potreroId: string): Promise<UltimaObservacion | null> {
  const filas = await comoUsuario(v.user_id, (tx) => tx<UltimaObservacion[]>`
    select r.fecha::text,c.nombre as campo,p.nombre as potrero,o.agua,o.pasto,o.electrico,o.conteo,o.novedad
    from observacion_potrero o join recorrida r on r.id=o.recorrida_id join potrero p on p.id=o.potrero_id join campo c on c.id=r.campo_id
    where o.empresa_id=${v.empresa_id} and p.id=${potreroId}
    order by r.fecha desc,o.created_at desc,o.id desc limit 1`)
  return filas[0] ?? null
}

export function novedades(v: Vinculo, desde: string, hasta: string, campoId: string | null) {
  return comoUsuario(v.user_id, (tx) => tx<{ fecha: string; campo: string; potrero: string; novedad: string }[]>`
    select r.fecha::text,c.nombre as campo,p.nombre as potrero,o.novedad
    from observacion_potrero o join recorrida r on r.id=o.recorrida_id join potrero p on p.id=o.potrero_id join campo c on c.id=r.campo_id
    where o.empresa_id=${v.empresa_id} and r.fecha between ${desde} and ${hasta}
      and nullif(trim(o.novedad),'') is not null and (${campoId}::uuid is null or c.id=${campoId})
    order by r.fecha desc,o.created_at desc,o.id desc limit 11`)
}

export function resumenGastos(v: Vinculo, desde: string, hasta: string, campoId: string | null, categoriaId: string | null) {
  return comoUsuario(v.user_id, (tx) => tx<{ campo: string; categoria: string; cantidad: number; total: number }[]>`
    select c.nombre as campo,coalesce(cat.nombre,'Sin categoría') as categoria,count(*)::int as cantidad,sum(m.monto)::float8 as total
    from movimiento_financiero m join campo c on c.id=m.campo_id left join categoria_movimiento cat on cat.id=m.categoria_id
    where m.empresa_id=${v.empresa_id} and m.tipo='gasto' and m.estado<>'anulado'
      and m.fecha_devengo between ${desde} and ${hasta}
      and (${campoId}::uuid is null or m.campo_id=${campoId}) and (${categoriaId}::uuid is null or m.categoria_id=${categoriaId})
    group by c.nombre,cat.nombre order by c.nombre,cat.nombre`)
}

export type CargaReciente = { fecha: string; tipo: string; campo: string; cantidad: number | null }
/** Una captura confirmada sólo se muestra cuando el registro concreto sigue existiendo. */
export function cargasRecientes(v: Vinculo, campoId: string | null) {
  return comoUsuario(v.user_id, (tx) => tx<CargaReciente[]>`
    select x.fecha,x.tipo,x.campo,x.cantidad from (
      select cap.created_at, l.fecha::text as fecha,'lluvia' as tipo,c.nombre as campo,l.mm::float8 as cantidad
      from captura cap join lluvia l on cap.escrito_tabla='lluvia' and l.id=cap.escrito_id and l.empresa_id=cap.empresa_id join campo c on c.id=l.campo_id
      where cap.empresa_id=${v.empresa_id} and cap.user_id=${v.user_id} and cap.estado='confirmada' and (${campoId}::uuid is null or c.id=${campoId})
      union all
      select cap.created_at,m.fecha_devengo::text,'gasto',c.nombre,m.monto::float8
      from captura cap join movimiento_financiero m on cap.escrito_tabla='movimiento_financiero' and m.id=cap.escrito_id and m.empresa_id=cap.empresa_id join campo c on c.id=m.campo_id
      where cap.empresa_id=${v.empresa_id} and cap.user_id=${v.user_id} and cap.estado='confirmada' and m.estado<>'anulado' and (${campoId}::uuid is null or c.id=${campoId})
      union all
      select cap.created_at,r.fecha::text,'recorrida',c.nombre,null::float8
      from captura cap join observacion_potrero o on cap.escrito_tabla='observacion_potrero' and o.id=cap.escrito_id and o.empresa_id=cap.empresa_id join recorrida r on r.id=o.recorrida_id join campo c on c.id=r.campo_id
      where cap.empresa_id=${v.empresa_id} and cap.user_id=${v.user_id} and cap.estado='confirmada' and (${campoId}::uuid is null or c.id=${campoId})
    ) x order by x.created_at desc limit 5`)
}

/** Después de un error: ¿cada potrero quedó hoy con lo que dijo? Un update no deja un id propio para buscar. */
export function verificarRecorrida(v: Vinculo, hoy: string, obs: ObsEscrita[]): Promise<boolean> {
  return comoUsuario(v.user_id, async (tx) => {
    for (const o of obs) {
      const filas = await tx`
        select 1 from observacion_potrero op join recorrida r on r.id = op.recorrida_id
        where r.empresa_id = ${v.empresa_id} and r.campo_id = ${o.campoId} and r.fecha = ${hoy}
          and op.potrero_id = ${o.potreroId}
          and (${o.agua}::agua_estado is null or op.agua = ${o.agua}::agua_estado)
          and (${o.pasto}::pasto_estado is null or op.pasto = ${o.pasto}::pasto_estado)
          and (${o.electrico}::electrico_estado is null or op.electrico = ${o.electrico}::electrico_estado)
          and (${o.conteo}::int is null or op.conteo = ${o.conteo}::int)
          and (${o.novedad}::text is null or position(${o.novedad}::text in coalesce(op.novedad, '')) > 0)
        limit 1`
      if (!filas.length) return false
    }
    return true
  })
}

/** Cuántos potreros de cada campo tienen observación hoy, sobre el total. */
export function avanceRecorrida(v: Vinculo, hoy: string, campoIds: string[]) {
  return comoUsuario(v.user_id, async (tx) => {
    const filas: { campo: string; recorridos: number; total: number }[] = []
    for (const id of campoIds) {
      const [f] = await tx<{ campo: string; recorridos: number; total: number }[]>`
        select c.nombre as campo,
          (select count(distinct op.potrero_id)::int from observacion_potrero op join recorrida r on r.id = op.recorrida_id
            where r.campo_id = c.id and r.fecha = ${hoy}) as recorridos,
          (select count(*)::int from potrero p where p.campo_id = c.id) as total
        from campo c where c.id = ${id} and c.empresa_id = ${v.empresa_id}`
      if (f) filas.push(f)
    }
    return filas
  })
}

/** El campo que este usuario recorre hoy, si tiene recorrida hoy en uno solo: desempata "el 5". */
export async function campoRecorridoHoy(v: Vinculo, hoy: string): Promise<string | null> {
  const filas = await comoUsuario(v.user_id, (tx) => tx<{ campo_id: string }[]>`
    select distinct campo_id from recorrida
    where empresa_id = ${v.empresa_id} and fecha = ${hoy} and created_by = ${v.user_id}`)
  return filas.length === 1 ? filas[0].campo_id : null
}

/** Los potreros con dibujo, para ubicar al que comparte su ubicación. */
export async function potrerosDibujados(v: Vinculo): Promise<PotreroDibujado[]> {
  const filas = await comoUsuario(v.user_id, (tx) => tx<{ id: string; nombre: string; campo_id: string; campo: string; poligono: unknown }[]>`
    select p.id, p.nombre, c.id as campo_id, c.nombre as campo, p.poligono
    from potrero p join campo c on c.id = p.campo_id
    where c.empresa_id = ${v.empresa_id} and p.poligono is not null`)
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    campoId: f.campo_id,
    campo: f.campo,
    poligono: (Array.isArray(f.poligono) ? f.poligono : [])
      .filter((x): x is [number, number] => Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'number'),
  }))
}

/** Campo y polígonos con el rol del usuario, y acotados a la empresa del vínculo. */
export function datosMapa(v: Vinculo, campoId: string): Promise<MapaCampo | null> {
  return comoUsuario(v.user_id, async tx => {
    const [campo] = await tx<{ id: string; nombre: string }[]>`select c.id,c.nombre from campo c where c.id=${campoId} and c.empresa_id=${v.empresa_id}
      and exists(select 1 from miembro_empresa where user_id=${v.user_id} and empresa_id=${v.empresa_id})`
    if (!campo) return null
    // Cabezas activas (vista con security_invoker: respeta RLS) y la última recorrida de cada potrero.
    const potreros = await tx<MapaCampo['potreros']>`select p.id,p.nombre,p.poligono,
        coalesce((select s.cabezas from v_stock_potrero s where s.potrero_id=p.id and s.empresa_id=${v.empresa_id}),0)::int as cabezas,
        (select max(r.fecha)::text from observacion_potrero o join recorrida r on r.id=o.recorrida_id
          where o.potrero_id=p.id and r.empresa_id=${v.empresa_id}) as "ultimaRecorrida"
      from potrero p join campo c on c.id=p.campo_id
      where c.id=${campo.id} and c.empresa_id=${v.empresa_id} and p.empresa_id=${v.empresa_id} order by p.nombre`
    // Un campo que todavía no usa recorridas no se llena de «nunca».
    if (!potreros.some(p => p.ultimaRecorrida)) for (const p of potreros) delete p.ultimaRecorrida
    const infra = await tx<{ id: string; tipo: ElementoMapa['tipo']; apodo: string | null; lat: number; lng: number; linea: [number, number][] | null }[]>`
      select id, tipo::text as tipo, apodo, lat, lng, linea from infraestructura
      where campo_id=${campo.id} and empresa_id=${v.empresa_id}
        and tipo::text in ('molino','tanque','bebedero','energizador','tranquera','electrico') order by created_at limit 150`
    return { ...campo, potreros, infraestructura: infra.map(i => ({ id: i.id, tipo: i.tipo, nombre: i.tipo, apodo: i.apodo, punto: [i.lat, i.lng] as [number, number], linea: i.linea })) }
  })
}

/** Referencia elegida por el usuario, registrada sólo tras enviar el mapa; no GPS. */
export async function campoMapaReciente(v: Vinculo): Promise<string | null> {
  const [r] = await sql<{ campo_id: string }[]>`select cuerpo->'tropero_mapa'->>'campo_id' as campo_id from wa_mensaje
    where vinculo_id=${v.id} and empresa_id=${v.empresa_id} and direccion='saliente' and tipo='image'
    and cuerpo->'tropero_mapa'->>'campo_id' is not null and created_at >= now() - interval '12 hours'
    order by created_at desc limit 1`
  return r?.campo_id ?? null
}

export async function mapaEnviadoParaCaptura(v: Vinculo, capturaId: string, campoId: string): Promise<boolean> {
  const filas = await sql`select id from wa_mensaje where vinculo_id=${v.id} and empresa_id=${v.empresa_id} and direccion='saliente' and tipo='image'
    and cuerpo->'tropero_mapa'->>'captura_id'=${capturaId} and cuerpo->'tropero_mapa'->>'campo_id'=${campoId} limit 1`
  return filas.length > 0
}

// ── Infraestructura cargada desde WhatsApp ──────────────────────────────

export type InfraGuardada = { id: string; campo_id: string; tipo: InfraNueva['tipo']; apodo: string | null; lat: number; lng: number; linea: [number, number][] | null }

/** Lo cargado de la empresa, para resolver «el tanque del 9B» y avisar duplicados. */
export function infraDeEmpresa(v: Vinculo): Promise<InfraGuardada[]> {
  return comoUsuario(v.user_id, (tx) => tx<InfraGuardada[]>`
    select id, campo_id, tipo::text as tipo, apodo, lat, lng, linea from infraestructura
    where empresa_id = ${v.empresa_id} and tipo::text in ('molino','tanque','bebedero','energizador','tranquera','electrico')
    order by created_at limit 500`)
}

/** Como el usuario: RLS y el disparador de la migración rechazan otra empresa o un campo ajeno. */
export function guardarInfra(v: Vinculo, e: InfraNueva): Promise<string> {
  return comoUsuario(v.user_id, async (tx) => {
    const [r] = await tx<{ id: string }[]>`
      insert into infraestructura (empresa_id, campo_id, tipo, apodo, lat, lng, linea)
      values (${v.empresa_id}, ${e.campoId}, ${e.tipo}::public.tipo_infraestructura, ${e.apodo}, ${e.lat}, ${e.lng},
        ${e.linea ? sql.json(e.linea as postgres.JSONValue) : null})
      returning id`
    return r.id
  })
}

export function borrarInfra(v: Vinculo, id: string): Promise<boolean> {
  return comoUsuario(v.user_id, async (tx) => (await tx`delete from infraestructura where id = ${id} and empresa_id = ${v.empresa_id} returning id`).length === 1)
}

type PropuestaInfra = (InfraNueva & { carga: 'infraestructura' }) | { carga: 'infraestructura_baja'; id: string; nombre: string }
export type ResultadoInfra = 'guardada' | 'borrada' | 'ya_guardada' | 'ya_borrada' | 'no_existe' | 'incierta' | 'vieja'

/** La propuesta y el dato se confirman juntos. El bloqueo serializa incluso dos
 * instancias del webhook; una excepción revierte ambos y deja reintentar.
 * El rol técnico sólo administra captura/pendiente: el inventario usa RLS. */
export function confirmarInfra(v: Vinculo, capturaId: string, accion: 'guardar' | 'borrar'): Promise<ResultadoInfra> {
  return operarInfra(v, capturaId, accion, true)
}
export function resultadoInfra(v: Vinculo, capturaId: string, accion: 'guardar' | 'borrar'): Promise<ResultadoInfra> {
  return operarInfra(v, capturaId, accion, false)
}
async function operarInfra(v: Vinculo, capturaId: string, accion: 'guardar' | 'borrar', ejecutar: boolean): Promise<ResultadoInfra> {
  if (!/^[0-9a-f-]{36}$/i.test(capturaId)) return 'vieja'
  return await sql.begin(async tx => {
    const [c] = await tx<{ estado: string; escrito_tabla: string | null; escrito_id: string | null; propuesta: PropuestaInfra }[]>`
      select c.estado,c.escrito_tabla,c.escrito_id,c.propuesta from captura c join wa_mensaje m on m.id=c.mensaje_id
      where c.id=${capturaId} and c.user_id=${v.user_id} and c.empresa_id=${v.empresa_id}
        and m.vinculo_id=${v.id} and m.empresa_id=${v.empresa_id} for update of c`
    if (!c || c.propuesta?.carga !== (accion === 'guardar' ? 'infraestructura' : 'infraestructura_baja')) return 'vieja'
    if (c.estado !== 'propuesta' && c.estado !== 'confirmada') return 'vieja'
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: v.user_id, role: 'authenticated' })}, true)`
    await tx.unsafe('set local role authenticated')
    const acceso = await tx`select 1 from miembro_empresa where user_id=${v.user_id} and empresa_id=${v.empresa_id}`
    if (!acceso.length) throw new Error('El vínculo ya no tiene acceso a esta empresa')
    if (c.estado === 'confirmada') {
      // Las versiones anteriores podían marcar confirmada antes de escribir.
      // No adivinar éxito ni repetir una operación cuyo resultado no consta.
      if (c.escrito_tabla !== 'infraestructura' || !c.escrito_id) return 'incierta'
      const existe = await tx`select id from infraestructura where id=${c.escrito_id} and empresa_id=${v.empresa_id}`
      if (accion === 'guardar') return existe.length ? 'ya_guardada' : 'incierta'
      return !existe.length && c.propuesta.carga === 'infraestructura_baja' && c.escrito_id === c.propuesta.id ? 'ya_borrada' : 'incierta'
    }
    if (!ejecutar) return 'vieja'
    let escritoId: string, resultado: ResultadoInfra
    if (c.propuesta.carga === 'infraestructura') {
      const e = c.propuesta
      const [r] = await tx<{ id: string }[]>`insert into infraestructura (empresa_id,campo_id,tipo,apodo,lat,lng,linea)
        values (${v.empresa_id},${e.campoId},${e.tipo}::public.tipo_infraestructura,${e.apodo},${e.lat},${e.lng},
          ${e.linea ? sql.json(e.linea as postgres.JSONValue) : null}) returning id`
      escritoId = r.id; resultado = 'guardada'
    } else {
      escritoId = c.propuesta.id
      const eliminada = await tx`delete from infraestructura where id=${escritoId} and empresa_id=${v.empresa_id} returning id`
      resultado = eliminada.length ? 'borrada' : 'no_existe'
    }
    await tx.unsafe('reset role')
    await tx`update captura set estado=${resultado === 'no_existe' ? 'error' : 'confirmada'}::estado_captura,
      escrito_tabla='infraestructura',escrito_id=${escritoId},updated_at=now() where id=${capturaId}`
    // No borrar una propuesta distinta que haya llegado mientras se confirmaba.
    await tx`update wa_vinculo set pendiente=null,pendiente_at=null where id=${v.id} and empresa_id=${v.empresa_id}
      and pendiente->>'capturaId'=${capturaId}`
    return resultado
  }) as ResultadoInfra
}

