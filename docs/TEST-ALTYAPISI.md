# Test altyapısı ve başlangıç ölçümleri

24 Ekim 2026 — yol haritasının 1. aşaması.

## Komutlar

| Komut | Kapsam |
| --- | --- |
| `npm test` | Tüm testler; eski tsx scriptlerinin yerini alır |
| `npm run test:unit` | Geriye uyumlu, tüm testleri çalıştıran eşdeğer komut |
| `npm run test:unit:watch` | İzleme modu |
| `npm run test:data` | Veri katmanı ve izolasyon testleri |
| `npm run test:sync` | PGlite üzerinde SQL, eski veri geçişi ve iki cihaz protokolü |
| `npm run test:rozetler` | Rozet testleri |
| `npm run typecheck` | Uygulama, test kodu, Vitest ayarları ve setup için TypeScript kontrolü |
| `npm run lint` | Üretilmiş çıktılar hariç statik kontrol |
| `npm run build` | Üretim derlemesi |

PowerShell script politikası nedeniyle gerekirse `npm` yerine `npm.cmd` kullanılır.
Eski `scripts/test-all.ts` ve `scripts/test-rozetler.ts` kaldırıldı. Güncel olmayan
puan beklentileri taşınmadı; mevcut puan testleri korunurken rozet ve tahmin
kontrolleri Vitest'e aktarıldı.

## Testlerin veri sınırı

- `vitest.config.ts` içindeki `envDir: false`, `.env.local` dahil env dosyalarını yüklemez. Test Supabase değişkenleri boştur.
- `vitest.setup.ts`, gerçek SDK'nin `createClient` çağrısını hata verecek şekilde değiştirir. Her testte `fetch` de engellenir. Bir test yanlışlıkla bulut değişkenlerini etkinleştirse bile gerçek istemci kurulamaz.
- `fake-indexeddb` yalnızca geliştirme bağımlılığıdır. Her test ayrı bir bellek içi IndexedDB fabrikasıyla başlar; tarayıcı profiline veya üretim veritabanına erişmez.
- localStorage/sessionStorage bellekte tutulur ve her test öncesi temizlenir. Mock'lar, ortam değişkeni değişiklikleri ve sahte saatler test sonunda geri alınır.
- Testler ve yardımcılar Tailwind kaynak taramasından çıkarılmıştır; test verilerindeki kelimeler üretim CSS'i oluşturmaz.
- Bu ortam gerçek tarayıcı, SQL migration'ları, RLS, işletim sistemi arka plan davranışı veya iki fiziksel cihaz için uçtan uca doğrulama sağlamaz.

## Yeni veri testi yazarken

1. Testi `src/test/data/*.test.ts` altında oluştur.
2. Testin başında `await loadDataEnvironment()` çağır. Bu yardımcı, modül içindeki eski DB bağlantılarını kullanmamak için modül önbelleğini sıfırlar. DB modüllerini ayrıca statik import etme.
3. `makeSession({ id: '...' })` ile sabit veriler üret; birden çok kayıt için farklı kimlik ver.
4. Bulut gerekiyorsa `createSupabaseStub()` oluştur ve `getSupabase` fonksiyonunu `vi.spyOn` ile bu istemciye yönlendir.
5. Her beklenen bulut sorgusu için `respondOnce({ data, error })` tanımla; `calls` ile gönderilen tablo/filtre/değerleri ve `pendingResponses` ile kullanılmayan yanıtları denetle. Yanıtı tanımlanmayan istek hata verir.
6. Duvar saatini kontrol etmek için `Date.now` spy'ı kullan. IndexedDB'nin asenkron görevleri nedeniyle tüm zamanlayıcıları dondururken dikkat et.

Örnek:

```ts
const { queue, supabase } = await loadDataEnvironment()
const remote = createSupabaseStub('test-user-a')
vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
remote.respondOnce({ data: null, error: null })
await queue.enqueueSync('upsert_session', 'example', makeSession({ id: 'example' }))
expect(await queue.processQueue()).toMatchObject({ flushed: 1 })
expect(await queue.getQueueLength()).toBe(0)
```

Stub yalnızca kullanılan sorgu zincirini kaydeder ve tanımlanan yanıtları döndürür.
Sunucudaki çakışma çözümünü veya RLS'yi uygulamaz. Eksik sorgu yöntemleri ihtiyaç
oldukça açıkça eklenmelidir; her isteğe otomatik başarılı yanıt verilmemelidir.

## Bu aşamada çalışan kontroller

