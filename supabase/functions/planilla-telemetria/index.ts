// Edge function: planilla-telemetria
//
// Alimenta la planilla viva de telemetría en Google Sheets: el Apps Script de
// la planilla la llama cada hora y dibuja un resumen y una hoja por vista.
// Spec: clientes/risso-agro/especificaciones/2026-09-19-telemetria-onboarding-activacion
//
// POST con header `x-clave-planilla`. Sin JWT (Apps Script no tiene sesión de
// Supabase): la barrera es la clave, cuyo hash está en interno.planilla_clave.
//
// El contenido (títulos, columnas en castellano, tipos, qué muestra cada hoja)
// vive acá; el Apps Script sólo dibuja. Cambiar una columna = redeployar esto,
// sin tocar la planilla.
//
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
  | 'pct' // 0–100
  | 'fecha'
  | 'fechahora'
  | 'sino'
  | 'puntaje' // puesta a punto, 0–5
  | 'dispositivo'
  | 'activo' // días activos: 0 se marca

type Columna = [clave: string, etiqueta: string, tipo: Tipo]

/** Un gráfico debajo de la tabla: el eje es una columna, las series otras. */
type Grafico = {
  tipo: 'barras' | 'columnas'
  titulo: string
  x: string
  series: string[]
  colores: string[]
  apilado: boolean
}

type Tabla = {
  subtitulo?: string
  descripcion?: string
  vacia: string
  sql: string
  columnas: Columna[]
  grafico?: Grafico
}

type Hoja = {
  nombre: string
  titulo: string
  descripcion: string
  color: string
  tablas: Tabla[]
}

const VERDE = '#178a55'
const AZUL = '#2f6f9f'
const TIERRA = '#b85c2e'
const GRIS = '#8a8a8a'
const CORAL = '#e07b67'

