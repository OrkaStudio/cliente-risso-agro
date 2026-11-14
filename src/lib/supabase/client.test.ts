import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchConKeepalive } from '@/lib/supabase/client'

describe('fetchConKeepalive', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('la telemetría sobrevive al cierre de la pestaña; el resto, fetch común', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null))
    vi.stubGlobal('fetch', fetch)
    await fetchConKeepalive('https://x.supabase.co/rest/v1/evento_producto', { method: 'POST' })
    await fetchConKeepalive('https://x.supabase.co/rest/v1/animal?select=*', { method: 'GET' })
    expect(fetch.mock.calls[0][1]).toEqual({ method: 'POST', keepalive: true })
    expect(fetch.mock.calls[1][1]).toEqual({ method: 'GET' })
  })
})
