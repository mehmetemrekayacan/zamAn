import type { DataScope } from './dataScope'
const active = new Set<DataScope>()
export function isSyncActive(scope: DataScope) { return active.has(scope) }
export function markSyncActive(scope: DataScope, value: boolean) {
  if (value) active.add(scope)
  else active.delete(scope)
}