- Seans kaydetme, aynı kimliği güncelleme, moda göre filtreleme, silme.
- Testler arasında boş IndexedDB ve temiz localStorage/sessionStorage.
- İptal edilmiş IndexedDB transaction'ında eski kaydın korunması. Bu, gelecek atomik içe aktarma düzeltmesine temel sağlar; mevcut içe aktarmanın atomik olduğunu göstermez.
- Geçerli yedeği dışa aktarma/geri yükleme; JSON olmayan dosyada mevcut kayıtları koruma.
- Kuyrukta aynı seansın son işlemini tutma; oturum yokken kuyruk koruma; girişten sonra başarılı gönderimi çıkarma.
- Geçici hata, bekleme süresine uyma ve başarılı yeniden deneme.
- Bulut okuma hatasının yerel kaydı değiştirmeden bildirilmesi.
- Gerçek bulut istemcisi ve fetch engeli; tanımlanmamış sahte yanıtın hata vermesi.
- Rozet ve tahmin kontrolleri; mevcut puanlama, zaman ve sayaç testleri.

Sayaç testleri her vaka başında başlangıç store durumuna döner. Böylece önceki
testin modu sonraki testi etkilemez. Yeniden açılış senaryolarında ise kaydedilen
storage tutulup modül tekrar yüklenerek persist/hydration ayrıca sınanmalıdır.

## Sonraki aşamalarda eklenecek regresyon senaryoları

Aşağıdaki tabloda IMPORT-01/02/03, 2. aşamada `src/test/data/backup.test.ts`
ile otomatikleştirildi. ACCOUNT-01/02/03, 3. aşamada `accounts.test.ts` ve
`accountLifecycle.test.ts` ile tamamlandı. Diğer aşamaların kabul durumu kendi
sonuç belgeleri ve yol haritasıyla takip edilir.
Her hata kendi aşamasında önce başarısız testle gösterilip sonra düzeltilecek.

| Kimlik | Aşama | Senaryo ve beklenen sonuç |
| --- | --- | --- |
| IMPORT-01 | 2 | `sessions: {}` veya eksik/geçersiz alanlar: eski seanslar ve ayarlar korunur |
| IMPORT-02 | 2 | Desteklenmeyen yedek sürümü: işlem başlamadan hata |
| IMPORT-03 | 2 | Yazmanın ortasında hata: yarım veri/yarım kuyruk oluşmaz |
| ACCOUNT-01 | 3 | A'nın kuyruğu beklerken B'ye geçiş: A verisi B'ye gönderilmez |
| ACCOUNT-02 | 3 | Gönderim sürerken hesap değişimi ve çıkış: sahiplik korunur |
| ACCOUNT-03 | 3 | Sahibi bilinmeyen eski kuyruk: yeni hesaba sessiz aktarılmaz |
| SYNC-01 | 4 | A yeni, B eski sürüm: B'nin gönderimi A'nın değişikliğini ezmez |
| SYNC-02 | 4 | A siler, B çevrimdışı eski kopyayla döner: kayıt yeniden oluşmaz |
| SYNC-03 | 4 | Pull: uzak zaman damgası korunur, yeniden gönderim oluşmaz |
| SYNC-04 | 4 | Tekrarlanan/eşzamanlı sync ve ayar hatası: sonuç tutarlı, hata görünür |
| RECOVERY-01 | 5 | Kurtarma ekranında bekleme: çalışma süresine eklenmez |
| RECOVERY-02 | 5 | Duraklatılmış veya bitmiş-kaydedilmemiş seansı yeniden açma: süre, duraklama ve kayıt taslağı korunur |
| RECORD-01 | 5 | Çift tıklama, kayıt hatası, tekrar deneme: tek seans oluşur |
| RECORD-02 | 5 | Bitiş ekranında kısayol/mod geçişi: kayıt taslağı değişmez |
| DATE-01 | 6 | Türkiye gece yarısı ve takvim sınırları: grafik, seri ve özet aynı günü kullanır |
| DATE-02 | 6 | Saat/gün sınırını aşan çalışma ve duraklama: yalnızca aktif süre doğru aralıklara dağılır |

İki cihazlı senaryolarda ayrı yerel depolar ve paylaşılan uzak durum gerekir.
Mevcut stub sorgu/yanıt akışının sınanmasına temel sağlar; bu senaryolarda ayrıca
uygun uzak durum modeli ve migration/gerçek veritabanı kontrolleri eklenecektir.

## Başlangıç ve 1. aşama sonuçları

| Ölçüm | İnceleme öncesi temel | 1. aşama |
| --- | --- | --- |
| Test dosyası / test | 3 / 64 | 8 / 84, tamamı geçti |
| Standart `npm test` | Güncel olmayan tsx scripti | Başarılı |
| Karıştırılmış test sırası | Ölçülmedi | 84 geçti; seed `24102026` |
| TypeScript (test setup dahil) | Ayrı komut yok | `npm run typecheck` başarılı |
| Değişen TS dosyalarında lint | — | Hata yok |
| Genel lint | 18 hata, 2 uyarı | 17 hata, 0 uyarı; aşağıdaki mevcut kaynak hataları |
| Üretim derlemesi | Başarılı | Başarılı |
| Ana JS | 668,50 kB; gzip 183,76 kB | Aynı: 668,50 kB; gzip 183,76 kB |
| React JS | 193,36 kB; gzip 61,03 kB | Aynı |
| CSS | 33,88 kB; gzip 7,33 kB | Aynı; test dosyaları üretim taramasına katılmaz |
| localStorage tick yazımı | 10 tick / 10 yazma (izole inceleme kontrolü) | Üretim sayaç kodu değiştirilmedi |
| Tarayıcı render/açılış süresi | Ölçülmedi | 7. aşamada ölçülecek |

