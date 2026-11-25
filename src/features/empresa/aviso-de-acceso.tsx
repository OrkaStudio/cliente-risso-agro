import { toast } from 'sonner'
import { Icono } from '@/components/tropero/icono'
import { SECCIONES_CON_PERMISO } from './secciones'
import type { Cambio } from './cambio-de-acceso'

const TONO: Record<Cambio['nivel'], string> = {
  no: 'bg-superficie/10 text-superficie/70',
  ve: 'bg-superficie/15 text-superficie',
  carga: 'bg-[#cfe6c4] text-[#2f5a24]',
  solo_manda: 'bg-[#dcf8c6] text-[#1fae55]',
}

/**
 * El aviso de que el dueño le cambió lo que puede ver (Lau, 25/11: el de antes era un
 * «?» con una frase corrida). Una tarjeta: arriba quién y qué; abajo, cada sección que
 * cambió con su ícono, en el color de lo que puede hacer ahora.
 */
export function avisarCambioDeAcceso(cambios: Cambio[], ganoLaApp: boolean) {
  toast.custom(
    (id) => (
      <div role="status" className="w-[min(440px,calc(100vw-32px))] overflow-hidden rounded-[22px] bg-tinta text-superficie shadow-[0_18px_44px_-14px_rgba(19,27,22,0.55)]">
        <div className="flex items-start gap-3 px-4 pt-3.5 pb-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-acento text-acento-texto">
            <Icono nombre="Usuario" tamano={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] leading-snug font-semibold">{ganoLaApp ? 'Ya podés usar la app' : 'El dueño cambió lo que podés ver'}</p>
            <p className="text-[13px] text-superficie/65">Ya está aplicado, no hace falta hacer nada.</p>
          </div>
          <button type="button" aria-label="Cerrar el aviso" onClick={() => toast.dismiss(id)} className="-mt-0.5 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-superficie/60 hover:bg-superficie/10 hover:text-superficie">
            <Icono nombre="Cerrar" tamano={16} />
          </button>
        </div>
        <ul className="flex flex-col gap-1.5 border-t border-superficie/10 px-4 py-3">
          {cambios.map((c) => {
            const s = SECCIONES_CON_PERMISO.find((x) => x.id === c.seccion)!
            return (
              <li key={c.seccion} className="flex items-center gap-2.5 text-[14px] leading-snug">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${TONO[c.nivel]}`}>
                  <Icono nombre={s.icono} tamano={16} />
                </span>
                <span className={c.nivel === 'no' ? 'text-superficie/70' : ''}>{c.texto}</span>
              </li>
            )
          })}
        </ul>
      </div>
    ),
    // Sin la tarjeta de los otros avisos alrededor: ésta ya es la tarjeta.
    { id: 'cambio-de-acceso', duration: 9000, unstyled: true, classNames: { toast: '!block !bg-transparent !p-0 !shadow-none !w-auto' } },
  )
}

/** Pasó a ir sólo por WhatsApp: el aviso anterior se va, lo dice su pantalla. */
export function cerrarAvisoDeAcceso() {
  toast.dismiss('cambio-de-acceso')
}
