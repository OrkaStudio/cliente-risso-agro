// Archivo de composición de rutas (define componentes lazy + exporta el router).
// No es un módulo de componentes para Fast Refresh → desactivamos la regla acá.
/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '@/features/auth/login-page'
import { ProtectedRoute } from '@/features/auth/protected-route'
import { AppShell } from '@/app/app-shell'

// Code-splitting por ruta: el código de cada sección se carga al entrar, no en
// el bundle inicial (login). El AppShell envuelve el <Outlet> en <Suspense>.
const HomePage = lazy(() =>
  import('@/app/home-page').then((m) => ({ default: m.HomePage })),
)
const AnimalesPage = lazy(() =>
  import('@/features/hacienda/animales-page').then((m) => ({
    default: m.AnimalesPage,
  })),
)
const AltaAnimalPage = lazy(() =>
  import('@/features/hacienda/alta-animal-page').then((m) => ({
    default: m.AltaAnimalPage,
  })),
)
const FichaAnimalPage = lazy(() =>
  import('@/features/hacienda/ficha-animal-page').then((m) => ({
    default: m.FichaAnimalPage,
  })),
)
const CamposPage = lazy(() =>
  import('@/features/campos/campos-page').then((m) => ({ default: m.CamposPage })),
)
const CampoDetailPage = lazy(() =>
  import('@/features/campos/campo-detail-page').then((m) => ({
    default: m.CampoDetailPage,
  })),
)
const AnaliticaPage = lazy(() =>
  import('@/features/analitica/analitica-page').then((m) => ({
    default: m.AnaliticaPage,
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
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'hacienda', element: <AnimalesPage /> },
          { path: 'hacienda/nuevo', element: <AltaAnimalPage /> },
          { path: 'hacienda/:id', element: <FichaAnimalPage /> },
          { path: 'campos', element: <CamposPage /> },
          { path: 'campos/:id', element: <CampoDetailPage /> },
          { path: 'analitica', element: <AnaliticaPage /> },
        ],
      },
    ],
  },
])
