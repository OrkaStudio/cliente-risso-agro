import { Syringe } from 'lucide-react'

/**
 * Stub de la Manga (Modo Campo). T1 deja el destino navegable y el marco mobile;
 * el flujo real —cargar animales sin caravana, input RFID por HID, confirmar
 * categoría + raza/pelaje, outbox offline— es T2.
 * Spec: orka-brain/clientes/risso-agro/especificaciones/2026-06-29-carga-masiva-y-caravaneo-manga.md
 */
export function MangaPage() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Syringe className="size-7" strokeWidth={1.75} />
      </div>
      <div className="space-y-1.5">
        <h1 className="font-heading text-xl font-bold text-foreground">Manga</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Caravaneo e individualización del rodeo. En construcción — próximamente
          vas a poder asignar RFID y datos animal por animal, también sin señal.
        </p>
      </div>
    </div>
  )
}
