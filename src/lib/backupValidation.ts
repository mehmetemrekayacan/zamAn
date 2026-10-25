import type { ExportPayload } from './sync'
import type { SyncConflict } from './syncProtocol'

type Fields = Record<string, unknown>
const MODES = ['serbest', 'gerisayim', 'ders60mola15', 'deneme', 'EXAM_SIMULATOR']

function requireValue(condition: unknown, path: string): asserts condition {
  if (!condition) throw new Error(`Geçersiz yedek alanı: ${path}.`)
}

function object(value: unknown, path: string): Fields {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path)
  return value as Fields
}

function text(value: unknown): value is string {
  return typeof value === 'string'
}

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
}

function count(value: unknown): value is number {
  return number(value) && Number.isSafeInteger(value)
}

function calendarDate(value: unknown): value is string {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function timestamp(value: unknown): value is string {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false
  return calendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
    && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60
}

function optionalFields(value: Fields, fields: string[], valid: (field: unknown) => boolean, path: string) {
  for (const field of fields) {
    if (value[field] != null) requireValue(valid(value[field]), `${path}.${field}`)
  }
}

function modeConfig(value: unknown, path: string) {
  const config = object(value, path)
  requireValue(MODES.includes(String(config.mode)), `${path}.mode`)
  if (config.mode === 'gerisayim' || config.mode === 'EXAM_SIMULATOR') {
    requireValue(number(config.sureMs) && config.sureMs > 0, `${path}.sureMs`)
  }
  if (config.mode === 'EXAM_SIMULATOR') {
    requireValue(text(config.startTimeHHmm) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(config.startTimeHHmm), `${path}.startTimeHHmm`)
  }
  if (config.mode === 'ders60mola15') {
    requireValue(number(config.calismaMs) && config.calismaMs > 0, `${path}.calismaMs`)
    requireValue(number(config.molaMs) && config.molaMs > 0, `${path}.molaMs`)
  }
  if (config.mode === 'deneme') {
    requireValue(Array.isArray(config.bolumler) && config.bolumler.length > 0, `${path}.bolumler`)
    for (const [index, raw] of config.bolumler.entries()) {
      const section = object(raw, `${path}.bolumler[${index}]`)
      requireValue(text(section.ad) && section.ad.trim().length > 0, `${path}.bolumler[${index}].ad`)
      requireValue(number(section.surePlanMs) && section.surePlanMs > 0, `${path}.bolumler[${index}].surePlanMs`)
    }
    if (config.currentSectionIndex != null) {
      requireValue(count(config.currentSectionIndex) && config.currentSectionIndex < config.bolumler.length, `${path}.currentSectionIndex`)
    }
    optionalFields(config, ['templateId', 'templateName'], text, path)
  }
  return config
}

function session(value: unknown, path: string) {
  const record = object(value, path)
  requireValue(text(record.id) && record.id.trim().length > 0, `${path}.id`)
  requireValue(MODES.includes(String(record.mod)), `${path}.mod`)
  requireValue(timestamp(record.tarihISO), `${path}.tarihISO`)
  for (const field of ['sureGercek', 'puan']) requireValue(number(record[field]), `${path}.${field}`)
  requireValue(count(record.duraklatmaSayisi), `${path}.duraklatmaSayisi`)
  optionalFields(record, ['surePlan', 'molaSaniye', 'ekstraSureMs', 'toplamDuraklamaSureSaniye'], number, path)
  optionalFields(record, ['dogruSayisi', 'yanlisSayisi', 'bosSayisi'], count, path)
  optionalFields(record, ['not', 'templateId', 'templateName'], text, path)
  optionalFields(record, ['createdAt', 'updatedAt'], timestamp, path)
  if (record.denemeMolalarSaniye != null) {
    requireValue(Array.isArray(record.denemeMolalarSaniye) && record.denemeMolalarSaniye.every(number), `${path}.denemeMolalarSaniye`)
  }
  if (record.bolumler != null) {
    requireValue(Array.isArray(record.bolumler), `${path}.bolumler`)
    for (const [index, raw] of record.bolumler.entries()) {
      const section = object(raw, `${path}.bolumler[${index}]`)
      requireValue(text(section.ad) && number(section.sureGercek), `${path}.bolumler[${index}]`)
      optionalFields(section, ['surePlan'], number, `${path}.bolumler[${index}]`)
    }
  }
  return record
}

function persisted(value: unknown, path: string) {
  requireValue(text(value), path)
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error(`Geçersiz yedek JSON alanı: ${path}.`) }
  const envelope = object(parsed, path)
  requireValue(envelope.version === undefined || envelope.version === 0, `${path}.version`)
  return object(envelope.state, `${path}.state`)
}

function allowedKeys(value: Fields, keys: string[], path: string) {
  for (const key of Object.keys(value)) requireValue(keys.includes(key), `${path}.${key}`)
}

function settings(value: unknown) {
  const path = 'settingsStorage'
  const state = persisted(value, path)
  // Eski ayarlardaki vurguRengi/updatedAt korunur; store aksiyonları veriyle ezilemez.
  allowedKeys(state, ['sesAçık', 'titreşimAçık', 'sessizMod', 'tema', 'bildirimİzni', 'kısayollar', 'kullaniciAdi', 'sinavTarihi', 'vurguRengi', 'updatedAt'], path)
  optionalFields(state, ['sesAçık', 'titreşimAçık', 'sessizMod'], (v) => typeof v === 'boolean', path)
  optionalFields(state, ['kullaniciAdi', 'vurguRengi'], text, path)
  optionalFields(state, ['updatedAt'], timestamp, path)
  if ('tema' in state) requireValue(['light', 'dark', 'high-contrast'].includes(String(state.tema)), `${path}.tema`)
  if ('bildirimİzni' in state) requireValue(['granted', 'denied', 'default'].includes(String(state.bildirimİzni)), `${path}.bildirimİzni`)
  if (state.sinavTarihi != null) requireValue(calendarDate(state.sinavTarihi), `${path}.sinavTarihi`)
  if ('kısayollar' in state) {
    const shortcuts = object(state.kısayollar, `${path}.kısayollar`)
    for (const key of ['startStop', 'reset', 'modGeçiş']) requireValue(text(shortcuts[key]) && shortcuts[key].length > 0, `${path}.kısayollar.${key}`)
    allowedKeys(shortcuts, ['startStop', 'reset', 'modGeçiş'], `${path}.kısayollar`)
  }
}

