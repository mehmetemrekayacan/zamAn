import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

// npm run build -- --manifest ardından çalıştırılır. Dinamik importlar ilk yüklemeye eklenmez.
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'))
const entry = Object.keys(manifest).find(key => manifest[key].isEntry)
if (!entry) throw new Error('Derleme giriş dosyası bulunamadı.')
const visited = new Set()
function visit(key) {
  if (visited.has(key)) return
  visited.add(key)
  for (const imported of manifest[key].imports ?? []) visit(imported)
}
visit(entry)
const files = [...visited].map(key => manifest[key].file).filter(file => file.endsWith('.js'))
const bytes = files.reduce((sum, file) => sum + statSync(`dist/${file}`).size, 0)
const gzipBytes = files.reduce((sum, file) => sum + gzipSync(readFileSync(`dist/${file}`)).length, 0)
const result = { initialJsBytes: bytes, initialJsGzipBytes: gzipBytes, files }
const lazyScreens = ['src/components/SettingsModal.tsx', 'src/components/DenemeManager.tsx', 'src/components/analytics/AnalyticsPage.tsx']
for (const screen of lazyScreens) {
  if (!manifest[screen]?.isDynamicEntry || visited.has(screen)) throw new Error(`${screen} başlangıç paketinden ayrılmamış.`)
}
result.lazyScreens = lazyScreens
console.log(JSON.stringify(result, null, 2))
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n')
