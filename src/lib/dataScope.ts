export type DataScope = Readonly<{
  ownerId: string | null
  generation: number
  ready: boolean
  signal: AbortSignal
}>

let controller = new AbortController()
let current: DataScope = Object.freeze({ ownerId: null, generation: 0, ready: false, signal: controller.signal })
const listeners = new Set<() => void>()

export function getDataScope(): DataScope { return current }

export function scopeKey(scope: DataScope): string {
  return scope.ownerId === null ? 'guest' : `account:${scope.ownerId}`
}

export function isCurrentScope(scope: DataScope): boolean { return current === scope && !scope.signal.aborted }

export function assertCurrentScope(scope: DataScope): void {
  if (!isCurrentScope(scope)) throw new Error('Hesap değişti. İşlemi açık hesapta yeniden dene.')
}

/** Eski işlemleri ağ yanıtı gelmeden geçersiz kılar; saklanan veriyi silmez. */
export function changeDataScope(ownerId: string | null): DataScope {
  if (current.ready && current.ownerId === ownerId) return current
  controller.abort()
  controller = new AbortController()
  current = Object.freeze({ ownerId, generation: current.generation + 1, ready: true, signal: controller.signal })
  for (const listener of listeners) listener()
  return current
}

export function subscribeDataScope(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
