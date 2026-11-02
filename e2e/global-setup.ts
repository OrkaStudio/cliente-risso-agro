import { borrarCamposPendientes, completarCampoBase } from './mapa-e2e'

export default function globalSetup() {
  completarCampoBase()
  borrarCamposPendientes()
}