const HOJAS: Hoja[] = [
  {
    nombre: 'Productores',
    titulo: 'Productores',
    descripcion:
      'Una fila por productor real: en qué etapa está, cuánto usa la app y cuánto cargó de su campo.',
    color: VERDE,
    tablas: [
      {
        vacia: 'Todavía no hay productores reales registrados.',
        sql: `select p.*,
                case when not e.tiene_telemetria then 'Sin telemetría (se registró antes)' else e.etapa end as etapa,
                e.aha_dia
              from interno.v_productores p
              left join interno.v_activacion_etapas e using (empresa_id)
              order by p.registro desc`,
        columnas: [
          ['nombre', 'Productor', 'texto'],
          ['emails', 'Email', 'email'],
          ['registro', 'Se registró', 'fecha'],
          ['dias_desde_registro', 'Días desde el registro', 'entero'],
          ['etapa', 'Etapa', 'texto'],
          ['aha_dia', 'Llegó al aha', 'fecha'],
          ['ultima_apertura', 'Última vez que abrió', 'fechahora'],
          ['dias_activos_7d', 'Días activos (7 d)', 'activo'],
          ['dias_activos_30d', 'Días activos (30 d)', 'activo'],
          ['aperturas_movil', 'Aperturas en celular', 'entero'],
          ['aperturas_escritorio', 'Aperturas en compu', 'entero'],
          ['perfil', 'Perfil', 'texto'],
          ['puesta_a_punto', 'Setup (puesta a punto)', 'puntaje'],
          ['activada_7d', 'Setup 5 de 5 en 7 días', 'sino'],
          ['salida_onboarding', 'Onboarding', 'texto'],
          ['dispositivo_alta', 'Se registró desde', 'dispositivo'],
          ['bienvenida', 'Bienvenida', 'texto'],
          ['misiones_completadas', 'Misiones completadas', 'entero'],
          ['misiones_abandonadas', 'Misiones abandonadas', 'entero'],
          ['pidio_ayuda', 'Pidió ayuda por WhatsApp', 'entero'],
          ['cabezas', 'Cabezas', 'entero'],
          ['potreros', 'Potreros', 'entero'],
          ['potreros_dibujados', 'Potreros dibujados', 'entero'],
          ['recorridas', 'Recorridas', 'entero'],
          ['trabajos_manga', 'Trabajos de manga', 'entero'],
          ['movimientos_plata', 'Movimientos de plata', 'entero'],
          ['labores', 'Labores', 'entero'],
          ['pantallas_mas_vistas', 'Pantallas más vistas', 'largo'],
        ],
      },
    ],
  },
  {
    nombre: 'Activación',
    titulo: 'Activación',
    descripcion:
      'Del registro al hábito. El aha es ver su campo de verdad: todos los campos con contorno y los potreros del alta asignados a los dibujados. Sólo se logra en la compu: el celular tiene que llevarlo ahí.',
    color: VERDE,
    tablas: [
      {
        subtitulo: 'El embudo',
        descripcion:
          'Cada etapa pide la anterior. Sólo cuentan quienes se registraron con la telemetría puesta; los de los últimos 14 días todavía pueden avanzar.',
        vacia: '',
        sql: 'select * from interno.v_activacion_embudo order by orden',
        columnas: [
          ['etapa', 'Etapa', 'largo'],
          ['total', 'Productores', 'entero'],
          ['compu', 'Se registraron en la compu', 'entero'],
          ['celular', 'Se registraron en el celular', 'entero'],
          ['pct_del_total', '% del total', 'pct'],
          ['pct_de_la_anterior', '% de la etapa anterior', 'pct'],
          ['pct_celular', '% de los del celular', 'pct'],
          ['referencia', 'Referencia (literatura)', 'texto'],
        ],
        grafico: {
          tipo: 'barras',
          titulo: 'Embudo de activación',
          x: 'etapa',
          series: ['compu', 'celular'],
          colores: [VERDE, AZUL],
          apilado: true,
        },
      },
      {
        subtitulo: 'Productor por productor',
        descripcion: 'En qué etapa está cada uno, cuándo llegó a cada paso y qué le falta para el aha.',
        vacia: 'Todavía no hay productores reales registrados.',
        sql: `select e.*,
                case when not e.tiene_telemetria then 'Sin telemetría (se registró antes)' else e.etapa end as etapa_txt,
                case when e.aha_dia is not null then 'Nada: ya llegó'
                  else nullif(concat_ws(' · ',
                    case when a.campos = 0 then 'cargar un campo'
                         when a.campos_con_contorno < a.campos
                           then (a.campos - a.campos_con_contorno) || ' de ' || a.campos || ' campos sin contorno' end,
                    case when a.potreros_alta > 0 and a.potreros_alta_asignados < a.potreros_alta
                           then (a.potreros_alta - a.potreros_alta_asignados) || ' de ' || a.potreros_alta || ' potreros del alta sin asignar'
                         when a.potreros_alta = 0 and a.potreros_dibujados = 0 then 'dibujar un potrero' end
                  ), '') end as falta_aha,
                case when a.potreros_alta > 0 then a.potreros_alta_asignados || ' de ' || a.potreros_alta else '—' end as asignados_txt
              from interno.v_activacion_etapas e
              join interno.v_aha_hoy a using (empresa_id)
              order by e.registro desc`,
        columnas: [
          ['nombre', 'Productor', 'texto'],
          ['etapa_txt', 'Etapa', 'texto'],
          ['dispositivo_registro', 'Se registró desde', 'dispositivo'],
          ['registro', 'Se registró', 'fechahora'],
          ['dias_desde_registro', 'Días desde el registro', 'entero'],
          ['onboarding_fin', 'Terminó el onboarding', 'fechahora'],
          ['compu_desde', 'Llegó a la compu', 'fechahora'],
          ['dias_hasta_compu', 'Días hasta la compu', 'decimal'],
          ['aha_dia', 'Llegó al aha', 'fecha'],
          ['dias_hasta_aha', 'Días hasta el aha', 'entero'],
          ['falta_aha', 'Qué le falta para el aha', 'largo'],
          ['asignados_txt', 'Potreros del alta asignados', 'texto'],
          ['primera', 'Primera anotación', 'fechahora'],
          ['tipo_primera', 'Qué anotó', 'texto'],
          ['segunda', 'Otra anotación otro día', 'fechahora'],
          ['setup', 'Setup (puesta a punto)', 'puntaje'],
        ],
      },
    ],
  },
  {
    nombre: 'Uso',
    titulo: 'Uso de la app',
    descripcion: 'Cuándo y desde dónde abre la app cada productor, y si vuelven día a día.',
    color: AZUL,
    tablas: [
      {
        subtitulo: 'Por productor',
        vacia: 'Todavía no hay aperturas registradas.',
        sql: 'select * from interno.v_uso order by ultima_apertura desc nulls last',
        columnas: [
          ['nombre', 'Productor', 'texto'],
          ['ultima_apertura', 'Última vez que abrió', 'fechahora'],
          ['dias_activos_7d', 'Días activos (7 d)', 'activo'],
          ['dias_activos_30d', 'Días activos (30 d)', 'activo'],
          ['aperturas', 'Aperturas', 'entero'],
          ['aperturas_movil', 'En celular', 'entero'],
          ['aperturas_escritorio', 'En compu', 'entero'],
          ['pantallas_mas_vistas', 'Pantallas más vistas', 'largo'],
        ],
      },
      {
        subtitulo: 'Día por día (últimos 30 días)',
        descripcion: 'Productores distintos que abrieron la app cada día.',
        vacia: '',
        sql: 'select * from interno.v_uso_diario order by dia',
        columnas: [
          ['dia', 'Día', 'fecha'],
          ['productores', 'Productores', 'entero'],
          ['en_compu', 'En la compu', 'entero'],
          ['en_celular', 'En el celular', 'entero'],
        ],
        grafico: {
          tipo: 'columnas',
          titulo: 'Productores que abrieron la app, por día',
          x: 'dia',
          series: ['productores'],
          colores: [VERDE],
          apilado: false,
        },
      },
    ],
  },
  {
    nombre: 'Tutoriales',
    titulo: 'Tutoriales',
    descripcion:
      'De la bienvenida al final de «Tu campo, en marcha»: qué misiones hizo, cuánta ayuda pidió y en qué orden completó la puesta a punto.',
    color: AZUL,
    tablas: [
      {
        vacia: 'Todavía no hay productores reales registrados.',
        sql: 'select * from interno.v_tutoriales order by nombre',
        columnas: [
          ['nombre', 'Productor', 'texto'],
          ['puesta_a_punto_hoy', 'Setup hoy', 'puntaje'],
          ['bienvenida', 'Bienvenida', 'texto'],
          ['misiones_iniciadas', 'Misiones empezadas', 'entero'],
          ['misiones_completadas', 'Completadas', 'entero'],
          ['misiones_abandonadas', 'Abandonadas', 'entero'],
          ['cuales_completo', 'Cuáles completó', 'largo'],
          ['puntitos_tocados', 'Puntitos de ayuda tocados', 'entero'],
          ['asistente_abierto', 'Abrió el asistente', 'entero'],
          ['preguntas', 'Preguntas al asistente', 'entero'],
          ['whatsapp', 'WhatsApp de soporte', 'entero'],
          ['orden_puesta_a_punto', 'Orden en que completó la puesta a punto', 'largo'],
          ['horas_hasta_completa', 'Horas hasta completarla', 'decimal'],
        ],
      },
    ],
  },
  {
    nombre: 'Misiones',
    titulo: 'Misiones',
    descripcion:
      'Cada misión de la puesta a punto: cuántos la empiezan, cuántos la terminan, cuánto tardan y en qué paso la dejan.',
    color: AZUL,
    tablas: [
      {
        vacia: 'Todavía nadie empezó una misión.',
        sql: 'select * from interno.v_misiones order by iniciadas desc',
        columnas: [
          ['mision', 'Misión', 'texto'],
          ['iniciadas', 'Empezadas', 'entero'],
          ['completadas', 'Completadas', 'entero'],
          ['abandonadas', 'Abandonadas', 'entero'],
          ['pct_completadas', '% completadas', 'pct'],
          ['mediana_min', 'Minutos (mediana)', 'decimal'],
          ['paso_mas_abandonado', 'Paso donde más la dejan', 'entero'],
          ['desde_bienvenida', 'Desde la bienvenida', 'entero'],
          ['desde_pastilla', 'Desde la pastilla', 'entero'],
          ['desde_asistente', 'Desde el asistente', 'entero'],
        ],
        grafico: {
          tipo: 'barras',
          titulo: 'Misiones: completadas y abandonadas',
          x: 'mision',
          series: ['completadas', 'abandonadas'],
          colores: [VERDE, CORAL],
          apilado: true,
        },
      },
    ],
  },
  {
    nombre: 'Embudo onboarding',
    titulo: 'Embudo del onboarding',
    descripcion: 'Paso por paso del registro: cuántos llegan, cuántos pasan y dónde se caen.',
    color: TIERRA,
    tablas: [
      {
        vacia: 'Todavía ningún productor real hizo el onboarding con la telemetría puesta.',
        sql: 'select * from interno.v_onboarding_funnel',
        columnas: [
          ['orden', 'Nº', 'entero'],
          ['paso', 'Paso', 'texto'],
          ['dispositivo', 'Dispositivo', 'dispositivo'],
          ['iniciaron', 'Empezaron', 'entero'],
          ['vieron', 'Vieron el paso', 'entero'],
          ['completaron', 'Lo completaron', 'entero'],
          ['saltearon', 'Lo saltearon', 'entero'],
          ['se_cayeron_aca', 'Se fueron acá', 'entero'],
          ['pct_vieron', '% que llegó', 'pct'],
          ['pct_pasaron', '% que pasó', 'pct'],
        ],
      },
    ],
  },
  {
    nombre: 'Tiempos onboarding',
    titulo: 'Tiempos del onboarding',
    descripcion: 'Cuánto tarda cada paso del registro. La mediana es el caso típico; el p75, el lento.',
    color: TIERRA,
    tablas: [
      {
        vacia: 'Todavía ningún productor real hizo el onboarding con la telemetría puesta.',
        sql: 'select * from interno.v_onboarding_tiempos',
        columnas: [
          ['orden', 'Nº', 'entero'],
          ['paso', 'Paso', 'texto'],
          ['resultado', 'Resultado', 'texto'],
          ['dispositivo', 'Dispositivo', 'dispositivo'],
          ['n', 'Veces', 'entero'],
          ['mediana_s', 'Segundos (mediana)', 'decimal'],
          ['p75_s', 'Segundos (p75)', 'decimal'],
        ],
      },
    ],
  },
  {
    nombre: 'Sesiones onboarding',
    titulo: 'Sesiones del onboarding',
    descripcion: 'Cada vez que alguien hizo el registro: hasta dónde llegó, qué salteó y cuánto tardó.',
    color: TIERRA,
    tablas: [
      {
        vacia: 'Todavía ningún productor real hizo el onboarding con la telemetría puesta.',
        sql: 'select * from interno.v_onboarding_sesiones order by inicio desc',
        columnas: [
          ['email', 'Email', 'email'],
          ['inicio', 'Empezó', 'fechahora'],
          ['dispositivo', 'Dispositivo', 'dispositivo'],
          ['completado', 'Lo terminó', 'sino'],
          ['ultimo_paso_visto', 'Último paso visto', 'texto'],
          ['salteados', 'Salteó', 'texto'],
          ['errores', 'Errores', 'entero'],
          ['duracion_s', 'Duración (s)', 'entero'],
          ['arranco_aca', 'Empezó en esta sesión', 'sino'],
          ['ultimo_evento', 'Último evento', 'fechahora'],
        ],
      },
    ],
  },
  {
    nombre: 'Eventos recientes',
    titulo: 'Eventos recientes',
    descripcion: 'Los últimos 1000 eventos de productores reales, del más nuevo al más viejo.',
    color: GRIS,
    tablas: [
      {
        vacia: 'Todavía no llegó ningún evento de un productor real.',
        sql: 'select * from interno.v_eventos_recientes',
        columnas: [
          ['ts_cliente', 'Cuándo', 'fechahora'],
          ['empresa', 'Productor', 'texto'],
          ['email', 'Email', 'email'],
          ['evento', 'Evento', 'texto'],
          ['detalle', 'Detalle', 'largo'],
          ['dispositivo', 'Dispositivo', 'dispositivo'],
        ],
      },
    ],
  },
  {
    nombre: 'Cuentas de prueba',
    titulo: 'Cuentas de prueba',
    descripcion:
      'Cuentas de Orka (e2e, pruebas de telemetría). No cuentan en ninguna otra hoja; sirven para ver que los eventos llegan.',
    color: GRIS,
    tablas: [
      {
        vacia: 'No hay eventos de cuentas de prueba.',
        sql: 'select * from interno.v_pruebas order by ultimo desc',
        columnas: [
          ['email', 'Email', 'email'],
          ['eventos', 'Eventos', 'entero'],
          ['ultimo', 'Último evento', 'fechahora'],
          ['tipos', 'Tipos de evento', 'largo'],
        ],
      },
    ],
  },
]

