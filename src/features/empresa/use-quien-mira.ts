import { esDueno } from './secciones'
import { useEmpresa } from './use-empresa'

/**
 * Quién está mirando (Lau, 13/11: un encargado no puede leer «Tus campos»).
 * El dueño ve los textos en segunda persona; un invitado, los del campo de otro.
 * Mientras carga la membresía se trata como dueño: es el caso de casi todos.
 */
export function useQuienMira() {
  const { data: membresia } = useEmpresa()
  const dueno = !membresia || esDueno(membresia)
  return {
    dueno,
    /** «Tus campos» / «Los campos». */
    losCampos: dueno ? 'Tus campos' : 'Los campos',
    /** «Todos tus campos» / «Todos los campos». */
    todosLosCampos: dueno ? 'Todos tus campos' : 'Todos los campos',
    /** «tus campos» / «los campos», en medio de una frase. */
    enLosCampos: dueno ? 'tus campos' : 'los campos',
  }
}
