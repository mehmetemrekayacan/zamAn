import { memo, useEffect, useRef, useState } from 'react'
import type { SessionRecord } from '../types'
import type { SessionSyncMap } from '../store/sessions'
import { SyncStatusBadge } from './SyncStatusBadge'
import { getSubjectLabel } from '../lib/utils'

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

/** Net sayısı: Doğru - Yanlış/4 */
function calculateNet(session: SessionRecord): number | null {
  if (typeof session.dogruSayisi !== 'number' || typeof session.yanlisSayisi !== 'number') return null
  return session.dogruSayisi - session.yanlisSayisi / 4
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface SessionDetailModalProps {
  session: SessionRecord
  onClose: () => void
}

function SessionDetailModal({ session, onClose }: SessionDetailModalProps) {
  const isDeneme = session.mod === 'deneme'
  const denemeLabel = isDeneme ? getSubjectLabel(session) : null
  const net = isDeneme ? calculateNet(session) : null

  const ekstraSureSn = session.ekstraSureMs != null ? Math.round(session.ekstraSureMs / 1000) : 0
  const toplamSureSn = session.sureGercek
  const normalSureSn = Math.max(0, toplamSureSn - ekstraSureSn)
  const normalDk = Math.round(normalSureSn / 60)
  const ekstraDk = ekstraSureSn > 0 ? Math.round(ekstraSureSn / 60) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal panel */}
      <div
        className="relative z-10 w-full max-w-[min(28rem,90vw)] overflow-hidden rounded-2xl
                   border border-[var(--card-border)] bg-surface-800 p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Kapat butonu */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 shrink-0 items-center justify-center
                     rounded-full text-text-muted transition-colors hover:bg-surface-600
                     hover:text-text-primary"
          aria-label="Kapat"
        >
          ✕
        </button>

        {/* Başlık */}
        <div className="mb-5 flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl">
            {MODE_EMOJIS[session.mod] ?? '📋'}
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p
              className="font-semibold text-text-primary"
              style={{ overflowWrap: 'anywhere' }}
            >
              {isDeneme ? denemeLabel : (MODE_LABELS[session.mod] ?? session.mod)}
            </p>
            <p
              className="text-xs text-text-muted"
              style={{ overflowWrap: 'anywhere' }}
            >
              {formatDate(session.tarihISO)}
            </p>
          </div>
        </div>

        {/* Bilgi satırları */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Süre</span>
            <span className="font-medium text-text-primary">
              {ekstraDk != null ? (
                <>
                  {normalDk} dk{' '}
                  <span className="text-primary font-semibold">+ {ekstraDk} dk ekstra</span>
                </>
              ) : (
                `${normalDk} dakika`
              )}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-text-muted">Puan</span>
            <span className="font-semibold text-primary">+{session.puan}</span>
          </div>

          {isDeneme && net != null && (
            <div className="flex justify-between">
              <span className="text-text-muted">Net</span>
              <span className="font-semibold text-primary">
                {net % 1 === 0 ? net : net.toFixed(2)}
              </span>
            </div>
          )}

          {isDeneme && typeof session.dogruSayisi === 'number' && (
            <div className="flex justify-between gap-4 rounded-xl bg-surface-700/50 px-3 py-2 text-xs">
              <span className="text-green-400">✓ {session.dogruSayisi} Doğru</span>
              <span className="text-red-400">✗ {session.yanlisSayisi ?? 0} Yanlış</span>
              <span className="text-text-muted">— {session.bosSayisi ?? 0} Boş</span>
            </div>
          )}

          {session.not && (
            <div className="w-full min-w-0 overflow-hidden rounded-xl bg-surface-700/40 p-3">
              <p className="mb-1 text-xs font-medium text-text-muted">Not</p>
              <p
                className="whitespace-pre-wrap break-all text-sm text-text-primary leading-relaxed"
                style={{ overflowWrap: 'anywhere' }}
              >
                {session.not}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const SessionHistory = memo(function SessionHistory({
  sessions,
  syncStatusById,
}: SessionHistoryProps) {
  const visibleSessions = sessions.slice(0, 10)

  const prevCountRef = useRef(sessions.length)
  const [newItemId, setNewItemId] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null)

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
    <>
      <div className="card p-5 min-w-0 overflow-hidden">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-label">Aktivite</p>
            <h3 className="section-title text-lg">Son Seanslar</h3>
          </div>
          <span className="rounded-full bg-surface-600/50 px-2.5 py-0.5 text-xs text-text-muted">
            {sessions.length} kayıt
          </span>
        </div>

        <div className="space-y-2">
          {visibleSessions.length > 0 ? (
            visibleSessions.map((session, index) => {
              const isDeneme = session.mod === 'deneme'
              const denemeLabel = isDeneme ? getSubjectLabel(session) : null
              const net = isDeneme ? calculateNet(session) : null

              const ekstraSureSn = session.ekstraSureMs != null ? Math.round(session.ekstraSureMs / 1000) : 0
              const toplamSureSn = session.sureGercek
              const normalSureSn = Math.max(0, toplamSureSn - ekstraSureSn)
              const normalDk = Math.round(normalSureSn / 60)
              const ekstraDk = ekstraSureSn > 0 ? Math.round(ekstraSureSn / 60) : null

              return (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedSession(session)}
                  onKeyDown={e => e.key === 'Enter' && setSelectedSession(session)}
                  className={`flex overflow-hidden cursor-pointer items-center gap-3 rounded-card-sm border
                             border-[var(--card-border)] bg-surface-900/40 px-4 py-3 transition-all
                             duration-300 hover:border-text-primary/10 hover:bg-surface-900/60
                             animate-list-item
                             ${session.id === newItemId ? 'ring-2 ring-primary/30 ring-offset-1 ring-offset-surface-900' : ''}`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  {/* Mod icon */}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base">
                    {MODE_EMOJIS[session.mod] ?? '📋'}
                  </span>

                  {/* Detay */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex w-full min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text-primary">
                        {isDeneme ? denemeLabel : (MODE_LABELS[session.mod] ?? session.mod)}
                      </span>
                      <SyncStatusBadge
                        sessionId={session.id}
                        status={syncStatusById?.[session.id]}
                      />
                      <span className="shrink-0 text-[11px] text-text-muted">
                        {new Date(session.tarihISO).toLocaleDateString('tr-TR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="block w-full min-w-0 overflow-hidden">
                      <span className="block truncate w-full text-xs text-text-secondary">
                        {ekstraDk != null ? (
                          <>
                            {normalDk} dk{' '}
                            <span className="text-primary font-medium">+ {ekstraDk} dk ekstra</span>
                          </>
                        ) : (
                          `${normalDk} dakika`
                        )}
                        {session.not && (
                          <span className="ml-2 text-text-muted italic">{session.not}</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Net sayısı (deneme modu) */}
                  {isDeneme && net != null && (
                    <span className="shrink-0 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-bold text-primary">
                      {net % 1 === 0 ? net : net.toFixed(2)} Net
                    </span>
                  )}

                  {/* Puan */}
                  <span className="shrink-0 rounded-full bg-primary/12 px-3 py-1 text-xs font-bold text-primary">
                    +{session.puan}
                  </span>
                </div>
              )
            })
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">
              Henüz seans kaydı yok. İlk seansını başlat!
            </p>
          )}
        </div>
      </div>

      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </>
  )
})
