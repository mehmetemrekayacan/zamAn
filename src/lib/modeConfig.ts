import type { Mode, ModeConfig, Section } from '../types'

/* ─── Timer / Mod Sabitleri ─── */

export const DERS_MS = 60 * 60 * 1000
export const MOLA_MS = 15 * 60 * 1000

/** Kısa mod etiketleri — bildirim, geçmiş, toast vb. için */
export const MODE_LABELS: Record<string, string> = {
  serbest: 'Kronometre',
  gerisayim: 'Zamanlayıcı',
  EXAM_SIMULATOR: 'Sınav Saati',
  ders60mola15: '60/15',
  deneme: 'Deneme',
}

/** Uzun / görsel mod etiketleri — TimerHero gibi büyük gösterimler için */
export const MODE_DISPLAY_LABELS: Record<string, string> = {
  serbest: 'Kronometre',
  gerisayim: 'Zamanlayıcı',
  EXAM_SIMULATOR: 'Sınav Saati',
  ders60mola15: '60/15 Pomodoro',
  deneme: 'Deneme Sınavı',
}

export const MODE_EMOJIS: Record<string, string> = {
  serbest: '⏱️',
  gerisayim: '⏳',
  EXAM_SIMULATOR: '🕒',
  ders60mola15: '🍅',
  deneme: '📋',
}

export const MODE_DEFAULTS: Record<Mode, ModeConfig> = {
  serbest: { mode: 'serbest' },
  gerisayim: { mode: 'gerisayim', sureMs: 40 * 60 * 1000 },
  EXAM_SIMULATOR: { mode: 'EXAM_SIMULATOR', startTimeHHmm: '14:45', sureMs: 90 * 60 * 1000 },
  ders60mola15: { mode: 'ders60mola15', calismaMs: DERS_MS, molaMs: MOLA_MS },
  deneme: {
    mode: 'deneme',
    templateId: 'oabt-ags',
    templateName: 'ÖABT + AGS',
    bolumler: [
      { ad: 'AGS', surePlanMs: 110 * 60 * 1000 },
      { ad: 'ÖABT', surePlanMs: 90 * 60 * 1000 },
    ],
    currentSectionIndex: 0,
  },
}

/** Deneme şablonları — iki ana başlık: KPSS (GY 60 + GK 60), ÖABT+AGS. */
export const DENEME_TEMPLATES: { id: string; label: string; bolumler: Section[] }[] = [
  {
    id: 'kpss',
    label: 'KPSS',
    bolumler: [
      { ad: 'Genel Yetenek', surePlanMs: 60 * 60 * 1000 },
      { ad: 'Genel Kültür', surePlanMs: 60 * 60 * 1000 },
    ],
  },
  {
    id: 'oabt-ags',
    label: 'ÖABT + AGS',
    bolumler: [
      { ad: 'AGS', surePlanMs: 110 * 60 * 1000 },
      { ad: 'ÖABT', surePlanMs: 90 * 60 * 1000 },
    ],
  },
]
