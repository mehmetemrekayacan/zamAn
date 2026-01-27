import { create } from 'zustand'
import type { SessionRecord, Mode } from '../types'
import { saveSession as dbSaveSession, listSessions, deleteSession as dbDeleteSession } from '../lib/db'

export interface SessionsState {
  sessions: SessionRecord[]
  loading: boolean
  loadSessions: () => Promise<void>
  addSession: (session: SessionRecord) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  getRecentSessions: (limit?: number) => SessionRecord[]
  getTodaySessions: () => SessionRecord[]
  getSessionsByMode: (mode: Mode) => SessionRecord[]
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  loading: false,

  loadSessions: async () => {
    set({ loading: true })
    try {
      const sessions = await listSessions()
      set({ sessions: sessions.sort((a, b) => new Date(b.tarihISO).getTime() - new Date(a.tarihISO).getTime()) })
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      set({ loading: false })
    }
  },

  addSession: async (session) => {
    try {
      await dbSaveSession(session)
      const state = get()
      set({
        sessions: [session, ...state.sessions].sort(
          (a, b) => new Date(b.tarihISO).getTime() - new Date(a.tarihISO).getTime(),
        ),
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
      set({ sessions: state.sessions.filter((s) => s.id !== id) })
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  },

  getRecentSessions: (limit = 3) => {
    return get().sessions.slice(0, limit)
  },

  getTodaySessions: () => {
    const today = new Date().toISOString().split('T')[0]
    return get().sessions.filter((s) => s.tarihISO.startsWith(today))
  },

  getSessionsByMode: (mode) => {
    return get().sessions.filter((s) => s.mod === mode)
  },
}))
