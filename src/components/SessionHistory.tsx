import { memo, useEffect, useRef, useState } from 'react'
import type { SessionRecord } from '../types'
import type { SessionSyncMap } from '../store/sessions'
import { SyncStatusBadge } from './SyncStatusBadge'

const MODE_LABELS: Record<string, string> = {
  serbest: 'Kronometre',
  gerisayim: 'Zamanlayıcı',
  ders60mola15: '60/15',
  deneme: 'Deneme',
}
const MODE_EMOJIS: Record<string, string> = {
  serbest: '⏱️',
  gerisayim: '⏳',
  ders60mola15: '🍅',
  deneme: '📋',
}

export interface SessionHistoryProps {
  sessions: SessionRecord[]
  syncStatusById?: SessionSyncMap
}

export const SessionHistory = memo(function SessionHistory({
  sessions,
  syncStatusById,
}: SessionHistoryProps) {
  const visibleSessions = sessions.slice(0, 10)

  /* Yeni eklenen öğeyi tespit et ve animasyon uygula */
  const prevCountRef = useRef(sessions.length)
  const [newItemId, setNewItemId] = useState<string | null>(null)

  useEffect(() => {
    if (sessions.length > prevCountRef.current && sessions[0]) {
      queueMicrotask(() => setNewItemId(sessions[0].id))
      const t = setTimeout(() => setNewItemId(null), 500)
      prevCountRef.current = sessions.length
      return () => clearTimeout(t)
    }
    prevCountRef.current = sessions.length
  }, [sessions])

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="section-label">
            Aktivite
          </p>
          <h3 className="section-title text-lg">
            Son Seanslar
          </h3>
        </div>
        <span className="rounded-full bg-surface-600/50 px-2.5 py-0.5 text-xs text-text-muted">
          {sessions.length} kayıt
        </span>
      </div>

      <div className="space-y-2">
        {visibleSessions.length > 0 ? (
          visibleSessions.map((session, index) => (
            <div
              key={session.id}
              className={`flex items-center gap-3 rounded-card-sm border border-[var(--card-border)]
                         bg-surface-900/40 px-4 py-3 transition-all duration-300 hover:border-text-primary/10
                         hover:bg-surface-900/60 animate-list-item
                         ${session.id === newItemId ? 'ring-2 ring-accent-blue/30 ring-offset-1 ring-offset-surface-900' : ''}`}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              {/* Mod icon */}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-blue/10 text-base">
                {MODE_EMOJIS[session.mod] ?? '📋'}
              </span>

              {/* Detay */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary truncate">
                    {MODE_LABELS[session.mod] ?? session.mod}
                  </span>
                  <SyncStatusBadge
                    sessionId={session.id}
                    status={syncStatusById?.[session.id]}
                  />
                  <span className="text-[11px] text-text-muted">
                    {new Date(session.tarihISO).toLocaleDateString('tr-TR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <span className="text-xs text-text-secondary">
                  {Math.round(session.sureGercek / 60)} dakika
                </span>
              </div>

              {/* Puan */}
              <span className="shrink-0 rounded-full bg-accent-blue/12 px-3 py-1 text-xs font-bold text-accent-blue">
                +{session.puan}
              </span>
            </div>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-text-muted">
            Henüz seans kaydı yok. İlk seansını başlat!
          </p>
        )}
      </div>
    </div>
  )
})
