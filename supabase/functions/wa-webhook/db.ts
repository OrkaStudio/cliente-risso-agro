// Acceso a la base del bot.
//
// Dos modos, a propósito:
// · Tablas del bot (wa_vinculo, wa_mensaje, captura): como dueño, sin RLS.
// · Datos del productor (lluvia, gastos, hacienda...): SIEMPRE con
//   `comoUsuario`, que abre una transacción con el rol `authenticated` y los
//   claims del usuario vinculado. Rige RLS igual que en la app y created_by
//   queda con su id. Nunca con la clave de servicio.

import postgres from 'npm:postgres@3.4.5'
import { sumarDias } from '../_shared/wa/texto.ts'
import type { Borrador, Campo, Categoria, Contexto, Pendiente } from '../_shared/wa/tipos.ts'
import type { FilaHacienda, FilaVencimiento } from '../_shared/wa/respuestas.ts'

// Pooler en modo transacción: sin prepared statements.
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 4, idle_timeout: 20 })
type Tx = postgres.TransactionSql

export type Vinculo = {
  id: string
  telefono: string
  user_id: string
  empresa_id: string
  pendiente: Pendiente | null
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
  const [r] = await sql<{ id: string }[]>`
    insert into wa_mensaje (wamid, direccion, telefono, vinculo_id, empresa_id, tipo, cuerpo)
    values (${m.wamid}, 'entrante', ${m.telefono}, ${m.vinculo?.id ?? null}, ${m.vinculo?.empresa_id ?? null},
            ${m.tipo}, ${sql.json(m.cuerpo as postgres.JSONValue)})
    on conflict (wamid) do nothing
    returning id`
  return r?.id ?? null
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

export async function guardarPendiente(vinculoId: string, p: Pendiente | null): Promise<void> {
  await sql`
    update wa_vinculo set pendiente = ${p ? sql.json(p as unknown as postgres.JSONValue) : null},
      pendiente_at = ${p ? sql`now()` : null}
    where id = ${vinculoId}`
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

async function comoUsuario<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`
    await tx.unsafe('set local role authenticated')
    return fn(tx)
  })) as T
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

// ── Escrituras ─────────────────────────────────────────────────────────

export function escribirLluvia(v: Vinculo, b: Borrador): Promise<string> {
  return comoUsuario(v.user_id, async (tx) => {
    const [r] = await tx<{ id: string }[]>`
      insert into lluvia (empresa_id, campo_id, fecha, mm, fuente)
      values (${v.empresa_id}, ${b.campoId!}, ${b.fecha!}, ${b.mm!}, 'manual')
      returning id`
    return r.id
  })
}

export function escribirGasto(v: Vinculo, b: Borrador, comprobanteUrl: string | null, id: string): Promise<string> {
  const lineas = (b.ivaLineas ?? []).filter((l) => l.neto || l.iva)
  const neto = lineas.reduce((s, l) => s + (l.neto || 0), 0)
  const iva = lineas.reduce((s, l) => s + (l.iva || 0), 0)
  return comoUsuario(v.user_id, async (tx) => {
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
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/comprobantes/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
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

export async function gastoMes(v: Vinculo, categoriaId: string, hoy: string) {
  const desde = `${hoy.slice(0, 7)}-01`
  const [r] = await comoUsuario(v.user_id, (tx) =>
    tx<{ total: number; cantidad: number }[]>`
      select coalesce(sum(monto), 0)::float8 as total, count(*)::int as cantidad
      from movimiento_financiero
      where empresa_id = ${v.empresa_id} and categoria_id = ${categoriaId} and tipo = 'gasto'
        and estado <> 'anulado' and fecha_devengo between ${desde} and ${hoy}`,
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
