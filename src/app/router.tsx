// Archivo de composición de rutas (define componentes lazy + exporta el router).
// No es un módulo de componentes para Fast Refresh → desactivamos la regla acá.
/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'
import { ErrorNuevaVersion } from '@/app/error-nueva-version'
import { NoEncontrada } from '@/app/pantalla-aviso'
import { SeccionPermitida } from '@/app/seccion-permitida'
import { CodigoPage } from '@/features/acceso/codigo-page'
import { CrearCuentaPage } from '@/features/acceso/crear-cuenta-page'
import { CambiarNumeroPage } from '@/features/acceso/cambiar-numero-page'
import { CambieDeNumeroPage } from '@/features/acceso/cambie-de-numero-page'
import { EntrarPage } from '@/features/acceso/entrar-page'
import { FondoAcceso } from '@/features/acceso/fondo-acceso'
import { TeInvitaronPage } from '@/features/acceso/te-invitaron-page'
import { componenteOnboarding, onboardingListo, precargarOnboarding } from '@/features/onboarding/precarga'
import { ProtectedRoute } from '@/features/auth/protected-route'
import { RequireEmpresa } from '@/features/auth/require-empresa'
import { RequireMapa } from '@/features/mapa/require-mapa'
import { ResponsiveShell } from '@/app/responsive-shell'

// Los shells también se cargan al entrar: el login, el registro y el
// onboarding no necesitan la barra de Oficina ni el Modo Campo (manga, RFID,
// base offline), y antes bajaban todo eso de entrada. Offline no cambia nada:
// el service worker precachea todos los chunks.
const AppShell = lazy(() => import('@/app/app-shell').then((m) => ({ default: m.AppShell })))
const CampoShell = lazy(() => import('@/app/campo-shell').then((m) => ({ default: m.CampoShell })))

// Code-splitting por ruta: el código de cada sección se carga al entrar, no en
// el bundle inicial (login). El AppShell envuelve el <Outlet> en <Suspense>.
const InicioPage = lazy(() =>
  import('@/features/inicio/inicio-page').then((m) => ({
    default: m.InicioPage,
  })),
)
const AnimalesPage = lazy(() =>
  import('@/features/hacienda/tropero/rodeo-page').then((m) => ({
    default: m.RodeoPage,
  })),
)
const FichaAnimalPage = lazy(() =>
  import('@/features/hacienda/tropero/ficha-page').then((m) => ({
    default: m.FichaPage,
  })),
)
const CamposPage = lazy(() =>
  import('@/features/campos/tropero/campos-page').then((m) => ({ default: m.CamposPage })),
)
// Las páginas viejas del campo y del potrero se borraron (03/11): sus direcciones
// llevan a Campos, con ese campo elegido o la tarjeta de ese potrero abierta.
function CampoViejo() {
  const { id } = useParams()
  return <Navigate to={`/campos?campo=${id}`} replace />
}
function PotreroViejo() {
  const { id } = useParams()
  return <Navigate to={`/campos?potrero=${id}`} replace />
}
// Plata (rediseño, Figma página 35): la plata y los movimientos.
const AnaliticaPage = lazy(() => import('@/features/analitica/tropero/plata-page').then((m) => ({ default: m.PlataPage })))
const MovimientosPage = lazy(() => import('@/features/analitica/tropero/movimientos-page').then((m) => ({ default: m.MovimientosPage })))
const ConfiguracionPage = lazy(() => import('@/features/configuracion/configuracion-page').then((m) => ({ default: m.ConfiguracionPage })))
const AgendaPage = lazy(() =>
  import('@/features/agenda/tropero/agenda-page').then((m) => ({
    default: m.AgendaPage,
  })),
)
const CampoInicioPage = lazy(() =>
  import('@/features/campo/inicio-page').then((m) => ({
    default: m.CampoInicioPage,
  })),
)
const MangaPage = lazy(() =>
  import('@/features/campo/manga-page').then((m) => ({
    default: m.MangaPage,
  })),
)
const LectorPage = lazy(() =>
  import('@/features/campo/lector-page').then((m) => ({
    default: m.LectorPage,
  })),
)
const RecorridaPage = lazy(() =>
  import('@/features/campo/recorrida-page').then((m) => ({
    default: m.RecorridaPage,
  })),
)
const PlataPage = lazy(() =>
  import('@/features/campo/plata-page').then((m) => ({
    default: m.PlataPage,
  })),
)
const HistorialPage = lazy(() =>
  import('@/features/campo/historial-page').then((m) => ({
    default: m.HistorialPage,
  })),
)
const OnboardingPage = lazy(() =>
  precargarOnboarding().then(() => ({ default: componenteOnboarding() })),
)

/**
 * El onboarding: si el registro ya lo bajó (lo normal), se dibuja directo, sin
 * pasar por Suspense — el pase del registro al onboarding no tiene cortes. Si
 * se entra por la URL sin haberlo bajado, `lazy` como siempre.
 */
function OnboardingRuta() {
  return (
    onboardingListo() ?? (
      <Suspense fallback={null}>
        <OnboardingPage />
      </Suspense>
    )
  )
}

const TutorialMapaPage = lazy(() =>
  import('@/features/mapa/tutorial-page').then((m) => ({ default: m.TutorialMapaPage })),
)
const AsistenteMuestra = lazy(() =>
  import('@/features/campos/tropero/asistente-muestra').then((m) => ({ default: m.AsistenteMuestra })),
)
const LegalesPage = lazy(() =>
  import('@/features/legales/legales-page').then((m) => ({ default: m.LegalesPage })),
)
const MuestraPage = lazy(() =>
  import('@/components/tropero/muestra-page').then((m) => ({ default: m.MuestraPage })),
)

