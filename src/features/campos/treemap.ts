/**
 * Treemap squarified: dado un rectángulo y una lista de pesos, devuelve
 * sub-rectángulos con área proporcional al peso y buen aspect ratio.
 * Algoritmo de Bruls, Huizing & van Wijk. Sin dependencias.
 */
export type Rect = { x: number; y: number; w: number; h: number }
export type TreemapItem<T> = { datum: T; value: number }
export type TreemapTile<T> = Rect & { datum: T }

function worstRatio(row: number[], sum: number, side: number): number {
  if (row.length === 0 || sum === 0 || side === 0) return Infinity
  const max = Math.max(...row)
  const min = Math.min(...row)
  const side2 = side * side
  const sum2 = sum * sum
  return Math.max((side2 * max) / sum2, sum2 / (side2 * min))
}

export function squarify<T>(
  items: TreemapItem<T>[],
  rect: Rect,
): TreemapTile<T>[] {
  const data = items
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = data.reduce((s, i) => s + i.value, 0)
  if (total <= 0) return []

  const area = rect.w * rect.h
  const scaled = data.map((i) => (i.value / total) * area)
  const tiles: TreemapTile<T>[] = []

  let x = rect.x
  let y = rect.y
  let w = rect.w
  let h = rect.h
  let i = 0

  while (i < scaled.length) {
    const side = Math.min(w, h)
    const row: number[] = []
    const rowIdx: number[] = []
    let rowSum = 0

    while (i < scaled.length) {
      const candSum = rowSum + scaled[i]
      const wWorst = worstRatio(row, rowSum, side)
      const cWorst = worstRatio([...row, scaled[i]], candSum, side)
      if (row.length === 0 || cWorst <= wWorst) {
        row.push(scaled[i])
        rowIdx.push(i)
        rowSum = candSum
        i++
      } else break
    }

    if (w >= h) {
      // columna de ancho colW a la izquierda
      const colW = rowSum / h
      let yy = y
      for (let k = 0; k < row.length; k++) {
        const rh = row[k] / colW
        tiles[rowIdx[k]] = { datum: data[rowIdx[k]].datum, x, y: yy, w: colW, h: rh }
        yy += rh
      }
      x += colW
      w -= colW
    } else {
      // fila de alto rowH arriba
      const rowH = rowSum / w
      let xx = x
      for (let k = 0; k < row.length; k++) {
        const rw = row[k] / rowH
        tiles[rowIdx[k]] = { datum: data[rowIdx[k]].datum, x: xx, y, w: rw, h: rowH }
        xx += rw
      }
      y += rowH
      h -= rowH
    }
  }

  return tiles
}
