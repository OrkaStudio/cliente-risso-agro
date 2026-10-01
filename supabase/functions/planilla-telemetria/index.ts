// Edge function: planilla-telemetria
//
// Alimenta la planilla viva de telemetría en Google Sheets: el Apps Script de
// la planilla la llama cada hora y dibuja dos hojas.
// Spec: clientes/risso-agro/especificaciones/2026-09-19-telemetria-onboarding-activacion
//
//  · Tablero: lo que miramos juntos para decidir. Cinco preguntas:
//    1. ¿El que llega, llega a ver su campo? (el camino, contra metas)
//    2. ¿Dónde se traba? (las fugas más grandes, con qué hacer)
//    3. ¿A quién ayudamos hoy? (los trabados, con qué hacer)
//    4. ¿Mejora con el tiempo? (por día de registro: % y cuánto tarda)
//    5. ¿Vuelven? (productores activos por día)
//  · Productores: una fila por productor con toda su historia.
//
// Cada sección existe porque responde una decisión; no se agregan datos
// porque sí. El detalle fino (tiempos por paso, eventos) se consulta en la
// base cuando el tablero señala un problema.
//
// POST con header `x-clave-planilla`. Sin JWT (Apps Script no tiene sesión de
// Supabase): la barrera es la clave, cuyo hash está en interno.planilla_clave.
// Lee con la conexión directa (SUPABASE_DB_URL) porque `interno` no está
// expuesto por la API, y así tiene que seguir.

import postgres from 'npm:postgres@3.4.5'

/** Cómo se dibuja la columna en la planilla. */
type Tipo =
  | 'texto'
  | 'largo' // texto que puede ser largo: columna ancha
  | 'email'
  | 'entero'
  | 'decimal'
  | 'fecha'
  | 'fechahora'
  | 'puntaje' // Setup, 0–5
  | 'dispositivo'
  | 'activo' // días activos: 0 se marca

type Columna = [clave: string, etiqueta: string, tipo: Tipo]

const VERDE = '#178a55'

// ── Metas ──────────────────────────────────────────────────────────────────

/**
 * Qué porcentaje de la etapa anterior tendría que pasar. Las de la literatura
 * (Setup→Aha, Aha→Hábito) son el piso del rango; las demás son provisorias
 * hasta tener datos propios. A afinar con Fran.
 */
const METAS: Record<number, number> = { 2: 70, 3: 60, 4: 50, 5: 50, 6: 30 }
/** Con menos de esto en la etapa anterior, un porcentaje no dice nada. */
const MINIMO = 5

const ETAPAS: Record<number, string> = {
  1: 'Se registraron',
  2: 'Terminaron el alta',
  3: 'Llegaron a la compu',
  4: 'Aha: vieron su campo',
  5: 'Primera anotación (7 d)',
  6: 'Hábito (14 d)',
}

// ── Consultas ──────────────────────────────────────────────────────────────

const GENERAL_SQL = `
  select
    (select count(*) from interno.v_productores) as productores,
    (select count(*) from interno.v_activacion_etapas where tiene_telemetria) as medidos,
    (select count(*) from interno.v_activacion_etapas where dispositivo_registro = 'movil') as del_celular,
    (select count(*) from interno.v_activacion_etapas
      where dispositivo_registro = 'movil' and compu_desde is null and dias_desde_registro >= 1) as celular_sin_compu,
    (select count(*) from interno.v_evento where ts_cliente > now() - interval '24 hours') as eventos_24h,
    (select max(ts_cliente) from public.evento_producto) as ultimo_evento
`

/** Qué le falta para el aha, en palabras. Se usa en el tablero y en Productores. */
const FALTA_SQL = `
  concat_ws(' · ',
    case when a.campos = 0 then 'cargar un campo'
         when a.campos_con_contorno < a.campos
           then (a.campos - a.campos_con_contorno) || ' de ' || a.campos || ' campos sin contorno' end,
    case when a.potreros_alta > 0 and a.potreros_alta_asignados < a.potreros_alta
           then (a.potreros_alta - a.potreros_alta_asignados) || ' de ' || a.potreros_alta || ' potreros del alta sin asignar'
         when a.potreros_alta = 0 and a.potreros_dibujados = 0 then 'dibujar un potrero' end
  )`

