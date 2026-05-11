/** Yerel tarih string (YYYY-MM-DD) - timezone'dan bağımsız */
export function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':')
}

/** Saniye cinsinden süreyi okunabilir formatta gösterir (örn: "2 dk 30 sn", "1 saat 5 dk") */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} saat`)
  if (mins > 0) parts.push(`${mins} dk`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs} sn`)
  return parts.join(' ')
}

/** Dakika cinsinden süreyi kullanıcı dostu formata çevirir (örn: 130 → "2 sa 10 dk", 45 → "45 dk", 0 → "0 dk") */
export function formatMinutesHuman(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes))
  const hours = Math.floor(m / 60)
  const mins = m % 60
  if (hours > 0 && mins > 0) return `${hours} sa ${mins} dk`
  if (hours > 0) return `${hours} sa`
  return `${mins} dk`
}

/** Grafik için kısa format (örn: "1s 30dk", "45dk") */
export function formatSecondsShort(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60
  if (hours > 0) return mins > 0 ? `${hours}s ${mins}dk` : `${hours}s`
  if (mins > 0) return secs > 0 ? `${mins}dk ${secs}sn` : `${mins}dk`
  return `${secs}sn`
}

/** Sanal duvar saati (HH:mm) + elapsedMs -> HH:mm:ss */
export function getVirtualWallClockTime(startTimeHHmm: string, elapsedMs: number): string {
  const [hStr, mStr] = startTimeHHmm.split(':')
  const rawHours = Number(hStr)
  const rawMinutes = Number(mStr)

  const hours = Number.isFinite(rawHours) ? Math.max(0, rawHours) : 0
  const minutes = Number.isFinite(rawMinutes) ? Math.max(0, rawMinutes) : 0

  const baseSeconds = ((hours % 24) * 3600) + ((minutes % 60) * 60)
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const daySeconds = 24 * 3600
  const totalSeconds = (baseSeconds + elapsedSeconds) % daySeconds

  const hh = Math.floor(totalSeconds / 3600)
  const mm = Math.floor((totalSeconds % 3600) / 60)
  const ss = totalSeconds % 60

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
