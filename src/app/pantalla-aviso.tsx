import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import grano from '@/assets/tropero/grano.png'
import { ConTrazo, LogoWhatsapp, OrbeConAura } from '@/components/tropero/aviso-partes'
import type { Animo } from '@/features/campos/tropero/mascota'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import tranquera from '@/assets/tropero/tranquera.webp'
import { Logo } from '@/components/tropero/logo'
import type { NombreIcono } from '@/components/tropero/iconos-svg'
import { cn } from '@/lib/utils'

/**
 * Lo que se ve cuando algo no está o falló: qué pasó en una línea, qué hacer y un
 * botón para hacerlo. Con `pantallaEntera` lleva la marca arriba (cuando no hay barra
 * lateral, como en un error de la app).
 *
 * En el celular (18/11): el orbe con su aura sobre el granulado de la web, una etiqueta
 * con un punto de color, el trazo a mano en la palabra que importa y los botones abajo,
 * a mano del pulgar. Si el texto nombra WhatsApp, hay un botón de WhatsApp de verdad.
 * En la compu sigue la tranquera a dos columnas (se rehace con la compu).
 */
export function PantallaAviso({
  titulo,
  texto,
  accion,
  icono,
  onAccion,
  secundaria,
  pantallaEntera = false,
  conImagen = true,
  etiqueta,
  animo = 'normal',
  subrayar,
  whatsapp,
  principalWhatsapp = false,
  detalle,
}: {
  titulo: string
  texto: string
  accion: string
  icono: NombreIcono
  onAccion: () => void
  /** `volver`: es un paso atrás (lleva la flecha); si no, es otro camino y va sin flecha. */
  secundaria?: { texto: string; onClick: () => void; volver?: boolean }
  /** Algo propio del caso, debajo del texto (por ejemplo, qué manda por WhatsApp). */
  detalle?: React.ReactNode
  pantallaEntera?: boolean
  /** Sin la tranquera: para avisos sin señal (la imagen no está guardada en el equipo). */
  conImagen?: boolean
  /** Celular: qué pasa en dos o tres palabras, con un punto de color, arriba del título. */
  etiqueta?: { texto: string; tono: 'rojo' | 'trigo' | 'gris' | 'verde' }
  /** Celular: el gesto del orbe. */
  animo?: Animo
  /** Celular: la palabra del título que va con el trazo a mano. */
  subrayar?: string
  /** Un botón de WhatsApp debajo del principal, con el mensaje ya escrito. */
  whatsapp?: { texto: string; href: string }
  /** El principal es abrir WhatsApp: en el celular va en su verde, con el logo. */
  principalWhatsapp?: boolean
}) {
  const punto = { rojo: 'bg-[#c8401a]', trigo: 'bg-trigo-500', gris: 'bg-texto-suave/50', verde: 'bg-[#25d366]' }[etiqueta?.tono ?? 'gris']
  const celular = (
    <div className={cn('relative isolate flex flex-col overflow-hidden bg-[#fff8ec] px-6 pt-7 pb-[max(32px,env(safe-area-inset-bottom))] md:hidden', pantallaEntera ? 'min-h-[100dvh]' : 'h-full overflow-y-auto')}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-90 [background-size:120px_120px]" style={{ backgroundImage: `url(${grano})` }} />
      {pantallaEntera && (
        <div className="flex justify-center">
          <Logo alto={24} />
        </div>
      )}
      <div className="my-auto flex flex-col items-center py-8 text-center">
        <OrbeConAura animo={animo} />
        {etiqueta && (
          <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-superficie/80 px-3 py-1 text-[12.5px] font-semibold text-texto-suave shadow-[inset_0_0_0_1px_var(--borde)]">
            <span className={cn('size-[7px] rounded-full', punto)} />
            {etiqueta.texto}
          </span>
        )}
        <h1 className="titulo-display mt-4 text-[32px] leading-[1.08] text-balance text-texto">
          <ConTrazo texto={titulo} subrayar={subrayar} />
        </h1>
        <p className="mt-3 max-w-[320px] text-[16.5px] leading-snug text-pretty text-texto-suave">{texto}</p>
        {detalle && <div className="mt-5 w-full max-w-[340px]">{detalle}</div>}
      </div>
      <div className="flex flex-col items-center gap-3">
        {principalWhatsapp ? (
          <motion.button
            type="button"
            onClick={onAccion}
            whileTap={{ scale: 0.98 }}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[16px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_12px_24px_-12px_rgb(31_174_85/.8)]"
            style={{ background: 'linear-gradient(180deg, #2bd46d 0%, #1fae55 100%)' }}
          >
            <LogoWhatsapp className="size-[21px]" />
            {accion}
          </motion.button>
        ) : (
          <BotonPrincipal icono={icono} onClick={onAccion} className="w-full">
            {accion}
          </BotonPrincipal>
        )}
        {whatsapp && (
          <motion.a
            href={whatsapp.href}
            target="_blank"
            rel="noopener noreferrer"
            whileTap={{ scale: 0.98 }}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-superficie text-[16px] font-bold text-texto shadow-[inset_0_0_0_1.5px_var(--borde)]"
          >
            <LogoWhatsapp className="size-[21px] text-[#1fae55]" />
            {whatsapp.texto}
          </motion.a>
        )}
        {secundaria && (
          <button type="button" onClick={secundaria.onClick} className="mt-1 inline-flex h-10 items-center px-3 text-[15px] font-semibold text-texto-suave underline decoration-borde decoration-[1.5px] underline-offset-4 hover:text-texto">
            {secundaria.texto}
          </button>
        )}
      </div>
    </div>
  )
  return (
    <>
    {celular}
    <div className={cn('hidden flex-col bg-fondo md:flex', pantallaEntera ? 'min-h-[100dvh] px-6 py-8 sm:px-10' : 'min-h-[70vh] py-10')}>
      {pantallaEntera && <Logo alto={28} />}
      {/* En la compu, a dos columnas: la tranquera a la izquierda y qué pasó con qué hacer a la derecha. */}
      <div className={cn('m-auto grid w-full items-center gap-10', conImagen ? 'max-w-[1040px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-14' : 'max-w-[560px]')}>
        {conImagen && (
          <div className="relative hidden aspect-[4/3] overflow-hidden rounded-[32px] border border-borde md:block">
            <img src={tranquera} alt="" className="absolute inset-0 size-full object-cover object-[50%_40%]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,color-mix(in_srgb,var(--fondo)_55%,transparent))]" />
          </div>
        )}
        <div className="flex flex-col items-start">
          <span className="grid size-14 place-items-center rounded-[18px] bg-principal-suave md:hidden">
            <Logo soloIsotipo alto={26} />
          </span>
          <h1 className="t-pagina mt-5 text-texto md:mt-0 md:text-[52px]">{titulo}</h1>
          <p className="mt-4 max-w-[460px] text-[18px] leading-snug text-texto-suave">{texto}</p>
          {detalle && <div className="mt-6 w-full max-w-[460px]">{detalle}</div>}
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            {principalWhatsapp ? (
              <button
                type="button"
                onClick={onAccion}
                className="inline-flex h-14 items-center justify-center gap-2.5 rounded-full px-7 text-[16px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_12px_24px_-12px_rgb(31_174_85/.8)] transition-[filter] hover:brightness-105 sm:min-w-[220px]"
                style={{ background: 'linear-gradient(180deg, #2bd46d 0%, #1fae55 100%)' }}
              >
                <LogoWhatsapp className="size-[21px]" />
                {accion}
              </button>
            ) : (
              <BotonPrincipal icono={icono} onClick={onAccion} className="sm:w-auto sm:min-w-[220px]">
                {accion}
              </BotonPrincipal>
            )}
            {secundaria && (
              <button type="button" onClick={secundaria.onClick} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie px-6 text-[16px] font-bold text-texto hover:border-principal hover:text-principal">
                {secundaria.volver && <Icono nombre="Atrás" tamano={16} />}
                {secundaria.texto}
              </button>
            )}
            {whatsapp && (
              <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-14 items-center justify-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie px-6 text-[16px] font-bold text-texto hover:border-principal">
                <LogoWhatsapp className="size-[18px] text-[#1fae55]" />
                {whatsapp.texto}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  )
}

/** Una dirección que no existe (un link viejo o mal escrito), dentro de la app. */
export function NoEncontrada() {
  const navigate = useNavigate()
  return (
    <PantallaAviso
      titulo="No encontramos esta página"
      texto="Puede que el link sea viejo o que esté mal escrito. Tus datos están bien."
      etiqueta={{ texto: 'Link viejo o mal escrito', tono: 'gris' }}
      animo="piensa"
      subrayar="página"
      accion="Ir al Inicio"
      icono="Inicio"
      onAccion={() => navigate('/')}
      secundaria={window.history.length > 1 ? { texto: 'Volver a donde estabas', onClick: () => navigate(-1), volver: true } : undefined}
    />
  )
}
