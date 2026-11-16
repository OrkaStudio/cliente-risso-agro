import { Icono } from '@/components/tropero/icono'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { fechaCorta as fecha, useLoUltimoMio } from './lo-ultimo-mio'


/**
 * El Inicio de quien sólo manda (permisos, 14/11): lo suyo va por WhatsApp. Se
 * le muestra cómo mandar y lo último que mandó (la base le deja ver sólo lo suyo).
 */
export function LoQueMandaste({ plata, campos }: { plata: boolean; campos: boolean }) {
  const q = useLoUltimoMio({ plata, campos })
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
