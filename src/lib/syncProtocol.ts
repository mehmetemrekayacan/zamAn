import type { SessionRecord } from '../types'
import { validateBackup } from './backupValidation'

export interface RemoteSessionRow {
  work_intervals?: SessionRecord['workIntervals'] | null
  id: string; user_id: string; mod: string; sure_plan: number | null; sure_gercek: number
  puan: number; tarih_iso: string; not_text: string | null; duraklatma: number
  mola_saniye: number | null; deneme_molalar: number[] | null
  dogru_sayisi: number | null; yanlis_sayisi: number | null; bos_sayisi: number | null
  bolumler: SessionRecord['bolumler'] | null; template_id: string | null; template_name: string | null
  ekstra_sure_ms: number | null; toplam_duraklama_saniye: number | null
  created_at: string; updated_at: string; deleted_at: string | null
  version: number; updated_at_server: string; sync_seq: number
}

export interface PendingSessionMutation {
  mutationId: string
  baseVersion: number
  action: 'upsert_session' | 'delete_session'
  payload?: SessionRecord
}

export interface SessionSyncState {
  id: string
  version: number
  fingerprint: string | null
  remote?: RemoteSessionRow
  pending?: PendingSessionMutation
}

export interface SyncConflict {
  id: string
  entity: 'session' | 'settings'
  sessionId?: string
  createdAt: string
  local: unknown
  remote: unknown
  action?: 'upsert_session' | 'delete_session'
}

export interface PreferenceSnapshot {
  settings: Record<string, unknown>
  deneme_config: Record<string, unknown> | null
}

export interface SettingsSyncState {
  id: 'settings'
  version: number
  fingerprint: string | null
  pending?: { mutationId: string; baseVersion: number; snapshot: PreferenceSnapshot; fingerprint: string }
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function sessionToRow(s: SessionRecord) {
  return {
    id: s.id, mod: s.mod, sure_plan: s.surePlan ?? null, sure_gercek: s.sureGercek,
    ...(s.workIntervals !== undefined ? { work_intervals: s.workIntervals } : {}),
    puan: s.puan, tarih_iso: new Date(s.tarihISO).toISOString(), not_text: s.not ?? null, duraklatma: s.duraklatmaSayisi,
    mola_saniye: s.molaSaniye ?? null, deneme_molalar: s.denemeMolalarSaniye ?? null,
    dogru_sayisi: s.dogruSayisi ?? null, yanlis_sayisi: s.yanlisSayisi ?? null, bos_sayisi: s.bosSayisi ?? null,
    bolumler: s.bolumler ?? null, template_id: s.templateId ?? null, template_name: s.templateName ?? null,
    ekstra_sure_ms: s.ekstraSureMs ?? null, toplam_duraklama_saniye: s.toplamDuraklamaSureSaniye ?? null,
    created_at: new Date(s.createdAt ?? s.tarihISO).toISOString(),
  }
}

export function rowToSession(r: RemoteSessionRow): SessionRecord {
  return {
    id: r.id, mod: r.mod as SessionRecord['mod'], surePlan: r.sure_plan ?? undefined,
    workIntervals: r.work_intervals ?? undefined,
    sureGercek: r.sure_gercek, puan: r.puan, tarihISO: new Date(r.tarih_iso).toISOString(), not: r.not_text ?? undefined,
    duraklatmaSayisi: r.duraklatma, molaSaniye: r.mola_saniye ?? undefined,
    denemeMolalarSaniye: r.deneme_molalar ?? undefined, dogruSayisi: r.dogru_sayisi ?? undefined,
    yanlisSayisi: r.yanlis_sayisi ?? undefined, bosSayisi: r.bos_sayisi ?? undefined,
    bolumler: r.bolumler ?? undefined, templateId: r.template_id ?? undefined,
    templateName: r.template_name ?? undefined, ekstraSureMs: r.ekstra_sure_ms ?? undefined,
    toplamDuraklamaSureSaniye: r.toplam_duraklama_saniye ?? undefined,
    createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
  }
}

export function sessionFingerprint(session: SessionRecord): string {
  const row = sessionToRow(session)
  // Oluşturma/güncelleme metadatası içerik değişikliği değildir.
  return canonical({ ...row, created_at: undefined, work_intervals: session.workIntervals ?? undefined })
}

export function newMutationId(): string { return crypto.randomUUID() }

export function assertRemoteRow(row: unknown, id?: string): asserts row is RemoteSessionRow {
  const r = row as Partial<RemoteSessionRow> | null
  if (!r || typeof r.id !== 'string' || (id !== undefined && r.id !== id) || !Number.isSafeInteger(r.version) || r.version! < 1 || !Number.isSafeInteger(r.sync_seq) || r.sync_seq! < 1 || typeof r.updated_at_server !== 'string') {
    throw new Error('Bulut yanıtı yeni senkronizasyon biçimiyle uyuşmuyor. Yerel kayıtlar korundu.')
  }
  if (typeof r.user_id !== 'string' || !r.id.length || r.deleted_at !== null && (typeof r.deleted_at !== 'string' || !Number.isFinite(Date.parse(r.deleted_at)))) throw new Error('Geçersiz bulut seans metadatası.')
  validateBackup({ version: 1, exportedAt: new Date().toISOString(), sessions: [rowToSession(r as RemoteSessionRow)] })
}
