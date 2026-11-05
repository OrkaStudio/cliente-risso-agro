import { Toaster as Sonner, type ToasterProps } from "sonner"
import { Icono } from "@/components/tropero/icono"

/** El círculo de color con su ícono: verde si salió bien, rojo si falló, trigo si hay que mirar algo. */
const circulo = (fondo: string, icono: React.ComponentProps<typeof Icono>["nombre"]) => (
  <span className={`grid size-8 place-items-center rounded-full ${fondo}`}>
    <Icono nombre={icono} tamano={16} />
  </span>
)

/**
 * Las confirmaciones de Tropero («Listo: …» con su «Deshacer»): una tarjeta
 * tinta abajo al centro, que no tapa el título de los paneles; el ícono dice
 * cómo salió y la acción va como botón trigo (Lau, 05/11).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="bottom-center"
      offset={28}
      gap={10}
      icons={{
        success: circulo("bg-estado-bien text-superficie", "Guardar"),
        error: circulo("bg-estado-problema text-superficie", "Cerrar"),
        warning: circulo("bg-acento text-acento-texto", "Ayuda"),
        info: circulo("bg-superficie/15 text-superficie", "Ayuda"),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(520px,calc(100vw-32px))] items-center gap-3.5 rounded-[22px] bg-tinta py-3.5 pr-3.5 pl-4 text-superficie shadow-[0_18px_44px_-14px_rgba(19,27,22,0.55)] font-sans",
          icon: "shrink-0 !m-0 !size-8",
          content: "min-w-0 flex-1",
          title: "text-[15.5px] leading-snug font-semibold",
          description: "mt-0.5 text-[14px] leading-snug text-superficie/70",
          actionButton:
            "shrink-0 h-10 rounded-full bg-acento px-4 text-[14.5px] font-bold text-acento-texto transition-colors hover:bg-trigo-300",
          cancelButton: "shrink-0 h-10 rounded-full px-3 text-[14.5px] font-semibold text-superficie/80 hover:bg-superficie/10",
          closeButton: "!bg-tinta !text-superficie !border-superficie/20",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