/** Qué hacer con cada productor según dónde quedó. */
const QUE_HACER_SQL = `
  case
    when not e.tiene_telemetria then 'Se registró antes de la medición · para el aha le falta: ' || coalesce(nullif(${FALTA_SQL}, ''), 'nada')
    when e.nivel = 1 then 'Retomar el alta: ' || coalesce(x.salida_onboarding, 'se fue a mitad de camino')
    when e.nivel = 2 then 'Mandarle el link para seguir en la compu'
    when e.nivel = 3 then 'Le falta para ver su campo: ' || coalesce(nullif(${FALTA_SQL}, ''), 'revisar')
    when e.nivel = 4 then 'Proponerle su primera recorrida o cargar una factura'
    when e.nivel = 5 then 'Recordarle anotar lo del día: le falta volver'
    else 'Al día'
  end`

const AYUDAR_SQL = `
  select e.nombre, r.emails, e.dias_desde_registro, e.nivel, ${QUE_HACER_SQL} as que_hacer
  from interno.v_activacion_etapas e
  join interno.v_aha_hoy a using (empresa_id)
  join interno.v_empresa_real r using (empresa_id)
  left join interno.v_onboarding_x_activacion x using (empresa_id)
  where e.tiene_telemetria
    and (
      (e.nivel in (1, 2) and e.dias_desde_registro >= 1) or
      (e.nivel = 3 and e.dias_desde_registro >= 2) or
      (e.nivel = 4 and e.dias_desde_registro >= 3) or
      (e.nivel = 5 and e.dias_desde_registro between 5 and 14)
    )
  order by e.nivel, e.dias_desde_registro desc
  limit 12
`

/** Las fugas posibles, cada una con cuántos afecta y qué hacer. */
const FUGAS_SQL = `
  with trabados_aha as (
    select a.* from interno.v_activacion_etapas e join interno.v_aha_hoy a using (empresa_id)
    where e.tiene_telemetria and e.nivel = 3 and e.dias_desde_registro >= 1
  )
  select 'Aha: les falta marcar el contorno del campo' as que,
         (select count(*) from trabados_aha where campos = 0 or campos_con_contorno < campos)::int as n,
         'Revisar la guía del contorno (boleta de ARBA o a mano)' as hacer
  union all
  select 'Aha: tienen potreros del alta sin asignar a uno dibujado',
         (select count(*) from trabados_aha where potreros_alta > 0 and potreros_alta_asignados < potreros_alta)::int,
         'Revisar cómo se elige qué potrero es el dibujado'
  union all
  select 'Celular: nunca abrieron la compu',
         (select count(*) from interno.v_activacion_etapas
           where tiene_telemetria and dispositivo_registro = 'movil' and compu_desde is null and dias_desde_registro >= 1)::int,
         'Link a la compu por WhatsApp y recordatorio a las 48 h'
  union all
  (select 'Alta: se fueron en el paso «' || paso || '»', sum(se_cayeron_aca)::int,
          'Simplificar ese paso o permitir saltearlo'
   from interno.v_onboarding_funnel group by paso order by 2 desc limit 1)
  union all
  (select 'Tutorial: dejaron la misión «' || mision || '» (en el paso ' || coalesce(paso_mas_abandonado::text, '?') || ')',
          abandonadas::int, 'Revisar ese paso de la misión'
   from interno.v_misiones order by abandonadas desc limit 1)
  union all
  select 'Después del aha: vieron su campo y no anotaron nada',
         (select count(*) from interno.v_activacion_etapas
           where tiene_telemetria and nivel = 4 and dias_desde_registro >= 3)::int,
         'Proponerles la primera recorrida o cargar una factura'
`

/** Esta semana contra la anterior: mediana de cuánto tardan. */
const COMPARA_SQL = `
  with t as (
    select *, (now() at time zone 'America/Argentina/Buenos_Aires')::date - cohorte as dias
    from interno.v_tiempos where tiene_telemetria
  )
  select
    percentile_cont(0.5) within group (order by alta_min) filter (where dias between 0 and 6) as alta_ahora,
    percentile_cont(0.5) within group (order by alta_min) filter (where dias between 7 and 13) as alta_antes,
    percentile_cont(0.5) within group (order by aha_horas) filter (where dias between 0 and 6) as aha_ahora,
    percentile_cont(0.5) within group (order by aha_horas) filter (where dias between 7 and 13) as aha_antes,
    count(*) filter (where dias between 0 and 6) as n_ahora,
    count(*) filter (where dias between 7 and 13) as n_antes
  from t
`