function timer(value: unknown) {
  const path = 'timerStorage'
  const state = persisted(value, path)
  const numeric = ['elapsedMs', 'plannedMs', 'remainingMs', 'expectedEndTime', 'startWallTime', 'molaToplamMs', 'totalPauseDurationMs', 'pauseStartTs', 'lastTickTs', 'backgroundBreakStartTs', 'backgroundBreakPlannedMs']
  const counts = ['currentSectionIndex', 'dersCycle', 'pomodoroRound', 'pauses']
  const dates = ['dersCycleDate', 'lastPomodoroDate']
  allowedKeys(state, [...numeric, ...counts, ...dates, 'status', 'mode', 'modeConfig', 'workBreakPhase', 'isOvertime', 'running', 'wasEarlyFinish', 'denemeMolalarSaniye'], path)
  requireValue(MODES.includes(String(state.mode)), `${path}.mode`)
  const config = modeConfig(state.modeConfig, `${path}.modeConfig`)
  requireValue(config.mode === state.mode, `${path}.modeConfig.mode`)
  requireValue(['idle', 'running', 'paused', 'finished'].includes(String(state.status)), `${path}.status`)
  requireValue(number(state.elapsedMs), `${path}.elapsedMs`)
  optionalFields(state, numeric, number, path)
  optionalFields(state, counts, count, path)
  optionalFields(state, dates, calendarDate, path)
  optionalFields(state, ['isOvertime', 'running', 'wasEarlyFinish'], (v) => typeof v === 'boolean', path)
  if (state.workBreakPhase != null) requireValue(['work', 'break'].includes(String(state.workBreakPhase)), `${path}.workBreakPhase`)
  if (state.denemeMolalarSaniye != null) requireValue(Array.isArray(state.denemeMolalarSaniye) && state.denemeMolalarSaniye.every(number), `${path}.denemeMolalarSaniye`)
}

/** Tam doğrulama mutasyonlardan önce yapılır; çağıranın nesnesine referans tutulmaz. */
export function validateBackup(value: unknown): ExportPayload {
  const payload = object(value, 'yedek')
  requireValue(payload.version === 1 || payload.version === 2, 'version (sürüm 1 veya 2 desteklenir)')
  requireValue(timestamp(payload.exportedAt), 'exportedAt')
  requireValue(Array.isArray(payload.sessions), 'sessions')
  const ids = new Set<string>()
  for (const [index, raw] of payload.sessions.entries()) {
    const record = session(raw, `sessions[${index}]`)
    requireValue(!ids.has(record.id as string), `sessions[${index}].id (tekrarlanan kimlik)`)
    ids.add(record.id as string)
  }
  if (payload.timerStorage != null) timer(payload.timerStorage)
  if (payload.settingsStorage != null) settings(payload.settingsStorage)
  if (payload.denemeConfig != null) {
    requireValue(text(payload.denemeConfig), 'denemeConfig')
    let parsed: unknown
    try { parsed = JSON.parse(payload.denemeConfig) } catch { throw new Error('Geçersiz yedek JSON alanı: denemeConfig.') }
    requireValue(modeConfig(parsed, 'denemeConfig').mode === 'deneme', 'denemeConfig.mode')
  }
  let conflicts: SyncConflict[] | undefined
  if (payload.version === 2) {
    requireValue(Array.isArray(payload.conflicts), 'conflicts')
    const conflictIds = new Set<string>()
    for (const [index, raw] of payload.conflicts.entries()) {
      const path = `conflicts[${index}]`
      const conflict = object(raw, path)
      requireValue(text(conflict.id) && conflict.id.length > 0 && !conflictIds.has(conflict.id), `${path}.id`)
      conflictIds.add(conflict.id)
      requireValue(timestamp(conflict.createdAt), `${path}.createdAt`)
      requireValue(['session','settings'].includes(String(conflict.entity)), `${path}.entity`)
      if (conflict.entity === 'session') {
        requireValue(text(conflict.sessionId) && conflict.sessionId.length > 0, `${path}.sessionId`)
        requireValue(['upsert_session','delete_session'].includes(String(conflict.action)), `${path}.action`)
        if (conflict.local != null) session(conflict.local, `${path}.local`)
        else requireValue(conflict.action === 'delete_session', `${path}.local`)
      } else {
        const local = object(conflict.local, `${path}.local`)
        settings(JSON.stringify(local.settings))
        if (local.deneme_config != null) requireValue(modeConfig(local.deneme_config, `${path}.local.deneme_config`).mode === 'deneme', `${path}.local.deneme_config.mode`)
      }
      if (conflict.remote !== null) object(conflict.remote, `${path}.remote`)
    }
    conflicts = payload.conflicts as SyncConflict[]
  }
  return structuredClone({
    version: payload.version,
    exportedAt: payload.exportedAt,
    sessions: payload.sessions,
    timerStorage: payload.timerStorage ?? null,
    denemeConfig: payload.denemeConfig ?? null,
    settingsStorage: payload.settingsStorage ?? null,
    conflicts,
  }) as ExportPayload
}
