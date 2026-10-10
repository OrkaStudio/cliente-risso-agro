import type { NombreIcono } from '@/components/tropero/icono'
import type { CampoSinRecorrer, PotreroAtencion, TipoSenal } from '../para-atender-api'
import type { CategoriaConteo, Vencimiento } from '../api'
import { estadoDe, type CampoMapa } from '@/features/mapa/reglas'

// El Inicio de Tropero (página 35, «Inicio · El día»): qué se dice arriba, qué
// hay para atender hoy y los números del rodeo. Puro, para probarlo sin base.

export type Tono = 'problema' | 'atencion' | 'aviso'

/** Una cosa para atender hoy: qué pasa, por qué importa y el botón que la resuelve. */
export type Cosa = {
  key: string
  tono: Tono
  titulo: string
  detalle: string
  accion: { texto: string; to: string }
  /** Para la tarjeta, que se entiende sin leer: el ícono del problema, dónde
   *  (en grande), qué pasa en dos o tres palabras y los datos cortos. */
  icono: NombreIcono
  lugar: string
  que: string
  datos: string[]
  /** Si es una señal de la recorrida, lo que hace falta para marcarla resuelta. */
  senal?: { potreroId: string; observacionId: string; tipo: TipoSenal }
}

const ICONO_SENAL: Record<TipoSenal, NombreIcono> = {
  agua: 'Agua',
  pasto: 'Campos',
  electrico: 'Eléctrico',
  cultivo: 'Campos',
  conteo: 'Vaca',
  tratamiento: 'Vacuna',
  novedad: 'Ayuda',
}

const plata = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('es-AR')}`
const dias = (n: number) => (n === 1 ? 'un día' : n === 2 ? 'dos días' : `${n} días`)

/**
 * Lo de hoy, de lo más urgente a lo menos: los potreros que piden ir, lo que
 * venció, lo que vence en tres días y los campos que hace rato no se recorren.
 * Como mucho `max`: más que eso ya no es «hoy».
 */
export function cosasParaHoy(
  potreros: PotreroAtencion[],
  vencimientos: Vencimiento[],
  sinRecorrer: CampoSinRecorrer[],
  max = 4,
): Cosa[] {
  const dePotrero = (p: PotreroAtencion): Cosa => {
    const a = p.avisos[0]!
    const cuando = p.hace <= 0 ? 'Desde hoy' : p.hace === 1 ? 'Desde ayer' : `Desde hace ${dias(p.hace)}`
    const adentro = p.cabezas > 0 ? ` Hay ${p.cabezas} ${p.cabezas === 1 ? 'animal' : 'animales'} adentro.` : ''
    return {
      key: `p-${p.key}`,
      tono: p.nivel === 'atender' ? 'problema' : 'atencion',
      titulo: `${a.titulo} en el ${p.potrero}`,
      detalle: `${cuando}.${adentro}`,
      accion: { texto: 'Ver el potrero', to: p.to },
      icono: ICONO_SENAL[a.tipo],
      lugar: p.potrero,
      que: a.titulo,
      datos: [p.hace <= 0 ? 'hoy' : p.hace === 1 ? 'ayer' : `hace ${p.hace} días`, ...(p.cabezas > 0 ? [`${p.cabezas} animales`] : []), ...(p.avisos.length > 1 ? [`+${p.avisos.length - 1} más`] : [])],
      senal: { potreroId: p.key, observacionId: p.observacionId, tipo: a.tipo },
    }
  }
  const deVencimiento = (v: Vencimiento): Cosa => {
    const d = v.diasParaVencer ?? 0
    const cobro = v.tipo === 'ingreso'
    const cuando = d < 0 ? `Venció hace ${dias(-d)}` : d === 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : `Vence en ${dias(d)}`
    return {
      key: `v-${v.id}`,
      tono: d < 0 ? 'problema' : 'atencion',
      titulo: v.descripcion,
      detalle: v.monto ? `${cuando}. ${plata(v.monto)}.` : `${cuando}.`,
      accion: { texto: cobro ? 'Registrar el cobro' : 'Registrar el pago', to: '/agenda' },
      icono: 'Plata',
      lugar: v.monto ? plataCorta(cobro ? v.monto : -v.monto, true) : v.descripcion,
      que: v.descripcion,
      datos: [d < 0 ? `venció hace ${dias(-d)}` : d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${dias(d)}`],
    }
  }
  const atender = potreros.filter((p) => p.nivel === 'atender').map(dePotrero)
  const vencidos = vencimientos.filter((v) => (v.diasParaVencer ?? 0) < 0).map(deVencimiento)
  const prevenir = potreros.filter((p) => p.nivel === 'prevenir').map(dePotrero)
  const proximos = vencimientos
    .filter((v) => v.diasParaVencer !== null && v.diasParaVencer >= 0 && v.diasParaVencer <= 3)
    .map(deVencimiento)
  const recorrer = sinRecorrer.map<Cosa>((c) => ({
    key: `r-${c.key}`,
    tono: 'aviso',
    titulo: c.hace === null ? `${c.campo} todavía no se recorrió` : `${c.campo} no se recorre hace ${dias(c.hace)}`,
    detalle: c.cabezas > 0 ? `Tiene ${c.cabezas} cabezas.` : 'Una vuelta alcanza para saber cómo está.',
    accion: { texto: 'Recorrerlo', to: c.to },
    icono: 'Recorrida',
    lugar: c.campo,
    que: c.hace === null ? 'Nunca se recorrió' : 'Sin recorrer',
    datos: [c.hace === null ? 'nunca' : `hace ${c.hace} días`, ...(c.cabezas > 0 ? [`${c.cabezas} cabezas`] : [])],
  }))
  return [...atender, ...vencidos, ...prevenir, ...proximos, ...recorrer].slice(0, max)
}

