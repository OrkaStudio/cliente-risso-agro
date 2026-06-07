import { QueryClient } from '@tanstack/react-query'

/**
 * Cliente de TanStack Query — capa de datos de la app.
 *
 * Para Track 1 es solo cache en memoria. La persistencia offline
 * (persistQueryClient) y el motor de sync de escritura (PowerSync vs outbox)
 * se deciden al construir el Modo Campo / recorrida. Ver
 * [[decisiones/agro-stack-vite-spa]] (sección "Motor de sync offline").
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
