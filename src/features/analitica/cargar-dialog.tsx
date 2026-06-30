import { useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Camera,
  CircleCheck,
  Clock,
  Landmark,
  Layers,
  Loader2,
  Receipt,
  Repeat,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Constants, type Database } from '@/lib/supabase/types'
import { useCampos, usePotreros } from '@/features/campos/hooks'
import {
  useCategorias,
  useCrearMovimiento,
  useCrearSerie,
} from '@/features/analitica/hooks'
import { actividadLabel } from '@/features/analitica/compute'
import { frecuenciaLabel, type Frecuencia } from '@/features/analitica/api'
import { Button } from '@/components/ui/button'
import { Dropdown } from '@/components/ui/dropdown'
import {
  CheckCard,
  FormDialog,
  formField,
  formItem,
  formLabel,
} from '@/components/form-dialog'
import { cn } from '@/lib/utils'

type TipoMov = Database['public']['Enums']['tipo_movimiento']
type MedioPago = Database['public']['Enums']['medio_pago']
type ActividadMov = Database['public']['Enums']['actividad_movimiento']
type Estructura = 'unico' | 'cuotas'

const medioPagoLabel: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
}

const hoy = () => new Date().toISOString().slice(0, 10)
const OFFSET: Record<Frecuencia, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtMes = (f: string) => {
  const [y, m] = f.split('-')
  return `${MESES[Number(m) - 1]}-${y.slice(2)}`
}
const addMeses = (f: string, meses: number) => {
  const [y, m, d] = f.split('-').map(Number)
  const dt = new Date(y, m - 1 + meses, d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
const fmtMonto = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
    : n >= 1_000
      ? `$${Math.round(n / 1_000)}k`
      : `$${n}`

type ComprobanteOCR = {
  tipo: TipoMov | null
  monto: number | null
  fecha: string | null
  descripcion: string | null
  contraparte: string | null
  categoria_id: string | null
  confianza: 'alta' | 'media' | 'baja'
}

async function fotoAJpegBase64(
  file: File,
): Promise<{ base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file)
  const max = 1500
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * escala)
  const h = Math.round(bitmap.height * escala)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(bitmap, 0, 0, w, h)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' }
}

// Chips cortos del indicador + descripción para el subtítulo.
const PASOS = ['Qué es', 'Cuánto', 'De qué'] as const
const PASO_SUB = ['Gasto o ingreso', 'Monto, fecha y medio', 'Categoría y campo'] as const

/**
 * Carga unificada de plata en un stepper de 3 pasos. Reemplaza los 3 diálogos
 * (movimiento / cheque / recurrente). Ejes separados: estructura (único/cuotas),
 * medio de pago (cheque → banco/N°), estado (saldado/pendiente). "Cheque" sale
 * del medio; "cuotas" genera una serie. Soporta prefill de campo/potrero.
 */
