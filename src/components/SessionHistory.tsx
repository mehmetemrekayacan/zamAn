import { memo, useEffect, useRef, useState } from 'react'
import type { SessionRecord } from '../types'

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
}

export const SessionHistory = memo(function SessionHistory({
  sessions,
}: SessionHistoryProps) {
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
    <div className="rounded-2xl border border-text-primary/5 bg-surface-800/60 p-5 shadow-lg shadow-cyan-500/5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted">
            Aktivite
          </p>
          <h3 className="font-display text-lg font-semibold text-text-primary">
            Son Seanslar
          </h3>
        </div>
        <span className="rounded-full bg-surface-700/60 px-2.5 py-0.5 text-xs text-text-muted">
          {sessions.length} kayıt
        </span>
      </div>

      <div className="space-y-2">
        {sessions.length > 0 ? (
          sessions.map((session, index) => (
            <div
              key={session.id}
              className={`flex items-center gap-3 rounded-xl border border-text-primary/5 
                         bg-surface-900/40 px-4 py-3 transition-all duration-300 hover:border-text-primary/10
                         animate-list-item
                         ${session.id === newItemId ? 'ring-2 ring-accent-blue/30 ring-offset-1 ring-offset-surface-900' : ''}`}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              {/* Mod icon */}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-blue/10 text-base">
                {MODE_EMOJIS[session.mod] ?? '📋'}
              </span>

              {/* Detay */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {MODE_LABELS[session.mod] ?? session.mod}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {new Date(session.tarihISO).toLocaleDateString('tr-TR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <span className="text-xs text-text-muted">
                  {Math.round(session.sureGercek / 60)} dakika
                </span>
              </div>

              {/* Puan */}
              <span className="shrink-0 rounded-full bg-accent-blue/15 px-2.5 py-1 text-xs font-bold text-accent-blue">
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
