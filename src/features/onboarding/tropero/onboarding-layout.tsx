import { motion, useReducedMotion } from 'framer-motion'
import { BotonChico } from '@/components/tropero/boton'
import { Logo } from '@/components/tropero/logo'
import { cn } from '@/lib/utils'

// Marco del onboarding (página 35). Compu: logo y «Paso N de 4» arriba; la
// escena a la izquierda (820 de 1440) y el formulario de 476 a la derecha.
// Celular: la escena compacta arriba, el formulario abajo y el botón
// principal fijo al pie, siempre a la vista.

export function Progreso({ paso }: { paso: number }) {
  return (
    <div className="flex items-center gap-3.5" aria-label={`Paso ${paso} de 4`}>
      <span className="text-[13px] font-semibold text-texto-suave md:text-[14.5px]">Paso {paso} de 4</span>
      <span className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={cn(
              'h-1.5 w-6 rounded-[3px] transition-colors duration-300 md:w-9',
              n <= paso ? 'bg-principal' : 'bg-borde',
            )}
          />
        ))}
      </span>
    </div>
  )
}

export function OnboardingLayout({
  paso,
  escena,
  escenaCelu,
  atras,
  titulo,
  bajada,
  children,
  pie,
}: {
  /** null = sin «Paso N de 4» (el cierre). */
  paso: number | null
  escena: React.ReactNode
  escenaCelu: React.ReactNode
  /** «Atrás»: al paso anterior, con lo cargado intacto. */
  atras?: { texto: string; onClick: () => void }
  titulo: string
  bajada?: React.ReactNode
  children: React.ReactNode
  /** El botón principal (y lo que lo acompaña): fijo abajo en el celular. */
  pie: React.ReactNode
}) {
  const reducir = useReducedMotion()
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-fondo md:overflow-hidden">
      <header className="flex shrink-0 items-center justify-between px-[18px] pt-[max(16px,env(safe-area-inset-top))] pb-3 md:px-12 md:pt-[38px] md:pb-0">
        <Logo alto={30} className="hidden md:block" />
        <Logo alto={26} soloIsotipo className="md:hidden" />
        {paso !== null && <Progreso paso={paso} />}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row md:gap-12 md:px-12 md:pt-9 md:pb-12">
        <div className="hidden min-h-0 md:block md:w-[57%] md:max-w-[820px] md:shrink-0">{escena}</div>
        <div className="px-[18px] md:hidden">{escenaCelu}</div>

        <motion.main
          key={titulo}
          initial={reducir ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-0 flex-1 flex-col px-[18px] pt-5 md:overflow-y-auto md:px-0 md:pt-0"
        >
          {/* my-auto: centrado si entra; si no, arranca arriba y scrollea. */}
          <div className="flex w-full max-w-[476px] flex-1 flex-col gap-5 md:my-auto md:flex-none md:gap-[22px] md:py-2">
            {atras && (
              <BotonChico type="button" icono="Atrás" className="self-start py-1.5 text-[13.5px]" onClick={atras.onClick}>
                {atras.texto}
              </BotonChico>
            )}
            <div className="flex flex-col gap-3">
              <h1 className="titulo-display text-[30px] leading-[1.02] text-texto md:text-[46px] md:tracking-[-0.02em]">
                {titulo}
              </h1>
              {bajada && <p className="text-[15px] leading-[1.4] text-texto-suave md:text-[16.5px]">{bajada}</p>}
            </div>
            {children}
            {/* El botón principal, una sola vez: fijo al pie en el celular
                (siempre a mano), en su lugar en la compu. */}
            <div className="sticky bottom-0 z-10 -mx-[18px] mt-auto flex flex-col gap-3 bg-gradient-to-t from-fondo from-70% to-transparent px-[18px] pt-6 pb-[max(18px,env(safe-area-inset-bottom))] md:static md:mx-0 md:mt-0 md:bg-none md:p-0">
              {pie}
            </div>
          </div>
        </motion.main>
      </div>
    </div>
  )
}