export function CargarDialog({
  empresaId,
  campoInicial,
  potreroInicial,
  triggerLabel = '+ Cargar',
  triggerVariant,
}: {
  empresaId: string
  campoInicial?: string
  potreroInicial?: string
  triggerLabel?: string
  triggerVariant?: 'outline'
}) {
  const [open, setOpen] = useState(false)
  const [paso, setPaso] = useState(1)

  const [tipo, setTipo] = useState<TipoMov>('gasto')
  const [estructura, setEstructura] = useState<Estructura>('unico')
  const [monto, setMonto] = useState('')
  const [liquidado, setLiquidado] = useState(true)
  const [fecha, setFecha] = useState(hoy())
  const [vence, setVence] = useState('')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual')
  const [cantidad, setCantidad] = useState('12')
  const [primera, setPrimera] = useState(hoy())
  const [medioPago, setMedioPago] = useState('')
  const [esEcheq, setEsEcheq] = useState(false)
  const [chequeBanco, setChequeBanco] = useState('')
  const [chequeNumero, setChequeNumero] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [campoId, setCampoId] = useState(campoInicial ?? '')
  const [potreroId, setPotreroId] = useState(potreroInicial ?? '')
  const [actividad, setActividad] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [escaneando, setEscaneando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const categorias = useCategorias()
  const campos = useCampos()
  const potreros = usePotreros(campoId)
  const crearMov = useCrearMovimiento()
  const crearSerie = useCrearSerie()

  const esGasto = tipo === 'gasto'
  const esCuotas = estructura === 'cuotas'
  const esCheque = medioPago === 'cheque'
  const montoNum = Number(monto)
  const cant = Math.max(0, Math.floor(Number(cantidad) || 0))
  const total = montoNum > 0 ? montoNum * cant : 0
  const ultima = cant > 0 ? addMeses(primera, (cant - 1) * OFFSET[frecuencia]) : primera
  const pendiente = crearMov.isPending || crearSerie.isPending

  const categoriasFiltradas = useMemo(
    () =>
      (categorias.data ?? []).filter(
        (c) => c.aplica_a === null || c.aplica_a === tipo,
      ),
    [categorias.data, tipo],
  )

  function reset() {
    setPaso(1)
    setTipo('gasto')
    setEstructura('unico')
    setMonto('')
    setLiquidado(true)
    setFecha(hoy())
    setVence('')
    setFrecuencia('mensual')
    setCantidad('12')
    setPrimera(hoy())
    setMedioPago('')
    setEsEcheq(false)
    setChequeBanco('')
    setChequeNumero('')
    setContraparte('')
    setCategoriaId('')
    setCampoId(campoInicial ?? '')
    setPotreroId(potreroInicial ?? '')
    setActividad('')
    setDescripcion('')
    setError(null)
  }

  function validarPaso(n: number): string | null {
    if (n === 2) {
      if (!monto || Number.isNaN(montoNum) || montoNum <= 0)
        return 'Ingresá un monto válido'
      if (esCuotas) {
        if (cant < 1) return 'La cantidad de cuotas debe ser 1 o más'
        if (!primera) return 'Elegí la fecha de la primera cuota'
      } else if (!liquidado && !vence) {
        return `Poné la fecha en que lo tenés que ${esGasto ? 'pagar' : 'cobrar'}`
      }
    }
    if (n === 3) {
      if (!categoriaId) return 'Elegí la categoría'
      if (!campoId) return 'Elegí el campo'
    }
    return null
  }

  async function onElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setEscaneando(true)
    try {
      const { base64, mediaType } = await fotoAJpegBase64(file)
      const cats = (categorias.data ?? []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        grupo: c.grupo,
        aplica_a: c.aplica_a,
      }))
      const { data, error: fnError } = await supabase.functions.invoke<ComprobanteOCR>(
        'extraer-comprobante',
        { body: { imageBase64: base64, mediaType, categorias: cats } },
      )
      if (fnError) throw new Error(fnError.message)
      if (!data || 'error' in data)
        throw new Error((data as { error?: string })?.error ?? 'No se pudo leer')

      setEstructura('unico')
      if (data.tipo === 'gasto' || data.tipo === 'ingreso') setTipo(data.tipo)
      if (data.monto && data.monto > 0) setMonto(String(Math.round(data.monto)))
      if (data.fecha) {
        setLiquidado(true)
        setFecha(data.fecha)
      }
      if (data.categoria_id) setCategoriaId(data.categoria_id)
      if (data.descripcion) setDescripcion(data.descripcion)
      if (data.contraparte) setContraparte(data.contraparte)
      setPaso(2) // saltá a confirmar la plata

      if (data.confianza === 'baja')
        toast.warning('Leí el comprobante pero la imagen es difícil. Revisá los datos.')
      else toast.success('Listo, revisá los datos antes de guardar.')
    } catch (err) {
      setError(
        err instanceof Error
          ? `No pude leer el comprobante: ${err.message}`
          : 'No pude leer el comprobante',
      )
    } finally {
      setEscaneando(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const err = validarPaso(paso)
    if (err) return setError(err)
    if (paso < 3) {
      setPaso(paso + 1)
      return
    }
    try {
      if (esCuotas) {
        await crearSerie.mutateAsync({
          empresaId,
          tipo,
          categoriaId,
          campoId,
          potreroId: potreroId || null,
          actividad: (actividad || null) as ActividadMov | null,
          montoCuota: montoNum,
          frecuencia,
          primeraFecha: primera,
          cantidad: cant,
          descripcion,
          medioPago: (medioPago || null) as MedioPago | null,
        })
        toast.success(`Serie creada: ${cant} cuotas`)
      } else {
        await crearMov.mutateAsync({
          empresaId,
          tipo,
          categoriaId,
          campoId,
          potreroId: potreroId || null,
          monto: montoNum,
          fechaDevengo: liquidado ? fecha : vence || fecha,
          fechaVencimiento: liquidado ? null : vence || null,
          fechaCobroPago: liquidado ? fecha : null,
          medioPago: (medioPago || null) as MedioPago | null,
          actividad: (actividad || null) as ActividadMov | null,
          descripcion,
          esEcheq,
          chequeNumero,
          chequeBanco,
          contraparte,
        })
        toast.success('Movimiento cargado')
      }
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  const btnLabel = pendiente
    ? 'Guardando…'
    : paso < 3
      ? 'Siguiente'
      : esCuotas
        ? `Crear ${cant || ''} cuotas`
        : 'Cargar'

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={!empresaId}
        variant={triggerVariant}
      >
        {triggerLabel}
      </Button>
      <FormDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) reset()
        }}
        icon={Receipt}
        title="Cargar"
        subtitle={`Paso ${paso} de 3 · ${PASO_SUB[paso - 1]}`}
        onSubmit={onSubmit}
        className="sm:max-w-[480px]"
        footer={
          <div className="flex gap-2.5">
            {paso > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null)
                  setPaso(paso - 1)
                }}
                className="h-12 rounded-xl px-4"
              >
                <ArrowLeft className="size-4" />
                Atrás
              </Button>
            )}
            <Button
              type="submit"
              disabled={pendiente || !empresaId}
              className="h-12 flex-1 rounded-xl text-[15px] font-semibold shadow-[0_4px_14px_rgba(16,30,20,0.18)]"
            >
              {btnLabel}
            </Button>
          </div>
        }
      >
        {/* Indicador de pasos */}
        <motion.div variants={formItem} className="flex items-center gap-1.5">
          {PASOS.map((p, i) => {
            const n = i + 1
            const activo = n === paso
            const hecho = n < paso
            return (
              <div key={p} className="flex flex-1 items-center gap-1.5">
                <span
                  className={cn(
                    'tnum flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                    activo
                      ? 'bg-field-deep text-white'
                      : hecho
                        ? 'bg-field-soft text-field-deep'
                        : 'bg-secondary text-faint',
                  )}
                >
                  {hecho ? '✓' : n}
                </span>
                <span
                  className={cn(
                    'truncate text-[12px] font-semibold',
                    activo ? 'text-ink' : 'text-faint',
                  )}
                >
                  {p}
                </span>
                {n < PASOS.length && (
                  <span className="h-px flex-1 bg-border" />
                )}
              </div>
            )
          })}
        </motion.div>

        {/* ===== Paso 1 · Qué ===== */}
        {paso === 1 && (
          <>
            {/* Escanear comprobante (OCR) */}
            <motion.div variants={formItem}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onElegirFoto}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={escaneando}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-primary/40 bg-field-soft/40 px-4 py-3 text-sm font-bold text-field-deep transition-colors hover:bg-field-soft disabled:opacity-60"
              >
                {escaneando ? (
                  <>
                    <Loader2 className="size-[18px] animate-spin" />
                    Leyendo comprobante…
                  </>
                ) : (
                  <>
                    <Camera className="size-[18px]" />
                    Escanear comprobante
                  </>
                )}
              </button>
              <p className="mt-1.5 px-1 text-[11px] text-faint">
                O cargá a mano abajo. Si escaneás, reviso y completo los datos.
              </p>
            </motion.div>

            {/* Tipo */}
            <motion.div variants={formItem}>
              <label className={formLabel}>¿Es un gasto o un ingreso?</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setTipo('gasto')
                    setCategoriaId('')
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                    esGasto
                      ? 'border-tierra bg-tierra-soft text-tierra'
                      : 'border-border bg-card text-muted-foreground hover:border-faint',
                  )}
                >
                  <ArrowUpRight className="size-[18px]" />
                  Gasto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTipo('ingreso')
                    setCategoriaId('')
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                    !esGasto
                      ? 'border-primary bg-field-soft text-field-deep'
                      : 'border-border bg-card text-muted-foreground hover:border-faint',
                  )}
                >
                  <ArrowDownLeft className="size-[18px]" />
                  Ingreso
                </button>
              </div>
            </motion.div>

            {/* Estructura */}
            <motion.div variants={formItem}>
              <label className={formLabel}>¿Único o en cuotas?</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setEstructura('unico')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                    !esCuotas
                      ? 'border-primary bg-field-soft text-field-deep'
                      : 'border-border bg-card text-muted-foreground hover:border-faint',
                  )}
                >
                  <Layers className="size-[18px]" />
                  Único
                </button>
                <button
                  type="button"
                  onClick={() => setEstructura('cuotas')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                    esCuotas
                      ? 'border-primary bg-field-soft text-field-deep'
                      : 'border-border bg-card text-muted-foreground hover:border-faint',
                  )}
                >
                  <Repeat className="size-[18px]" />
                  En cuotas
                </button>
              </div>
            </motion.div>
          </>
        )}

        {/* ===== Paso 2 · La plata ===== */}
        {paso === 2 && (
          <>
            {/* Monto */}
            <motion.div variants={formItem}>
              <label htmlFor="c-monto" className={formLabel}>
                {esCuotas ? 'Monto de cada cuota' : 'Monto'}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-heading text-lg font-bold text-faint">
                  $
                </span>
                <input
                  id="c-monto"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  autoFocus
                  value={monto ? Number(monto).toLocaleString('es-AR') : ''}
                  onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))}
                  className={cn(formField, 'tnum h-12 pl-8 text-xl font-bold')}
                />
              </div>
            </motion.div>

            {/* Cuotas: frecuencia + cantidad + primera + preview */}
            {esCuotas ? (
              <>
                <motion.div variants={formItem} className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={formLabel}>Cada</label>
                    <Dropdown
                      block
                      ariaLabel="Frecuencia"
                      value={frecuencia}
                      onChange={(v) => setFrecuencia(v as Frecuencia)}
                      options={Object.entries(frecuenciaLabel).map(([v, l]) => ({
                        value: v,
                        label: l,
                      }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="c-cant" className={formLabel}>
                      Cuotas
                    </label>
                    <input
                      id="c-cant"
                      type="number"
                      min={1}
                      max={120}
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                      className={cn(formField, 'tnum')}
                    />
                  </div>
                </motion.div>
                <motion.div variants={formItem}>
                  <label htmlFor="c-primera" className={formLabel}>
                    Primer vencimiento
                  </label>
                  <input
                    id="c-primera"
                    type="date"
                    value={primera}
                    onChange={(e) => setPrimera(e.target.value)}
                    className={cn(formField, '[color-scheme:light]')}
                  />
                </motion.div>
                {montoNum > 0 && cant > 0 && (
                  <motion.div
                    variants={formItem}
                    className="rounded-xl border border-border bg-secondary/60 px-3.5 py-2.5 text-[13px]"
                  >
                    <span className="font-bold text-ink">
                      {cant} cuotas de {fmtMonto(montoNum)}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}· total {fmtMonto(total)} · de {fmtMes(primera)} a{' '}
                      {fmtMes(ultima)}
                    </span>
                  </motion.div>
                )}
              </>
            ) : (
              /* Único: estado + fecha */
              <>
                <motion.div variants={formItem}>
                  <label className={formLabel}>Estado</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setLiquidado(true)}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2.5 text-sm font-semibold transition-colors',
                        liquidado
                          ? 'border-primary bg-field-soft text-field-deep'
                          : 'border-border bg-card text-muted-foreground hover:border-faint',
                      )}
                    >
                      <CircleCheck className="size-4" />
                      Ya se {esGasto ? 'pagó' : 'cobró'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLiquidado(false)}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2.5 text-sm font-semibold transition-colors',
                        !liquidado
                          ? 'border-sol-deep bg-sol-soft text-sol-deep'
                          : 'border-border bg-card text-muted-foreground hover:border-faint',
                      )}
                    >
                      <Clock className="size-4" />
                      Queda pendiente
                    </button>
                  </div>
                </motion.div>
                <motion.div variants={formItem}>
                  {liquidado ? (
                    <div>
                      <label htmlFor="c-fecha" className={formLabel}>
                        Fecha del {esGasto ? 'pago' : 'cobro'}
                      </label>
                      <input
                        id="c-fecha"
                        type="date"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        className={cn(formField, '[color-scheme:light]')}
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="c-vence" className={formLabel}>
                        ¿Cuándo lo tenés que {esGasto ? 'pagar' : 'cobrar'}?
                      </label>
                      <input
                        id="c-vence"
                        type="date"
                        value={vence}
                        onChange={(e) => setVence(e.target.value)}
                        className={cn(formField, '[color-scheme:light]')}
                      />
                    </div>
                  )}
                </motion.div>
              </>
            )}

            {/* Medio de pago */}
            <motion.div variants={formItem}>
              <label className={formLabel}>
                {esGasto ? 'Medio de pago' : 'Medio de cobro'}
              </label>
              <Dropdown
                block
                ariaLabel={esGasto ? 'Medio de pago' : 'Medio de cobro'}
                value={medioPago}
                onChange={setMedioPago}
                options={[
                  { value: '', label: '—' },
                  ...Constants.public.Enums.medio_pago.map((m) => ({
                    value: m,
                    label: medioPagoLabel[m],
                  })),
                ]}
              />
            </motion.div>

            {/* Datos del cheque (único + cheque). En cuotas, los N° se cargan al liquidar. */}
            {esCheque && !esCuotas && (
              <motion.div
                variants={formItem}
                className="grid gap-3 rounded-xl border border-border bg-secondary/50 p-3.5"
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                  Datos del cheque
                </span>
                <CheckCard checked={esEcheq} onChange={setEsEcheq}>
                  Es echeq
                </CheckCard>
                <input
                  value={contraparte}
                  onChange={(e) => setContraparte(e.target.value)}
                  placeholder={esGasto ? 'Beneficiario' : 'Emisor'}
                  className={formField}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={chequeBanco}
                    onChange={(e) => setChequeBanco(e.target.value)}
                    placeholder="Banco"
                    className={formField}
                  />
                  <input
                    value={chequeNumero}
                    onChange={(e) => setChequeNumero(e.target.value)}
                    placeholder="N° de cheque"
                    className={cn(formField, 'tnum')}
                  />
                </div>
              </motion.div>
            )}
            {esCheque && esCuotas && (
              <motion.div variants={formItem}>
                <p className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-[12px] text-muted-foreground">
                  <Landmark className="mr-1 inline size-3.5" />
                  Cada cuota queda como cheque; el banco y el N° los cargás al
                  liquidar cada uno en la Agenda.
                </p>
              </motion.div>
            )}
          </>
        )}

        {/* ===== Paso 3 · De qué ===== */}
        {paso === 3 && (
          <>
            <motion.div variants={formItem}>
              <label htmlFor="c-desc" className={formLabel}>
                {esCuotas ? '¿Qué es?' : 'Descripción'}
                {esCuotas && <span className="font-normal text-faint"> (ej: Cuota camioneta)</span>}
              </label>
              <input
                id="c-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={esCuotas ? 'Cuota camioneta · Alquiler La Lucía' : 'Ej: antiparasitario'}
                className={formField}
              />
            </motion.div>

            <motion.div variants={formItem} className="grid grid-cols-2 gap-3">
              <div>
                <label className={formLabel}>Categoría</label>
                <Dropdown
                  block
                  ariaLabel="Categoría"
                  value={categoriaId}
                  onChange={setCategoriaId}
                  options={[
                    { value: '', label: 'Elegí…' },
                    ...categoriasFiltradas.map((c) => ({ value: c.id, label: c.nombre })),
                  ]}
                />
              </div>
              <div>
                <label className={formLabel}>Campo</label>
                <Dropdown
                  block
                  ariaLabel="Campo"
                  value={campoId}
                  onChange={(v) => {
                    setCampoId(v)
                    setPotreroId('')
                  }}
                  options={[
                    { value: '', label: 'Elegí…' },
                    ...(campos.data ?? []).map((c) => ({ value: c.id, label: c.nombre })),
                  ]}
                />
              </div>
            </motion.div>

            <motion.div variants={formItem}>
              <label className={formLabel}>
                Potrero{' '}
                <span className="font-normal text-faint">· así sabés qué potrero rinde</span>
              </label>
              <Dropdown
                block
                ariaLabel="Potrero"
                value={potreroId}
                onChange={setPotreroId}
                options={[
                  { value: '', label: campoId ? 'Todo el campo' : 'Elegí un campo primero' },
                  ...(potreros.data ?? []).map((p) => ({ value: p.id, label: p.nombre })),
                ]}
              />
            </motion.div>

            <motion.div variants={formItem}>
              <label className={formLabel}>
                Actividad{' '}
                <span className="font-normal text-faint">· cría, invernada, agricultura…</span>
              </label>
              <Dropdown
                block
                ariaLabel="Actividad"
                value={actividad}
                onChange={setActividad}
                options={[
                  { value: '', label: 'Sin asignar' },
                  ...Constants.public.Enums.actividad_movimiento.map((a) => ({
                    value: a,
                    label: actividadLabel[a],
                  })),
                ]}
              />
            </motion.div>

            {/* Contraparte (no-cheque): para saber de quién es */}
            {!esCheque && (
              <motion.div variants={formItem}>
                <label htmlFor="c-contra" className={formLabel}>
                  {esGasto ? 'Proveedor / a quién' : 'Cliente / de quién'}{' '}
                  <span className="font-normal text-faint">(opcional)</span>
                </label>
                <input
                  id="c-contra"
                  value={contraparte}
                  onChange={(e) => setContraparte(e.target.value)}
                  placeholder={esGasto ? 'A quién le pagás' : 'Quién te paga'}
                  className={formField}
                />
              </motion.div>
            )}
          </>
        )}

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm font-medium text-destructive"
              role="alert"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </FormDialog>
    </>
  )
}
