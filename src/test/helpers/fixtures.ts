import type { SessionRecord } from '../../types'

export const TEST_TIME = '2026-10-24T09:00:00.000Z'

/** Birden fazla kayıt üretirken farklı id verin; varsayılan zaman sabittir. */
export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'test-session',
    mod: 'serbest',
    sureGercek: 3600,
    puan: 600,
    tarihISO: TEST_TIME,
    duraklatmaSayisi: 0,
    createdAt: TEST_TIME,
    updatedAt: TEST_TIME,
    ...overrides,
  }
}
