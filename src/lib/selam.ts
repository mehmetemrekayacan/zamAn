/** Saate göre selamlama (isim varsa kullan) */
export function getSelam(kullaniciAdi: string): string {
  const ad = (kullaniciAdi || '').trim()
  const saat = new Date().getHours()
  let selam: string
  if (saat >= 5 && saat < 12) selam = 'Günaydın'
  else if (saat >= 12 && saat < 18) selam = 'İyi günler'
  else if (saat >= 18 && saat < 22) selam = 'İyi akşamlar'
  else selam = 'İyi geceler'
  return ad ? `${selam}, ${ad}!` : `${selam}!`
}

/** Sınav tarihine kalan gün (null ise tarih yok) */
export function getSinavKalanGun(sinavTarihi: string | null): number | null {
  if (!sinavTarihi || !sinavTarihi.trim()) return null
  const hedef = new Date(sinavTarihi)
  const bugun = new Date()
  hedef.setHours(0, 0, 0, 0)
  bugun.setHours(0, 0, 0, 0)
  const diff = Math.ceil((hedef.getTime() - bugun.getTime()) / (24 * 60 * 60 * 1000))
  return diff >= 0 ? diff : 0
}
