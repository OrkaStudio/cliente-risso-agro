// Archivo de composición de rutas (define componentes lazy + exporta el router).
// No es un módulo de componentes para Fast Refresh → desactivamos la regla acá.
/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from '@/features/auth/login-page'
import { ProtectedRoute } from '@/features/auth/protected-route'
import { AppShell } from '@/app/app-shell'
import { CampoShell } from '@/app/campo-shell'
import { ResponsiveShell } from '@/app/responsive-shell'

// Code-splitting por ruta: el código de cada sección se carga al entrar, no en
// el bundle inicial (login). El AppShell envuelve el <Outlet> en <Suspense>.
const InicioPage = lazy(() =>
  import('@/features/inicio/inicio-page').then((m) => ({
    default: m.InicioPage,
  })),
)
const AnimalesPage = lazy(() =>
  import('@/features/hacienda/animales-page').then((m) => ({
    default: m.AnimalesPage,
  })),
)
const FichaAnimalPage = lazy(() =>
  import('@/features/hacienda/ficha-animal-page').then((m) => ({
    default: m.FichaAnimalPage,
  })),
)
const LotesPage = lazy(() =>
  import('@/features/lotes/lotes-page').then((m) => ({ default: m.LotesPage })),
)
const CampoDetailPage = lazy(() =>
  import('@/features/campos/campo-detail-page').then((m) => ({
    default: m.CampoDetailPage,
  })),
)
const PotreroDetailPage = lazy(() =>
  import('@/features/potrero/potrero-detail-page').then((m) => ({
    default: m.PotreroDetailPage,
  })),
)
const AnaliticaPage = lazy(() =>
  import('@/features/analitica/analitica-page').then((m) => ({
    default: m.AnaliticaPage,
  })),
)
const AgendaPage = lazy(() =>
  import('@/features/agenda/agenda-page').then((m) => ({
    default: m.AgendaPage,
  })),
)
const MangaPage = lazy(() =>
  import('@/features/campo/manga-page').then((m) => ({
    default: m.MangaPage,
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

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        // Gate por dispositivo: misma web, distinta navegación según el equipo.
        // Un móvil cae al Modo Campo; escritorio ve el Modo Oficina completo.
        element: <ResponsiveShell />,
        children: [
          {
            // Modo Oficina (escritorio) — shell con sidebar.
            element: <AppShell />,
            children: [
              { index: true, element: <InicioPage /> },
              { path: 'hacienda', element: <AnimalesPage /> },
              { path: 'hacienda/:id', element: <FichaAnimalPage /> },
              { path: 'campos', element: <LotesPage /> },
              { path: 'campos/:id', element: <CampoDetailPage /> },
              // Compat: la sección Potreros se unificó dentro de Campos.
              { path: 'potreros', element: <Navigate to="/campos" replace /> },
              { path: 'potrero/:id', element: <PotreroDetailPage /> },
              { path: 'analitica', element: <AnaliticaPage /> },
              { path: 'agenda', element: <AgendaPage /> },
              // Compat: la sección Cheques se unificó en Agenda (cheque = filtro).
              { path: 'cheques', element: <Navigate to="/agenda" replace /> },
            ],
          },
          {
            // Modo Campo (móvil) — shell con nav inferior.
            element: <CampoShell />,
            children: [
              { path: 'campo', element: <Navigate to="/campo/manga" replace /> },
              { path: 'campo/manga', element: <MangaPage /> },
              { path: 'campo/recorrida', element: <RecorridaPage /> },
              { path: 'campo/plata', element: <PlataPage /> },
              { path: 'campo/historial', element: <HistorialPage /> },
            ],
          },
        ],
      },
    ],
  },
])
