import { create } from 'zustand'
import type { SessionRecord, Mode } from '../types'
import { saveSession as dbSaveSession, listSessions, deleteSession as dbDeleteSession } from '../lib/db'
import { getQueueItems } from '../lib/offlineSync'
import { isCloudSyncEnabled } from '../lib/supabase'
import { startOfLocalDay } from '../lib/time'
import { buildStudyStatistics } from '../lib/studyStatistics'
import { getDataScope, isCurrentScope } from '../lib/dataScope'
import { getPendingSessions } from '../lib/localSync'

export type SyncStatus = 'pending' | 'synced' | 'failed'
export type SessionSyncMap = Record<string, SyncStatus>

function deriveSyncStatusByQueue(sessions: SessionRecord[], queueItems: Awaited<ReturnType<typeof getQueueItems>>, pendingIds: string[] = []): SessionSyncMap {
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
    result[session.id] = statusBySession.get(session.id) ?? (pendingIds.includes(session.id) ? 'pending' : 'synced')
  }

  return result
}

export interface SessionsState {
  sessions: SessionRecord[]
  syncStatusById: SessionSyncMap
  loading: boolean
  loadSessions: () => Promise<void>
  addSession: (session: SessionRecord) => Promise<void>
  updateSession: (updatedSession: SessionRecord) => Promise<void>
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
    const scope = getDataScope()
    set({ loading: true })
    try {
      const sessions = await listSessions(undefined, scope)
      const sortTs = (s: SessionRecord) => (s.createdAt ?? s.tarihISO)
      const sorted = sessions.sort((a, b) => new Date(sortTs(b)).getTime() - new Date(sortTs(a)).getTime())
      const queueItems = await getQueueItems(scope)
      const pending = scope.ownerId !== null ? await getPendingSessions(scope) : []
      if (!isCurrentScope(scope)) return
      set({
        sessions: sorted,
        syncStatusById: deriveSyncStatusByQueue(sorted, queueItems, pending.map((item) => item.id)),
      })
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      if (isCurrentScope(scope)) set({ loading: false })
    }
  },

  addSession: async (session) => {
    const scope = getDataScope()
    try {
      const normalizedSession: SessionRecord = session.mod === 'deneme'
        ? { ...session, denemeMolalarSaniye: session.denemeMolalarSaniye ?? [] }
        : session

      await dbSaveSession(normalizedSession, scope)
      if (!isCurrentScope(scope)) return
      const state = get()
      const sortTs = (s: SessionRecord) => (s.createdAt ?? s.tarihISO)
      const sorted = [normalizedSession, ...state.sessions.filter((existing) => existing.id !== normalizedSession.id)].sort(
        (a, b) => new Date(sortTs(b)).getTime() - new Date(sortTs(a)).getTime(),
      )
      const nextStatus: SyncStatus = scope.ownerId !== null && isCloudSyncEnabled() ? 'pending' : 'synced'
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

  updateSession: async (updatedSession) => {
    const scope = getDataScope()
    try {
      const record: SessionRecord = { ...updatedSession, updatedAt: new Date().toISOString() }
      await dbSaveSession(record, scope)
      if (!isCurrentScope(scope)) return
      const state = get()
      set({
        sessions: state.sessions.map((s) => (s.id === record.id ? record : s)),
      })
    } catch (error) {
      console.error('Failed to update session:', error)
      throw error
    }
  },

  deleteSession: async (id) => {
    const scope = getDataScope()
    try {
      await dbDeleteSession(id, scope)
      if (!isCurrentScope(scope)) return
      const state = get()
      const nextSessions = state.sessions.filter((s) => s.id !== id)
      const nextSyncMap = { ...state.syncStatusById }
      delete nextSyncMap[id]
      set({ sessions: nextSessions, syncStatusById: nextSyncMap })
    } catch (error) {
      console.error('Failed to delete session:', error)
      throw error
    }
  },

  refreshSyncStatuses: async () => {
    const scope = getDataScope()
    try {
      const queueItems = await getQueueItems(scope)
      const pending = scope.ownerId !== null ? await getPendingSessions(scope) : []
      if (isCurrentScope(scope)) set({ syncStatusById: deriveSyncStatusByQueue(get().sessions, queueItems, pending.map((item) => item.id)) })
    } catch (error) {
      console.error('Failed to refresh sync statuses:', error)
    }
  },

  getRecentSessions: (limit = 3) => {
    return get().sessions.slice(0, limit)
  },

  getTodaySessions: () => {
    const now = new Date()
    const today = startOfLocalDay(now)
    return buildStudyStatistics(get().sessions, now).completed.filter((session) => new Date(session.tarihISO) >= today)
  },

  getSessionsByMode: (mode) => {
    return get().sessions.filter((s) => s.mod === mode)
  },
}))
