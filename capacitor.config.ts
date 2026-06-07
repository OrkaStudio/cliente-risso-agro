import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Shell nativo (iOS/Android) que envuelve el build estático de Vite.
 * `webDir` apunta al output de `vite build`.
 *
 * Las plataformas nativas (carpetas ios/ y android/) NO se agregan todavía:
 *   - iOS requiere macOS/Xcode (Lau desarrolla en Windows) → se hace al armar
 *     la PoC en el iPhone del padre (TestFlight).
 *   - android/ se agrega con `pnpm cap add android` cuando se necesite (Android
 *     Studio en Windows).
 * Ambas carpetas están gitignoreadas (se regeneran). Ver decisión
 * [[decisiones/agro-stack-vite-spa]] (nota "Build de iOS").
 */
const config: CapacitorConfig = {
  appId: 'studio.orka.rissoagro',
  appName: 'Risso Agro',
  webDir: 'dist',
}

export default config
