import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search, X } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { useAnimales, usePotreros } from '@/features/hacienda/hooks'
import { useCampos } from '@/features/campos/hooks'
import {
  categoriaColor,
  categoriaLabel,
  sexoLabel,
} from '@/features/hacienda/labels'
import { Panel } from '@/components/panel'
import { buttonVariants } from '@/components/ui/button'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

type Categoria = Database['public']['Enums']['categoria_animal']
type Estado = Database['public']['Enums']['estado_animal']
type Animal = Database['public']['Views']['v_animal_con_caravana']['Row']

const CATEGORIAS = Object.keys(categoriaLabel) as Categoria[]

function edad(fechaNac: string | null): string {
  if (!fechaNac) return '—'
  const nac = new Date(fechaNac)
  const now = new Date()
  let meses =
    (now.getFullYear() - nac.getFullYear()) * 12 +
    (now.getMonth() - nac.getMonth())
  if (now.getDate() < nac.getDate()) meses -= 1
  if (meses < 0) return '—'
  if (meses < 24) return `${meses} m`
  return `${Math.floor(meses / 12)} a`
}


export function AnimalesPage() {
  const animales = useAnimales()
  const potreros = usePotreros()
  const campos = useCampos()

  const [q, setQ] = useState('')
  const [catF, setCatF] = useState<'todas' | Categoria>('todas')
  const [estF, setEstF] = useState<Estado>('activo')
  const [potF, setPotF] = useState<string | null>(null)
  const [campoF, setCampoF] = useState<string | null>(null)
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
  const { porCategoria, totalActivos } = useMemo(() => {
    const activos = lista.filter((a) => a.estado === 'activo')
    const conteo = new Map<Categoria, number>()
    for (const a of activos) {
      if (a.categoria)
        conteo.set(a.categoria, (conteo.get(a.categoria) ?? 0) + 1)
    }
    const porCategoria = [...conteo.entries()]
      .map(([categoria, n]) => ({ categoria, n }))
      .sort((a, b) => b.n - a.n)
    return { porCategoria, totalActivos: activos.length }
  }, [lista])

  const filtered = useMemo(() => {
    const txt = q.trim().toLowerCase()
    return lista.filter((a) => {
      if (a.estado !== estF) return false
      if (catF !== 'todas' && a.categoria !== catF) return false
      if (potF && a.potrero_id !== potF) return false
      if (
        txt &&
        !`${a.caravana_rfid ?? ''} ${a.caravana_visual ?? ''}`
          .toLowerCase()
          .includes(txt)
      )
        return false
      return true
    })
  }, [lista, q, catF, estF, potF])

  const potrerosConAnimales = useMemo(
    () => new Set(lista.filter((a) => a.estado === 'activo').map((a) => a.potrero_id)).size,
    [lista],
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
            Hacienda
          </h1>
          <p className="mt-1 text-[14.5px] font-medium text-muted-foreground">
            <span className="tnum">{totalActivos}</span> cabezas activas ·{' '}
            {potrerosConAnimales} potreros con animales
          </p>
        </div>
        <Link to="/hacienda/nuevo" className={buttonVariants()}>
          + Nuevo animal
        </Link>
      </div>

      {/* Stock por categoría */}
      <Panel title="Stock por categoría" sub={`${totalActivos} cabezas activas`}>
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
                    background: categoriaColor[c.categoria],
                  }}
                  title={`${categoriaLabel[c.categoria]}: ${c.n}`}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[13.5px] sm:grid-cols-3">
              {porCategoria.map((c) => (
                <div key={c.categoria} className="flex items-center gap-2.5">
                  <span
                    className="size-[11px] shrink-0 rounded-[3px]"
                    style={{ background: categoriaColor[c.categoria] }}
                  />
                  <span className="text-ink">{categoriaLabel[c.categoria]}</span>
                  <span className="tnum ml-auto text-[12.5px] font-bold text-ink">
                    {c.n}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

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
      <Panel className={cn(animales.isLoading && 'animate-pulse')}>
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
          <AnimalTable rows={filtered} potreroNombre={potreroNombre} />
        ) : (
          <PorPotrero rows={filtered} potreroNombre={potreroNombre} />
        )}
      </Panel>
    </div>
  )
}

/* ===== Tabla ===== */
function AnimalTable({
  rows,
  potreroNombre,
}: {
  rows: Animal[]
  potreroNombre: Map<string, string>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left">
            {['Caravana', 'Categoría', 'Sexo', 'Potrero', 'Edad', ''].map(
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
          {rows.map((a) => (
            <tr
              key={a.id}
              className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/50"
            >
              <td className="px-4 py-3.5">
                <span className="tnum text-[13px] font-semibold text-ink">
                  {a.caravana_rfid ?? '—'}
                </span>
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
                      style={{ background: categoriaColor[a.categoria] }}
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
              <td className="px-4 py-3.5 text-sm text-muted-foreground">
                {a.potrero_id ? (potreroNombre.get(a.potrero_id) ?? '—') : '—'}
              </td>
              <td className="tnum px-4 py-3.5 text-sm text-muted-foreground">
                {edad(a.fecha_nacimiento)}
              </td>
              <td className="px-4 py-3.5 text-right">
                {a.id && (
                  <Link
                    to={`/hacienda/${a.id}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-field-deep hover:underline"
                  >
                    Ver ficha
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ===== Vista por potrero ===== */
function PorPotrero({
  rows,
  potreroNombre,
}: {
  rows: Animal[]
  potreroNombre: Map<string, string>
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
            <AnimalTable rows={animales} potreroNombre={potreroNombre} />
          </div>
        </div>
      ))}
    </div>
  )
}
