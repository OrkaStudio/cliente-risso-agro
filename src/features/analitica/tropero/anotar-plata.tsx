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
type Frecuencia = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'
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
const FRECUENCIAS: { valor: Frecuencia; texto: string; meses: number }[] = [
  { valor: 'mensual', texto: 'Todos los meses', meses: 1 },
  { valor: 'bimestral', texto: 'Cada 2 meses', meses: 2 },
  { valor: 'trimestral', texto: 'Cada 3 meses', meses: 3 },
  { valor: 'semestral', texto: 'Cada 6 meses', meses: 6 },
  { valor: 'anual', texto: 'Una vez al año', meses: 12 },
]
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const enDias = (n: number) => new Date(Date.parse(`${hoyLocal()}T12:00:00`) + n * 86_400_000).toISOString().slice(0, 10)
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
  const [cuando, setCuando] = useState<'hoy' | 'otro'>('hoy')
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
  const [cantidad, setCantidad] = useState('6')
  const [otraCantidad, setOtraCantidad] = useState(false)
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual')
  const [primera, setPrimera] = useState(hoyLocal())
  // Cuotas: lo que puso es lo de cada cuota (lo que sabe el productor) o el total. Se repite: un sueldo.
  const [clase, setClase] = useState<'cuotas' | 'repite'>('cuotas')
  const [esCadaCuota, setEsCadaCuota] = useState<'cada' | 'total'>('cada')
  const [durante, setDurante] = useState('12')
  const [error, setError] = useState<string | null>(null)
  const [mas, setMas] = useState(false)

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
  const visibles = todasCategorias ? opcionesCategoria : opcionesCategoria.slice(0, 5)
  if (categoriaId && !visibles.some((c) => c.id === categoriaId) && !todasCategorias) setTodasCategorias(true)

  const cant = Math.max(0, Math.floor(Number(cantidad) || 0))
  const pasos = FRECUENCIAS.find((f) => f.valor === frecuencia)!.meses
  const repite = clase === 'repite'
  // Cuántas veces: en cuotas, las que dice; si se repite, las que entran en el tiempo elegido.
  const veces = repite ? Math.max(1, Math.floor(Number(durante) / pasos)) : cant
  const cuota = repite || esCadaCuota === 'cada' ? total : cant > 0 ? Math.round((total / cant) * 100) / 100 : 0
  const totalSerie = cuota * veces
  const ocupado = crear.isPending || crearSerie.isPending
  const nombreCategoria = opcionesCategoria.find((c) => c.id === categoriaId)?.nombre
  const nombreCampo = campos.find((c) => c.id === campoId)?.nombre

  function faltante(paraCuotas = false): string | null {
    if (total <= 0) return 'Escribí cuánto fue.'
    if (!categoriaId) return `Tocá en qué ${esGasto ? 'se fue' : 'entró'}.`
    if (!campoId) return 'Tocá de qué campo es.'
    if (paraCuotas) return !repite && cant < 1 ? 'Poné cuántas cuotas.' : null
    if (!cuenta) return esGasto ? 'Tocá cómo lo pagaste, o «Todavía no».' : 'Tocá cómo lo cobraste, o «Todavía no».'
    if (pendiente && !vence) return `Poné cuándo ${esGasto ? 'vence el pago' : 'lo cobrás'}.`
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
    const dia = cuando === 'hoy' ? hoyLocal() : fecha
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
    try {
      await crearSerie.mutateAsync({
        empresaId,
        tipo,
        categoriaId,
        campoId,
        potreroId: potreroId || null,
        actividad: actividad || null,
        montoCuota: cuota,
        frecuencia,
        primeraFecha: primera,
        cantidad: veces,
        sinNumerar: repite,
        descripcion: descripcion.trim() || nombreCategoria || (esGasto ? 'Gasto' : 'Ingreso'),
        medioPago: null,
      })
      toast.success(repite ? `Listo: ${veces} pagos de ${pesos(cuota)} en la Agenda` : `Listo: ${veces} cuotas en la Agenda`, { description: `${pesos(cuota)} cada ${repite ? 'vez' : 'una'}, desde el ${Number(primera.slice(8))} de ${nombreMes(primera.slice(0, 7))}.` })
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
    const meses = Array.from({ length: Math.min(veces, 12) }, (_, i) => sumarMeses(primera, i * pasos))
    const nombre = esGasto ? 'gasto' : 'ingreso'
    return (
      <PanelLateral
        abierto={abierto}
        onCerrar={onCerrar}
        onVolver={() => (setError(null), setModo('mano'))}
        titulo={repite ? `Un ${nombre} que se repite` : `Un ${nombre} en cuotas`}
        bajada={[descripcion.trim(), nombreCategoria, nombreCampo].filter(Boolean).join(', ')}
        pie={
          <>
            {errorAviso}
            <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado} onClick={() => void guardarCuotas()}>
              {repite ? `Anotar ${veces} ${veces === 1 ? 'pago' : 'pagos'} de ${fmtCompact(cuota)}` : veces > 0 ? `Anotar las ${veces} cuotas` : 'Anotar las cuotas'}
            </BotonPrincipal>
          </>
        }
      >
        <Segmentos etiqueta="Qué es" valor={clase} onCambio={setClase} opciones={[{ valor: 'cuotas', texto: 'Son cuotas' }, { valor: 'repite', texto: 'Se repite (un sueldo)' }]} />

        {repite ? (
          <>
            <p className="titulo-display cifra mt-6 text-[48px] leading-none tracking-[-0.03em] text-texto">{pesos(cuota)}</p>
            <p className="mt-2 text-[16px] font-bold text-principal">cada vez, {veces} {veces === 1 ? 'vez' : 'veces'}</p>
            <Grupo titulo="Cada cuánto" className="mt-6">
              <Opciones etiqueta="Cada cuánto" opciones={FRECUENCIAS} elegidas={[frecuencia]} onTocar={setFrecuencia} />
            </Grupo>
            <Grupo titulo="Durante">
              <Opciones etiqueta="Durante" opciones={[{ valor: '6', texto: '6 meses' }, { valor: '12', texto: 'Un año' }, { valor: '24', texto: 'Dos años' }]} elegidas={[durante]} onTocar={setDurante} />
            </Grupo>
            <Grupo titulo="El primero">
              <CampoFecha value={primera} onChange={setPrimera} ariaLabel="El primero" />
            </Grupo>
          </>
        ) : (
          <>
            <Grupo titulo="Lo que escribiste es" className="mt-6">
              <Segmentos etiqueta="Lo que escribiste es" valor={esCadaCuota} onCambio={setEsCadaCuota} opciones={[{ valor: 'cada', texto: `Cada cuota, ${fmtCompact(total)}` }, { valor: 'total', texto: `El total, ${fmtCompact(total)}` }]} />
            </Grupo>
            <p className="titulo-display cifra mt-6 text-[48px] leading-none tracking-[-0.03em] text-texto">{pesos(cuota)}</p>
            {veces > 0 && <p className="mt-2 text-[16px] font-bold text-principal">por cuota, {veces} cuotas: {pesos(totalSerie)} en total</p>}
            <Grupo titulo={esCadaCuota === 'cada' ? 'Cuántas te quedan' : 'Cuántas cuotas'} className="mt-6">
              <Opciones
                etiqueta="Cuántas cuotas"
                opciones={[...['3', '6', '12'].map((v) => ({ valor: v, texto: v })), { valor: 'otra', texto: 'Otra' }]}
                elegidas={[otraCantidad ? 'otra' : cantidad]}
                onTocar={(v) => (v === 'otra' ? setOtraCantidad(true) : (setOtraCantidad(false), setCantidad(v)))}
              />
              {otraCantidad && <CampoTexto className="mt-3" etiqueta="Cuántas" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} autoFocus />}
            </Grupo>
            <Grupo titulo="Cada cuánto">
              <Opciones etiqueta="Cada cuánto" opciones={FRECUENCIAS} elegidas={[frecuencia]} onTocar={setFrecuencia} />
            </Grupo>
            <Grupo titulo={esCadaCuota === 'cada' ? 'La próxima vence' : 'La primera vence'}>
              <CampoFecha value={primera} onChange={setPrimera} ariaLabel="La primera vence" />
            </Grupo>
          </>
        )}
        {veces > 0 && (
          <ol className="mt-5 grid grid-cols-6 gap-y-3 text-center">
            {meses.map((m, i) => (
              <li key={m}>
                <span aria-hidden className={cn('mx-auto block size-3.5 rounded-full border-2 border-principal', i === 0 && 'bg-principal')} />
                <p className="mt-1 text-[13px] font-bold text-texto">{nombreMes(m.slice(0, 7)).slice(0, 3).replace(/^\w/, (c) => c.toUpperCase())}</p>
                <p className="t-cifra-mini text-texto-suave">{fmtCompact(cuota)}</p>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-5 flex items-start gap-3 rounded-[16px] bg-superficie-hundida p-4 text-[14px] text-texto">
          <Icono nombre="Agenda" tamano={16} className="mt-0.5 shrink-0" />
          {repite ? 'Van a la Agenda. Cuando pagás uno, lo marcás y pasa a Plata.' : `Las ${veces || ''} cuotas van a la Agenda. Cuando pagás una, la marcás y pasa a Plata.`}
        </p>
      </PanelLateral>
    )
  }

  // ===== A mano, o lo que leyó de la foto =====
  const leyo = modo === 'leyo'
  const verMas = mas || leyo || !!actividad || !!potreroId || factura !== 'no' || !!contraparte || !!cuit || (modoVence && !!previsto)
  const amarillo = (k: string) => leyo && leidos.has(k)
  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      onVolver={leyo ? () => (setModo('mano'), setLeidos(new Set())) : undefined}
      volverTexto="Cargarlo a mano"
      titulo={leyo ? 'Esto es lo que leyó' : modoVence ? 'Algo que vence' : 'Anotar plata'}
      bajada={leyo ? 'Lo marcado en amarillo lo sacó de la foto. Tocá cualquier dato para corregirlo.' : modoVence ? 'Lo vas a pagar o cobrar más adelante: queda en la Agenda y en lo que viene de Plata.' : undefined}
      pie={
        <>
        {errorAviso}
        <div className="flex items-center gap-3">
          <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado} onClick={() => void guardar()} className="flex-1">
            {total > 0 ? (pendiente && vence ? `Anotar: ${esGasto ? 'pagás' : 'cobrás'} ${fmtCompact(total)} el ${Number(vence.slice(8))}/${Number(vence.slice(5, 7))}` : `Anotar ${pesos(total)}`) : 'Anotar'}
          </BotonPrincipal>
          {!leyo && (
            <button type="button" onClick={() => archivo.current?.click()} aria-label="Escanear un comprobante" className="grid size-16 shrink-0 place-items-center rounded-full border-[1.5px] border-principal text-principal hover:bg-principal-suave">
              <Icono nombre="Foto" />
            </button>
          )}
        </div>
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

      {!leyo && <Segmentos etiqueta="Salió o entró" valor={tipo === 'gasto' ? 'salio' : 'entro'} onCambio={(v) => (setTipo(v === 'salio' ? 'gasto' : 'ingreso'), setCategoriaId(''))} opciones={modoVence ? [{ valor: 'salio', texto: 'A pagar' }, { valor: 'entro', texto: 'A cobrar' }] : [{ valor: 'salio', texto: 'Salió' }, { valor: 'entro', texto: 'Entró' }]} />}

      {/* El monto, grande: es lo primero que se mira. */}
      <label className={cn('mt-5 flex items-baseline gap-1 rounded-[18px] px-1', amarillo('monto') && 'bg-acento/35 px-3', leyo && !fotoUrl && 'mt-0')}>
        <span className="titulo-display shrink-0 text-[44px] whitespace-nowrap text-texto-suave">{esGasto ? '−$' : '+$'}</span>
        <input aria-label="Cuánto" inputMode="numeric" placeholder="0" value={monto} onChange={(e) => (setMonto(formatearNumero(e.target.value)), setLeidos((s) => (s.delete('monto'), new Set(s))))} autoFocus={!leyo} className="titulo-display cifra min-w-[2ch] max-w-full bg-transparent text-[56px] [field-sizing:content] leading-tight tracking-[-0.03em] text-texto outline-none placeholder:text-texto/25" />
      </label>
      {!leyo && conIva && iva > 0 && (
        <p className="mt-1 text-[14px] text-texto-suave">
          Neto {pesos(neto)} + IVA {lineasLeidas ? '' : `${alicuota.replace('.', ',')} % `}
          {pesos(iva)}.{factura === 'a' && esGasto ? ' Con factura A, el IVA es crédito.' : ''}
        </p>
      )}

      {/* Lo que hace falta, en el orden en que se piensa; lo demás, plegado (Lau, 05/11: «simplificá los formularios»). */}
      {modoVence ? (
        <>
      {pendiente ? (
        <Grupo titulo={esGasto ? 'Cuándo vence' : 'Cuándo lo cobrás'} className="mt-6">
          <Opciones
            etiqueta="Cuándo vence"
            opciones={[
              { valor: '7', texto: 'En 7 días' },
              { valor: '30', texto: 'En 30 días' },
              { valor: 'repite', texto: 'Se repite' },
              { valor: 'cuotas', texto: 'Son cuotas' },
            ]}
            elegidas={[vence === enDias(7) ? '7' : vence === enDias(30) ? '30' : '']}
            onTocar={(x) => {
              if (x !== 'cuotas' && x !== 'repite') return setVence(enDias(Number(x)))
              const f = faltante(true)
              if (f) return setError(f)
              setError(null)
              setClase(x === 'repite' ? 'repite' : 'cuotas')
              if (vence) setPrimera(vence)
              setModo('cuotas')
            }}
          />
          <div className="mt-3">
            <CampoFecha value={vence} onChange={setVence} ariaLabel="Cuándo vence" min={hoyLocal()} />
          </div>
        </Grupo>
      ) : (
        <Grupo titulo="Cuándo">
          <Opciones
            etiqueta="Cuándo"
            opciones={[
              { valor: 'hoy', texto: 'Hoy' },
              { valor: 'otro', texto: 'Otro día' },
              ...(leyo ? [] : [{ valor: 'cuotas', texto: 'En cuotas' }, { valor: 'repite', texto: 'Se repite' }]),
            ]}
            elegidas={[cuando]}
            onTocar={(v) => {
              if (v !== 'cuotas' && v !== 'repite') return setCuando(v as 'hoy' | 'otro')
              const f = faltante(true)
              if (f) return setError(f)
              setError(null)
              setClase(v === 'repite' ? 'repite' : 'cuotas')
              setModo('cuotas')
            }}
          />
          {cuando === 'otro' && (
            <div className={cn('mt-3 rounded-2xl', amarillo('fecha') && 'ring-4 ring-acento/45')}>
              <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Qué día" max={hoyLocal()} />
            </div>
          )}
        </Grupo>
      )}

      <Grupo titulo={esGasto ? 'En qué, lo que más usás primero' : 'De qué, lo que más usás primero'} className="mt-6">
        <Opciones etiqueta="En qué" opciones={[...visibles.map((c) => ({ valor: c.id, texto: c.nombre })), ...(!todasCategorias && opcionesCategoria.length > 5 ? [{ valor: '__otra', texto: 'Otra' }] : [])]} elegidas={[categoriaId]} onTocar={(v) => (v === '__otra' ? setTodasCategorias(true) : setCategoriaId(v))} />
        {leyo && categoriaId && <p className="mt-2 text-[13px] text-texto-suave">La sugiere la app por lo que dice el comprobante.</p>}
      </Grupo>

      <Grupo titulo="De qué campo">
        <Opciones etiqueta="De qué campo" opciones={campos.map((c) => ({ valor: c.id, texto: c.nombre }))} elegidas={[campoId]} onTocar={(v) => (setCampoId(v), setPotreroId(''))} />
      </Grupo>
        </>
      ) : (
        <>
      <Grupo titulo={esGasto ? 'En qué, lo que más usás primero' : 'De qué, lo que más usás primero'} className="mt-6">
        <Opciones etiqueta="En qué" opciones={[...visibles.map((c) => ({ valor: c.id, texto: c.nombre })), ...(!todasCategorias && opcionesCategoria.length > 5 ? [{ valor: '__otra', texto: 'Otra' }] : [])]} elegidas={[categoriaId]} onTocar={(v) => (v === '__otra' ? setTodasCategorias(true) : setCategoriaId(v))} />
        {leyo && categoriaId && <p className="mt-2 text-[13px] text-texto-suave">La sugiere la app por lo que dice el comprobante.</p>}
      </Grupo>

      <Grupo titulo="De qué campo">
        <Opciones etiqueta="De qué campo" opciones={campos.map((c) => ({ valor: c.id, texto: c.nombre }))} elegidas={[campoId]} onTocar={(v) => (setCampoId(v), setPotreroId(''))} />
      </Grupo>
      <Grupo titulo={modoVence ? (esGasto ? 'Cómo se paga' : 'Cómo se cobra') : esGasto ? 'Cómo lo pagaste' : 'Cómo lo cobraste'}>
        {modoVence ? (
          <Opciones etiqueta="Cómo" opciones={CUENTAS} elegidas={[previsto]} onTocar={(x) => setPrevisto((p) => (p === x ? '' : x))} />
        ) : (
          <Opciones etiqueta="Cómo" opciones={[...CUENTAS, { valor: 'pendiente' as Cuenta, texto: 'Todavía no, va a la Agenda' }]} elegidas={[cuenta]} onTocar={setCuenta} />
        )}
        {(modoVence ? previsto : cuenta) === 'cheque' && (
          <div className="mt-3 flex flex-col gap-3">
            <Segmentos etiqueta="Qué cheque" valor={esEcheq} onCambio={setEsEcheq} opciones={[{ valor: 'fisico', texto: 'De papel' }, { valor: 'echeq', texto: 'eCheq' }]} />
            <div className="grid grid-cols-2 gap-3">
              <CampoTexto etiqueta="Banco" value={chequeBanco} onChange={(e) => setChequeBanco(e.target.value)} />
              <CampoTexto etiqueta="N° de cheque" inputMode="numeric" value={chequeNumero} onChange={(e) => setChequeNumero(e.target.value)} />
            </div>
          </div>
        )}
      </Grupo>

      {pendiente ? (
        <Grupo titulo={esGasto ? 'Cuándo vence' : 'Cuándo lo cobrás'}>
          <Opciones
            etiqueta="Cuándo vence"
            opciones={[
              { valor: '7', texto: 'En 7 días' },
              { valor: '30', texto: 'En 30 días' },
              { valor: 'repite', texto: 'Se repite' },
              { valor: 'cuotas', texto: 'Son cuotas' },
            ]}
            elegidas={[vence === enDias(7) ? '7' : vence === enDias(30) ? '30' : '']}
            onTocar={(x) => {
              if (x !== 'cuotas' && x !== 'repite') return setVence(enDias(Number(x)))
              const f = faltante(true)
              if (f) return setError(f)
              setError(null)
              setClase(x === 'repite' ? 'repite' : 'cuotas')
              if (vence) setPrimera(vence)
              setModo('cuotas')
            }}
          />
          <div className="mt-3">
            <CampoFecha value={vence} onChange={setVence} ariaLabel="Cuándo vence" min={hoyLocal()} />
          </div>
        </Grupo>
      ) : (
        <Grupo titulo="Cuándo">
          <Opciones
            etiqueta="Cuándo"
            opciones={[
              { valor: 'hoy', texto: 'Hoy' },
              { valor: 'otro', texto: 'Otro día' },
              ...(leyo ? [] : [{ valor: 'cuotas', texto: 'En cuotas' }, { valor: 'repite', texto: 'Se repite' }]),
            ]}
            elegidas={[cuando]}
            onTocar={(v) => {
              if (v !== 'cuotas' && v !== 'repite') return setCuando(v as 'hoy' | 'otro')
              const f = faltante(true)
              if (f) return setError(f)
              setError(null)
              setClase(v === 'repite' ? 'repite' : 'cuotas')
              setModo('cuotas')
            }}
          />
          {cuando === 'otro' && (
            <div className={cn('mt-3 rounded-2xl', amarillo('fecha') && 'ring-4 ring-acento/45')}>
              <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Qué día" max={hoyLocal()} />
            </div>
          )}
        </Grupo>
      )}

        </>
      )}
      <div className="mt-6">
        <Campo leido={amarillo('descripcion')}>
          <CampoTexto etiqueta="Qué fue" placeholder={esGasto ? 'Gasoil para el tractor' : 'Venta de terneros'} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>
      </div>

      {/* Lo opcional: el potrero, la actividad, cómo se paga, la factura y a quién. Abierto si leyó la foto o ya tiene algo. */}
      <button type="button" aria-expanded={verMas} onClick={() => setMas((x) => !x)} className="mt-6 flex w-full items-center justify-between gap-3 rounded-[16px] border-[1.5px] border-borde bg-superficie px-4 py-3.5 text-left hover:border-neutro-300">
        <span className="min-w-0">
          <span className="block text-[15.5px] font-bold text-texto">Más datos · opcional</span>
          <span className="block truncate text-[13.5px] text-texto-suave">{[(potreros.data ?? []).length > 0 ? 'Potrero' : null, 'actividad', modoVence ? (esGasto ? 'cómo se paga' : 'cómo se cobra') : null, 'factura', esGasto ? 'a quién' : 'de quién'].filter(Boolean).join(', ')}</span>
        </span>
        <span className={cn('shrink-0 transition-transform', verMas ? '-rotate-90' : 'rotate-90')}><Icono nombre="Siguiente" tamano={16} /></span>
      </button>
      {verMas && (
        <div className="pt-6 pb-2">
      {campoId && (potreros.data ?? []).length > 0 && (
        <Grupo titulo="De qué potrero · si es de uno">
          <Opciones etiqueta="De qué potrero" opciones={(potreros.data ?? []).map((p) => ({ valor: p.id, texto: p.nombre }))} elegidas={[potreroId]} onTocar={(v) => setPotreroId((x) => (x === v ? '' : v))} />
        </Grupo>
      )}
      <Grupo titulo="Para qué actividad · así ves qué rinde">
        <Opciones etiqueta="Para qué actividad" opciones={(Object.keys(actividadLabel) as Actividad[]).map((a) => ({ valor: a, texto: actividadLabel[a] }))} elegidas={[actividad]} onTocar={(v) => setActividad((x) => (x === v ? '' : v))} />
      </Grupo>

      {modoVence && (
        <>
      <Grupo titulo={modoVence ? (esGasto ? 'Cómo se paga' : 'Cómo se cobra') : esGasto ? 'Cómo lo pagaste' : 'Cómo lo cobraste'}>
        {modoVence ? (
          <Opciones etiqueta="Cómo" opciones={CUENTAS} elegidas={[previsto]} onTocar={(x) => setPrevisto((p) => (p === x ? '' : x))} />
        ) : (
          <Opciones etiqueta="Cómo" opciones={[...CUENTAS, { valor: 'pendiente' as Cuenta, texto: 'Todavía no, va a la Agenda' }]} elegidas={[cuenta]} onTocar={setCuenta} />
        )}
        {(modoVence ? previsto : cuenta) === 'cheque' && (
          <div className="mt-3 flex flex-col gap-3">
            <Segmentos etiqueta="Qué cheque" valor={esEcheq} onCambio={setEsEcheq} opciones={[{ valor: 'fisico', texto: 'De papel' }, { valor: 'echeq', texto: 'eCheq' }]} />
            <div className="grid grid-cols-2 gap-3">
              <CampoTexto etiqueta="Banco" value={chequeBanco} onChange={(e) => setChequeBanco(e.target.value)} />
              <CampoTexto etiqueta="N° de cheque" inputMode="numeric" value={chequeNumero} onChange={(e) => setChequeNumero(e.target.value)} />
            </div>
          </div>
        )}
      </Grupo>

        </>
      )}
      <Grupo titulo="La factura">
        <Opciones etiqueta="La factura" opciones={FACTURAS} elegidas={[factura]} onTocar={(v) => (setFactura(v), setLineasLeidas(null))} />
        {conIva && !lineasLeidas && (
          <div className="mt-3">
            <Opciones etiqueta="El IVA" opciones={ALICUOTAS.map((a) => ({ valor: a, texto: `IVA ${a.replace('.', ',')} %` }))} elegidas={[alicuota]} onTocar={setAlicuota} />
          </div>
        )}
        {conIva && lineasLeidas && <p className="mt-2 text-[13.5px] text-texto-suave">El IVA lo leyó de la factura: {lineasLeidas.map((l) => `${String(l.alicuota).replace('.', ',')} %`).join(' y ')}. Tocá otra factura para cambiarlo.</p>}
      </Grupo>

      <div className="mt-6 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
          <Campo leido={amarillo('contraparte')}>
            <CampoTexto etiqueta={esGasto ? 'A quién · opcional' : 'De quién · opcional'} placeholder="Shell Deheza S.A." value={contraparte} onChange={(e) => setContraparte(e.target.value)} />
          </Campo>
          <Campo leido={amarillo('cuit')}>
            <CampoTexto etiqueta="CUIT · opcional" inputMode="numeric" placeholder="30-50672834-1" value={cuit} onChange={(e) => setCuit(e.target.value)} />
          </Campo>
      </div>
        </div>
      )}
    </PanelLateral>
  )
}

/** Lo que leyó de la foto, en amarillo hasta que se toca. */
function Campo({ leido, children }: { leido: boolean; children: ReactNode }) {
  return <div className={cn('rounded-[18px]', leido && 'bg-acento/35 p-2 [&_label]:text-acento-texto')}>{children}</div>
}
