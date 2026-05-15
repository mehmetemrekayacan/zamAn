import { memo, useCallback, useState } from 'react'
import { useSessionsStore } from '../store/sessions'
import type { SessionRecord } from '../types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function calcNet(session: SessionRecord): string | null {
  if (typeof session.dogruSayisi !== 'number' || typeof session.yanlisSayisi !== 'number') return null
  const net = session.dogruSayisi - session.yanlisSayisi / 4
  return net % 1 === 0 ? String(net) : net.toFixed(2)
}

interface EditState {
  dogru: string
  yanlis: string
  bos: string
}

interface DenemeCardProps {
  session: SessionRecord
  onUpdate: (updated: SessionRecord) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const DenemeCard = memo(function DenemeCard({ session, onUpdate, onDelete }: DenemeCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EditState>({
    dogru: String(session.dogruSayisi ?? ''),
    yanlis: String(session.yanlisSayisi ?? ''),
    bos: String(session.bosSayisi ?? ''),
  })

  const net = calcNet(session)
  const label = session.templateName ?? session.not ?? '—'
  const dkGercek = Math.round(session.sureGercek / 60)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate({
        ...session,
        dogruSayisi: form.dogru === '' ? undefined : Number(form.dogru),
        yanlisSayisi: form.yanlis === '' ? undefined : Number(form.yanlis),
        bosSayisi: form.bos === '' ? undefined : Number(form.bos),
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setForm({
      dogru: String(session.dogruSayisi ?? ''),
      yanlis: String(session.yanlisSayisi ?? ''),
      bos: String(session.bosSayisi ?? ''),
    })
    setEditing(false)
  }

  return (
    <div className="rounded-2xl border border-text-primary/10 bg-surface-800 p-4 flex flex-col gap-3">
      {/* Başlık satırı */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-text-primary truncate">{label}</p>
          <p className="text-xs text-text-muted mt-0.5">{formatDate(session.tarihISO)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {net !== null && (
            <span className="rounded-full bg-primary/12 px-2.5 py-1 text-xs font-bold text-primary">
              {net} Net
            </span>
          )}
          <span className="text-xs text-text-muted">{dkGercek} dk</span>
        </div>
      </div>

      {/* D/Y/B satırı (görüntüleme) */}
      {!editing && (
        <div className="flex gap-4 rounded-xl bg-surface-900/50 px-3 py-2 text-xs">
          <span className="text-green-400">✓ {session.dogruSayisi ?? '—'} Doğru</span>
          <span className="text-red-400">✗ {session.yanlisSayisi ?? '—'} Yanlış</span>
          <span className="text-text-muted">— {session.bosSayisi ?? '—'} Boş</span>
        </div>
      )}

      {/* Düzenleme formu */}
      {editing && (
        <div className="space-y-3 rounded-xl border border-warning/25 bg-warning/5 p-3">
          <p className="text-xs font-semibold text-warning">Doğru / Yanlış / Boş Düzenle</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { label: 'Doğru', key: 'dogru', color: 'text-green-400' },
                { label: 'Yanlış', key: 'yanlis', color: 'text-red-400' },
                { label: 'Boş', key: 'bos', color: 'text-text-muted' },
              ] as { label: string; key: keyof EditState; color: string }[]
            ).map((f) => (
              <div key={f.key}>
                <label className={`mb-1 block text-xs font-medium ${f.color}`}>{f.label}</label>
                <input
                  type="number"
                  min="0"
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full rounded-xl border border-text-primary/10 bg-surface-700 px-2 py-2 text-center text-sm text-text-primary focus:border-warning/50 focus:outline-none"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-full bg-warning px-3 py-2 text-xs font-semibold text-warning-foreground transition hover:bg-warning/90 disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : '✓ Kaydet'}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="rounded-full border border-text-primary/15 px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-text-primary/40 disabled:opacity-50"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Aksiyon butonları */}
      {!editing && (
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="flex-1 rounded-full border border-info/30 bg-info/10 px-3 py-2 text-xs font-semibold text-info transition hover:bg-info/20"
          >
            Düzenle
          </button>
          <button
            onClick={() => onDelete(session.id)}
            className="flex-1 rounded-full border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20"
          >
            Sil
          </button>
        </div>
      )}
    </div>
  )
})

interface DenemeManagerProps {
  onClose: () => void
}

export function DenemeManager({ onClose }: DenemeManagerProps) {
  const sessions = useSessionsStore((s) => s.sessions)
  const updateSession = useSessionsStore((s) => s.updateSession)
  const deleteSession = useSessionsStore((s) => s.deleteSession)

  const [filterName, setFilterName] = useState('all')
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)

  const handleRequestDelete = useCallback((id: string) => {
    setSessionToDelete(id)
  }, [])

  const denemeSessions = sessions.filter((s) => s.mod === 'deneme')

  const uniqueNames = Array.from(
    new Set(denemeSessions.map((s) => s.templateName ?? s.not ?? '—'))
  )

  const filteredSessions =
    filterName === 'all'
      ? denemeSessions
      : denemeSessions.filter((s) => (s.templateName ?? s.not ?? '—') === filterName)

  return (
    <div className="mx-auto w-full max-w-2xl flex flex-col gap-6">
      {/* Başlık + Geri butonu */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label">Yönetim</p>
          <h2 className="section-title text-xl">Denemelerim</h2>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-full border border-text-primary/15 bg-surface-700/50 px-4 py-2 text-sm font-medium text-text-primary transition hover:border-secondary/50 hover:text-secondary"
        >
          ← Geri
        </button>
      </div>

      {/* Filtre dropdown */}
      {denemeSessions.length > 0 && (
        <div className="relative">
          <select
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="w-full appearance-none rounded-xl border border-text-primary/10 bg-surface-700 px-4 py-2.5 pr-10 text-sm font-medium text-text-primary shadow-sm focus:border-secondary/50 focus:outline-none"
          >
            <option value="all">Tüm Denemeler</option>
            {uniqueNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-text-muted">
            <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>
      )}

      {/* Liste */}
      {denemeSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-text-primary/15 bg-surface-800/40 px-6 py-16 text-center">
          <span className="mb-3 text-4xl opacity-50">📋</span>
          <p className="font-medium text-text-primary">Henüz deneme seansı yok</p>
          <p className="mt-1 text-sm text-text-muted">İlk deneme seansını tamamladığında burada görünecek.</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-text-primary/15 bg-surface-800/40 px-6 py-12 text-center">
          <span className="mb-3 text-3xl opacity-50">🔍</span>
          <p className="font-medium text-text-primary">Sonuç bulunamadı</p>
          <p className="mt-1 text-sm text-text-muted">Bu isme ait deneme seansı yok.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredSessions.map((session) => (
            <DenemeCard
              key={session.id}
              session={session}
              onUpdate={updateSession}
              onDelete={handleRequestDelete}
            />
          ))}
        </div>
      )}

      {/* Silme onay modalı */}
      {sessionToDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-800 border border-text-primary/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-text-primary">Emin misiniz?</h3>
            <p className="mt-2 text-sm text-text-muted">
              Bu deneme seansı kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setSessionToDelete(null)}
                className="rounded-full border border-text-primary/15 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-700"
              >
                İptal
              </button>
              <button
                onClick={() => { void deleteSession(sessionToDelete); setSessionToDelete(null) }}
                className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-danger-foreground transition hover:bg-danger/90"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
