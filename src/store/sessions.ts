import { create } from 'zustand'
import type { SessionRecord, Mode } from '../types'
import { saveSession as dbSaveSession, listSessions, deleteSession as dbDeleteSession } from '../lib/db'
import { getQueueItems } from '../lib/offlineSync'
import { isCloudSyncEnabled } from '../lib/supabase'
import { getLocalDateString } from '../lib/time'

export type SyncStatus = 'pending' | 'synced' | 'failed'
export type SessionSyncMap = Record<string, SyncStatus>

function deriveSyncStatusByQueue(sessions: SessionRecord[], queueItems: Awaited<ReturnType<typeof getQueueItems>>): SessionSyncMap {
  const statusBySession = new Map<string, SyncStatus>()

  for (const item of queueItems) {
    if (item.isFailed) {
      statusBySession.set(item.sessionId, 'failed')
      continue
    }
    if (!statusBySession.has(item.sessionId)) {
      statusBySession.set(item.sessionId, 'pending')
    }
  }

  const result: SessionSyncMap = {}
  for (const session of sessions) {
    result[session.id] = statusBySession.get(session.id) ?? 'synced'
  }

  return result
}

export interface SessionsState {
  sessions: SessionRecord[]
  syncStatusById: SessionSyncMap
  loading: boolean
  loadSessions: () => Promise<void>
  addSession: (session: SessionRecord) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  refreshSyncStatuses: () => Promise<void>
  getRecentSessions: (limit?: number) => SessionRecord[]
  getTodaySessions: () => SessionRecord[]
  getSessionsByMode: (mode: Mode) => SessionRecord[]
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  syncStatusById: {},
  loading: false,

  loadSessions: async () => {
    set({ loading: true })
    try {
      const sessions = await listSessions()
      const sortTs = (s: SessionRecord) => (s.createdAt ?? s.tarihISO)
      const sorted = sessions.sort((a, b) => new Date(sortTs(b)).getTime() - new Date(sortTs(a)).getTime())
      const queueItems = await getQueueItems()
      set({
        sessions: sorted,
        syncStatusById: deriveSyncStatusByQueue(sorted, queueItems),
      })
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      set({ loading: false })
    }
  },

  addSession: async (session) => {
    try {
      const normalizedSession: SessionRecord = session.mod === 'deneme'
        ? { ...session, denemeMolalarSaniye: session.denemeMolalarSaniye ?? [] }
        : session

      await dbSaveSession(normalizedSession)
      const state = get()
      const sortTs = (s: SessionRecord) => (s.createdAt ?? s.tarihISO)
      const sorted = [normalizedSession, ...state.sessions].sort(
        (a, b) => new Date(sortTs(b)).getTime() - new Date(sortTs(a)).getTime(),
      )
      const nextStatus: SyncStatus = isCloudSyncEnabled() ? 'pending' : 'synced'
      set({
        sessions: sorted,
        syncStatusById: {
          ...state.syncStatusById,
          [normalizedSession.id]: nextStatus,
        },
      })
    } catch (error) {
      console.error('Failed to save session:', error)
      throw error
    }
  },

  deleteSession: async (id) => {
    try {
      await dbDeleteSession(id)
      const state = get()
      const nextSessions = state.sessions.filter((s) => s.id !== id)
      const { [id]: _deleted, ...nextSyncMap } = state.syncStatusById
      set({ sessions: nextSessions, syncStatusById: nextSyncMap })
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  },

  refreshSyncStatuses: async () => {
    try {
      const state = get()
      const queueItems = await getQueueItems()
      set({ syncStatusById: deriveSyncStatusByQueue(state.sessions, queueItems) })
    } catch (error) {
      console.error('Failed to refresh sync statuses:', error)
    }
  },

  getRecentSessions: (limit = 3) => {
    return get().sessions.slice(0, limit)
  },

  getTodaySessions: () => {
    const today = getLocalDateString()
    return get().sessions.filter((s) => getLocalDateString(new Date(s.tarihISO)) === today)
  },

  getSessionsByMode: (mode) => {
    return get().sessions.filter((s) => s.mod === mode)
  },
}))
