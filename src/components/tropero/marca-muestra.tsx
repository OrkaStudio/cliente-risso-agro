// Página interna de desarrollo (/estilo/marca): la marca en vidrio y la pantalla de carga,
// para elegir entre Fran y Lau. No existe en producción.
import { MotionConfig } from "framer-motion"

import { BotonChico } from "./boton"
import { PantallaCargando } from "./cargando"
import { Logo } from "./logo"
import { MarcaVidrio } from "./marca-vidrio"
import { TCargando } from "./t-cargando"

function Caja({ etiqueta, nota, oscuro = false, children }: { etiqueta: string; nota: string; oscuro?: boolean; children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-3">
      <div className={oscuro ? "dark overflow-hidden rounded-[28px]" : "overflow-hidden rounded-[28px] border border-borde"}>{children}</div>
      <div>
        <p className="text-[15px] font-bold text-texto">{etiqueta}</p>
        <p className="mt-0.5 text-[14px] leading-snug text-texto-suave">{nota}</p>
      </div>
    </article>
  )
}

export function MarcaMuestra() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="h-full overflow-y-auto bg-fondo text-texto">
        <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-8 sm:px-10">
          <header className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <Logo alto={28} />
              <BotonChico onClick={() => window.location.reload()}>Repetir todo</BotonChico>
            </div>
            <div className="max-w-2xl">
              <h1 className="t-pagina">La marca, en movimiento</h1>
              <p className="mt-2 text-[16px] text-texto-suave">
                La T aparece grande detrás del borde de un vidrio, que la dobla en color. Después el vidrio la suelta y entran la palabra y el lema. Tocá cualquiera para repetirlo.
              </p>
            </div>
          </header>

          <section className="flex flex-col gap-4">
            <h2 className="t-seccion">La marca en vidrio</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <Caja etiqueta="Vidrio claro, sobre hueso" nota="El fondo es el hueso del manual (#f4f1e9); la T en terracota.">
                <MarcaVidrio tono="dia" />
              </Caja>
              <Caja etiqueta="Placa tinta, sobre hueso" nota="El vidrio oscuro, como el ícono de la app, sobre el mismo fondo hueso.">
                <MarcaVidrio tono="placa" />
              </Caja>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="t-seccion">Cargando la app</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <Caja etiqueta="Hoy" nota="La marca respirando suave, mientras se arma la sesión (components/tropero/cargando.tsx).">
                <div className="h-[300px]">
                  <PantallaCargando />
                </div>
              </Caja>
              <Caja
                etiqueta="La T que gira"
                nota="La T de la marca, con volumen, gira y flota sobre su propia sombra. Idea tomada de loader-3 de 21st.dev, con la T en lugar del cubo."
              >
                <div className="grid h-[300px] place-items-center bg-fondo">
                  <TCargando />
                </div>
              </Caja>
            </div>
          </section>

          <section className="flex max-w-2xl flex-col gap-2 pb-6">
            <h2 className="t-seccion">Dónde podría ir</h2>
            <ul className="list-disc pl-5 text-[15px] leading-relaxed text-texto-suave">
              <li>La primera vez que se abre la app descargable, antes de entrar.</li>
              <li>La portada de troppero.com, arriba de todo.</li>
              <li>El cierre del onboarding, cuando el campo queda cargado.</li>
              <li>No en cada carga: dura unos 3,5 s y la app tiene que abrir rápido. Para eso está la pantalla de carga.</li>
            </ul>
          </section>
        </div>
      </div>
    </MotionConfig>
  )
}
