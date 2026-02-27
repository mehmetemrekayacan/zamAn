import type { SyncStatus } from '../store/sessions'

export function SyncStatusBadge({
  sessionId,
  status,
}: {
  sessionId: string
  status?: SyncStatus
}) {
  const effectiveStatus: SyncStatus = status ?? 'synced'

  if (effectiveStatus === 'pending') {
    return (
      <span
        data-session-id={sessionId}
        className="inline-flex items-center gap-1 rounded-full border border-accent-amber/30 bg-accent-amber/10 px-2 py-0.5 text-[10px] font-semibold text-accent-amber"
        title="Senkron bekleniyor"
      >
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        Bekliyor
      </span>
    )
  }

  if (effectiveStatus === 'failed') {
    return (
      <span
        data-session-id={sessionId}
        className="inline-flex items-center gap-1 rounded-full border border-accent-red/35 bg-accent-red/10 px-2 py-0.5 text-[10px] font-semibold text-accent-red"
        title="Senkron başarısız"
      >
        <span className="text-[11px]">⚠</span>
        Hata
      </span>
    )
  }

  return (
    <span
      data-session-id={sessionId}
      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"
      title="Senkronlandı"
    >
      <span className="text-[11px]">✓</span>
      Senkron
    </span>
  )
}
