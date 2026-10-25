import { vi } from 'vitest'

/**
 * Her testin başında çağrılır. IndexedDB fabrikası global setup'ta yenilenir;
 * modül önbelleği de sıfırlanarak önceki testin DB bağlantısı kullanılmaz.
 * Statik DB importlarıyla karıştırmayın. Ağ/online dinleyicileri başlatılmaz.
 */
export async function loadDataEnvironment(ownerId?: string | null) {
  vi.resetModules()
  const [db, queue, cloud, supabase, backup, scope] = await Promise.all([
    import('../../lib/db'),
    import('../../lib/offlineSync'),
    import('../../lib/cloudSync'),
    import('../../lib/supabase'),
    import('../../lib/sync'),
    import('../../lib/dataScope'),
  ])
  if (ownerId !== undefined) scope.changeDataScope(ownerId)
  return { db, queue, cloud, supabase, backup, scope }
}
