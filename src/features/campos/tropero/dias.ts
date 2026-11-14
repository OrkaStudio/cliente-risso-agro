// Campos · capa «Días» (Figma 1050:2): cuántos días lleva la hacienda adentro
// de cada potrero, y cuántos descansa el que está vacío. Puro.

export type Movimiento = { animalId: string; fecha: string; origen: string | null; destino: string | null }
export type AnimalEn = { id: string; potreroId: string | null; alta: string }
export type Dias = { adentro: number } | { descansa: number } | null

const dias = (desde: string, hoy: string) => Math.max(0, Math.round((Date.parse(hoy) - Date.parse(desde.slice(0, 10))) / 86_400_000))

/** Con hacienda: desde que entró la primera que sigue ahí. Vacío: desde que salió la última. Sin datos: null. */
export function diasPorPotrero(potreros: string[], animales: AnimalEn[], movs: Movimiento[], hoy: string): Map<string, Dias> {
  const entro = new Map<string, string>() // animal|potrero → última entrada
  const salio = new Map<string, string>() // potrero → última salida
  for (const m of movs) {
    if (m.destino) {
      const k = `${m.animalId}|${m.destino}`
      if (!entro.has(k) || entro.get(k)! < m.fecha) entro.set(k, m.fecha)
    }
    if (m.origen && (!salio.has(m.origen) || salio.get(m.origen)! < m.fecha)) salio.set(m.origen, m.fecha)
  }
  const r = new Map<string, Dias>()
  for (const p of potreros) {
    const adentro = animales.filter((a) => a.potreroId === p)
    if (adentro.length) {
      const desde = adentro.map((a) => entro.get(`${a.id}|${p}`) ?? a.alta.slice(0, 10)).sort()[0]!
      r.set(p, { adentro: dias(desde, hoy) })
    } else r.set(p, salio.has(p) ? { descansa: dias(salio.get(p)!, hoy) } : null)
  }
  return r
}
