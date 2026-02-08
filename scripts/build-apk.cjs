const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (!process.env.JAVA_HOME) {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Android', 'Android Studio', 'jbr'),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'bin', 'java.exe'))) {
        process.env.JAVA_HOME = dir;
        console.log('JAVA_HOME otomatik ayarlandi: ' + dir);
        break;
      }
    }
  }
}
if (!process.env.JAVA_HOME) {
  console.error('');
  console.error('HATA: JAVA_HOME tanımlı değil.');
  console.error('');
  console.error('APK üretmek için JDK kurulu olmalı ve JAVA_HOME ayarlanmalı.');
  console.error('  • Android Studio kurduysan: Android Studio → Settings → Build → JDK yolunu kopyala');
  console.error('  • Veya OpenJDK indir: https://adoptium.net/');
  console.error('  • Sonra PowerShell\'de (geçici):');
  console.error('    $env:JAVA_HOME = "C:\\Program Files\\Android\\Android Studio\\jbr"');
  console.error('    npm run apk:build');
  console.error('  • Kalıcı yapmak için: Sistem → Gelişmiş → Ortam Değişkenleri → JAVA_HOME ekle');
  console.error('');
  process.exit(1);
}

const projectRoot = path.join(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const localPropsPath = path.join(androidDir, 'local.properties');

let sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdkDir && process.platform === 'win32') {
  const fallback = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  if (fs.existsSync(fallback)) sdkDir = fallback;
}
if (sdkDir) {
  const sdkPath = sdkDir.replace(/\\/g, '\\\\');
  fs.writeFileSync(localPropsPath, 'sdk.dir=' + sdkPath + '\n', 'utf8');
} else {
  if (!fs.existsSync(localPropsPath) || !fs.readFileSync(localPropsPath, 'utf8').includes('sdk.dir')) {
    console.error('');
    console.error('HATA: Android SDK konumu bulunamadı.');
    console.error('');
    console.error('ANDROID_HOME tanımlı değil ve android/local.properties içinde sdk.dir yok.');
    console.error('  • Android Studio kurduysan SDK genelde: %LOCALAPPDATA%\\Android\\Sdk');
    console.error('  • PowerShell\'de (geçici):');
    console.error('    $env:ANDROID_HOME = "$env:LOCALAPPDATA\\Android\\Sdk"');
    console.error('    npm run apk:build');
    console.error('  • Veya android/local.properties dosyası oluştur, içine yaz:');
    console.error('    sdk.dir=C:\\Users\\KULLANICI\\AppData\\Local\\Android\\Sdk');
    console.error('');
    process.exit(1);
  }
}

const isWin = process.platform === 'win32';
const mode = process.env.APK_MODE || 'debug';
const task = mode === 'release' ? 'assembleRelease' : 'assembleDebug';
const gradleCmd = isWin ? `gradlew.bat ${task}` : `./gradlew ${task}`;
if (mode === 'debug') {
  console.log('');
  console.log('Debug APK uretiliyor (imzali, telefona yuklemek icin uygun).');
  console.log('Cikti: android/app/build/outputs/apk/debug/app-debug.apk');
  console.log('');
}
execSync(gradleCmd, { cwd: androidDir, stdio: 'inherit', shell: true });