const PRODUCTORES: { sql: string; columnas: Columna[] } = {
  sql: `
    select
      p.nombre, p.emails, p.registro,
      e.dispositivo_registro,
      case when not e.tiene_telemetria then 'Sin medición' else e.etapa end as etapa,
      ${QUE_HACER_SQL} as que_hacer,
      t.alta_min, t.aha_horas, e.setup, t.setup_horas, e.tipo_primera,
      p.ultima_apertura, p.dias_activos_7d,
      tu.misiones_completadas || ' hechas · ' || tu.misiones_abandonadas || ' dejadas' as misiones,
      tu.whatsapp + tu.preguntas as ayuda,
      p.cabezas,
      a.potreros_dibujados || ' de ' || p.potreros as potreros
    from interno.v_productores p
    join interno.v_activacion_etapas e using (empresa_id)
    join interno.v_aha_hoy a using (empresa_id)
    left join interno.v_tiempos t using (empresa_id)
    left join interno.v_tutoriales tu using (empresa_id)
    left join interno.v_onboarding_x_activacion x using (empresa_id)
    order by p.registro desc`,
  columnas: [
    ['nombre', 'Productor', 'texto'],
    ['emails', 'Email', 'email'],
    ['registro', 'Se registró', 'fecha'],
    ['dispositivo_registro', 'Desde', 'dispositivo'],
    ['etapa', 'Etapa', 'texto'],
    ['que_hacer', 'Qué le falta / qué hacer', 'largo'],
    ['alta_min', 'Alta (min)', 'decimal'],
    ['aha_horas', 'Horas hasta el aha', 'decimal'],
    ['setup', 'Setup', 'puntaje'],
    ['setup_horas', 'Horas hasta el Setup', 'decimal'],
    ['tipo_primera', 'Primera anotación', 'texto'],
    ['ultima_apertura', 'Última vez que abrió', 'fechahora'],
    ['dias_activos_7d', 'Días activos (7 d)', 'activo'],
    ['misiones', 'Misiones', 'texto'],
    ['ayuda', 'Pidió ayuda', 'entero'],
    ['cabezas', 'Cabezas', 'entero'],
    ['potreros', 'Potreros dibujados', 'texto'],
  ],
}

// ── Armado ─────────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const DISPOSITIVO: Record<string, string> = { movil: 'Celular', escritorio: 'Compu' }

/** El valor crudo de la base, listo para la celda según el tipo de columna. */
function celda(v: unknown, tipo: Tipo): string | number | null {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.join(', ')
  if (tipo === 'dispositivo') return DISPOSITIVO[String(v)] ?? String(v)
  // Fechas: la fecha sola como AAAA-MM-DD (sin corrimiento de huso), el
  // instante como ISO; el Apps Script las convierte a fechas de la planilla.
  if (v instanceof Date) return tipo === 'fecha' ? v.toISOString().slice(0, 10) : v.toISOString()
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number') return v
  if (['entero', 'decimal', 'puntaje', 'activo'].includes(tipo)) {
    const n = Number(v)
    return Number.isFinite(n) ? n : String(v)
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const n = (v: unknown) => Number(v ?? 0)
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : null)
const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10)

/** "18 h", "2,5 días", "6 min": lo más legible para cada magnitud. */
function duracion(horas: number | null): string {
  if (horas === null) return '—'
  if (horas < 1) return `${Math.round(horas * 60)} min`
  if (horas < 48) return `${Math.round(horas)} h`
  return `${(horas / 24).toFixed(1).replace('.', ',')} días`
}