const NUMEROS = ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']
const enLetras = (n: number) => NUMEROS[n] ?? String(n)

export function saludo(hora: number, nombre: string): string {
  const s = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'
  return nombre ? `${s}, ${nombre}.` : `${s}.`
}

/** «17 grados en La Porteña. Llovieron 142 mm en dos meses y hay cuatro cosas para atender.» */
export function fraseDelDia({
  temp,
  lugar,
  lluvia60,
  cosas,
}: {
  temp: number | null
  lugar: string | null
  lluvia60: number | null
  cosas: number
}): string {
  const partes: string[] = []
  if (temp !== null && lugar) partes.push(`${temp} ${Math.abs(temp) === 1 ? 'grado' : 'grados'} en ${lugar}.`)
  const atender = cosas === 0 ? 'no hay nada urgente' : `hay ${enLetras(cosas)} ${cosas === 1 ? 'cosa' : 'cosas'} para atender`
  if (lluvia60 !== null && lluvia60 > 0) partes.push(`Llovieron ${Math.round(lluvia60)} mm en dos meses y ${atender}.`)
  else partes.push(`${atender.charAt(0).toUpperCase()}${atender.slice(1)}.`)
  return partes.join(' ')
}

/** El 1 de julio de la campaña en curso (julio a junio), 'YYYY-MM-DD'. */
export function inicioDeCampania(hoy: Date): string {
  const y = hoy.getMonth() >= 6 ? hoy.getFullYear() : hoy.getFullYear() - 1
  return `${y}-07-01`
}

/** Lo que entra menos lo que sale en los próximos 30 días (sin lo ya vencido). */
export function proximos30(vencimientos: Vencimiento[]): number {
  return vencimientos
    .filter((v) => v.diasParaVencer !== null && v.diasParaVencer >= 0 && v.diasParaVencer <= 30)
    .reduce((s, v) => s + (v.tipo === 'ingreso' ? 1 : -1) * (v.monto ?? 0), 0)
}

