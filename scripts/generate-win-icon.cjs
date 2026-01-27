/**
 * public/icon-512x512.png dosyasından build/icon.ico üretir.
 * Windows .exe ve pencere ikonu için gerekli (PNG kabul etmez).
 */
const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')
const pngPath = path.join(projectRoot, 'public', 'icon-512x512.png')
const outDir = path.join(projectRoot, 'build')
const outPath = path.join(outDir, 'icon.ico')

if (!fs.existsSync(pngPath)) {
  console.warn('Uyarı: public/icon-512x512.png bulunamadı, icon.ico üretilmedi.')
  process.exit(0)
}

;(async () => {
  const { default: pngToIco } = await import('png-to-ico')
  fs.mkdirSync(outDir, { recursive: true })
  try {
    const buf = await pngToIco(pngPath)
    fs.writeFileSync(outPath, buf)
    console.log('build/icon.ico oluşturuldu.')
  } catch (err) {
    console.error('icon.ico üretilemedi:', err)
    process.exit(1)
  }
})()