Genel lint hâlâ başarısızdır. Üretilmiş Android çıktısının kapsamdan çıkarılması
bir hata ve iki uyarıyı kaldırdı; kaynak hataları kuralları kapatılarak gizlenmedi:

| Dosya | Hata sayısı | Tür |
| --- | --- | --- |
| `FinishScreen.tsx` | 1 | Effect içinde senkron setState |
| `SettingsModal.tsx` | 2 | `any` |
| `TimerHero.tsx` | 1 | Effect içinde senkron setState |
| `Toast.tsx` | 1 | Effect içinde senkron setState |
| `notifications.ts` | 3 | `@ts-ignore` |
| `sync.ts` | 1 | Kullanılmayan değişken |
| `timerStrategies.ts` | 7 | Kullanılmayan parametreler |
| `sessions.ts` | 1 | Kullanılmayan değişken |

Derlemede büyük paket, etkisiz dinamik import ve eski Browserslist verisi
uyarıları sürüyor. Bunlar bu aşamada performans düzelmiş gibi değerlendirilmedi.

2. aşama sonrasında toplam 117 test vardır; genel lint'te 16 mevcut kaynak
hatası kalmıştır. Güncel sonuçlar ve transaction kapsamı
[2. aşama belgesinde](ASAMA-2-YEDEKLEME.md) bulunur.

25 Ekim 2026: 3. aşamanın hesap ayrımı için 25 test bulunuyor. Mevcut çalışma
alanındaki sonraki aşama hazırlıklarıyla birlikte 173 test geçti; TypeScript ve
üretim derlemesi başarılı, genel lint'te 13 mevcut hata kaldı. Kapsam ve canlı
geçiş sınırları [3. aşama belgesinde](ASAMA-3-HESAPLAR.md) kayıtlıdır.

26 Ekim 2026: 4. aşamanın yerel hazırlığıyla önce 189 test geçti. Bunların 44'ü
PGlite üzerinde eski veri geçişi, SQL yetkileri, RPC ve cihaz senaryolarını
kapsar. Canlı Supabase'e uygulanmış migration olarak değerlendirilmez.
Geçiş dosyaları ve kalan işlemler [4. aşama belgesinde](ASAMA-4-SENKRONIZASYON.md) bulunur.

Aynı gün canlı şema farkları ve TRUNCATE yetkisi kontrolleriyle toplam **191 test**
(46 PostgreSQL testi) geçti. Canlı veri yedeği yerel PostgreSQL'e geri yüklenip
alan ve içerik özetleri doğrulandı; v3 migration canlıya uygulandı. Canlıda
rollback edilen RPC/RLS testleri ve anonim REST erişim kontrolleri de geçti.
Vercel yayını ile fiziksel iki cihaz kontrolü kullanıcı yayınından sonra yapılacak.

26 Ekim 2026: 5. aşamada **231 test** (18 dosya) geçti. Yeni 40 test seans
kurtarma, bitiş taslağı, beş modda kayıt hatası/tekrar deneme, yedek uyumu ve
web/Electron kısayollarını kapsar. İlk 15 regression eski kodda başarısızdı.
TypeScript ve üretim derlemesi başarılı; değişen kaynaklar lint temiz,
genel lint'te 4 mevcut hata kaldı (Toast 1, notifications 3).
[5. aşama raporu](ASAMA-5-SEANS-YASAM-DONGUSU.md) kurtarma kurallarını ve
gerçek cihaz kabulü sınırını açıklar.

26 Ekim 2026: 6. aşamada **275 test** (23 dosya) karıştırılmış sırada da geçti
(seed 26102026). Yeni 44 test yerel gece yarısı, hafta/ay/yıl ve DST sınırlarını,
net çalışma aralıklarını, eski veri gösterimini ve gerçek PostgreSQL protokolünü
kapsar. Testlerin varsayılan TZ'si Europe/Istanbul olarak sabitlendi; DST testleri
sonrasında eski varsayılan saate dönüş, test sırasından bağımsızdır.
Gerçek veri yedeği PGlite'a geri yüklendi; mevcut alanlar korundu ve günlük/saatlik
toplamlar eşleşti. Canlı ek migration ve rollback edilen RPC testleri de başarılı.
[6. aşama raporu](ASAMA-6-TARIH-ISTATISTIK.md) yayın/cihaz sınırlarını açıklar.
