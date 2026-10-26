import type { FinishedSession, FinishForm, SessionRecord, TimerSnapshot, ModeConfig } from '../types'
import { calculateScore, calculateStreak, type ScoreBreakdown } from './scoring'
import { getLocalDateString } from './time'
import { closeWorkIntervals } from './workIntervals'

export const emptyFinishForm = (): FinishForm => ({ note: '', examName: '', analysis: null })

export function captureFinishedSession(state: TimerSnapshot & { modeConfig: ModeConfig }, endedAt: number): FinishedSession {
  return structuredClone({
    id: state.sessionId ?? crypto.randomUUID(),
    workIntervals: closeWorkIntervals(state, endedAt, state.elapsedMs),
    startedAt: state.sessionStartedAt ?? Math.max(0, endedAt - state.elapsedMs - state.totalPauseDurationMs),
    endedAt,
    config: state.modeConfig,
    elapsedMs: state.elapsedMs,
    plannedMs: state.plannedMs,
    pauses: state.pauses,
    totalPauseDurationMs: state.totalPauseDurationMs,
    molaToplamMs: state.molaToplamMs,
    denemeMolalarSaniye: state.denemeMolalarSaniye,
    currentSectionIndex: state.currentSectionIndex,
    wasEarlyFinish: state.wasEarlyFinish ?? (state.plannedMs != null && state.elapsedMs < state.plannedMs),
  })
}

export function scoreFinishedSession(draft: FinishedSession, sessions: SessionRecord[]): ScoreBreakdown {
  const endDate = new Date(draft.endedAt)
  const day = getLocalDateString(endDate)
  const previous = sessions.filter((session) => session.id !== draft.id && Date.parse(session.tarihISO) <= draft.endedAt)
  const rounds = previous.filter((session) => session.mod === draft.config.mode && getLocalDateString(new Date(session.tarihISO)) === day).length
  const candidate: SessionRecord = {
    id: draft.id, mod: draft.config.mode, sureGercek: Math.round(draft.elapsedMs / 1000),
    tarihISO: endDate.toISOString(), duraklatmaSayisi: draft.pauses, puan: 0, workIntervals: draft.workIntervals,
  }
  return calculateScore(draft.elapsedMs, draft.config.mode, draft.pauses, !draft.wasEarlyFinish,
    rounds, calculateStreak([...previous, candidate], undefined, endDate), draft.plannedMs,
    draft.plannedMs != null ? Math.max(0, draft.elapsedMs - draft.plannedMs) : undefined)
}

export function finishedSessionRecord(draft: FinishedSession, score: ScoreBreakdown, form: FinishForm): SessionRecord {
  const config = draft.config
  const isExam = config.mode === 'deneme' || config.mode === 'EXAM_SIMULATOR'
  const timestamp = new Date(draft.endedAt).toISOString()
  return {
    id: draft.id, mod: config.mode,
    workIntervals: draft.workIntervals?.map((part) => ({ ...part })),
    surePlan: draft.plannedMs != null ? Math.round(draft.plannedMs / 1000) : undefined,
    sureGercek: Math.round(draft.elapsedMs / 1000), puan: score.totalScore,
    tarihISO: timestamp, createdAt: timestamp, updatedAt: timestamp,
    not: isExam && form.examName.trim() ? form.examName.trim() : form.note || undefined,
    duraklatmaSayisi: draft.pauses,
    toplamDuraklamaSureSaniye: draft.totalPauseDurationMs > 0 ? Math.round(draft.totalPauseDurationMs / 1000) : undefined,
    molaSaniye: config.mode === 'ders60mola15' ? Math.round((draft.molaToplamMs ?? 0) / 1000) : undefined,
    denemeMolalarSaniye: config.mode === 'deneme' ? [...(draft.denemeMolalarSaniye ?? [])] : undefined,
    dogruSayisi: isExam ? form.analysis?.dogru : undefined,
    yanlisSayisi: isExam ? form.analysis?.yanlis : undefined,
    bosSayisi: isExam ? form.analysis?.bos : undefined,
    templateId: config.mode === 'deneme' ? config.templateId : undefined,
    templateName: config.mode === 'deneme' ? config.bolumler[draft.currentSectionIndex ?? 0]?.ad ?? config.templateName : undefined,
    ekstraSureMs: draft.plannedMs != null && draft.elapsedMs > draft.plannedMs ? draft.elapsedMs - draft.plannedMs : undefined,
  }
}
