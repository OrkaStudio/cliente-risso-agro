import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import { useAuth } from '@/features/auth/auth-context'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from '@/features/mapa/api'
import { campoPendiente, totalesDelMapa } from '@/features/mapa/reglas'
import { cn } from '@/lib/utils'
import ilustracion from '@/assets/tropero/antes-del-mapa.webp'
import { porDondeVaElMapa } from './dia'

const CURVA = [0.22, 1, 0.36, 1] as const
/** «La Porteña, La Loma y El Bajo». */
const lista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)

/**
 * Inicio · Antes del mapa (página 35): el campo está cargado pero no ubicado.
 * Una sola cosa para hacer (el mapa), y lo que viene después, a la vista pero
 * apagado: se abre con el mapa.
 */
export function AntesDelMapa() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const { data: campos } = useMapa(membresia?.empresa_id)
  const reducir = useReducedMotion()
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const cs = campos ?? []
  const t = totalesDelMapa(cs)
  const siguiente = campoPendiente(cs)
  const nombres = cs.map((c) => c.nombre)
  const tus = cs.length === 1 ? 'tu campo' : `tus ${['', '', 'dos', 'tres', 'cuatro', 'cinco'][cs.length] ?? cs.length} campos`

  const pasos = [
    {
      titulo: 'Cargar el campo',
      detalle: `${lista(nombres)}, ${t.potreros} ${t.potreros === 1 ? 'potrero' : 'potreros'} y ${t.cabezas} cabezas`,
      estado: 'listo' as const,
    },
    {
      titulo: cs.length === 1 ? 'Ubicar tu campo en el mapa' : 'Ubicar tus campos en el mapa',
      detalle: porDondeVaElMapa(cs),
      estado: 'ahora' as const,
    },
    { titulo: 'Mandá tu primera lluvia por WhatsApp', detalle: 'Ya está conectado: es el celular con el que entrás', estado: 'despues' as const },
    { titulo: 'Probar el bastón', detalle: 'Leé una caravana en la manga. Se abre con el mapa', estado: 'despues' as const },
    { titulo: 'Anotar el primer gasto', detalle: 'Con la foto del ticket, en diez segundos', estado: 'despues' as const },
  ]
  const entra = (i: number) =>
    reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.07, ease: CURVA } }

  return (
    <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-10">
      <motion.section {...entra(0)} className="relative isolate flex h-[300px] flex-col justify-center overflow-hidden rounded-[28px] bg-tinta px-12">
        <img src={ilustracion} alt="" className="absolute inset-0 -z-20 size-full object-cover" fetchPriority="high" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgba(19,27,22,0.85)] via-[rgba(19,27,22,0.15)] via-60% to-transparent" />
        {nombre && <p className="text-[20px] font-semibold text-[#f7e3b6]">Bienvenido, {nombre}</p>}
        <h1 className="titulo-display mt-1 max-w-[760px] text-[60px] leading-none tracking-[-0.03em] text-superficie">
          Falta el mapa de {cs.length === 1 ? 'tu campo' : 'tus campos'}.
        </h1>
        <p className="mt-4 max-w-[760px] text-[17px] text-[#f7e3b6]">
          Lo primero es tener {tus} en el mapa. Con los potreros dibujados se abre toda la app.
        </p>
      </motion.section>

      <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
        <motion.div {...entra(1)}>
          <p className="titulo-display text-[96px] leading-[0.95] tracking-[-0.03em] whitespace-nowrap text-texto">1 de 5</p>
          <p className="mt-3 text-[18px] font-semibold text-texto-suave">pasos para arrancar</p>
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {pasos.map((p, i) => (
              <span key={i} className={cn('h-2 flex-1 rounded-full', p.estado === 'listo' ? 'bg-estado-bien' : 'bg-borde')} />
            ))}
          </div>
        </motion.div>

        <ol className="flex flex-col gap-1">
          {pasos.map((p, i) => (
            <motion.li
              key={p.titulo}
              {...entra(2 + i)}
              className={cn(
                'flex items-center gap-5 rounded-[18px] px-5 py-4',
                p.estado === 'ahora' && 'bg-superficie shadow-[0_2px_14px_rgba(19,27,22,0.06)]',
              )}
            >
              <span
                className={cn(
                  'grid size-[30px] shrink-0 place-items-center rounded-full text-[14px] font-bold',
                  p.estado === 'listo'
                    ? 'bg-estado-bien text-superficie'
                    : p.estado === 'ahora'
                      ? 'border-2 border-principal text-principal'
                      : 'border-[1.5px] border-borde text-texto-suave/70',
                )}
              >
                {p.estado === 'listo' ? <Icono nombre="Guardar" tamano={16} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-[18px]', p.estado === 'ahora' ? 'font-bold text-texto' : p.estado === 'listo' ? 'font-medium text-texto' : 'font-semibold text-texto-suave/70')}>
                  {p.titulo}
                </p>
                <p className={cn('text-[14.5px]', p.estado === 'despues' ? 'text-texto-suave/60' : 'text-texto-suave')}>{p.detalle}</p>
              </div>
              {p.estado === 'listo' && <span className="text-[15px] font-semibold text-estado-bien-texto">Listo</span>}
              {p.estado === 'ahora' && (
                <button
                  type="button"
                  onClick={() => navigate(siguiente ? `/mapa/${siguiente.id}` : '/mapa')}
                  className="inline-flex h-12 shrink-0 items-center gap-3 rounded-full bg-principal py-1.5 pr-1.5 pl-6 text-[16px] font-bold text-principal-texto hover:bg-terracota-600"
                >
                  Seguir
                  <span className="grid size-9 place-items-center rounded-full bg-acento text-acento-texto">
                    <Icono nombre="Siguiente" tamano={16} />
                  </span>
                </button>
              )}
              {p.estado === 'despues' && <span className="shrink-0 text-[15px] font-semibold text-principal/60">Después del mapa</span>}
            </motion.li>
          ))}
        </ol>
      </div>

      <p className="text-[15px] text-texto-suave">Si cortás, cada paso queda donde lo dejaste. Nada se pierde.</p>
    </div>
  )
}
