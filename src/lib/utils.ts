import type { SessionRecord } from '../types'
import { DENEME_TEMPLATES } from '../store/timer'

/**
 * Deneme seansı için anlamlı etiket (başlık) türetir.
 * Varsa session.not alanı, yoksa templateName kullanılır.
 */
export function getSubjectLabel(session: SessionRecord): string {
  if (session.not) return session.not
  
  if (session.mod === 'deneme') {
    return getDenemeTemplateName(session)
  }

  const labels: Record<string, string> = {
    serbest: 'Kronometre',
    gerisayim: 'Zamanlayıcı',
    ders60mola15: '60/15',
    deneme: 'Deneme'
  }
  return labels[session.mod] || 'Seans'
}

/**
 * SessionRecord içindeki şablon adını bulur.
 */
export function getDenemeTemplateName(session: SessionRecord): string {
  // 1. Eğer seansa özel kaydedilmiş şablon ismi varsa direkt dön.
  if (session.templateName) return session.templateName

  // 2. Eğer templateId varsa `DENEME_TEMPLATES` içinden bulalım.
  if (session.templateId) {
    const template = DENEME_TEMPLATES.find((t) => t.id === session.templateId)
    if (template) return template.label
  }

  // 3. İkisi de yoksa direkt 'Genel Deneme' dön, bölüm isimlerini '+ ile birleştirme!'
  return 'Genel Deneme'
}
