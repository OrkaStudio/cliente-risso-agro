import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PantallaAviso } from '@/app/pantalla-aviso'
import { LogoWhatsapp } from '@/components/tropero/audio-whatsapp'
import { Icono } from '@/components/tropero/icono'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { useAuth } from '@/features/auth/auth-context'
import { olvidarCuentaElegida } from '@/features/empresa/cuenta-activa'
import { SECCIONES_CON_PERMISO, type Niveles } from '@/features/empresa/secciones'
import { formatearCelularAR } from '@/lib/telefono'

/** Qué manda de cada sección: lo que tiene en «Avisa». */
const QUE_MANDA: Record<string, string> = {
  hacienda: 'Nacimientos, muertes y lo que pasa con la hacienda',
  campos: 'Lluvias, recorridas y novedades del campo',
  plata: 'Gastos y facturas, con la foto',
}

/**
 * Quien va sólo por WhatsApp (todo en «No ve» o «Avisa», 25/11) no usa la app: si
 * igual entra, se le dice qué manda, a qué número, y se lo abre. Si además está en
 * otras cuentas (varias cuentas, 14/11), puede entrar con otra.
 */
export function AccesoPorWhatsapp({ empresa, niveles, otrasCuentas = false }: { empresa: string | null; niveles: Niveles | null; otrasCuentas?: boolean }) {
  const { user, signOut } = useAuth()
  const qc = useQueryClient()
  const avisa = SECCIONES_CON_PERMISO.filter((s) => niveles?.[s.id] === 'solo_manda')
  return (
    <PantallaAviso
      pantallaEntera
      titulo="Tu acceso es por WhatsApp"
      texto={`${empresa ? `En ${empresa}, l` : 'L'}o tuyo lo mandás por WhatsApp. No hace falta usar la app.`}
      accion="Abrir WhatsApp"
      icono="Celular"
      etiqueta={{ texto: 'Lo tuyo va por WhatsApp', tono: 'verde' }}
      subrayar="WhatsApp"
      principalWhatsapp
      detalle={
        <div className="overflow-hidden rounded-[20px] bg-superficie text-left shadow-[inset_0_0_0_1px_var(--borde)]">
          {avisa.length > 0 && (
            <ul className="divide-y divide-borde/60">
              {avisa.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#dcf8c6] text-[#1fae55]">
                    <Icono nombre={s.icono} tamano={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-texto">{s.texto}</span>
                    <span className="block text-[13.5px] leading-snug text-texto-suave">{QUE_MANDA[s.id]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 border-t border-borde/60 bg-superficie-hundida/50 py-2 pr-2 pl-4 text-[14px] text-texto">
            <LogoWhatsapp className="size-4 shrink-0 text-[#1fae55]" />
            <span className="min-w-0 flex-1">
              Al número de Troppero: <b className="whitespace-nowrap">{formatearCelularAR(`+${WHATSAPP_TROPERO}`)}</b>
            </span>
            {/* Chiquito, para agendarlo o pasarlo (Lau, 25/11). */}
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(`+${WHATSAPP_TROPERO}`).then(
                  // Arriba: abajo está el botón de WhatsApp y no hay barra que lo separe.
                  () => toast.success('Listo: copiaste el número', { description: 'Agendalo o pegalo en WhatsApp.', position: 'top-center' }),
                  () => toast.error('No se pudo copiar', { description: `Anotalo: ${formatearCelularAR(`+${WHATSAPP_TROPERO}`)}` }),
                )
              }
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-superficie px-3 text-[13px] font-bold text-texto shadow-[inset_0_0_0_1px_var(--borde)] hover:text-principal"
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" />
              </svg>
              Copiar
            </button>
          </div>
        </div>
      }
      onAccion={() => window.open(`https://wa.me/${WHATSAPP_TROPERO}`, '_blank', 'noopener')}
      secundaria={
        otrasCuentas && user
          ? {
              texto: 'Entrar con otra cuenta',
              onClick: () => {
                olvidarCuentaElegida(user.id)
                void qc.invalidateQueries({ queryKey: ['empresa'] })
              },
            }
          : { texto: 'Salir', onClick: () => void signOut() }
      }
    />
  )
}
