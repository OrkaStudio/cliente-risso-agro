import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import { useAuth } from '@/features/auth/auth-context'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from '@/features/mapa/api'
import { primerPendiente } from '@/features/mapa/bloqueo'
import { EjemploCampo } from '@/features/mapa/ejemplo'
import { dibujadoEn, estadoDe, haTexto, type CampoMapa } from '@/features/mapa/reglas'
import { cn } from '@/lib/utils'

const CURVA = [0.22, 1, 0.36, 1] as const

/**
 * Inicio mientras falta el mapa (Lau, 02/11: «que se entienda sin leer»).
 * A la izquierda, cómo va a quedar: un campo de ejemplo que se arma solo sobre
 * el satélite (el borde y después los potreros con lo que tienen). A la
 * derecha, lo concreto de SU campo: el borde y cada potrero, con nombre,
 * hectáreas y lo que tiene, para ir tildando, y un solo botón. Abajo, lo que se
 * abre al terminar.
 */
export function AntesDelMapa() {
  const { data: membresia } = useEmpresa()
  const { data: campos } = useMapa(membresia?.empresa_id)
  const { user } = useAuth()
  const reducir = useReducedMotion()
  const cs = campos ?? []
  const campo = primerPendiente(cs)
  if (!campo) return null
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.08, ease: CURVA } })
  const nombre = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const primeraVez = !cs.some((c) => primerPendiente([c]) === null)
  const otros = cs.filter((c) => c.id !== campo.id && primerPendiente([c]) !== null)

  return (
    <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-4">
      <motion.p {...entra(0)} className="text-[15px] font-semibold text-texto-suave">
        {primeraVez ? `Hola${nombre ? `, ${nombre}` : ''}. Lo primero es tu campo en el mapa.` : `Sumaste ${campo.nombre}: falta ubicarlo en el mapa.`}
      </motion.p>

      <motion.section {...entra(1)} className="grid overflow-hidden rounded-[24px] border border-borde bg-superficie lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Cómo va a quedar: el ejemplo se arma solo. */}
        <div className="relative min-h-[300px] bg-tinta lg:min-h-[440px]">
          <EjemploCampo />
          <p className="absolute top-4 left-4 rounded-full bg-tinta/80 px-3.5 py-1.5 text-[13.5px] font-bold text-superficie backdrop-blur">Así va a quedar tu campo</p>
        </div>
        {/* Lo que tiene que hacer, con su campo. */}
        <Lista campo={campo} />
      </motion.section>

      <motion.div {...entra(2)} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] bg-superficie-hundida/60 px-5 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-superficie text-texto-suave">
          <Icono nombre="Candado" tamano={16} />
        </span>
        <p className="min-w-0 flex-1 text-[15px] text-texto">
          Al terminar se abren <b>Hacienda</b>, <b>Plata</b> y <b>Agenda</b>.
          {otros.length > 0 && <span className="text-texto-suave"> Después siguen {otros.map((c) => c.nombre).join(' y ')}.</span>}
        </p>
      </motion.div>
    </div>
  )
}

function Lista({ campo }: { campo: CampoMapa }) {
  const navigate = useNavigate()
  const col = colorDeCampo(campo.colorIdx ?? 0)
  const borde = !!campo.contorno
  const potreros = [...campo.potreros].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
  const hechos = borde ? potreros.filter((p) => dibujadoEn(p, campo.contorno)).length : 0
  const sigue = !borde ? 'borde' : (potreros.find((p) => !dibujadoEn(p, campo.contorno))?.id ?? null)
  const fila = (hecho: boolean, ahora: boolean, titulo: React.ReactNode, detalle: string) => (
    <li className={cn('flex items-center gap-3 rounded-[14px] px-3 py-2.5', ahora && 'bg-principal-suave/50 ring-1 ring-principal/30')}>
      <span
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-full',
          hecho ? 'bg-estado-bien text-superficie' : ahora ? 'border-2 border-principal' : 'border-[1.5px] border-borde',
        )}
      >
        {hecho && <Icono nombre="Guardar" tamano={16} />}
      </span>
      <span className={cn('min-w-0 flex-1 text-[15px]', hecho ? 'text-texto-suave line-through decoration-texto-suave/40' : 'text-texto')}>{titulo}</span>
      <span className="shrink-0 text-[13px] text-texto-suave">{detalle}</span>
    </li>
  )
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] text-[18px] font-extrabold text-white" style={{ background: col.hex }}>
          {col.letra}
        </span>
        <div className="min-w-0">
          <h1 className="font-heading text-[24px] leading-tight font-extrabold text-texto">{campo.nombre}</h1>
          <p className="text-[14px] text-texto-suave">
            {campo.hectareas ? `${haTexto(campo.hectareas)} ha · ` : ''}
            {potreros.length} {potreros.length === 1 ? 'potrero' : 'potreros'}
          </p>
        </div>
      </div>
      <p className="text-[15px] text-texto">Marcá en el satélite su borde y cada potrero.</p>
      <ol className="flex flex-col gap-0.5">
        {fila(borde, sigue === 'borde', <b>Borde del campo</b>, borde ? 'listo' : '')}
        {potreros.map((p) => {
          const hecho = borde && dibujadoEn(p, campo.contorno)
          return fila(hecho, sigue === p.id, <b className="cifra">{p.nombre}</b>, [p.hectareas ? `${haTexto(p.hectareas)} ha` : null, p.que].filter(Boolean).join(' · '))
        })}
      </ol>
      <button
        type="button"
        // Campos abre solo el que falta: el link no cambia lo elegido en la barra.
        onClick={() => navigate('/campos')}
        className="mt-auto inline-flex h-12 w-full items-center justify-between rounded-full bg-principal py-1 pr-1 pl-6 text-[16px] font-bold text-principal-texto hover:bg-terracota-600"
      >
        {estadoDe(campo).tipo === 'sin-borde' ? `Dibujar ${campo.nombre}` : `Seguir: ${hechos} de ${potreros.length} potreros`}
        <span className="grid size-10 place-items-center rounded-full bg-acento text-acento-texto">
          <Icono nombre="Siguiente" tamano={16} />
        </span>
      </button>
    </div>
  )
}
