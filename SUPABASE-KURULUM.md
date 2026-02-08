# Supabase Kurulum — Kayıt Ol / Giriş Yap

## 1. Supabase Projesi Oluştur

1. [supabase.com](https://supabase.com) → Giriş yap
2. **New Project** → Proje adı (örn: `zaman-olcer`), şifre belirle, bölge seç
3. Proje oluşmasını bekle (~2 dk)

## 2. URL ve Anon Key Al

1. Sol menüden **Settings** (dişli) → **API**
2. **Project URL** → Kopyala (örn: `https://abcdefgh.supabase.co`)
3. **Project API keys** bölümünde:
   - **anon** / **public** key → Kopyala (uzun, `eyJ...` ile başlayan JWT)

## 3. .env.local Dosyasını Doldur

Proje kökünde `.env.local` dosyası oluştur (veya düzenle):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxxx...
```

- `VITE_SUPABASE_URL` → Project URL (Settings → API)
- `VITE_SUPABASE_ANON_KEY` → anon/public key (eyJ... ile başlayan)

⚠️ **service_role** key kullanma — sadece **anon** key kullan.

## 4. Tabloyu Oluştur

1. Supabase Dashboard → **SQL Editor**
2. `supabase-sync.sql` dosyasının içeriğini yapıştır
3. **Run** tıkla

## 5. Auth Ayarları (isteğe bağlı)

- **Authentication** → **Providers** → Email açık (varsayılan)
- **Authentication** → **URL Configuration** → Site URL: `https://zam-an.vercel.app` ekleyebilirsin

## 6. Test

```bash
npm run dev
```

Ayarlar → Aşağı kaydır → **"Hesap (online senkron)"** görünmeli (İsim, E-posta, Şifre, Kayıt ol, Giriş yap).