function compara(ahora: number | null, antes: number | null, nAhora: number, nAntes: number, que: string, unidad: 'min' | 'h') {
  if (ahora === null || antes === null || nAhora < 3 || nAntes < 3) return null
  const fmt = (v: number) => (unidad === 'min' ? `${Math.round(v)} min` : duracion(v))
  const cambio = ahora < antes * 0.9 ? 'más rápido' : ahora > antes * 1.1 ? 'más lento' : 'igual'
  return `${que}: ${fmt(ahora)} esta semana contra ${fmt(antes)} la anterior (mediana) → ${cambio}.`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método' }, 405)
  const clave = req.headers.get('x-clave-planilla') ?? ''
  if (clave.length < 32) return json({ error: 'no autorizado' }, 401)

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 })
  try {
    const [{ ok }] = await sql`select interno.planilla_clave_ok(${clave}) as ok`
    if (!ok) return json({ error: 'no autorizado' }, 401)

    const [g] = await sql.unsafe(GENERAL_SQL)
    const ultimo = g.ultimo_evento ? (g.ultimo_evento as Date) : null
    const horasDesdeUltimo = ultimo ? (Date.now() - ultimo.getTime()) / 3600000 : null
    const salud = {
      ok: horasDesdeUltimo !== null && horasDesdeUltimo < 24,
      texto:
        horasDesdeUltimo === null
          ? 'No llegó nunca un evento'
          : horasDesdeUltimo < 24
            ? `La medición anda · último evento hace ${duracion(horasDesdeUltimo)}`
            : `Sin eventos hace ${duracion(horasDesdeUltimo)}: si hubo uso, algo se rompió`,
    }

    // 1 · El camino, etapa por etapa, contra su meta.
    const embudo = await sql.unsafe('select orden, total from interno.v_activacion_embudo order by orden')
    const cant = embudo.map((e) => n(e.total))
    const camino = cant.map((c, i) => {
      const orden = i + 1
      if (orden === 1) return { etapa: ETAPAS[1], cantidad: c, pct: null, meta: null, estado: 'base' }
      const previo = cant[i - 1]
      const p = pct(c, previo)
      const meta = METAS[orden]
      const estado = previo < MINIMO ? 'pocos' : p! >= meta ? 'bien' : p! >= meta * 0.7 ? 'atencion' : 'mal'
      return { etapa: ETAPAS[orden], cantidad: c, pct: p, meta, estado }
    })

    // 2 · Dónde se traba: las tres fugas que más gente afectan.
    const fugas = (await sql.unsafe(FUGAS_SQL))
      .map((f) => ({ que: String(f.que), n: n(f.n), hacer: String(f.hacer) }))
      .filter((f) => f.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)

    // 3 · A quién ayudar hoy.
    const ayudar = (await sql.unsafe(AYUDAR_SQL)).map((t) => ({
      nombre: String(t.nombre),
      email: String(t.emails ?? ''),
      dias: n(t.dias_desde_registro),
      etapa: ETAPAS[n(t.nivel)],
      hacer: String(t.que_hacer),
    }))

    // 4 · ¿Mejora con el tiempo? Por día de registro.
    const cohortes = (await sql.unsafe('select * from interno.v_cohortes order by dia desc limit 14')).map((c) => ({
      dia: (c.dia as Date).toISOString().slice(0, 10),
      enCurso: n(c.dias) < 7,
      registrados: n(c.registrados),
      alta: { pct: num(c.alta_pct), valor: num(c.alta_min) },
      aha: { pct: num(c.aha_pct), valor: num(c.aha_horas) },
      setup: { pct: num(c.setup_pct), valor: num(c.setup_horas) },
      anoto: num(c.anoto_pct),
    }))
    const [cmp] = await sql.unsafe(COMPARA_SQL)
    const comparaciones = [
      compara(num(cmp.alta_ahora), num(cmp.alta_antes), n(cmp.n_ahora), n(cmp.n_antes), 'El alta', 'min'),
      compara(num(cmp.aha_ahora), num(cmp.aha_antes), n(cmp.n_ahora), n(cmp.n_antes), 'Llegar al aha', 'h'),
    ].filter((x): x is string => x !== null)

    // 5 · ¿Vuelven? Productores activos por día, 30 días.
    const vuelven = (await sql.unsafe('select dia, productores from interno.v_uso_diario order by dia')).map((d) =>
      n(d.productores),
    )

    // En una frase, lo que dice todo junto.
    const titular =
      cant[0] === 0
        ? 'Todavía no se registró nadie con la medición puesta: el tablero se llena solo con los primeros registros después del deploy.'
        : `De cada 10 que se registran, ${Math.round((10 * cant[3]) / cant[0])} llegan a ver su campo y ${Math.round((10 * cant[5]) / cant[0])} forman el hábito.` +
          (n(g.del_celular) > 0 ? ` Del celular, ${n(g.del_celular) - n(g.celular_sin_compu)} de ${n(g.del_celular)} ya pasaron a la compu.` : '')

    const filas = await sql.unsafe(PRODUCTORES.sql)
    const productores = {
      columnas: PRODUCTORES.columnas.map(([, etiqueta, tipo]) => ({ etiqueta, tipo })),
      filas: filas.map((f) => PRODUCTORES.columnas.map(([c, , tipo]) => celda(f[c], tipo))),
    }

    return json({
      generado: new Date().toISOString(),
      version: 2,
      tablero: {
        salud,
        titular,
        productores: n(g.productores),
        medidos: n(g.medidos),
        camino,
        minimo: MINIMO,
        fugas,
        ayudar,
        cohortes,
        comparaciones,
        vuelven,
        color: VERDE,
      },
      productores,
    })
  } catch (err) {
    console.error('[planilla-telemetria]', err)
    return json({ error: 'falló la lectura' }, 500)
  } finally {
    await sql.end()
  }
})
