const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const iconSrc = path.join(root, 'public', 'icon-512x512.png');
const iconDest = path.join(assetsDir, 'icon.png');

if (!fs.existsSync(iconSrc)) {
  console.warn('Uyari: public/icon-512x512.png bulunamadi, ikon atlanacak.');
  process.exit(0);
}
fs.mkdirSync(assetsDir, { recursive: true });
fs.copyFileSync(iconSrc, iconDest);
console.log('assets/icon.png hazir (public/icon-512x512.png kopyalandi).');
