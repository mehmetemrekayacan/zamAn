import { useCallback, useEffect, useRef, useState } from 'react'
import { listSyncConflicts, resolveSyncConflict, syncCloud } from '../lib/sessionSync'
import { getDataScope, isCurrentScope } from '../lib/dataScope'
import { formatSeconds } from '../lib/time'
import { MODE_LABELS } from '../lib/modeConfig'
import type { SyncConflict } from '../lib/syncProtocol'

function summary(value: unknown, entity: SyncConflict['entity']): string {
  if (!value || typeof value !== 'object') return 'Kayıt bulunmuyor.'
  const data = value as Record<string, unknown>
  if (entity === 'settings') {
    const state = (data.settings as { state?: Record<string, unknown> })?.state ?? {}
    const theme = { dark:'Koyu',light:'Açık','high-contrast':'Yüksek kontrast' }[String(state.tema)]
    return [state.kullaniciAdi ? `İsim: ${state.kullaniciAdi}` : null,theme ? `Tema: ${theme}` : null,
      typeof state.sesAçık === 'boolean' ? `Ses: ${state.sesAçık ? 'açık' : 'kapalı'}` : null,
      typeof state.sessizMod === 'boolean' ? `Sessiz mod: ${state.sessizMod ? 'açık' : 'kapalı'}` : null,
      state.sinavTarihi ? `Hedef tarih: ${state.sinavTarihi}` : null,
    ].filter(Boolean).join(' · ') || 'Varsayılan tercihler'
  }
  if (data.deleted_at) return 'Bu seans diğer cihazdan silinmiş.'
  const seconds = Number(data.sureGercek ?? data.sure_gercek ?? 0)
  const mode = MODE_LABELS[String(data.mod)] ?? 'Seans'
  const note = data.not ?? data.not_text
  return `${mode} · ${formatSeconds(seconds)}${note ? ` · ${String(note)}` : ''}`
}

export function SyncConflictPanel() {
  const scope = getDataScope()
  const [conflicts,setConflicts] = useState<SyncConflict[]>([])
  const [busy,setBusy] = useState<string | null>(null)
  const [error,setError] = useState<string | null>(null)
  const resolving = useRef(false)
  const refresh = useCallback(async () => {
    const result = await listSyncConflicts(scope)
    if (isCurrentScope(scope)) setConflicts(result)
  },[scope])
  useEffect(() => {
    let mounted = true
    const update = () => { if (mounted) void refresh().catch(() => {}) }
    update()
    window.addEventListener('zaman-sync-updated',update)
    return () => { mounted = false; window.removeEventListener('zaman-sync-updated',update) }
  },[refresh])
  const resolve = async (conflict: SyncConflict,keepLocal: boolean) => {
    if (resolving.current || !isCurrentScope(scope)) return
    resolving.current = true
    setBusy(conflict.id)
    setError(null)
    try {
      await resolveSyncConflict(conflict.id,keepLocal)
      if (!isCurrentScope(scope)) return
      await refresh()
      if (keepLocal) {
        const result = await syncCloud()
        if (!result.ok && isCurrentScope(scope)) setError(result.error)
      }
    } catch (failure) { if (isCurrentScope(scope)) setError(failure instanceof Error ? failure.message : 'Değişiklik uygulanamadı.') }
    finally { resolving.current = false; if (isCurrentScope(scope)) setBusy(null) }
  }
  if (conflicts.length === 0 && !error) return null
  return (
    <section className="space-y-3 border-t border-text-primary/10 pt-3" aria-label="Korunan değişiklikler">
      <h3 className="text-base font-semibold text-text-primary">Korunan değişiklikler ({conflicts.length})</h3>
      <p className="text-xs text-text-muted">Cihazlardaki sürümler farklı. Yerel kopyan burada ve dışa aktardığın yedekte korunur.</p>
      {conflicts.map((conflict) => (
        <div key={conflict.id} className="space-y-2 rounded-lg border border-text-primary/20 p-3 text-xs">
          <p className="font-semibold text-text-primary">{conflict.entity === 'settings' ? 'Tercih değişikliği' : conflict.action === 'delete_session' ? 'Silme isteği' : 'Seans değişikliği'}</p>
          <p className="break-words text-text-muted"><strong>Yerel:</strong> {summary(conflict.local,conflict.entity)}</p>
          <p className="break-words text-text-muted"><strong>Bulut:</strong> {summary(conflict.remote,conflict.entity)}</p>
          <button type="button" disabled={busy !== null} onClick={() => resolve(conflict,false)} className="w-full rounded border border-text-primary/20 px-3 py-2 text-text-primary disabled:opacity-50">Bulut sürümünü kabul et</button>
          <button type="button" disabled={busy !== null} onClick={() => resolve(conflict,true)} className="w-full rounded border border-primary/50 px-3 py-2 text-primary disabled:opacity-50">
            {busy === conflict.id ? 'Uygulanıyor…' : conflict.entity === 'settings' ? 'Yerel tercihlerimi uygula' : conflict.action === 'delete_session' ? 'Silmeyi yeniden dene' : 'Yereli yeni seans olarak kaydet'}
          </button>
        </div>
      ))}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </section>
  )
}