const RESUMEN_SQL = `
  select
    (select count(*) from interno.v_productores) as productores,
    (select count(*) from interno.v_productores where dias_activos_7d > 0) as activos_7d,
    (select count(*) from interno.v_productores where salida_onboarding like 'completo%') as onboarding_completo,
    (select count(*) from interno.v_productores where salida_onboarding = 'sin telemetría') as sin_telemetria,
    (select count(*) from interno.v_activacion_etapas where aha_dia is not null) as aha,
    (select count(*) from interno.v_activacion_etapas where dispositivo_registro = 'movil') as del_celular,
    (select count(*) from interno.v_activacion_etapas where dispositivo_registro = 'movil' and compu_desde is not null) as celular_a_compu,
    (select count(*) from interno.v_activacion_etapas where nivel = 6) as habito,
    (select max(ultima_apertura) from interno.v_productores) as ultima_apertura,
    (select count(*) from interno.v_evento where ts_cliente > now() - interval '24 hours') as eventos_24h
`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const DISPOSITIVO: Record<string, string> = { movil: 'Celular', escritorio: 'Compu' }

/** El valor crudo de la base, listo para la celda según el tipo de columna. */
function celda(v: unknown, tipo: Tipo): string | number | null {
  if (v === null || v === undefined) return tipo === 'sino' ? '—' : null
  if (Array.isArray(v)) return v.join(', ')
  if (tipo === 'sino') return v ? 'Sí' : 'No'
  if (tipo === 'dispositivo') return DISPOSITIVO[String(v)] ?? String(v)
  // Fechas: la fecha sola como AAAA-MM-DD (sin corrimiento de huso), el
  // instante como ISO; el Apps Script las convierte a fechas de la planilla.
  if (v instanceof Date) return tipo === 'fecha' ? v.toISOString().slice(0, 10) : v.toISOString()
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number') return v
  if (tipo === 'entero' || tipo === 'decimal' || tipo === 'pct' || tipo === 'puntaje' || tipo === 'activo') {
    const n = Number(v)
    return Number.isFinite(n) ? n : String(v)
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const n = (v: unknown) => Number(v ?? 0)
const deTotal = (total: number) => `de ${total} productor${total === 1 ? '' : 'es'}`

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método' }, 405)
  const clave = req.headers.get('x-clave-planilla') ?? ''
  if (clave.length < 32) return json({ error: 'no autorizado' }, 401)

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 })
  try {
    const [{ ok }] = await sql`select interno.planilla_clave_ok(${clave}) as ok`
    if (!ok) return json({ error: 'no autorizado' }, 401)

    const [r] = await sql.unsafe(RESUMEN_SQL)
    const total = n(r.productores)
    const resumen = [
      { etiqueta: 'Productores', valor: total, tipo: 'entero', detalle: 'Cuentas reales, sin las de prueba' },
      {
        etiqueta: 'Usaron la app esta semana',
        valor: n(r.activos_7d),
        tipo: 'entero',
        detalle: `Abrieron la app en los últimos 7 días, ${deTotal(total)}`,
      },
      {
        etiqueta: 'Llegaron al aha',
        valor: n(r.aha),
        tipo: 'entero',
        detalle: `Campos con contorno y potreros del alta asignados, ${deTotal(total)}`,
      },
      {
        etiqueta: 'Hábito',
        valor: n(r.habito),
        tipo: 'entero',
        detalle: 'Otra anotación en otro día, antes del día 14',
      },
      {
        etiqueta: 'Terminaron el onboarding',
        valor: n(r.onboarding_completo),
        tipo: 'entero',
        detalle:
          n(r.sin_telemetria) > 0
            ? `${n(r.sin_telemetria) === 1 ? 'Uno se registró' : `${n(r.sin_telemetria)} se registraron`} antes de que se midiera`
            : `Completo o con salteos, ${deTotal(total)}`,
      },
      {
        etiqueta: 'Del celular a la compu',
        valor: n(r.celular_a_compu),
        tipo: 'entero',
        detalle:
          n(r.del_celular) === 0
            ? 'Todavía nadie se registró desde el celular'
            : `Abrieron la app en la compu, de ${n(r.del_celular)} que se registraron en el celular`,
      },
      {
        etiqueta: 'Última apertura de un productor',
        valor: r.ultima_apertura ? (r.ultima_apertura as Date).toISOString() : null,
        tipo: 'fechahora',
        detalle: 'Sirve para ver de un vistazo si hay uso',
      },
      {
        etiqueta: 'Eventos en las últimas 24 h',
        valor: n(r.eventos_24h),
        tipo: 'entero',
        detalle: 'Si da 0 y hubo productores usando la app, algo se rompió',
      },
    ]

    const hojas = []
    for (const h of HOJAS) {
      const tablas = []
      for (const t of h.tablas) {
        const filas = await sql.unsafe(t.sql)
        const claves = t.columnas.map(([c]) => c)
        tablas.push({
          subtitulo: t.subtitulo ?? null,
          descripcion: t.descripcion ?? null,
          vacia: t.vacia,
          columnas: t.columnas.map(([, etiqueta, tipo]) => ({ etiqueta, tipo })),
          filas: filas.map((f) => t.columnas.map(([c, , tipo]) => celda(f[c], tipo))),
          grafico: t.grafico
            ? { ...t.grafico, x: claves.indexOf(t.grafico.x), series: t.grafico.series.map((s) => claves.indexOf(s)) }
            : null,
        })
      }
      hojas.push({ nombre: h.nombre, titulo: h.titulo, descripcion: h.descripcion, color: h.color, tablas })
    }
    return json({
      generado: new Date().toISOString(),
      resumen,
      // El embudo de activación se repite en el Resumen.
      graficoResumen: { hoja: 'Activación', tabla: 0 },
      hojas,
    })
  } catch (err) {
    console.error('[planilla-telemetria]', err)
    return json({ error: 'falló la lectura' }, 500)
  } finally {
    await sql.end()
  }
})
