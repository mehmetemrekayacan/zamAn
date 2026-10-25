/**
 * Eski sync_data yazıcısı sürümlü eşitlemeyi atladığı için devre dışıdır.
 * Yedekleri uygulamadaki doğrulanan içe aktarma akışıyla geri yükleyin.
 */
console.error('Bu yardımcı eski sync_data tablosuna yazdığı için devre dışı bırakıldı.');
console.error('Yedeği hedef hesaba giriş yaptıktan sonra Ayarlar > Veri > İçe aktar ile yükleyin.');
console.error('Sunucu geçişi için docs/ASAMA-4-SENKRONIZASYON.md belgesini kullanın.');
process.exitCode = 1;