export const router = createBrowserRouter([
  // Sólo en desarrollo: los componentes de Troppero juntos (/estilo).
  ...(import.meta.env.DEV
    ? [
        { path: '/estilo', element: <Suspense fallback={null}><MuestraPage /></Suspense> },
        { path: '/estilo/asistente', element: <Suspense fallback={null}><AsistenteMuestra /></Suspense> },
      ]
    : []),
  // Acceso (A1–A5): se entra con un código por WhatsApp, sin contraseñas. Comparten la foto
  // y el sello (FondoAcceso), que no se recargan al pasar de una pantalla a otra.
  {
    element: <FondoAcceso />,
    errorElement: <ErrorNuevaVersion />,
    children: [
      { path: '/login', element: <EntrarPage /> },
      { path: '/login/codigo', element: <CodigoPage /> },
      { path: '/registro', element: <CrearCuentaPage /> },
      // A4: el link que manda el dueño desde Personas.
      { path: '/invitacion/:token', element: <TeInvitaronPage /> },
      // A5 (afuera): qué hacer si cambiaste de número.
      { path: '/cambie-de-numero', element: <CambieDeNumeroPage /> },
    ],
  },
  // Términos, privacidad y su resumen: abiertos, sin sesión.
  { path: '/legales', element: <Suspense fallback={null}><LegalesPage doc="resumen" /></Suspense> },
  { path: '/terminos', element: <Suspense fallback={null}><LegalesPage doc="terminos" /></Suspense> },
  { path: '/privacidad', element: <Suspense fallback={null}><LegalesPage doc="privacidad" /></Suspense> },
  // Sin contraseñas no hay nada que recuperar: los links viejos van a entrar.
  { path: '/recuperar', element: <Navigate to="/login" replace /> },
  { path: '/restablecer', element: <Navigate to="/login" replace /> },
  {
    element: <ProtectedRoute />,
    errorElement: <ErrorNuevaVersion />,
    children: [
      {
        // A5 (adentro): cambiar el número con la sesión abierta y un código al nuevo.
        path: '/mi-cuenta/numero',
        element: <CambiarNumeroPage />,
      },
      {
        // Recién registrado, sin empresa todavía: arma la suya acá.
        path: '/onboarding',
        element: (
          <OnboardingRuta />
        ),
      },
      {
        // Usuario sin membresía → onboarding; con empresa → la app.
        element: <RequireEmpresa />,
        children: [
          {
            // Módulo 3 · el tutorial para ubicar los campos y potreros en el mapa.
            path: 'mapa',
            element: (
              <Suspense fallback={null}>
                <TutorialMapaPage />
              </Suspense>
            ),
          },
          {
            path: 'mapa/:campoId',
            element: (
              <Suspense fallback={null}>
                <TutorialMapaPage />
              </Suspense>
            ),
          },
          {
            // Primero el campo: sin el mapa sólo andan el Inicio y Campos.
            element: <RequireMapa />,
            children: [
          {
            // Gate por dispositivo: misma web, distinta navegación según el equipo.
            // Un móvil cae al Modo Campo; escritorio ve el Modo Oficina completo.
            element: <ResponsiveShell />,
            children: [
          {
            // Modo Oficina (escritorio) — shell con sidebar.
            element: (
              <Suspense fallback={null}>
                <AppShell />
              </Suspense>
            ),
            children: [
              {
              // Cada uno ve lo que el dueño le habilitó (Configuración → Personas).
              element: <SeccionPermitida />,
              children: [
              { index: true, element: <InicioPage /> },
              { path: 'hacienda', element: <AnimalesPage /> },
              { path: 'hacienda/:id', element: <FichaAnimalPage /> },
              { path: 'campos', element: <CamposPage /> },
              { path: 'campos/:id', element: <CampoViejo /> },
              // Compat: la sección Potreros se unificó dentro de Campos.
              { path: 'potreros', element: <Navigate to="/campos" replace /> },
              { path: 'potrero/:id', element: <PotreroViejo /> },
              { path: 'analitica', element: <AnaliticaPage /> },
              { path: 'analitica/movimientos', element: <MovimientosPage /> },
              { path: 'agenda', element: <AgendaPage /> },
              // Compat: la sección Cheques se unificó en Agenda (cheque = filtro).
              { path: 'cheques', element: <Navigate to="/agenda" replace /> },
              { path: 'configuracion', element: <ConfiguracionPage /> },
              // Una dirección que no existe: se dice, dentro de la app, con el camino al Inicio.
              { path: '*', element: <NoEncontrada /> },
              ],
              },
            ],
          },
              {
                // Modo Campo (móvil) — shell con nav inferior.
                element: (
                  <Suspense fallback={null}>
                    <CampoShell />
                  </Suspense>
                ),
                children: [
                  {
                  element: <SeccionPermitida />,
                  children: [
                  { path: 'campo', element: <CampoInicioPage /> },
                  { path: 'campo/manga', element: <MangaPage /> },
                  // Laboratorio: probar un bastón RFID antes de comprarlo.
                  // Fuera de la nav (no es una tarea del campo, es una prueba).
                  { path: 'campo/lector', element: <LectorPage /> },
                  { path: 'campo/recorrida', element: <RecorridaPage /> },
                  { path: 'campo/plata', element: <PlataPage /> },
                  { path: 'campo/historial', element: <HistorialPage /> },
                  ],
                  },
                ],
              },
            ],
          },
            ],
          },
        ],
      },
    ],
  },
])
