/**
 * Estado de puesta a punto — la parte PURA (sin Supabase, sin React): tipos,
 * helpers de redacción y la derivación de los ítems del camino a partir del
 * `Resumen`. Vive aparte para poder probarse con vitest y para que los
 * pasos de los recorridos la importen sin arrastrar el cliente de la DB.
 */

export type ItemChecklist = {
  id: 'campo' | 'potreros' | 'hacienda' | 'tropas' | 'alquiler' | 'recorrida'
  titulo: string
  /** Qué es y por qué importa, en criollo — el productor lee y entiende. */
  detalle: string
  /** Qué pasa al tocar el botón del paso. */
  cta: string
  /** Sección de la app donde se resuelve (para navegar). */
  ruta: string
  /** Ancla data-guia a clickear para abrir la herramienta (null = solo navegar). */
  accion: string | null
  /** Se hace desde el teléfono, no desde la Oficina. */
  movil?: boolean
  hecho: boolean
}

export type CampoSinContorno = {
  id: string
  nombre: string
  provincia: string | null
}

/** Los números de la empresa que importan para recibir y guiar. */
export type Resumen = {
  campos: number
  /** Campos sin contorno (ni catastro ni marcado a mano), en orden de alta. */
  sinContorno: CampoSinContorno[]
  potreros: number
  potrerosDibujados: number
  /** Animales activos. */
  cabezas: number
  /** Activos sin potrero (cargados antes de tener potreros). */
  sinPotrero: number
  /** Campos alquilados (el alquiler se pide acá, no en el onboarding). */
  alquilados: number
  /** De esos, los que todavía no tienen el alquiler cargado. */
  alquilerPendiente: { id: string; nombre: string }[]
  recorridas: number
}

export type EstadoPuestaAPunto = {
  items: ItemChecklist[]
  resumen: Resumen
}

/** "8 potreros" / "1 potrero". */
export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/** Hoy el catastro automático es Buenos Aires (ARBA). Para el resto no se
 *  promete: el contorno se marca sobre el satélite. Sin provincia cargada se
 *  asume ARBA (el diálogo real lo aclara). */
export function catastroAutomatico(provincia: string | null): boolean {
  return !provincia || provincia === 'Buenos Aires'
}

/**
 * Los pasos del camino, nombrados con lo que hay. Cada ítem apunta a UN
 * botón real (`accion`) — lección del 18/09: un paso que promete lo que
 * ninguna pantalla puede hacer es un callejón.
 */
export function itemsDe(r: Resumen): ItemChecklist[] {
  const primero = r.sinContorno[0] ?? null
  const auto = catastroAutomatico(primero?.provincia ?? null)
  // Con más de un campo sin contorno gana la explicación del primero (el
  // resto lo dice el diálogo real al cambiar de campo).
  const nombreCampo = primero && r.campos > 1 ? ` de ${primero.nombre}` : ''
  const sinDibujar = r.potreros - r.potrerosDibujados

  return [
    {
      id: 'campo',
      titulo: primero
        ? auto
          ? `Traé el contorno${nombreCampo}`
          : `Marcá el contorno${nombreCampo}`
        : r.campos === 0
          ? 'Traé tu campo'
          : 'Contorno del campo',
      // Una línea. La explicación larga vive en la ficha y en el diálogo real.
      detalle: auto
        ? 'Con los tres números de la boleta de ARBA, el mapa se arma solo.'
        : 'Ubicalo en el satélite y marcá las esquinas del campo.',
      cta: auto ? 'Traer el contorno' : 'Marcar el contorno',
      ruta: primero ? `/campos?campo=${primero.id}` : '/campos',
      accion: 'campos-catastro',
      hecho: r.campos >= 1 && r.sinContorno.length === 0,
    },
    {
      id: 'potreros',
      titulo:
        r.potreros === 0
          ? 'Cargá los potreros'
          : sinDibujar > 0 && sinDibujar < r.potreros
            ? `Dibujá los ${plural(sinDibujar, 'potrero que falta', 'potreros que faltan')}`
            : `Dibujá los ${plural(r.potreros, 'potrero', 'potreros')}`,
      detalle:
        r.potreros === 0
          ? 'Número y hectáreas de cada uno; después los marcás en el mapa.'
          : 'Elegí cada potrero de la lista y marcá sus esquinas sobre el satélite.',
      cta: 'Ir al mapa',
      ruta: '/campos',
      accion: null,
      // Umbral del spec: con 2 potreros dibujados el mapa ya trabaja.
      hecho: r.potrerosDibujados >= 2,
    },
    {
      id: 'hacienda',
      titulo: 'Cargá tu hacienda',
      detalle: 'Con o sin caravana, en un minuto.',
      cta: 'Cargar animales',
      ruta: '/hacienda',
      accion: 'hacienda-acciones',
      hecho: r.cabezas >= 1,
    },
    {
      id: 'tropas',
      titulo:
        r.sinPotrero > 0
          ? `Ubicá ${plural(r.sinPotrero, 'animal', 'animales')} sin potrero`
          : 'Ubicá las tropas',
      // Con animales sin potrero (cargados en el onboarding antes que los
      // potreros) el camino es Hacienda → "Ubicar en un potrero"; el mapa
      // sólo mueve desde un potrero de origen.
      detalle:
        r.sinPotrero > 0
          ? 'Poné cada tropa en el potrero donde está hoy.'
          : 'Cada tropa en su potrero, tocando el mapa.',
      cta: r.sinPotrero > 0 ? 'Ubicarlos' : 'Ver el mapa',
      ruta: r.sinPotrero > 0 ? '/hacienda' : '/campos',
      accion: r.sinPotrero > 0 ? 'hacienda-ubicar' : null,
      hecho: r.cabezas >= 1 && r.sinPotrero === 0,
    },
    ...(r.alquilados > 0
      ? [
          {
            id: 'alquiler' as const,
            titulo:
              r.alquilerPendiente.length === 1
                ? `Cargá el alquiler de ${r.alquilerPendiente[0]!.nombre}`
                : 'Cargá el alquiler',
            detalle:
              r.alquilerPendiente.length > 0
                ? 'Como está en el contrato: en kilos, quintales, dólares o pesos. Cada pago queda en la Agenda.'
                : 'Cada pago está en la Agenda y en la cuenta del campo.',
            cta: 'Cargar el alquiler',
            ruta: '/analitica',
            accion: 'analitica-alquiler',
            hecho: r.alquilerPendiente.length === 0,
          },
        ]
      : []),
    {
      id: 'recorrida',
      titulo: 'Probá la Recorrida',
      detalle: 'Una vez con señal, y queda lista para el campo.',
      cta: '',
      ruta: '/campo/recorrida',
      accion: null,
      movil: true,
      hecho: r.recorridas >= 1,
    },
  ]
}
