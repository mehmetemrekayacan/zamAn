import type { SessionRecord } from '../types'

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
