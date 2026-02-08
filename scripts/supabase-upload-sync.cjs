/**
 * Bir yedek JSON dosyasını Supabase'de belirtilen kullanıcıya (e-posta) yükler.
 * Sadece bu işlem için kullan; service_role key güvende tutulmalı.
 *
 * Kullanım:
 *   set SUPABASE_URL=https://xxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...  (Supabase Dashboard → Settings → API → service_role)
 *   node scripts/supabase-upload-sync.cjs path/to/yedek.json sevgilinin@email.com
 *
 * service_role key: Supabase Dashboard → Project Settings → API → Project API keys → service_role (secret)
 */
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('');
  console.error('HATA: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ortam degiskenleri gerekli.');
  console.error('');
  console.error('PowerShell:');
  console.error('  $env:SUPABASE_URL = "https://mplndquosywhqscahzyn.supabase.co"');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY = "service_role_key_buraya"');
  console.error('  node scripts/supabase-upload-sync.cjs yedek.json email@example.com');
  console.error('');
  console.error('service_role key: Supabase Dashboard → Settings → API → service_role (secret)');
  console.error('');
  process.exit(1);
}

const jsonPath = process.argv[2];
const email = process.argv[3];

if (!jsonPath || !email) {
  console.error('Kullanim: node scripts/supabase-upload-sync.cjs <yedek.json> <hedef_email>');
  process.exit(1);
}

const absolutePath = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
if (!fs.existsSync(absolutePath)) {
  console.error('Dosya bulunamadi:', absolutePath);
  process.exit(1);
}

let payload;
try {
  const raw = fs.readFileSync(absolutePath, 'utf8');
  payload = JSON.parse(raw);
} catch (e) {
  console.error('JSON okunamadi:', e.message);
  process.exit(1);
}

if (!payload.sessions || !Array.isArray(payload.sessions)) {
  console.error('Gecersiz yedek: "sessions" dizisi gerekli.');
  process.exit(1);
}

async function main() {
  const supabaseUrl = url.replace(/\/$/, '');
  const res = await fetch(supabaseUrl + '/auth/v1/admin/users', {
    method: 'GET',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': 'Bearer ' + serviceRoleKey,
    },
  });
  if (!res.ok) {
    console.error('Kullanici listesi alinamadi:', res.status, await res.text());
    process.exit(1);
  }
  const users = await res.json();
  const user = users.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error('Bu e-postaya kayitli kullanici bulunamadi:', email);
    process.exit(1);
  }
  const userId = user.id;
  console.log('Kullanici bulundu:', user.email, '→', userId);

  const upsertRes = await fetch(supabaseUrl + '/rest/v1/sync_data', {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': 'Bearer ' + serviceRoleKey,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      data: payload,
      updated_at: new Date().toISOString(),
    }),
  });

  if (upsertRes.status === 201 || upsertRes.status === 200) {
    console.log('sync_data guncellendi. Uygulamada "Buluttan cek" yapabilir.');
    return;
  }
  if (upsertRes.status === 409 || upsertRes.status === 404) {
    const updateRes = await fetch(supabaseUrl + '/rest/v1/sync_data?user_id=eq.' + userId, {
      method: 'PATCH',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: payload, updated_at: new Date().toISOString() }),
    });
    if (updateRes.ok) {
      console.log('sync_data guncellendi. Uygulamada "Buluttan cek" yapabilir.');
      return;
    }
    console.error('Guncelleme hatasi:', updateRes.status, await updateRes.text());
    process.exit(1);
  }
  console.error('Yukleme hatasi:', upsertRes.status, await upsertRes.text());
  process.exit(1);
}

main();
