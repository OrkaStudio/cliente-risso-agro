// Edge function: planilla-telemetria
//
// Alimenta la planilla viva de telemetría en Google Sheets: el Apps Script de
// la planilla la llama cada hora y reescribe una hoja por vista de `interno`.
// Spec: clientes/risso-agro/especificaciones/2026-09-19-telemetria-onboarding-activacion
//
// POST con header `x-clave-planilla`. Sin JWT (Apps Script no tiene sesión de
// Supabase): la barrera es la clave, cuyo hash está en interno.planilla_clave.
// Respuesta: { generado, hojas: [{ nombre, columnas, filas }] }
//
// Lee con la conexión directa (SUPABASE_DB_URL) porque `interno` no está
// expuesto por la API, y así tiene que seguir.

import postgres from 'npm:postgres@3.4.5'

const HOJAS: [string, string][] = [
  ['Productores', 'select * from interno.v_productores order by registro desc'],
  ['Tutoriales', 'select * from interno.v_tutoriales order by nombre'],
  ['Misiones', 'select * from interno.v_misiones order by mision'],
  ['Uso', 'select * from interno.v_uso order by ultima_apertura desc nulls last'],
  ['Embudo onboarding', 'select * from interno.v_onboarding_funnel'],
  ['Tiempos onboarding', 'select * from interno.v_onboarding_tiempos'],
  ['Sesiones onboarding', 'select * from interno.v_onboarding_sesiones'],
  ['Eventos recientes', 'select * from interno.v_eventos_recientes'],
  ['Cuentas de prueba', 'select * from interno.v_pruebas order by ultimo desc'],
]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Fechas, jsonb y numéricos a algo que una celda entienda.
function celda(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return v as string | number | boolean
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método' }, 405)
  const clave = req.headers.get('x-clave-planilla') ?? ''
  if (clave.length < 32) return json({ error: 'no autorizado' }, 401)

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 })
  try {
    const [{ ok }] = await sql`select interno.planilla_clave_ok(${clave}) as ok`
    if (!ok) return json({ error: 'no autorizado' }, 401)

    const hojas = []
    for (const [nombre, consulta] of HOJAS) {
      const filas = await sql.unsafe(consulta)
      const columnas = filas.columns.map((c) => c.name)
      hojas.push({ nombre, columnas, filas: filas.map((f) => columnas.map((c) => celda(f[c]))) })
    }
    return json({ generado: new Date().toISOString(), hojas })
  } catch (err) {
    console.error('[planilla-telemetria]', err)
    return json({ error: 'falló la lectura' }, 500)
  } finally {
    await sql.end()
  }
})
