// Una carga y su resumen pueden fallar en momentos distintos.
// Si hay un error, se consulta el ID de la carga; nunca se repite la escritura.
export type EstadoCarga = 'guardada' | 'no_guardada' | 'sin_verificar'

export type ResultadoConfirmacion = {
  estado: EstadoCarga
  texto: string
  error?: string
}

export async function confirmarConVerificacion(d: {
  escribir: () => Promise<unknown>
  resumir: () => Promise<string>
  verificar: () => Promise<boolean>
  mensajeGuardada: string
}): Promise<ResultadoConfirmacion> {
  try {
    await d.escribir()
    return { estado: 'guardada', texto: await d.resumir() }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    try {
      const guardada = await d.verificar()
      return guardada
        ? { estado: 'guardada', texto: d.mensajeGuardada, error }
        : {
            estado: 'no_guardada',
            texto: 'No pude guardar la carga. Comprobé que no está en la base. Podés intentarlo de nuevo.',
            error,
          }
    } catch {
      return {
        estado: 'sin_verificar',
        texto: 'No pude comprobar si la carga quedó guardada porque la base no responde. No vuelvas a enviarla todavía.',
        error,
      }
    }
  }
}
