import type { SessionRecord } from '../types'
import { DENEME_TEMPLATES } from '../store/timer'

/**
 * Deneme seansı için anlamlı etiket (başlık) türetir.
 * Varsa session.not alanı, yoksa bölüm adlarının birleşimi kullanılır.
 */
export function getSubjectLabel(session: SessionRecord): string {
  if (session.not) return session.not
  if (session.bolumler && session.bolumler.length > 0) {
    return session.bolumler.map((b) => b.ad).join(' + ')
  }
  return 'Deneme'
}

/**
 * SessionRecord içindeki şablon adını bulur veya retro-fit mantığıyla tahmin eder.
 */
export function getDenemeTemplateName(session: SessionRecord): string {
  // 1. Eğer seansa özel kaydedilmiş şablon ismi varsa direkt dön.
  if (session.templateName) return session.templateName

  // 2. Eğer templateId varsa `DENEME_TEMPLATES` içinden bulalım.
  if (session.templateId) {
    const template = DENEME_TEMPLATES.find((t) => t.id === session.templateId)
    if (template) return template.label
  }

  // 3. İkisi de yoksa, bölüm adlarıyla (retro-fit) eşleştirme yapalım.
  if (session.bolumler && session.bolumler.length > 0) {
    const sectionNames = session.bolumler.map((b) => b.ad).join(',')
    for (const t of DENEME_TEMPLATES) {
      if (t.bolumler.map((b) => b.ad).join(',') === sectionNames) {
        return t.label
      }
    }
    // Eşleşme bulamazsa tüm bölümlerin isimlerini yan yana yaz.
    return session.bolumler.map((b) => b.ad).join(' + ')
  }

  return 'Genel Deneme'
}