/** $36.900.000 → «$36,9M»; $350.000 → «$350.000». */
export function plataCorta(n: number, signo = false): string {
  const s = signo ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: a >= 10_000_000 ? 1 : 2 })}M`
  return `${s}$${Math.round(a).toLocaleString('es-AR')}`
}

/** El rodeo en las cuatro franjas de la barra: vientres, cría, recría y machos adultos. */
export function franjasDelRodeo(cats: CategoriaConteo[]): { nombre: string; cabezas: number; clase: string }[] {
  const n = (c: CategoriaConteo['categoria']) => cats.find((x) => x.categoria === c)?.cabezas ?? 0
  return [
    { nombre: 'Vacas', cabezas: n('vaca'), clase: 'bg-principal' },
    { nombre: 'Terneros', cabezas: n('ternero') + n('ternera'), clase: 'bg-[#cf7b4f]' },
    { nombre: 'Recría', cabezas: n('vaquillona') + n('novillo') + n('capon'), clase: 'bg-acento' },
    { nombre: 'Toros', cabezas: n('toro'), clase: 'bg-[#7c8b69]' },
  ].filter((f) => f.cabezas > 0)
}

/**
 * «La Porteña: vas por el borde. Después, Los Pampas. Unos 12 minutos»: por
 * dónde sigue el mapa. Los minutos: 3 por el borde y 1 por potrero sin dibujar.
 */
export function porDondeVaElMapa(campos: CampoMapa[]): string {
  const pendientes = campos.filter((c) => estadoDe(c).tipo !== 'listo')
  if (!pendientes.length) return 'Ya está todo en el mapa.'
  const [actual, ...resto] = pendientes
  const e = estadoDe(actual!)
  const donde =
    e.tipo === 'sin-borde'
      ? 'vas por el borde'
      : e.tipo === 'sin-potreros'
        ? 'falta dibujar los potreros'
        : e.tipo === 'faltan'
          ? `${e.faltan.length === 1 ? 'falta un potrero' : `faltan ${e.faltan.length} potreros`}`
          : ''
  const minutos = pendientes.reduce((s, c) => {
    const x = estadoDe(c)
    return s + (x.tipo === 'sin-borde' ? 3 : 0) + c.potreros.filter((p) => !p.poligono).length
  }, 0)
  const despues = resto.length ? ` Después, ${resto.map((c) => c.nombre).join(' y ')}.` : ''
  return `${actual!.nombre}: ${donde}.${despues} Unos ${Math.max(2, minutos)} minutos`
}

/** Un dato del día en la cabecera: lo más importante, de un vistazo, y adónde lleva. */
export type Chip = { key: string; texto: string; tono: Tono | 'bien' | 'info'; destino: string }

/**
 * Lo que dice la cabecera, en orden de importancia (como mucho tres): lo que
 * hay que atender, lo vencido, y la lluvia de mañana si es probable. Sin nada
 * urgente, lo dice: también es información que el productor quiere.
 */
export function chipsDelDia({
  cosas,
  vencimientos,
  lluviaManana,
}: {
  cosas: Cosa[]
  vencimientos: Vencimiento[]
  /** Probabilidad de lluvia de mañana (%), si hay pronóstico. */
  lluviaManana: number | null
}): Chip[] {
  const chips: Chip[] = []
  const atender = cosas.filter((c) => !c.key.startsWith('v-')).length
  if (atender > 0)
    chips.push({ key: 'atender', texto: `${atender} ${atender === 1 ? 'cosa' : 'cosas'} en el campo`, tono: 'problema', destino: '#para-atender' })
  const vencidos = vencimientos.filter((v) => (v.diasParaVencer ?? 0) < 0)
  if (vencidos.length > 0)
    chips.push({ key: 'vencidos', texto: `${vencidos.length} ${vencidos.length === 1 ? 'pago vencido' : 'pagos vencidos'}`, tono: 'problema', destino: '/agenda' })
  else {
    const semana = vencimientos.filter((v) => v.diasParaVencer !== null && v.diasParaVencer >= 0 && v.diasParaVencer <= 7).length
    if (semana > 0) chips.push({ key: 'semana', texto: `${semana} ${semana === 1 ? 'vence' : 'vencen'} esta semana`, tono: 'atencion', destino: '/agenda' })
  }
  if (lluviaManana !== null && lluviaManana >= 40)
    chips.push({ key: 'lluvia', texto: `${lluviaManana} % de lluvia mañana`, tono: 'info', destino: '#clima' })
  if (chips.length === 0) chips.push({ key: 'ok', texto: 'Todo en orden hoy', tono: 'bien', destino: '#para-atender' })
  return chips.slice(0, 3)
}

export type PuntoPlata = { id: string; dia: number; monto: number; cobro: boolean; descripcion: string; fecha: string | null }

/**
 * La plata de los próximos días como línea de tiempo: lo que entra (arriba),
 * lo que sale (abajo), lo vencido (antes de hoy) y los tres números que la
 * resumen. Se entiende sin leer la lista.
 */
export function lineaDePlata(vencimientos: Vencimiento[], horizonte = 30) {
  const puntos: PuntoPlata[] = vencimientos
    .filter((v) => v.diasParaVencer !== null && v.diasParaVencer <= horizonte && (v.monto ?? 0) > 0)
    .map((v) => ({ id: v.id, dia: v.diasParaVencer!, monto: v.monto!, cobro: v.tipo === 'ingreso', descripcion: v.descripcion, fecha: v.fechaVencimiento }))
  const futuros = puntos.filter((p) => p.dia >= 0)
  const entra = futuros.filter((p) => p.cobro).reduce((s, p) => s + p.monto, 0)
  const sale = futuros.filter((p) => !p.cobro).reduce((s, p) => s + p.monto, 0)
  const vencidos = puntos.filter((p) => p.dia < 0)
  return {
    entra,
    sale,
    queda: entra - sale,
    vencido: vencidos.reduce((s, p) => s + (p.cobro ? -p.monto : p.monto), 0),
    vencidos,
    futuros,
    maximo: Math.max(1, ...puntos.map((p) => p.monto)),
  }
}

export type Cielo = 'sol' | 'nubes' | 'nublado' | 'lluvia' | 'tormenta' | 'noche'

/**
 * Cómo pintar la escena del molino con el clima de ahora (códigos WMO de
 * Open-Meteo). El viento va aparte: se suma a cualquier cielo (la rueda gira
 * rápido y las nubes corren). Ventoso desde 30 km/h.
 */
export function escenaDelClima(code: number, viento: number, dia: boolean): { cielo: Cielo; ventoso: boolean } {
  const ventoso = viento >= 30
  if (code >= 95) return { cielo: 'tormenta', ventoso }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 71 && code <= 77) || code === 85 || code === 86)
    return { cielo: 'lluvia', ventoso }
  if (!dia) return { cielo: 'noche', ventoso }
  if (code === 3 || code === 45 || code === 48) return { cielo: 'nublado', ventoso }
  if (code === 2) return { cielo: 'nubes', ventoso }
  return { cielo: 'sol', ventoso }
}
