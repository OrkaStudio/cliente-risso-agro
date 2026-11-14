import { useQuery } from '@tanstack/react-query'
import { Icono } from '@/components/tropero/icono'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase/client'

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

/**
 * El Inicio de quien sólo manda (permisos, 14/11): lo suyo va por WhatsApp. Se
 * le muestra cómo mandar y lo último que mandó (la base le deja ver sólo lo suyo).
 */
export function LoQueMandaste({ plata, campos }: { plata: boolean; campos: boolean }) {
  const { user } = useAuth()
  const q = useQuery({
    queryKey: ['lo-que-mandaste', user?.id, plata, campos],
    enabled: !!user,
    queryFn: async () => {
      const [m, l] = await Promise.all([
        plata ? supabase.from('movimiento_financiero').select('id, descripcion, monto, created_at, estado').eq('created_by', user!.id).neq('estado', 'anulado').order('created_at', { ascending: false }).limit(5) : Promise.resolve({ data: [], error: null }),
        campos ? supabase.from('lluvia').select('id, mm, created_at, campo(nombre)').eq('created_by', user!.id).order('created_at', { ascending: false }).limit(5) : Promise.resolve({ data: [], error: null }),
      ])
      if (m.error) throw m.error
      if (l.error) throw l.error
      return [
        ...(m.data ?? []).map((x) => ({ id: x.id, cuando: x.created_at, texto: `${x.descripcion || 'Gasto'} · ${pesos(Number(x.monto))}${x.estado === 'pendiente' ? ' · a pagar' : ''}` })),
        ...(l.data ?? []).map((x) => ({ id: x.id, cuando: x.created_at, texto: `Lluvia · ${Number(x.mm)} mm${(x.campo as { nombre: string } | null)?.nombre ? ` en ${(x.campo as { nombre: string }).nombre}` : ''}` })),
      ]
        .sort((a, b) => b.cuando.localeCompare(a.cuando))
        .slice(0, 5)
    },
  })
  const que = [campos && 'lluvias y novedades del campo', plata && 'gastos, facturas o lo que hay que pagar'].filter(Boolean).join(', ')
  return (
    <section aria-label="Lo que mandás" className="flex flex-col gap-4 rounded-[20px] border border-borde bg-superficie p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="t-seccion text-texto">Lo tuyo lo mandás por WhatsApp</h2>
          <p className="mt-1 text-[15px] text-texto-suave">Mandale a Troppero {que}: una foto, un audio o un mensaje. El dueño lo ve con tu nombre.</p>
        </div>
        <button type="button" onClick={() => window.open(`https://wa.me/${WHATSAPP_TROPERO}`, '_blank', 'noopener')} className="inline-flex h-12 items-center gap-3 rounded-full bg-principal py-1 pr-1 pl-5 text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600">
          Abrir WhatsApp
          <span className="grid size-10 place-items-center rounded-full bg-acento text-acento-texto">
            <Icono nombre="Celular" tamano={16} />
          </span>
        </button>
      </div>
      {(q.data?.length ?? 0) > 0 && (
        <div>
          <p className="text-[14px] font-bold text-texto">Lo último que mandaste</p>
          <ul className="mt-2 flex flex-col divide-y divide-borde/70">
            {q.data!.map((x) => (
              <li key={x.id} className="flex items-center gap-4 py-2.5 text-[15px] text-texto">
                <span className="t-cifra-chica w-14 shrink-0 text-texto-suave">{fecha(x.cuando)}</span>
                {x.texto}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
