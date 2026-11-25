import leerExcel from 'npm:read-excel-file@9.3.12/universal'
import { parse } from 'npm:csv-parse@5.6.0/sync'
import { esFecha, norm } from '../_shared/wa/texto.ts'

type Celda = string | number | boolean | Date | null
type Hoja = { nombre: string; filas: Celda[][] }
type Fila = { hoja: string; fila: number; rfid: string }
export type Planilla = {
  filas: Fila[]
  invalidas: number
  repetidas: number
  vacunas: string[]
  fechas: string[]
  campos: string[]
  cabeceras: string[]
}

const texto = (c: Celda | undefined) => c == null ? '' : String(c).trim()
const encabezado = (c: Celda) => norm(texto(c)).replace(/[_.-]/g, ' ')
const chip = /^(?:eid|rfid|chip|caravana(?: electronica| rfid)?|numero rfid)$/
const vacuna = /^(?:vacuna|producto aplicado|vacuna aplicada)$/
const aplicacion = /^(?:fecha (?:de )?(?:aplicacion|vacunacion)|aplicada el)$/
const campo = /^(?:campo|establecimiento)$/

function fecha(c: Celda | undefined) {
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  const s = texto(c)
  const d = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  const iso = d ? [d[3], d[2].padStart(2, '0'), d[1].padStart(2, '0')].join('-') : s
  return esFecha(iso) ? iso : null
}

export async function leerPlanilla(bytes: Uint8Array, nombre: string): Promise<Planilla> {
  let hojas: Hoja[]
  if (/\.xlsx$/i.test(nombre)) {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('El adjunto no es un XLSX')
    const xlsx = await leerExcel(Uint8Array.from(bytes).buffer)
    hojas = xlsx.map(h => ({ nombre: h.sheet, filas: h.data as Hoja['filas'] }))
  } else {
    const utf8 = new TextDecoder('utf-8').decode(bytes)
    const csv = utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(bytes) : utf8
    const pistas = csv.split(/\r\n|\n|\r/).slice(0, 25).join('\n')
    const sep = [';', '\t', ','].reduce((a, b) => pistas.split(b).length > pistas.split(a).length ? b : a)
    const filas = parse(csv, { bom: true, delimiter: sep, relax_column_count: true, max_record_size: 16_384 }) as string[][]
    hojas = [{ nombre, filas }]
  }
  if (hojas.length > 20 || hojas.reduce((n, h) => n + h.filas.length, 0) > 1500) {
    throw new Error('La planilla supera el alcance de la revisión')
  }

  const filas: Fila[] = []
  const vistos = new Set<string>()
  const cabeceras = new Set<string>()
  const vacunas = new Map<string, string>(), fechas = new Set<string>(), campos = new Map<string, string>()
  let invalidas = 0, repetidas = 0
  for (const h of hojas) {
    const titulo = h.filas.findIndex(f => f.some(c => chip.test(encabezado(c))))
    if (titulo < 0) {
      for (const c of h.filas.find(f => f.some(c => texto(c))) ?? []) {
        const nombre = texto(c)
        if (/^[\p{L}][\p{L}\s_.()/-]{1,50}$/u.test(nombre) && cabeceras.size < 20) cabeceras.add(nombre)
      }
      continue
    }
    const titulos = h.filas[titulo].map(encabezado)
    const cChip = titulos.findIndex(s => chip.test(s))
    const cVacuna = titulos.findIndex(s => vacuna.test(s))
    const cFecha = titulos.findIndex(s => aplicacion.test(s))
    const cCampo = titulos.findIndex(s => campo.test(s))
    for (const [n, f] of h.filas.slice(titulo + 1).entries()) {
      if (!f.some(c => texto(c))) continue
      const valor = f[cChip]
      const rfid = typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0
        ? String(valor).padStart(15, '0') : texto(valor).replace(/\s+/g, '')
      const fechaCruda = f[cFecha]
      const dia = fecha(fechaCruda)
      if (!/^\d{15}$/.test(rfid) || /^0+$/.test(rfid) || (!dia && texto(fechaCruda))) {
        invalidas++
        continue
      }
      const producto = texto(f[cVacuna]).slice(0, 120)
      const lugar = texto(f[cCampo]).slice(0, 100)
      if (producto) vacunas.set(norm(producto), producto)
      if (dia) fechas.add(dia)
      if (lugar) campos.set(norm(lugar), lugar)
      if (vistos.has(rfid)) repetidas++
      else {
        vistos.add(rfid)
        filas.push({ hoja: h.nombre, fila: titulo + n + 2, rfid })
      }
    }
  }
  return { filas, invalidas, repetidas, vacunas: [...vacunas.values()], fechas: [...fechas.values()], campos: [...campos.values()], cabeceras: [...cabeceras] }
}
