/** Clickea el elemento anclado por data-guia cuando aparece — la página
 *  destino puede ser un chunk lazy, así que se reintenta un ratito. Lo usan
 *  la smart checklist y el panel del Asistente. */
export function ejecutarEnAncla(ancla: string | null) {
  if (!ancla) return
  let intentos = 0
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-guia="${ancla}"]`)
    if (el) {
      const btn =
        el.tagName === 'BUTTON'
          ? el
          : (el.querySelector<HTMLElement>('button, a') ?? el)
      btn.click()
      return
    }
    if (++intentos < 12) setTimeout(tick, 200)
  }
  setTimeout(tick, 150)
}
