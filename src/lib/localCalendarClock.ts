import { useSyncExternalStore } from 'react'
import { addLocalDays, getLocalDateString, localDateFromKey, startOfLocalDay } from './time'

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined
let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

export function localCalendarSnapshot(): string {
  const now = new Date()
  return `${getLocalDateString(now)}|${now.getTimezoneOffset()}|${timezone}`
}

/** Gece yarısındaki render yarışında takvim anahtarıyla farklı günleri karıştırmaz. */
export function dateForCalendar(snapshot: string): Date {
  const now = new Date()
  const day = snapshot.split('|')[0]
  return getLocalDateString(now) === day ? now : localDateFromKey(day)
}

function schedule() {
  clearTimeout(timer)
  if (!listeners.size) return
  const now = new Date()
  const next = addLocalDays(startOfLocalDay(now), 1)
  timer = setTimeout(refresh, Math.max(1, next.getTime() - now.getTime() + 5))
}

function refresh() {
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  for (const listener of listeners) listener()
  schedule()
}

export function subscribeLocalCalendar(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refresh)
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('focus', refresh)
      window.addEventListener('pageshow', refresh)
    }
    schedule()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    clearTimeout(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refresh)
    if (typeof window.removeEventListener === 'function') {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }
}

export function useLocalCalendar(): string {
  return useSyncExternalStore(subscribeLocalCalendar, localCalendarSnapshot, localCalendarSnapshot)
}
