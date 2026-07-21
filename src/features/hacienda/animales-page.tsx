import { useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  HeartPulse,
  Layers,
  LogOut,
  Scissors,
  Search,
  Stethoscope,
  Tag,
  X,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import {
  useAnimales,
  useEventosSenales,
  usePotreros,
} from '@/features/hacienda/hooks'
import { useCampos } from '@/features/campos/hooks'
import {
  coloresPorCategoria,
  categoriaLabel,
  categoriaNombre,
  sexoLabel,
} from '@/features/hacienda/labels'
import {
  PESO_VENTA_KG,
  edadMeses,
  partoEstimado,
  resumirEventos,
  senalesDe,
  type Senal,
} from '@/features/hacienda/senales'
import { CrearAnimalDialog } from '@/features/hacienda/crear-animal-dialog'
import { DarBajaDialog } from '@/features/hacienda/acciones-animal'
import { Contador } from '@/components/contador'
import { Panel } from '@/components/panel'
import { PageHeader, Stat } from '@/components/page-header'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

type Categoria = Database['public']['Enums']['categoria_animal']
type Estado = Database['public']['Enums']['estado_animal']
type Animal = Database['public']['Views']['v_animal_con_caravana']['Row']

const CATEGORIAS = Object.keys(categoriaLabel) as Categoria[]

function edad(fechaNac: string | null): string {
  const meses = edadMeses(fechaNac)
  if (meses == null) return '—'
  if (meses < 24) return `${meses} m`
  return `${Math.floor(meses / 12)} a`
}

/* ===== Señales del rodeo ===== */

const SENAL_UI: Record<
  Senal,
  { label: string; icon: ComponentType<{ className?: string }>; tile: string; chip: string }
> = {
  retiro: {
    label: 'En tratamiento',
    icon: Stethoscope,
    tile: 'bg-destructive/10 text-destructive',
    chip: 'bg-destructive/10 text-destructive',
  },
  prenada: {
    label: 'Preñadas',
    icon: HeartPulse,
    tile: 'bg-field-soft text-field-deep',
    chip: 'bg-field-soft text-field-deep',
  },
  vender: {
    label: 'Para vender',
    icon: Tag,
    tile: 'bg-sol-soft text-sol-deep',
    chip: 'bg-sol-soft text-sol-deep',
  },
  destete: {
    label: 'Para destetar',
    icon: Scissors,
    tile: 'bg-sky-soft text-sky',
    chip: 'bg-sky-soft text-sky',
  },
}

const SENAL_CHIP_LABEL: Record<Senal, string> = {
  retiro: 'retiro vigente',
  prenada: 'preñada',
  vender: 'para vender',
  destete: 'destete',
}


export function AnimalesPage() {
  const animales = useAnimales()
  const potreros = usePotreros()
  const campos = useCampos()
  const eventosSenales = useEventosSenales()

  const [q, setQ] = useState('')
  const [catF, setCatF] = useState<'todas' | Categoria>('todas')
  const [estF, setEstF] = useState<Estado>('activo')
  const [potF, setPotF] = useState<string | null>(null)
  const [campoF, setCampoF] = useState<string | null>(null)
  const [soloSinCaravana, setSoloSinCaravana] = useState(false)
  const [senalF, setSenalF] = useState<Senal | null>(null)
  const [view, setView] = useState<'tabla' | 'potrero'>('tabla')

  const potreroNombre = useMemo(
    () => new Map((potreros.data ?? []).map((p) => [p.id, p.nombre])),
    [potreros.data],
  )
  // potrero_id → campo_id, para acotar el apartado por campo.
  const potreroCampo = useMemo(
    () => new Map((potreros.data ?? []).map((p) => [p.id, p.campo_id])),
    [potreros.data],
  )

  const todos = useMemo(() => animales.data ?? [], [animales.data])

  // Alcance del apartado: si hay un campo elegido, todo (stock, conteos y
  // tabla) se acota a los animales de ese campo.
  const lista = useMemo(
    () =>
      campoF
        ? todos.filter((a) => potreroCampo.get(a.potrero_id ?? '') === campoF)
        : todos,
    [todos, campoF, potreroCampo],
  )

  // Stock por categoría = activos del alcance (no depende de los filtros de la tabla).
  const { porCategoria, totalActivos, sinCaravana } = useMemo(() => {
    const activos = lista.filter((a) => a.estado === 'activo')
    const conteo = new Map<Categoria, number>()
    for (const a of activos) {
      if (a.categoria)
        conteo.set(a.categoria, (conteo.get(a.categoria) ?? 0) + 1)
    }
    const porCategoria = [...conteo.entries()]
      .map(([categoria, n]) => ({ categoria, n }))
      .sort((a, b) => b.n - a.n)
    return {
      porCategoria,
      totalActivos: activos.length,
      sinCaravana: activos.filter((a) => !a.caravana_rfid).length,
    }
  }, [lista])
  // Colores por presencia → barra, leyenda y puntos de la tabla coinciden.
  const coloresCat = coloresPorCategoria(porCategoria.map((c) => c.categoria))

  // Señales: qué dice el historial (evento.datos) de cada animal activo.
  const hoyISO = new Date().toISOString().slice(0, 10)
  const resumen = useMemo(
    () => resumirEventos(eventosSenales.data ?? []),
    [eventosSenales.data],
  )
  const senalesPorAnimal = useMemo(() => {
    const map = new Map<string, Senal[]>()
    for (const a of lista) {
      if (a.estado !== 'activo' || !a.id) continue
      const s = senalesDe(
        { categoria: a.categoria, fecha_nacimiento: a.fecha_nacimiento },
        resumen.get(a.id),
        hoyISO,
      )
      if (s.length) map.set(a.id, s)
    }
    return map
  }, [lista, resumen, hoyISO])

  // Conteos y subtítulos del panel de señales (sobre el alcance del campo).
  const senalesResumen = useMemo(() => {
    const conteo: Record<Senal, number> = { retiro: 0, prenada: 0, vender: 0, destete: 0 }
    let paren90 = 0
    let kgSuma = 0
    let kgN = 0
    // Hoy + 90 días, derivado de hoyISO (determinístico para el render).
    const [hy, hm, hd] = hoyISO.split('-').map(Number)
    const f90 = new Date(hy, hm - 1, hd + 90)
    const en90 = `${f90.getFullYear()}-${String(f90.getMonth() + 1).padStart(2, '0')}-${String(f90.getDate()).padStart(2, '0')}`
    for (const a of lista) {
      if (a.estado !== 'activo' || !a.id) continue
      const s = senalesPorAnimal.get(a.id)
      if (!s) continue
      for (const x of s) conteo[x] += 1
      const r = resumen.get(a.id)
      if (s.includes('prenada') && r?.prenada) {
        const est = partoEstimado(r.prenada)
        if (est && est <= en90) paren90 += 1
      }
      if (s.includes('vender') && r?.ultimoPeso) {
        kgSuma += r.ultimoPeso.kg
        kgN += 1
      }
    }
    return { conteo, paren90, kgProm: kgN ? Math.round(kgSuma / kgN) : null }
  }, [lista, senalesPorAnimal, resumen, hoyISO])

  const filtered = useMemo(() => {
    const txt = q.trim().toLowerCase()
    return lista.filter((a) => {
      if (a.estado !== estF) return false
      if (soloSinCaravana && a.caravana_rfid) return false
      if (catF !== 'todas' && a.categoria !== catF) return false
      if (potF && a.potrero_id !== potF) return false
      if (senalF && !(a.id && senalesPorAnimal.get(a.id)?.includes(senalF)))
        return false
      if (
        txt &&
        !`${a.caravana_rfid ?? ''} ${a.caravana_visual ?? ''}`
          .toLowerCase()
          .includes(txt)
      )
        return false
      return true
    })
  }, [lista, q, catF, estF, potF, soloSinCaravana, senalF, senalesPorAnimal])

  const potrerosConAnimales = useMemo(
    () => new Set(lista.filter((a) => a.estado === 'activo').map((a) => a.potrero_id)).size,
    [lista],
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <PageHeader
        title="Hacienda"
        meta={
          <>
            <Stat>{totalActivos}</Stat> cabezas activas ·{' '}
            <Stat>{potrerosConAnimales}</Stat> potreros con animales
            {sinCaravana > 0 && (
              <>
                {' '}
                · <Stat>{sinCaravana}</Stat> sin caravana
              </>
            )}
          </>
        }
        action={
          <div data-guia="hacienda-acciones">
            <CrearAnimalDialog />
          </div>
        }
      />

      {/* Stock por categoría + Señales del rodeo */}
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Panel
          title="Stock por categoría"
          sub={`${totalActivos} cabezas activas`}
          guia="hacienda-stock"
        >
          {totalActivos === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todavía no hay animales activos.
            </p>
          ) : (
            <>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-md">
                {porCategoria.map((c) => (
                  <span
                    key={c.categoria}
                    className="h-full rounded-sm"
                    style={{
                      width: `${(c.n / totalActivos) * 100}%`,
                      background: coloresCat[c.categoria],
                    }}
                    title={`${categoriaNombre(c.categoria, c.n)}: ${c.n}`}
                  />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[13.5px] sm:grid-cols-3">
                {porCategoria.map((c) => (
                  <div key={c.categoria} className="flex items-center gap-2.5">
                    <span
                      className="size-[11px] shrink-0 rounded-[3px]"
                      style={{ background: coloresCat[c.categoria] }}
                    />
                    <span className="text-ink">{categoriaNombre(c.categoria, c.n)}</span>
                    <span className="tnum ml-auto text-[12.5px] font-bold text-ink">
                      {c.n}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel
          title="Señales"
          guia="hacienda-senales"
          action={
            senalF ? (
              <button
                type="button"
                onClick={() => setSenalF(null)}
                className="flex items-center gap-1 text-[13px] font-semibold text-field-deep hover:underline"
              >
                <X className="size-3.5" /> quitar filtro
              </button>
            ) : (
              <span className="text-[13.5px] text-faint">tocá para filtrar</span>
            )
          }
        >
          <div className="grid grid-cols-2 gap-2.5">
            {(Object.keys(SENAL_UI) as Senal[]).map((s, i) => {
              const ui = SENAL_UI[s]
              const Icon = ui.icon
              const n = senalesResumen.conteo[s]
              const sub =
                s === 'retiro'
                  ? 'con retiro sanitario'
                  : s === 'prenada'
                    ? senalesResumen.paren90 > 0
                      ? `~${senalesResumen.paren90} paren en 90 días`
                      : 'según último tacto'
                    : s === 'vender'
                      ? senalesResumen.kgProm
                        ? `~${senalesResumen.kgProm} kg promedio`
                        : `novillos ≥${PESO_VENTA_KG} kg`
                      : 'crías de 6-8 meses'
              return (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
                  type="button"
                  onClick={() => setSenalF(senalF === s ? null : s)}
                  aria-pressed={senalF === s}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                    senalF === s
                      ? 'border-field-deep bg-field-soft/50'
                      : 'border-border bg-card hover:border-faint',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-xl',
                      ui.tile,
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'tnum block text-[21px] font-bold leading-none',
                        n === 0 ? 'text-faint' : 'text-ink',
                      )}
                    >
                      <Contador n={n} />
                    </span>
                    <span className="mt-0.5 block text-[12px] font-semibold text-muted-foreground">
                      {ui.label}
                    </span>
                    <span className="block truncate text-[10.5px] text-faint">{sub}</span>
                  </span>
                </motion.button>
              )
            })}
          </div>
          {[...senalesPorAnimal.values()].length === 0 && (
            <p className="mt-3 text-[11.5px] leading-snug text-faint">
              Las señales se prenden solas con lo que se registra en el
              historial: tactos, tratamientos con retiro, pesadas y edades.
            </p>
          )}
        </Panel>
      </div>

      {/* Toolbar de filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex h-10 min-w-52 flex-1 items-center gap-2.5 rounded-[10px] border border-border bg-card px-3.5 shadow-[0_1px_2px_rgba(16,24,19,0.05)] focus-within:border-primary focus-within:ring-2 focus-within:ring-field-soft">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por caravana…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Limpiar búsqueda">
              <X className="size-4 text-faint transition-colors hover:text-ink" />
            </button>
          )}
        </div>

        {potF && (
          <span className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-primary bg-field-soft px-3.5 text-[13.5px] font-semibold text-field-deep">
            Potrero: {potreroNombre.get(potF) ?? '—'}
            <button onClick={() => setPotF(null)} aria-label="Quitar filtro">
              <X className="size-3.5" />
            </button>
          </span>
        )}

        <Dropdown
          ariaLabel="Filtrar por campo"
          value={campoF ?? 'todos'}
          onChange={(v) => {
            setCampoF(v === 'todos' ? null : v)
            setPotF(null)
          }}
          options={[
            { value: 'todos', label: 'Campo: todos' },
            ...(campos.data ?? []).map((c) => ({ value: c.id, label: c.nombre })),
          ]}
        />

        <Dropdown
          ariaLabel="Filtrar por categoría"
          value={catF}
          onChange={(v) => setCatF(v as 'todas' | Categoria)}
          options={[
            { value: 'todas', label: 'Categoría: todas' },
            ...CATEGORIAS.map((c) => ({ value: c, label: categoriaLabel[c] })),
          ]}
        />

        <Dropdown
          ariaLabel="Filtrar por estado"
          value={estF}
          onChange={(v) => setEstF(v as Estado)}
          options={[
            { value: 'activo', label: 'Estado: activos' },
            { value: 'vendido', label: 'Vendidos' },
            { value: 'muerto', label: 'Bajas' },
          ]}
        />

        {(soloSinCaravana || sinCaravana > 0) && (
          <button
            type="button"
            onClick={() => setSoloSinCaravana((v) => !v)}
            className={cn(
              'inline-flex h-10 items-center gap-1.5 rounded-[10px] border px-3.5 text-[13.5px] font-semibold transition-colors',
              soloSinCaravana
                ? 'border-primary bg-field-soft text-field-deep'
                : 'border-border bg-card text-muted-foreground hover:text-ink',
            )}
          >
            <Layers className="size-4" />
            Sin caravana
            <span className="tnum rounded-full bg-ink/[0.06] px-1.5 text-[12px]">
              {sinCaravana}
            </span>
          </button>
        )}

        <div className="ml-auto flex h-10 rounded-[10px] border border-border bg-secondary p-0.5">
          {(['tabla', 'potrero'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-[7px] px-4 text-[13.5px] font-semibold transition-colors',
                view === v
                  ? 'bg-card text-ink shadow-[0_1px_3px_rgba(16,24,19,0.08)]'
                  : 'text-muted-foreground hover:text-ink',
              )}
            >
              {v === 'tabla' ? 'Tabla' : 'Por potrero'}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <Panel className={cn(animales.isLoading && 'animate-pulse')} guia="hacienda-tabla">
        {animales.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando…
          </p>
        ) : animales.error ? (
          <p className="py-8 text-center text-sm text-destructive">
            Error al cargar: {(animales.error as Error).message}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Sin animales con ese filtro.
          </p>
        ) : view === 'tabla' ? (
          <AnimalTable
            rows={filtered}
            potreroNombre={potreroNombre}
            senales={senalesPorAnimal}
            colores={coloresCat}
          />
        ) : (
          <PorPotrero
            rows={filtered}
            potreroNombre={potreroNombre}
            senales={senalesPorAnimal}
            colores={coloresCat}
          />
        )}
      </Panel>
    </div>
  )
}

/* ===== Tabla ===== */
function AnimalTable({
  rows,
  potreroNombre,
  senales,
  colores,
}: {
  rows: Animal[]
  potreroNombre: Map<string, string>
  senales: Map<string, Senal[]>
  colores: Record<Categoria, string>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left">
            {['Caravana', 'Categoría', 'Sexo', 'Potrero', 'Edad', 'Señales', ''].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3.5 text-xs font-semibold uppercase tracking-[0.05em] text-faint"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const s = a.id ? senales.get(a.id) : undefined
            return (
              <tr
                key={a.id}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/50"
              >
                <td className="px-4 py-3.5">
                  {a.caravana_rfid ? (
                    <span className="tnum text-[13px] font-semibold text-ink">
                      {a.caravana_rfid}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-faint">
                      sin caravana
                    </span>
                  )}
                  {a.caravana_visual && (
                    <span className="ml-2 text-xs text-faint">
                      {a.caravana_visual}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-sm">
                  {a.categoria ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: colores[a.categoria] }}
                      />
                      {categoriaLabel[a.categoria]}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3.5 text-sm text-muted-foreground">
                  {a.sexo ? sexoLabel[a.sexo] : '—'}
                </td>
                <td className="px-4 py-3.5 text-sm">
                  {a.potrero_id ? (
                    <Link
                      to={`/potrero/${a.potrero_id}`}
                      className="font-medium text-muted-foreground transition-colors hover:text-field-deep hover:underline"
                    >
                      {potreroNombre.get(a.potrero_id) ?? '—'}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="tnum px-4 py-3.5 text-sm text-muted-foreground">
                  {edad(a.fecha_nacimiento)}
                </td>
                <td className="px-4 py-3.5">
                  {s?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {s.map((x) => (
                        <span
                          key={x}
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold',
                            SENAL_UI[x].chip,
                          )}
                        >
                          {SENAL_CHIP_LABEL[x]}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-faint">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right">
                  {a.id && (
                    <span className="inline-flex items-center gap-3">
                      <Link
                        to={`/hacienda/${a.id}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-field-deep hover:underline"
                      >
                        Ver ficha
                        <ArrowRight className="size-3.5" />
                      </Link>
                      {a.estado === 'activo' && (
                        <DarBajaDialog
                          animalId={a.id}
                          trigger={
                            <button
                              type="button"
                              title="Dar de baja (venta, muerte o error de carga)"
                              aria-label="Dar de baja"
                              className="inline-flex size-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <LogOut className="size-4" />
                            </button>
                          }
                        />
                      )}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ===== Vista por potrero ===== */
function PorPotrero({
  rows,
  potreroNombre,
  senales,
  colores,
}: {
  rows: Animal[]
  potreroNombre: Map<string, string>
  senales: Map<string, Senal[]>
  colores: Record<Categoria, string>
}) {
  const grupos = useMemo(() => {
    const map = new Map<string, Animal[]>()
    for (const a of rows) {
      const key = a.potrero_id ?? 'sin'
      const arr = map.get(key)
      if (arr) arr.push(a)
      else map.set(key, [a])
    }
    return [...map.entries()]
  }, [rows])

  return (
    <div className="flex flex-col gap-5">
      {grupos.map(([potId, animales]) => (
        <div
          key={potId}
          className="overflow-hidden rounded-xl border border-border bg-secondary/40"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="font-heading text-base font-bold text-ink">
              {potId === 'sin' ? 'Sin potrero' : (potreroNombre.get(potId) ?? '—')}
            </span>
            <span className="tnum rounded-full border border-border bg-card px-3 py-0.5 text-xs font-semibold text-muted-foreground">
              {animales.length} animales
            </span>
          </div>
          <div className="bg-card">
            <AnimalTable
              rows={animales}
              potreroNombre={potreroNombre}
              senales={senales}
              colores={colores}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
