import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Grupo, Opciones, PanelLateral } from '@/components/tropero/panel-lateral'
import { Segmentos } from '@/components/tropero/segmentos'
import { CampoFecha } from '@/components/ui/campo-fecha'
import type { ComprobanteTipo, IvaLinea } from '@/features/analitica/api'
import { actividadLabel, fmtCompact } from '@/features/analitica/compute'
import { useCategorias, useCrearMovimiento, useCrearSerie, useMovimientos } from '@/features/analitica/hooks'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { usePotreros } from '@/features/campos/hooks'
import { formatearNumero, numeroDeFormateado } from '@/features/onboarding/numeros'
import { hoyLocal } from '@/lib/fecha'
import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { nombreMes } from './plata'

type Tipo = Database['public']['Enums']['tipo_movimiento']
type Medio = Database['public']['Enums']['medio_pago']
type Actividad = Database['public']['Enums']['actividad_movimiento']
type Modo = 'mano' | 'leyendo' | 'leyo' | 'cuotas'
/** Cómo se pagó: un medio real, o todavía no (va a la Agenda con su vencimiento). */
type Cuenta = Medio | 'pendiente'

type Leido = {
  tipo: Tipo | null
  monto: number | null
  fecha: string | null
  descripcion: string | null
  contraparte: string | null
  categoria_id: string | null
  cuit: string | null
  comprobante_tipo: ComprobanteTipo | null
  iva_lineas: IvaLinea[] | null
  confianza: 'alta' | 'media' | 'baja'
}

