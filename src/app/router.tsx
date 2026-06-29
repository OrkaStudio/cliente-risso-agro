// Archivo de composición de rutas (define componentes lazy + exporta el router).
// No es un módulo de componentes para Fast Refresh → desactivamos la regla acá.
/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from '@/features/auth/login-page'
import { ProtectedRoute } from '@/features/auth/protected-route'
import { AppShell } from '@/app/app-shell'

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
const LoteFichaPage = lazy(() =>
  import('@/features/lotes/lote-ficha-page').then((m) => ({
    default: m.LoteFichaPage,
  })),
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
const ChequesPage = lazy(() =>
  import('@/features/cheques/cheques-page').then((m) => ({
    default: m.ChequesPage,
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
          { index: true, element: <InicioPage /> },
          { path: 'hacienda', element: <AnimalesPage /> },
          { path: 'hacienda/:id', element: <FichaAnimalPage /> },
          { path: 'campos', element: <LotesPage /> },
          { path: 'campos/:id', element: <CampoDetailPage /> },
          { path: 'potreros/:id', element: <LoteFichaPage /> },
          // Compat: la sección Potreros se unificó dentro de Campos.
          { path: 'potreros', element: <Navigate to="/campos" replace /> },
          { path: 'potrero/:id', element: <PotreroDetailPage /> },
          { path: 'analitica', element: <AnaliticaPage /> },
          { path: 'cheques', element: <ChequesPage /> },
        ],
      },
    ],
  },
])
