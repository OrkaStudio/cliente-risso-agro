import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import './index.css'
import { queryClient } from '@/lib/query-client'
import { AuthProvider } from '@/features/auth/auth-context'
import { router } from '@/app/router'
import { Toaster } from '@/components/ui/sonner'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* reducedMotion="user": si el teléfono tiene "reducir movimiento"
            activado, framer no anima (UI instantánea) — accesibilidad + menos
            trabajo en equipos lentos. */}
        <MotionConfig reducedMotion="user">
          <RouterProvider router={router} />
          <Toaster richColors position="top-right" />
        </MotionConfig>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
