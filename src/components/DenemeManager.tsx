import { memo, useCallback, useId, useMemo, useRef, useState } from 'react'
import { useSessionsStore } from '../store/sessions'
import type { SessionRecord } from '../types'
import { getDenemeTemplateName } from '../lib/utils'
import { ModalDialog } from './ModalDialog'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Net hesaplama yardımcı fonksiyonu.
 * Doğru - Yanlış/4 formülünü uygular ve tam sayı ise virgül olmadan gösterir.
 */
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
  onDelete: (id: string) => void
}

const DenemeCard = memo(function DenemeCard({ session, onUpdate, onDelete }: DenemeCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const [form, setForm] = useState<EditState>({
    dogru: String(session.dogruSayisi ?? ''),
    yanlis: String(session.yanlisSayisi ?? ''),
    bos: String(session.bosSayisi ?? ''),
  })

  const net = calcNet(session)
  // Kart başlığının öncelik sırası:
  // 1. session.templateName (varsa öncelikli olarak şablon adı yazılır)
  // 2. session.not (yoksa kullanıcının girdiği 'kpss' vb. not başlık yapılır)
  // 3. Mod etiketinin varsayılan adı ("Sınav Saati", "Deneme")
  const label = session.templateName || session.not || getDenemeTemplateName(session)
  const dkGercek = Math.round(session.sureGercek / 60)

  const handleSave = async () => {
    if (savingRef.current) return
    if (Object.values(form).some(value => value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 999))) {
      setError('Doğru, yanlış ve boş sayıları 0–999 arasında tam sayı olmalı.')
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      await onUpdate({
        ...session,
        dogruSayisi: form.dogru === '' ? undefined : Number(form.dogru),
        yanlisSayisi: form.yanlis === '' ? undefined : Number(form.yanlis),
        bosSayisi: form.bos === '' ? undefined : Number(form.bos),
      })
      setEditing(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Değişiklik kaydedilemedi. Yeniden deneyebilirsin.')
    } finally {
      savingRef.current = false
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
    setError(null)
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
        <fieldset disabled={saving} className="space-y-3 rounded-xl border border-warning/25 bg-warning/5 p-3" aria-busy={saving}>
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
                <label htmlFor={`${inputId}-${f.key}`} className={`mb-1 block text-xs font-medium ${f.color}`}>{f.label}</label>
                <input
                  id={`${inputId}-${f.key}`}
                  type="number"
                  min="0"
                  max="999"
                  step="1"
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
        </fieldset>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

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
const PAGE_SIZE = 20

export function DenemeManager({ onClose }: DenemeManagerProps) {
  const sessions = useSessionsStore((s) => s.sessions)
  const updateSession = useSessionsStore((s) => s.updateSession)
  const deleteSession = useSessionsStore((s) => s.deleteSession)

  const [filterName, setFilterName] = useState('all')
  const [requestedPage, setRequestedPage] = useState(1)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deletingRef = useRef(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleRequestDelete = useCallback((id: string) => {
    setDeleteError(null)
    setSessionToDelete(id)
  }, [])

  const handleDelete = async () => {
    if (!sessionToDelete || deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSession(sessionToDelete)
      setSessionToDelete(null)
    } catch (failure) {
      setDeleteError(failure instanceof Error ? failure.message : 'Seans silinemedi. Yeniden deneyebilirsin.')
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }

  /**
   * Hem 'deneme' hem de 'EXAM_SIMULATOR' modlarındaki seansları kapsayacak şekilde filtreler.
   * Performansı artırmak için useMemo ile sarmalanmış ve tarihe göre azalan (yeniden eskiye) sırada sıralanmıştır.
   */
  const denemeSessions = useMemo(() => {
    return sessions
      .filter((s) => s.mod === 'deneme' || s.mod === 'EXAM_SIMULATOR')
      .sort((a, b) => new Date(b.tarihISO).getTime() - new Date(a.tarihISO).getTime())
  }, [sessions])

  /**
   * Şablon filtresi için sadece geçerli templateName değerlerini toplar.
   * session.not (seans notları) alanının filtre dropdown listesini kirletmesini engeller.
   */
  const uniqueNames = useMemo(() => {
    const set = new Set<string>()
    for (const session of denemeSessions) {
      const name = getDenemeTemplateName(session)
      if (name) set.add(name)
    }
    return Array.from(set)
  }, [denemeSessions])

  /**
   * Seçili şablon filtresine göre seansları süzer.
   */
  const filteredSessions = useMemo(() => {
    if (filterName === 'all') return denemeSessions
    return denemeSessions.filter((s) => getDenemeTemplateName(s) === filterName)
  }, [denemeSessions, filterName])

  const pageCount = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE))
  // Son sayfadaki kayıt silinirse boş bir sayfada kalma.
  const page = Math.min(requestedPage, pageCount)
  const pageStart = (page - 1) * PAGE_SIZE
  const visibleSessions = filteredSessions.slice(pageStart, pageStart + PAGE_SIZE)

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
            aria-label="Deneme filtresi"
            value={filterName}
            onChange={(e) => { setFilterName(e.target.value); setRequestedPage(1) }}
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
          {visibleSessions.map((session) => (
            <DenemeCard
              key={session.id}
              session={session}
              onUpdate={updateSession}
              onDelete={handleRequestDelete}
            />
          ))}
        </div>
      )}

      {filteredSessions.length > PAGE_SIZE && (
        <nav aria-label="Deneme sayfaları" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-text-muted" aria-live="polite">{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredSessions.length)} / {filteredSessions.length} deneme</span>
          <div className="flex items-center gap-3">
            <button type="button" disabled={page === 1} onClick={() => setRequestedPage(page - 1)} className="rounded-full border border-text-primary/15 px-4 py-2 text-text-primary disabled:opacity-40">Önceki</button>
            <span className="text-text-muted">{page} / {pageCount}</span>
            <button type="button" disabled={page === pageCount} onClick={() => setRequestedPage(page + 1)} className="rounded-full border border-text-primary/15 px-4 py-2 text-text-primary disabled:opacity-40">Sonraki</button>
          </div>
        </nav>
      )}

      {/* Silme onay modalı */}
      {sessionToDelete !== null && (
        <ModalDialog label="Deneme seansını sil" role="alertdialog" onClose={() => setSessionToDelete(null)} busy={deleting}
          className="w-full max-w-sm rounded-2xl border border-text-primary/10 bg-surface-800 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-text-primary">Deneme seansını sil?</h3>
            <p className="mt-2 text-sm text-text-muted">
              Bu deneme seansı silinecek. Hesaba giriş yaptıysan silme diğer cihazlarına da eşitlenir. Bu işlem geri alınamaz.
            </p>
            {deleteError && <p role="alert" className="mt-3 text-sm text-danger">{deleteError}</p>}
            <div className="mt-6 flex gap-3 justify-end">
              <button
                data-dialog-initial-focus
                disabled={deleting}
                onClick={() => setSessionToDelete(null)}
                className="rounded-full border border-text-primary/15 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-700"
              >
                İptal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-danger-foreground transition hover:bg-danger/90"
              >
                {deleting ? 'Siliniyor…' : 'Sil'}
              </button>
            </div>
        </ModalDialog>
      )}
    </div>
  )
}