const CUENTAS: { valor: Medio; texto: string }[] = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'cheque', texto: 'Cheque' },
  { valor: 'mercadopago', texto: 'Mercado Pago' },
]
const FACTURAS: { valor: ComprobanteTipo | 'no'; texto: string }[] = [
  { valor: 'no', texto: 'Sin factura' },
  { valor: 'a', texto: 'Factura A' },
  { valor: 'b', texto: 'Factura B' },
  { valor: 'c', texto: 'Factura C' },
]
const ALICUOTAS = ['21', '10.5', '27'] as const
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const enDias = (n: number) => new Date(Date.parse(`${hoyLocal()}T12:00:00`) + n * 86_400_000).toISOString().slice(0, 10)
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00`) + n * 86_400_000).toISOString().slice(0, 10)
const fechaCorta = (f: string) => `${Number(f.slice(8))} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(f.slice(5, 7)) - 1]}`
const PLAZOS = [30, 60, 90, 120, 150, 180]
const sumarMeses = (f: string, n: number) => {
  const [y, m, d] = f.split('-').map(Number) as [number, number, number]
  const x = new Date(y, m - 1 + n, d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** La foto achicada a JPEG para leerla y guardarla. */
async function fotoAJpeg(file: File): Promise<{ base64: string; blob: Blob }> {
  const bitmap = await createImageBitmap(file)
  const escala = Math.min(1, 1500 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85))
  return { base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1]!, blob }
}

/**
 * «Anotar plata» (Figma página 35: «Anotar a mano», «Leyendo el comprobante»,
 * «Lo que leyó» y «En cuotas»), en el panel lateral. Guarda lo mismo que la carga
 * vieja: salió o entró, monto, en qué, campo, potrero, actividad, cómo se pagó
 * (o pendiente con su vencimiento), cheque, factura e IVA, proveedor y CUIT,
 * detalle, cuotas y la foto del comprobante. Sin cuentas bancarias ni «los dos
 * campos»: la base no los tiene y no se inventan (Lau, 03/11).
 */
export function AnotarPlata({
  empresaId,
  campoInicial,
  potreroInicial,
  renderTrigger,
  vence = false,
  venceInicial,
}: {
  empresaId: string
  campoInicial?: string
  potreroInicial?: string
  /** «Algo que vence» (la Agenda): arranca como pendiente y pide el vencimiento. */
  vence?: boolean
  /** El día ya elegido (tocando un día del calendario de la Agenda). */
  venceInicial?: string
  /** El botón que lo abre; `escanear` arranca pidiendo la foto. */
  renderTrigger: (abrir: (escanear?: boolean) => void) => ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const [vez, setVez] = useState(0)
  const [escanear, setEscanear] = useState(false)
  return (
    <>
      {renderTrigger((e = false) => {
        setEscanear(e)
        setVez((v) => v + 1)
        setAbierto(true)
      })}
      {/* La key cambia al abrir: arranca de cero y sale con su animación. */}
      <Formulario key={vez} vence={vence} venceInicial={venceInicial} empresaId={empresaId} campoInicial={campoInicial} potreroInicial={potreroInicial} abierto={abierto} escanear={escanear && vez > 0} onCerrar={() => setAbierto(false)} />
    </>
  )
}

function Formulario({
  vence: modoVence,
  venceInicial,
  empresaId,
  campoInicial,
  potreroInicial,
  abierto,
  escanear,
  onCerrar,
}: {
  vence: boolean
  venceInicial?: string
  empresaId: string
  campoInicial?: string
  potreroInicial?: string
  abierto: boolean
  escanear: boolean
  onCerrar: () => void
}) {
  const { campos, elegido } = useCampoElegido()
  const categorias = useCategorias()
  const movs = useMovimientos()
  const crear = useCrearMovimiento()
  const crearSerie = useCrearSerie()
  const archivo = useRef<HTMLInputElement>(null)

  const [modo, setModo] = useState<Modo>('mano')
  const [tipo, setTipo] = useState<Tipo>('gasto')
  const [monto, setMonto] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [todasCategorias, setTodasCategorias] = useState(false)
  const [campoId, setCampoId] = useState(campoInicial ?? elegido?.id ?? (campos.length === 1 ? campos[0]!.id : ''))
  const [potreroId, setPotreroId] = useState(potreroInicial ?? '')
  const [actividad, setActividad] = useState<Actividad | ''>('')
  const [cuenta, setCuenta] = useState<Cuenta | ''>(modoVence ? 'pendiente' : '')
  // En «Algo que vence», cómo se va a pagar (queda pendiente igual).
  const [previsto, setPrevisto] = useState<Medio | ''>('')
  const [esEcheq, setEsEcheq] = useState<'fisico' | 'echeq'>('fisico')
  const [chequeBanco, setChequeBanco] = useState('')
  const [chequeNumero, setChequeNumero] = useState('')
  // Sin preelegir (Lau, 05/11): el productor toca cuándo fue.
  const [cuando, setCuando] = useState<'hoy' | 'otro' | ''>('')
  const [fecha, setFecha] = useState(hoyLocal())
  const [vence, setVence] = useState(venceInicial ?? '')
  const [factura, setFactura] = useState<ComprobanteTipo | 'no'>('no')
  const [alicuota, setAlicuota] = useState<(typeof ALICUOTAS)[number]>('21')
  const [lineasLeidas, setLineasLeidas] = useState<IvaLinea[] | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [cuit, setCuit] = useState('')
  const [foto, setFoto] = useState<Blob | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [leidos, setLeidos] = useState<Set<string>>(new Set())
  // En varios pagos (Lau, 06/11): a plazos (30, 60, 90 días, como cobran las consignatarias) o todos los meses.
  const [forma, setForma] = useState<'plazos' | 'mensual' | ''>('')
  const [plazos, setPlazos] = useState<number[]>([])
  const [otroPlazo, setOtroPlazo] = useState('')
  const [meses, setMeses] = useState('')
  const [otrosMeses, setOtrosMeses] = useState(false)
  const [primera, setPrimera] = useState(hoyLocal())
  // Lo que escribió: el total (una venta que se cobra en partes) o lo de cada pago (un sueldo, una cuota).
  const [esTotal, setEsTotal] = useState<'total' | 'cada'>('total')
  const [error, setError] = useState<string | null>(null)
  // A mano, en tres pasos chicos (Lau, 05/11: «el form es un quilombo»): cuánto y en qué; de dónde y cuándo; el detalle.
  const [paso, setPaso] = useState<1 | 2 | 3>(1)

  const potreros = usePotreros(campoId)
  const total = numeroDeFormateado(monto) ?? 0
  const esGasto = tipo === 'gasto'
  const pendiente = cuenta === 'pendiente'
  const conIva = factura === 'a' || factura === 'b'
  // El IVA: el leído de la factura, o el que sale del total con la alícuota elegida.
  const lineas: IvaLinea[] = !conIva || total <= 0 ? [] : (lineasLeidas ?? [{ concepto: null, neto: Math.round((total / (1 + Number(alicuota) / 100)) * 100) / 100, alicuota: Number(alicuota), iva: Math.round((total - total / (1 + Number(alicuota) / 100)) * 100) / 100 }])
  const neto = lineas.reduce((s, l) => s + l.neto, 0)
  const iva = lineas.reduce((s, l) => s + l.iva, 0)

  // En qué: primero lo que más usa para este tipo, después el resto.
  const opcionesCategoria = useMemo(() => {
    const deTipo = (categorias.data ?? []).filter((c) => c.aplica_a === null || c.aplica_a === tipo)
    const usos = new Map<string, number>()
    for (const m of movs.data ?? []) if (m.tipo === tipo && m.categoria_id) usos.set(m.categoria_id, (usos.get(m.categoria_id) ?? 0) + 1)
    return deTipo.sort((a, b) => (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre))
  }, [categorias.data, movs.data, tipo])
  // Las 5 que más usa (y la elegida, si es otra); el resto, a un toque, y se cierra al elegir.
  const masUsadas = opcionesCategoria.slice(0, 5)
  const elegidaAparte = opcionesCategoria.find((c) => c.id === categoriaId && !masUsadas.includes(c))
  const visibles = todasCategorias ? opcionesCategoria : elegidaAparte ? [...masUsadas, elegidaAparte] : masUsadas

  // Las fechas de cada pago: a N días desde «desde», o un pago por mes.
  const nMeses = Math.max(0, Math.min(60, Math.floor(Number(meses) || 0)))
  const fechasSerie = forma === 'plazos' ? [...plazos].sort((a, b) => a - b).map((d) => sumarDias(primera, d)) : forma === 'mensual' ? Array.from({ length: nMeses }, (_, i) => sumarMeses(primera, i)) : []
  const veces = fechasSerie.length
  const cuota = esTotal === 'cada' ? total : veces > 0 ? Math.round((total / veces) * 100) / 100 : 0
  const totalSerie = cuota * veces
  const ocupado = crear.isPending || crearSerie.isPending
  const nombreCategoria = opcionesCategoria.find((c) => c.id === categoriaId)?.nombre
  const nombreCampo = campos.find((c) => c.id === campoId)?.nombre

  function faltante(paraCuotas = false): string | null {
    if (total <= 0) return 'Escribí cuánto fue.'
    if (!categoriaId) return `Tocá en qué ${esGasto ? 'se fue' : 'entró'}.`
    if (!campoId) return 'Tocá de qué campo es.'
    if (paraCuotas) return null
    if (!cuenta) return esGasto ? 'Tocá cómo lo pagaste, o «Todavía no».' : 'Tocá cómo lo cobraste, o «Todavía no».'
    if (pendiente && !vence) return `Poné cuándo ${esGasto ? 'vence el pago' : 'lo cobrás'}.`
    if (!pendiente && !cuando && modo !== 'leyo') return `Tocá cuándo ${esGasto ? 'salió' : 'entró'}.`
    return null
  }

  /** Lo que falta para pasar del paso 1 (cuánto y en qué) al 2. */
  function faltaPaso1(): string | null {
    if (total <= 0) return 'Escribí cuánto fue.'
    if (!categoriaId) return `Tocá en qué ${esGasto ? 'se fue' : 'entró'}.`
    return null
  }

  async function leerFoto(file: File) {
    setError(null)
    setModo('leyendo')
    try {
      const { base64, blob } = await fotoAJpeg(file)
      setFoto(blob)
      setFotoUrl((u) => {
        if (u) URL.revokeObjectURL(u)
        return URL.createObjectURL(blob)
      })
      const cats = (categorias.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, grupo: c.grupo, aplica_a: c.aplica_a }))
      const { data, error: e } = await supabase.functions.invoke<Leido>('extraer-comprobante', { body: { imageBase64: base64, mediaType: 'image/jpeg', categorias: cats } })
      if (e) throw new Error(e.message)
      if (!data || 'error' in data) throw new Error((data as { error?: string } | null)?.error ?? 'No se pudo leer')
      const marcados = new Set<string>()
      if (data.tipo === 'gasto' || data.tipo === 'ingreso') setTipo(data.tipo)
      if (data.monto && data.monto > 0) {
        setMonto(formatearNumero(String(Math.round(data.monto))))
        marcados.add('monto')
      }
      if (data.fecha) {
        setCuando(data.fecha === hoyLocal() ? 'hoy' : 'otro')
        setFecha(data.fecha)
        marcados.add('fecha')
      }
      if (data.categoria_id) setCategoriaId(data.categoria_id)
      if (data.descripcion) {
        setDescripcion(data.descripcion)
        marcados.add('descripcion')
      }
      if (data.contraparte) {
        setContraparte(data.contraparte)
        marcados.add('contraparte')
      }
      if (data.cuit) {
        setCuit(data.cuit)
        marcados.add('cuit')
      }
      if (data.comprobante_tipo) {
        setFactura(data.comprobante_tipo)
        marcados.add('factura')
      }
      if (Array.isArray(data.iva_lineas) && data.iva_lineas.length) {
        setLineasLeidas(data.iva_lineas.map((l) => ({ concepto: l.concepto ?? null, neto: Number(l.neto) || 0, alicuota: Number(l.alicuota) || 21, iva: Number(l.iva) || 0 })))
        marcados.add('iva')
      }
      setLeidos(marcados)
      setModo('leyo')
      if (data.confianza === 'baja') toast.warning('La foto se ve difícil: revisá bien lo que leyó.')
    } catch (e) {
      setModo('mano')
      setError(`No pude leer el comprobante (${e instanceof Error ? e.message : 'error'}). Cargalo a mano: la foto queda guardada.`)
    }
  }

  // Al pasar a cuotas (o volver), el panel arranca arriba: si no, quedaba bajado y se cortaba lo primero.
  useEffect(() => {
    document.querySelectorAll('[role="dialog"] .overflow-y-auto').forEach((e) => e.scrollTo(0, 0))
  }, [modo])

  // «Escanear» desde Plata: pide la foto apenas se abre (el formulario se monta de nuevo en cada apertura).
  useEffect(() => {
    if (abierto && escanear) archivo.current?.click()
  }, [abierto, escanear])

  async function guardar() {
    setError(null)
    const f = faltante()
    if (f) return setError(f)
    const dia = cuando === 'otro' ? fecha : hoyLocal()
    const medioFinal = pendiente ? previsto : cuenta
    try {
      await crear.mutateAsync({
        empresaId,
        tipo,
        categoriaId,
        campoId,
        potreroId: potreroId || null,
        monto: total,
        fechaDevengo: pendiente ? vence : dia,
        fechaVencimiento: pendiente ? vence : null,
        fechaCobroPago: pendiente ? null : dia,
        medioPago: pendiente ? previsto || null : (cuenta as Medio),
        actividad: actividad || null,
        descripcion,
        esEcheq: medioFinal === 'cheque' && esEcheq === 'echeq',
        chequeNumero: medioFinal === 'cheque' ? chequeNumero : '',
        chequeBanco: medioFinal === 'cheque' ? chequeBanco : '',
        contraparte,
        cuit,
        comprobanteTipo: factura === 'no' ? null : factura,
        ivaLineas: lineas,
        comprobanteImg: foto,
      })
      toast.success(`Listo: ${esGasto ? 'salieron' : 'entraron'} ${pesos(total)}`, { description: pendiente ? 'Quedó en la Agenda para cuando vence.' : 'Lo ves en los movimientos.' })
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }

  async function guardarCuotas() {
    setError(null)
    const f = faltante(true)
    if (f) return setError(f)
    if (!forma) return setError(`Tocá cómo ${esGasto ? 'se paga' : 'se cobra'}: a plazos o todos los meses.`)
    if (!veces) return setError(forma === 'plazos' ? 'Tocá a cuántos días es cada pago.' : 'Tocá cuántos meses.')
    try {
      await crearSerie.mutateAsync({
        empresaId,
        tipo,
        categoriaId,
        campoId,
        potreroId: potreroId || null,
        actividad: actividad || null,
        montoCuota: cuota,
        frecuencia: 'mensual',
        primeraFecha: fechasSerie[0]!,
        cantidad: veces,
        fechas: fechasSerie,
        // Un sueldo o un alquiler (lo mismo cada mes) no lleva «cuota 3/12».
        sinNumerar: forma === 'mensual' && esTotal === 'cada',
        descripcion: descripcion.trim() || nombreCategoria || (esGasto ? 'Gasto' : 'Ingreso'),
        medioPago: null,
      })
      toast.success(`Listo: ${veces} ${veces === 1 ? 'pago' : 'pagos'} de ${pesos(cuota)} en la Agenda`, { description: `El primero el ${Number(fechasSerie[0]!.slice(8))} de ${nombreMes(fechasSerie[0]!.slice(0, 7))}.` })
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }

  const inputFoto = (
    <input
      ref={archivo}
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) void leerFoto(file)
      }}
    />
  )
  // El aviso va en el pie, arriba del botón: siempre a la vista, aunque el panel esté scrolleado.
  const errorAviso = error && (
    <p role="alert" className="mb-3 rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">
      {error}
    </p>
  )

  // ===== Leyendo el comprobante =====
  if (modo === 'leyendo') {
    return (
      <PanelLateral chico abierto={abierto} onCerrar={onCerrar} titulo="Leyendo el comprobante…" bajada="Un momento. Después revisás lo que leyó." pie={<p className="text-center text-[13.5px] text-texto-suave">Si no la lee bien, la cargás a mano y la foto queda guardada.</p>}>
        {inputFoto}
        <div className="relative grid h-[340px] place-items-center overflow-hidden rounded-[24px] bg-superficie-hundida">
          {fotoUrl ? <img src={fotoUrl} alt="El comprobante" className="max-h-[300px] max-w-[85%] rotate-[-1.5deg] rounded-[6px] shadow-[0_12px_30px_rgba(19,27,22,0.18)]" /> : <Icono nombre="Comprobante" />}
          <span aria-hidden className="absolute inset-x-8 top-0 h-[2px] animate-[escaneo_1.8s_ease-in-out_infinite] bg-acento shadow-[0_0_24px_6px_rgba(236,196,106,0.55)]" />
        </div>
      </PanelLateral>
    )
  }

  // ===== En cuotas =====
  if (modo === 'cuotas') {
    const verbo = esGasto ? 'pagás' : 'cobrás'
    const color = esGasto ? 'text-estado-problema-texto' : 'text-estado-bien-texto'
    const elegirForma = (f: 'plazos' | 'mensual') => {
      setForma(f)
      // Lo esperable de cada una: una venta a plazos es el total; un sueldo, lo de cada mes.
      setEsTotal(f === 'plazos' ? 'total' : 'cada')
    }
    return (
      <PanelLateral
        abierto={abierto}
        onCerrar={onCerrar}
        chico
        ancho
        onVolver={() => (setError(null), setModo('mano'), setPaso(2))}
        titulo={esGasto ? 'Lo pagás en varios pagos' : 'Lo cobrás en varios pagos'}
        bajada={[descripcion.trim(), nombreCategoria, nombreCampo].filter(Boolean).join(', ')}
        pie={
          <>
            {errorAviso}
            <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado} onClick={() => void guardarCuotas()}>
              {veces > 0 ? `Anotar ${veces} ${veces === 1 ? 'pago' : 'pagos'} de ${fmtCompact(cuota)}` : 'Anotar los pagos'}
            </BotonPrincipal>
          </>
        }
      >
        {/* Cómo se paga: dos tarjetas, cada una con su ejemplo. */}
        <div role="radiogroup" aria-label="Cómo" className="grid grid-cols-2 gap-2.5">
          {(
            [
              ['plazos', 'A plazos', esGasto ? 'A 30, 60, 90 días' : 'A 30, 60, 90 días, como pagan las consignatarias'],
              ['mensual', 'Todos los meses', esGasto ? 'Un sueldo, un alquiler, una cuota' : 'Un alquiler que cobrás'],
            ] as const
          ).map(([v, t, ej]) => (
            <button key={v} type="button" role="radio" aria-checked={forma === v} onClick={() => elegirForma(v)} className={cn('flex flex-col gap-1 rounded-[18px] border-[1.5px] p-4 text-left transition-colors', forma === v ? 'border-principal bg-principal-suave/70' : 'border-borde bg-superficie hover:border-neutro-300')}>
              <span className="t-tarjeta text-texto">{t}</span>
              <span className="text-[13.5px] leading-snug text-texto-suave">{ej}</span>
            </button>
          ))}
        </div>

        {forma === 'plazos' && (
          <>
            <Grupo titulo="A cuántos días · tocá todos los que sean" className="mt-5">
              <div role="group" aria-label="A cuántos días" className="flex flex-wrap gap-2">
                {[...new Set([...PLAZOS, ...plazos])].sort((a, b) => a - b).map((d) => {
                  const si = plazos.includes(d)
                  return (
                    <button key={d} type="button" aria-pressed={si} onClick={() => setPlazos((xs) => (si ? xs.filter((x) => x !== d) : [...xs, d]))} className={cn('inline-flex h-10 items-center rounded-full border-[1.5px] px-4 text-[14.5px] font-semibold transition-colors', si ? 'border-acento bg-acento text-acento-texto' : 'border-borde bg-superficie text-texto hover:border-neutro-300')}>
                      {d} días
                    </button>
                  )
                })}
                <span className="inline-flex h-10 items-center gap-1 rounded-full border-[1.5px] border-dashed border-borde bg-superficie pr-1 pl-3">
                  <input aria-label="Otro plazo, en días" inputMode="numeric" placeholder="Otro" value={otroPlazo} onChange={(e) => setOtroPlazo(e.target.value.replace(/\D/g, '').slice(0, 3))} className="w-12 bg-transparent text-[14.5px] font-semibold outline-none placeholder:text-texto-suave" />
                  <button type="button" disabled={!Number(otroPlazo)} onClick={() => (setPlazos((xs) => [...new Set([...xs, Number(otroPlazo)])]), setOtroPlazo(''))} className="h-8 rounded-full bg-principal px-3 text-[13px] font-bold text-principal-texto disabled:opacity-40">
                    Sumar
                  </button>
                </span>
              </div>
            </Grupo>
            <Grupo titulo={esGasto ? 'Contando desde · el día de la compra' : 'Contando desde · el día de la venta'}>
              <CampoFecha value={primera} onChange={setPrimera} ariaLabel="Contando desde" />
            </Grupo>
          </>
        )}
        {forma === 'mensual' && (
          <>
            <Grupo titulo="Cuántos meses" className="mt-5">
              <Opciones etiqueta="Cuántos meses" opciones={[...['3', '6', '12', '24'].map((v) => ({ valor: v, texto: v === '12' ? '12 · un año' : v === '24' ? '24 · dos años' : v })), { valor: 'otra', texto: 'Otro' }]} elegidas={[otrosMeses ? 'otra' : meses]} onTocar={(v) => (v === 'otra' ? (setOtrosMeses(true), setMeses('')) : (setOtrosMeses(false), setMeses(v)))} />
              {otrosMeses && <CampoTexto className="mt-3" etiqueta="Cuántos meses" inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value.replace(/\D/g, '').slice(0, 2))} autoFocus />}
            </Grupo>
            <Grupo titulo={esGasto ? 'El primero vence' : 'El primero lo cobrás'}>
              <CampoFecha value={primera} onChange={setPrimera} ariaLabel="El primero" />
            </Grupo>
          </>
        )}

        {forma && (
          <Grupo titulo={`Los ${fmtCompact(total)} que escribiste son`}>
            <Segmentos etiqueta="Lo que escribiste es" valor={esTotal} onCambio={setEsTotal} opciones={[{ valor: 'total', texto: 'El total, se divide' }, { valor: 'cada', texto: 'Lo de cada pago' }]} />
          </Grupo>
        )}

        {/* Cómo queda: cada pago con su fecha y su monto. */}
        {veces > 0 && (
          <section aria-label="Cómo queda" className="mt-5 overflow-hidden rounded-[18px] border border-borde bg-superficie">
            <p className="flex items-baseline justify-between border-b border-borde px-4 py-3 text-[14px] font-semibold text-texto-suave">
              <span>
                {veces} {veces === 1 ? 'pago' : 'pagos'} · {verbo}
              </span>
              <b className={cn('t-cifra', color)}>
                {esGasto ? '−' : '+'}
                {pesos(totalSerie)} en total
              </b>
            </p>
            <ol className={cn('grid gap-x-4 px-4 py-3', veces > 6 ? 'grid-cols-3' : 'grid-cols-1')}>
              {fechasSerie.slice(0, 24).map((f, i) => (
                <li key={f + i} className="flex items-baseline justify-between gap-2 py-1 text-[14.5px]">
                  <span className="text-texto">
                    {forma === 'plazos' ? <b className="font-semibold">{[...plazos].sort((a, b) => a - b)[i]} días</b> : null}
                    <span className={cn(forma === 'plazos' && 'ml-1.5 text-texto-suave')}>{fechaCorta(f)}</span>
                  </span>
                  <span className={cn('t-cifra-chica', color)}>{fmtCompact(cuota)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <p className="mt-4 flex items-start gap-2.5 text-[13.5px] text-texto-suave">
          <Icono nombre="Agenda" tamano={16} className="mt-0.5 shrink-0" />
          Van a la Agenda. Cuando {esGasto ? 'pagás uno, lo marcás' : 'cobrás uno, lo marcás'} y pasa a Plata.
        </p>
      </PanelLateral>
    )
  }

  // ===== A mano (en pasos), o lo que leyó de la foto (todo junto, para revisar) =====
  const leyo = modo === 'leyo'
  const amarillo = (k: string) => leyo && leidos.has(k)
  const ve = (n: 1 | 2 | 3) => leyo || paso === n
  const PASOS = ['Cuánto y en qué', modoVence ? 'Cuándo vence y de dónde' : 'De dónde y cuándo', 'El detalle, si querés'] as const
  function seguir() {
    setError(null)
    if (paso === 1) {
      const f = faltaPaso1()
      if (f) return setError(f)
      return setPaso(2)
    }
    const f = faltante()
    if (f) return setError(f)
    setPaso(3)
  }

  const bloqueTipo = !leyo && <Segmentos etiqueta="Salió o entró" valor={tipo === 'gasto' ? 'salio' : 'entro'} onCambio={(v) => (setTipo(v === 'salio' ? 'gasto' : 'ingreso'), setCategoriaId(''))} opciones={modoVence ? [{ valor: 'salio', texto: 'A pagar' }, { valor: 'entro', texto: 'A cobrar' }] : [{ valor: 'salio', texto: 'Salió' }, { valor: 'entro', texto: 'Entró' }]} />
  const bloqueMonto = (
    <>
      {/* El monto, grande: es lo primero que se mira. */}
      <label className={cn('mt-5 flex items-baseline gap-1 rounded-[18px] px-1', amarillo('monto') && 'bg-acento/35 px-3', leyo && !fotoUrl && 'mt-0')}>
        <span className={cn('titulo-display shrink-0 text-[44px] whitespace-nowrap', esGasto ? 'text-estado-problema-texto/70' : 'text-estado-bien-texto/70')}>{esGasto ? '−$' : '+$'}</span>
        <input aria-label="Cuánto" inputMode="numeric" placeholder="0" value={monto} onChange={(e) => (setMonto(formatearNumero(e.target.value)), setLeidos((s) => (s.delete('monto'), new Set(s))))} autoFocus={!leyo} className={cn('titulo-display cifra min-w-[2ch] max-w-full bg-transparent text-[56px] [field-sizing:content] leading-tight tracking-[-0.03em] outline-none placeholder:text-texto/25', esGasto ? 'text-estado-problema-texto' : 'text-estado-bien-texto')} />
      </label>
      {!leyo && conIva && iva > 0 && (
        <p className="mt-1 text-[14px] text-texto-suave">
          Neto {pesos(neto)} + IVA {lineasLeidas ? '' : `${alicuota.replace('.', ',')} % `}
          {pesos(iva)}.{factura === 'a' && esGasto ? ' Con factura A, el IVA es crédito.' : ''}
        </p>
      )}
    </>
  )
  const bloqueEnQue = (
    <Grupo titulo={todasCategorias ? (esGasto ? 'En qué · todas' : 'De qué · todas') : esGasto ? 'En qué · las que más usás' : 'De qué · las que más usás'} className="mt-6">
      <Opciones etiqueta="En qué" opciones={[...visibles.map((c) => ({ valor: c.id, texto: c.nombre })), ...(!todasCategorias && opcionesCategoria.length > visibles.length ? [{ valor: '__otra', texto: `Ver las ${opcionesCategoria.length}` }] : [])]} elegidas={[categoriaId]} onTocar={(v) => (v === '__otra' ? setTodasCategorias(true) : (setCategoriaId(v), setTodasCategorias(false)))} />
      {leyo && categoriaId && <p className="mt-2 text-[13px] text-texto-suave">La sugiere la app por lo que dice el comprobante.</p>}
    </Grupo>
  )
  // El campo: si ya está elegido en la barra o hay uno solo, no se pregunta (se puede cambiar en «De dónde»).
  const bloqueCampo = (campos.length > 1 || !campoId) && (
    <Grupo titulo="De qué campo">
      <Opciones etiqueta="De qué campo" opciones={campos.map((c) => ({ valor: c.id, texto: c.nombre }))} elegidas={[campoId]} onTocar={(v) => (setCampoId(v), setPotreroId(''))} />
    </Grupo>
  )
  const bloqueComo = (
    <Grupo titulo={modoVence ? (esGasto ? 'Cómo se paga · si ya sabés' : 'Cómo se cobra · si ya sabés') : esGasto ? 'Cómo lo pagaste' : 'Cómo lo cobraste'}>
      {modoVence ? (
        <Opciones etiqueta="Cómo" opciones={CUENTAS} elegidas={[previsto]} onTocar={(x) => setPrevisto((p) => (p === x ? '' : x))} />
      ) : (
        <Opciones etiqueta="Cómo" opciones={[...CUENTAS, { valor: 'pendiente' as Cuenta, texto: 'Todavía no, va a la Agenda' }]} elegidas={[cuenta]} onTocar={setCuenta} />
      )}
      {(modoVence || pendiente ? previsto : cuenta) === 'cheque' && (
        <div className="mt-3 flex flex-col gap-3">
          <Segmentos etiqueta="Qué cheque" valor={esEcheq} onCambio={setEsEcheq} opciones={[{ valor: 'fisico', texto: 'De papel' }, { valor: 'echeq', texto: 'eCheq' }]} />
          <div className="grid grid-cols-2 gap-3">
            <CampoTexto etiqueta="Banco" value={chequeBanco} onChange={(e) => setChequeBanco(e.target.value)} />
            <CampoTexto etiqueta="N° de cheque" inputMode="numeric" value={chequeNumero} onChange={(e) => setChequeNumero(e.target.value)} />
          </div>
        </div>
      )}
    </Grupo>
  )
  const bloqueCuando = pendiente ? (
    <Grupo titulo={esGasto ? 'Cuándo vence' : 'Cuándo lo cobrás'} className="mt-6">
      <Opciones
        etiqueta="Cuándo vence"
        opciones={[
          { valor: '7', texto: 'En 7 días' },
          { valor: '30', texto: 'En 30 días' },
          { valor: 'varios', texto: 'En varios pagos' },
        ]}
        elegidas={[vence === enDias(7) ? '7' : vence === enDias(30) ? '30' : '']}
        onTocar={(x) => {
          if (x !== 'varios') return setVence(enDias(Number(x)))
          const f = faltante(true)
          if (f) return setError(f)
          setError(null)
          if (vence) setPrimera(vence)
          setModo('cuotas')
        }}
      />
      <div className="mt-3">
        <CampoFecha value={vence} onChange={setVence} ariaLabel="Cuándo vence" min={hoyLocal()} />
      </div>
    </Grupo>
  ) : (
    <Grupo titulo={esGasto ? 'Cuándo salió' : 'Cuándo entró'}>
      <Opciones
        etiqueta="Cuándo"
        opciones={[
          { valor: 'hoy', texto: 'Hoy' },
          { valor: 'otro', texto: 'Otro día' },
          ...(leyo ? [] : [{ valor: 'varios', texto: 'En varios pagos' }]),
        ]}
        elegidas={[cuando]}
        onTocar={(v) => {
          if (v !== 'varios') return setCuando(v as 'hoy' | 'otro')
          const f = faltante(true)
          if (f) return setError(f)
          setError(null)
          setModo('cuotas')
        }}
      />
      {cuando === 'otro' && (
        <div className={cn('mt-3 rounded-2xl', amarillo('fecha') && 'ring-4 ring-acento/45')}>
          <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Qué día" max={hoyLocal()} />
        </div>
      )}
    </Grupo>
  )
  const bloqueDetalle = (
    <>
      <div className={cn(!leyo && paso === 3 ? '' : 'mt-6')}>
        <Campo leido={amarillo('descripcion')}>
          <CampoTexto etiqueta="Qué fue" placeholder={esGasto ? 'Gasoil para el tractor' : 'Venta de terneros'} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} autoFocus={!leyo} />
        </Campo>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        <Campo leido={amarillo('contraparte')}>
          <CampoTexto etiqueta={esGasto ? 'A quién' : 'De quién'} placeholder="Shell Deheza S.A." value={contraparte} onChange={(e) => setContraparte(e.target.value)} />
        </Campo>
        <Campo leido={amarillo('cuit')}>
          <CampoTexto etiqueta="CUIT" inputMode="numeric" placeholder="30-50672834-1" value={cuit} onChange={(e) => setCuit(e.target.value)} />
        </Campo>
      </div>
      {campoId && (potreros.data ?? []).length > 0 && (
        <Grupo titulo="De qué potrero · si es de uno" className="mt-6">
          <Opciones etiqueta="De qué potrero" opciones={(potreros.data ?? []).map((p) => ({ valor: p.id, texto: p.nombre }))} elegidas={[potreroId]} onTocar={(v) => setPotreroId((x) => (x === v ? '' : v))} />
        </Grupo>
      )}
      <Grupo titulo="Para qué actividad · así ves qué rinde" className="mt-6">
        <Opciones etiqueta="Para qué actividad" opciones={(Object.keys(actividadLabel) as Actividad[]).map((a) => ({ valor: a, texto: actividadLabel[a] }))} elegidas={[actividad]} onTocar={(v) => setActividad((x) => (x === v ? '' : v))} />
      </Grupo>
      <Grupo titulo="La factura">
        <Opciones etiqueta="La factura" opciones={FACTURAS} elegidas={[factura]} onTocar={(v) => (setFactura(v), setLineasLeidas(null))} />
        {conIva && !lineasLeidas && (
          <div className="mt-3">
            <Opciones etiqueta="El IVA" opciones={ALICUOTAS.map((a) => ({ valor: a, texto: `IVA ${a.replace('.', ',')} %` }))} elegidas={[alicuota]} onTocar={setAlicuota} />
          </div>
        )}
        {conIva && lineasLeidas && <p className="mt-2 text-[13.5px] text-texto-suave">El IVA lo leyó de la factura: {lineasLeidas.map((l) => `${String(l.alicuota).replace('.', ',')} %`).join(' y ')}. Tocá otra factura para cambiarlo.</p>}
      </Grupo>
    </>
  )

  const botonAnotar = (
    <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado} onClick={() => void guardar()} className="flex-1">
      {total > 0 ? (pendiente && vence ? `Anotar: ${esGasto ? 'pagás' : 'cobrás'} ${fmtCompact(total)} el ${Number(vence.slice(8))}/${Number(vence.slice(5, 7))}` : `Anotar ${pesos(total)}`) : 'Anotar'}
    </BotonPrincipal>
  )
  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      chico={!leyo}
      onVolver={leyo ? () => (setModo('mano'), setLeidos(new Set())) : paso > 1 ? () => (setError(null), setPaso((p) => (p - 1) as 1 | 2)) : undefined}
      volverTexto={leyo ? 'Cargarlo a mano' : 'Volver'}
      titulo={leyo ? 'Esto es lo que leyó' : modoVence ? 'Algo que vence' : 'Anotar plata'}
      bajada={
        leyo ? (
          'Lo marcado en amarillo lo sacó de la foto. Tocá cualquier dato para corregirlo.'
        ) : (
          <span className="flex flex-col gap-2">
            <span className="flex gap-1.5" aria-hidden>
              {[1, 2, 3].map((n) => (
                <span key={n} className={cn('h-1.5 w-8 rounded-full', n <= paso ? 'bg-principal' : 'bg-borde')} />
              ))}
            </span>
            <span>
              Paso {paso} de 3: {PASOS[paso - 1]}
            </span>
          </span>
        )
      }
      pie={
        <>
          {errorAviso}
          <div className="flex items-center gap-3">
            {leyo || paso === 3 ? (
              botonAnotar
            ) : (
              <BotonPrincipal icono="Siguiente" onClick={seguir} className="flex-1">
                Seguir
              </BotonPrincipal>
            )}
            {!leyo && paso === 1 && (
              <button type="button" onClick={() => archivo.current?.click()} aria-label="Escanear un comprobante" className="grid size-16 shrink-0 place-items-center rounded-full border-[1.5px] border-principal text-principal hover:bg-principal-suave">
                <Icono nombre="Foto" />
              </button>
            )}
          </div>
          {!leyo && paso === 2 && (
            <button type="button" onClick={() => void guardar()} disabled={ocupado} className="mt-2.5 h-12 w-full rounded-full border-[1.5px] border-borde bg-superficie text-[15px] font-bold text-texto hover:border-principal hover:text-principal disabled:opacity-50">
              Anotar así, sin más detalle
            </button>
          )}
        </>
      }
    >
      {inputFoto}
      {!leyo && fotoUrl && (
        <p className="mb-4 flex items-center gap-3 rounded-[14px] bg-superficie px-3 py-2 text-[14px] text-texto">
          <img src={fotoUrl} alt="" className="size-10 rounded-[6px] object-cover" />
          La foto del comprobante queda guardada con este movimiento.
        </p>
      )}
      {leyo && fotoUrl && (
        <div className="mb-6 flex items-start gap-5">
          <img src={fotoUrl} alt="El comprobante" className="h-[150px] w-[120px] shrink-0 rotate-[-2deg] rounded-[6px] object-cover shadow-[0_10px_24px_rgba(19,27,22,0.18)]" />
          <div className="min-w-0 pt-2">
            {(contraparte || factura !== 'no') && <p className="text-[15px] font-bold text-texto">{[contraparte, FACTURAS.find((f) => f.valor === factura)?.texto].filter(Boolean).join(' · ')}</p>}
            {conIva && iva > 0 && <p className="mt-1.5 text-[14px] text-texto-suave">Neto {pesos(neto)} + IVA {pesos(iva)}</p>}
            {factura === 'a' && esGasto && <p className="mt-1 text-[13.5px] font-semibold text-estado-bien-texto">Te sirve como crédito fiscal</p>}
          </div>
        </div>
      )}

      {ve(1) && (
        <>
          {bloqueTipo}
          {bloqueMonto}
          {bloqueEnQue}
        </>
      )}
      {ve(2) && (
        <div className={cn(!leyo && '[&>fieldset:first-child]:mt-0')}>
          {/* Algo que vence: primero cuándo; si no, primero de dónde y cómo. */}
          {modoVence ? (
            <>
              {bloqueCuando}
              {bloqueCampo}
              {bloqueComo}
            </>
          ) : (
            <>
              {bloqueCampo}
              {bloqueComo}
              {bloqueCuando}
            </>
          )}
        </div>
      )}
      {ve(3) && bloqueDetalle}
    </PanelLateral>
  )
}

/** Lo que leyó de la foto, en amarillo hasta que se toca. */
function Campo({ leido, children }: { leido: boolean; children: ReactNode }) {
  return <div className={cn('rounded-[18px]', leido && 'bg-acento/35 p-2 [&_label]:text-acento-texto')}>{children}</div>
}
