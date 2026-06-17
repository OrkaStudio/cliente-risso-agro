import { useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  ChevronDown,
  CircleCheck,
  Clock,
  Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Constants, type Database } from '@/lib/supabase/types'
import { useCampos, usePotreros } from '@/features/campos/hooks'
import { useCategorias, useCrearMovimiento } from '@/features/analitica/hooks'
import { actividadLabel } from '@/features/analitica/compute'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

type TipoMov = Database['public']['Enums']['tipo_movimiento']
type MedioPago = Database['public']['Enums']['medio_pago']
type ActividadMov = Database['public']['Enums']['actividad_movimiento']

const label = 'mb-1.5 block text-[12px] font-semibold text-ink'
const field =
  'h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-field-soft placeholder:text-faint'

const medioPagoLabel: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
}

const hoy = () => new Date().toISOString().slice(0, 10)

type ComprobanteOCR = {
  tipo: TipoMov | null
  monto: number | null
  fecha: string | null
  descripcion: string | null
  contraparte: string | null
  categoria_id: string | null
  confianza: 'alta' | 'media' | 'baja'
}

/** Achica la foto antes de mandarla (menos tokens = menos costo) y la pasa a base64 JPEG. */
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

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const fade: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 26 } },
}

export function CargarMovimientoDialog({
  empresaId,
  campoInicial,
  potreroInicial,
  triggerLabel = '+ Cargar gasto/ingreso',
  triggerVariant,
}: {
  empresaId: string
  campoInicial?: string
  potreroInicial?: string
  triggerLabel?: string
  triggerVariant?: 'outline'
}) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoMov>('gasto')
  const [categoriaId, setCategoriaId] = useState('')
  const [campoId, setCampoId] = useState(campoInicial ?? '')
  const [potreroId, setPotreroId] = useState(potreroInicial ?? '')
  const [actividad, setActividad] = useState('')
  const [monto, setMonto] = useState('')
  const [liquidado, setLiquidado] = useState(true) // ya se pagó/cobró
  const [fecha, setFecha] = useState(hoy())
  const [vence, setVence] = useState('')
  const [medioPago, setMedioPago] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [esEcheq, setEsEcheq] = useState(false)
  const [chequeNumero, setChequeNumero] = useState('')
  const [chequeBanco, setChequeBanco] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [masOpciones, setMasOpciones] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [escaneando, setEscaneando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const categorias = useCategorias()
  const campos = useCampos()
  const potreros = usePotreros(campoId)
  const crear = useCrearMovimiento()

  const esGasto = tipo === 'gasto'
  const esCheque = medioPago === 'cheque'

  const categoriasFiltradas = useMemo(
    () =>
      (categorias.data ?? []).filter(
        (c) => c.aplica_a === null || c.aplica_a === tipo,
      ),
    [categorias.data, tipo],
  )

  function elegirTipo(t: TipoMov) {
    setTipo(t)
    setCategoriaId('')
  }

  function reset() {
    setCategoriaId('')
    setActividad('')
    setMonto('')
    setLiquidado(true)
    setFecha(hoy())
    setVence('')
    setMedioPago('')
    setDescripcion('')
    setEsEcheq(false)
    setChequeNumero('')
    setChequeBanco('')
    setContraparte('')
    setMasOpciones(false)
  }

  async function onElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-elegir la misma foto
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

      // Pre-llenar — sugiere, no impone. El usuario revisa y confirma.
      if (data.tipo === 'gasto' || data.tipo === 'ingreso') setTipo(data.tipo)
      if (data.monto && data.monto > 0) setMonto(String(Math.round(data.monto)))
      if (data.fecha) setFecha(data.fecha)
      if (data.categoria_id) setCategoriaId(data.categoria_id)
      if (data.descripcion) setDescripcion(data.descripcion)
      if (data.contraparte) setContraparte(data.contraparte)
      if (data.descripcion || data.contraparte) setMasOpciones(true)

      if (data.confianza === 'baja')
        toast.warning('Leí el comprobante pero la imagen es difícil. Revisá bien los datos.')
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
    const montoNum = Number(monto)
    if (!monto || Number.isNaN(montoNum) || montoNum <= 0)
      return setError('Ingresá un monto válido')
    if (!categoriaId) return setError('Elegí la categoría')
    if (!campoId) return setError('Elegí el campo')

    try {
      await crear.mutateAsync({
        empresaId,
        tipo,
        categoriaId,
        campoId,
        potreroId: potreroId || null,
        monto: montoNum,
        // Liquidado: devenga el día que se pagó/cobró. Pendiente: devenga el
        // día en que vence (lo que el productor entiende como "cuándo lo pagás").
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
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={!empresaId}
        variant={triggerVariant}
      >
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              Cargar movimiento
            </DialogTitle>
          </DialogHeader>

          <motion.form
            onSubmit={onSubmit}
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid gap-4"
          >
            {/* Escanear comprobante (OCR con IA) */}
            <motion.div variants={fade}>
              {/* Sin `capture`: el SO ofrece sacar foto O elegir un archivo. */}
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
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-primary/40 bg-field-soft/40 px-4 py-3 text-sm font-bold text-field-deep transition-colors hover:bg-field-soft disabled:opacity-60',
                )}
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
                Sacale una foto al ticket o factura, o subí el archivo, y completo
                los campos. Revisás vos antes de guardar.
              </p>
            </motion.div>

            {/* Tipo */}
            <motion.div variants={fade} className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => elegirTipo('gasto')}
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
                onClick={() => elegirTipo('ingreso')}
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
            </motion.div>

            {/* Monto */}
            <motion.div variants={fade}>
              <label htmlFor="mv-monto" className={label}>
                Monto
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-heading text-lg font-bold text-faint">
                  $
                </span>
                <input
                  id="mv-monto"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  autoFocus
                  value={monto ? Number(monto).toLocaleString('es-AR') : ''}
                  onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))}
                  className={cn(field, 'tnum h-12 pl-8 text-xl font-bold')}
                />
              </div>
            </motion.div>

            {/* Categoría + Campo */}
            <motion.div variants={fade} className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Categoría</label>
                <Dropdown
                  block
                  ariaLabel="Categoría"
                  value={categoriaId}
                  onChange={setCategoriaId}
                  options={[
                    { value: '', label: 'Elegí…' },
                    ...categoriasFiltradas.map((c) => ({
                      value: c.id,
                      label: c.nombre,
                    })),
                  ]}
                />
              </div>
              <div>
                <label className={label}>Campo</label>
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
                    ...(campos.data ?? []).map((c) => ({
                      value: c.id,
                      label: c.nombre,
                    })),
                  ]}
                />
              </div>
            </motion.div>

            {/* Potrero — clave para la rentabilidad por potrero */}
            <motion.div variants={fade}>
              <label className={label}>
                Potrero{' '}
                <span className="font-normal text-faint">
                  · así sabés qué potrero rinde
                </span>
              </label>
              <Dropdown
                block
                ariaLabel="Potrero"
                value={potreroId}
                onChange={setPotreroId}
                options={[
                  {
                    value: '',
                    label: campoId ? 'Todo el campo' : 'Elegí un campo primero',
                  },
                  ...(potreros.data ?? []).map((p) => ({
                    value: p.id,
                    label: p.nombre,
                  })),
                ]}
              />
            </motion.div>

            {/* Actividad — para ver qué actividad rinde */}
            <motion.div variants={fade}>
              <label className={label}>
                Actividad{' '}
                <span className="font-normal text-faint">
                  · cría, invernada, agricultura…
                </span>
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

            {/* Estado: ya se pagó/cobró vs pendiente */}
            <motion.div variants={fade}>
              <label className={label}>Estado</label>
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

            {/* Fechas según estado */}
            <motion.div variants={fade}>
              {liquidado ? (
                <div>
                  <label htmlFor="mv-fecha" className={label}>
                    Fecha del {esGasto ? 'pago' : 'cobro'}
                  </label>
                  <input
                    id="mv-fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className={cn(field, '[color-scheme:light]')}
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="mv-vence" className={label}>
                    ¿Cuándo lo tenés que {esGasto ? 'pagar' : 'cobrar'}?
                  </label>
                  <input
                    id="mv-vence"
                    type="date"
                    value={vence}
                    onChange={(e) => setVence(e.target.value)}
                    className={cn(field, '[color-scheme:light]')}
                  />
                </div>
              )}
            </motion.div>

            {/* Más opciones */}
            <motion.div variants={fade}>
              <button
                type="button"
                onClick={() => setMasOpciones((m) => !m)}
                className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-[13px] font-semibold text-field-deep"
              >
                Más opciones (medio de pago, cheque, nota)
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform',
                    masOpciones && 'rotate-180',
                  )}
                />
              </button>

              <AnimatePresence initial={false}>
                {masOpciones && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-4 pt-3">
                      <div>
                        <label className={label}>
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
                      </div>

                      {esCheque && (
                        <div className="grid gap-3 rounded-xl border border-border bg-secondary/50 p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                              Datos del cheque
                            </span>
                            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink">
                              <input
                                type="checkbox"
                                checked={esEcheq}
                                onChange={(e) => setEsEcheq(e.target.checked)}
                                className="size-4 accent-[var(--primary)]"
                              />
                              Es echeq
                            </label>
                          </div>
                          <input
                            value={contraparte}
                            onChange={(e) => setContraparte(e.target.value)}
                            placeholder={
                              esGasto ? 'Beneficiario' : 'Emisor'
                            }
                            className={field}
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              value={chequeBanco}
                              onChange={(e) => setChequeBanco(e.target.value)}
                              placeholder="Banco"
                              className={field}
                            />
                            <input
                              value={chequeNumero}
                              onChange={(e) => setChequeNumero(e.target.value)}
                              placeholder="N° de cheque"
                              className={cn(field, 'tnum')}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label htmlFor="mv-desc" className={label}>
                          Descripción
                        </label>
                        <input
                          id="mv-desc"
                          value={descripcion}
                          onChange={(e) => setDescripcion(e.target.value)}
                          placeholder="Ej: antiparasitario"
                          className={field}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <motion.div variants={fade}>
              <Button
                type="submit"
                disabled={crear.isPending || !empresaId}
                className="h-11 w-full rounded-xl"
              >
                {crear.isPending ? 'Guardando…' : 'Cargar movimiento'}
              </Button>
            </motion.div>
          </motion.form>
        </DialogContent>
      </Dialog>
    </>
  )
}
