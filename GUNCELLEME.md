# Otomatik Güncelleme Sistemi

Uygulama artık **remote URL** modunda çalışıyor. Yani:

1. **Vercel'e deploy** yapınca tüm kullanıcılar (Windows, Android) **anında** güncelleme alır
2. Kullanıcıların tekrar yüklemesi veya yeni APK/EXE indirmesi **gerekmez**

## Nasıl Çalışıyor?

- **Windows (Electron):** Paketlenmiş .exe uygulama her açıldığında Vercel URL'inden yüklenir
- **Android (APK):** Release APK (`npm run apk:release`) remote modda — uygulama Vercel'den yüklenir
- **PWA:** Tarayıcıdan zaten her girişte güncel sürüm yüklenir

## Yapmanız Gerekenler

### 1. URL'i Ayarlayın

`app-config.cjs` dosyasında `APP_URL` değişkenini **Vercel'deki gerçek URL'inizle** değiştirin:

```js
const APP_URL = 'https://zaman-olcer.vercel.app'  // veya kendi domain: https://zaman.siteniz.com
```

Veya ortam değişkeni ile:
```bash
set ZAMAN_APP_URL=https://zaman-olcer.vercel.app
npm run win
```

### 2. İlk Dağıtım (Tek Seferlik)

- **Windows:** `npm run win` → release klasöründeki .exe'yi kullanıcılara verin
- **Android:** `npm run apk:release` → APK'yı kullanıcılara verin

### 3. Sonraki Güncellemeler

1. Kodu düzeltin / özellik ekleyin
2. `git push` (Vercel otomatik deploy eder)
3. **Hepsi bu.** Kullanıcılar uygulamayı bir sonraki açışlarında güncel sürümü alır.

## Notlar

- **Offline:** İnternet yokken uygulama önceki cache ile açılabilir (PWA cache). Tam offline desteği için ileride iyileştirme yapılabilir.
- **Android debug:** `npm run apk:debug` local modda çalışır (test için)
- **Android release:** `npm run apk:release` remote modda — dağıtım için
