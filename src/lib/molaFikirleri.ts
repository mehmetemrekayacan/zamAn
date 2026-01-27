/** Mola veya deneme arasında gösterilecek kısa öneriler */
export const MOLA_FIKIRLERI: string[] = [
  'Gözlerini 20 saniye kapat.',
  'Bir bardak su al.',
  '2 dakika esneme yap.',
  'Pencereyi aç, derin nefes al.',
  'Boynunu hafifçe sağa sola çevir.',
  'Bir şey atıştır (kuruyemiş, meyve).',
  'Kısa bir yürüyüş yap.',
  'Sırtını dikleştir, omuzlarını gevşet.',
  'Masadan kalk, birkaç adım at.',
  'Telefonsuz 2 dakika geçir.',
]

export function getRandomMolaFikri(): string {
  return MOLA_FIKIRLERI[Math.floor(Math.random() * MOLA_FIKIRLERI.length)]
}
