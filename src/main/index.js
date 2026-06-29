import { app, BrowserWindow, screen, utilityProcess } from 'electron'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow   = null
let splashWindow = null
let pythonProcess  = null
let whatsappProcess = null

// ─────────────────────────────────────────────
// مساعد: انتظار حتى يرد HTTP endpoint
// ─────────────────────────────────────────────
function waitForPort(port, maxMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    function tryConnect() {
      const req = http.get(`http://localhost:${port}/`, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > maxMs) {
          reject(new Error(`Timeout waiting for port ${port}`))
        } else {
          setTimeout(tryConnect, 1000)
        }
      })
      req.setTimeout(2000, () => { req.destroy() })
    }
    tryConnect()
  })
}

// ─────────────────────────────────────────────
// 1. Splash Window
// ─────────────────────────────────────────────
function createSplash() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  splashWindow = new BrowserWindow({
    width: 480,
    height: 480,
    x: Math.round((width - 480) / 2),
    y: Math.round((height - 480) / 2),
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, '../../public/Elite Control.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  })

  // dev: out/main/ → ../../src/splash.html
  // prod: resources/splash.html (via extraResources)
  const splashPath = app.isPackaged
    ? path.join(process.resourcesPath, 'splash.html')
    : path.join(__dirname, '../../src/splash.html')
  splashWindow.loadFile(splashPath)
  splashWindow.on('closed', () => { splashWindow = null })
}

// ─────────────────────────────────────────────
// 2. Main Window
// ─────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    icon: path.join(__dirname, '../../public/Elite Control.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    },
    title: 'كنترول نخبة الشمال',
    backgroundColor: '#0f172a',
    show: false,
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    // أغلق Splash وافتح النافذة الرئيسية بشكل سلس
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close()
    }
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─────────────────────────────────────────────
// 3. تحديث Splash عبر IPC
// ─────────────────────────────────────────────
function updateSplash(step, text) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `window.updateStatus && window.updateStatus(${step}, "${text}")`
    ).catch(() => {})
  }
}

// ─────────────────────────────────────────────
// 4. تشغيل الخدمات الخلفية
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 4. تشغيل الخدمات الخلفية
// ─────────────────────────────────────────────
function startBackends() {
  const isProd = app.isPackaged
  const resourcesPath = isProd ? process.resourcesPath : path.resolve('.')

  const omrEnginePath = path.join(resourcesPath, 'omr_engine')
  const wppPath = path.join(resourcesPath, 'wppconnect-master')

  // ─── Python OMR Engine ───────────────────────
  const venvSitePackages = path.join(omrEnginePath, 'venv', 'Lib', 'site-packages')
  const pythonPath = isProd 
    ? path.join(omrEnginePath, 'venv', 'Scripts', 'python.exe')
    : (process.platform === 'win32' ? 'python' : 'python3')

  const pythonEnv = {
    ...process.env,
    PYTHONPATH: venvSitePackages,
    PYTHONUNBUFFERED: '1',
  }

  console.log('[OMR] Starting OMR Engine from:', omrEnginePath)
  
  try {
    pythonProcess = spawn(pythonPath, ['-m', 'uvicorn', 'main:app', '--port', '8000', '--host', '127.0.0.1'], {
      cwd: omrEnginePath,
      env: pythonEnv,
      stdio: 'pipe',
    })
  } catch (e) {
    console.error('[OMR] Error spawning python:', e.message)
  }

  if (pythonProcess) {
    pythonProcess.stdout.on('data', (d) => console.log(`[OMR] ${d.toString().trim()}`))
    pythonProcess.stderr.on('data', (d) => {
      const msg = d.toString().trim()
      if (msg) console.log(`[OMR] ${msg}`)
    })
    pythonProcess.on('error', (e) => console.error('[OMR] Critical error:', e.message))
  }

  // ─── WhatsApp Server ─────────────────────────
  console.log('[WA] Starting WhatsApp Server via UtilityProcess from:', wppPath)
  const waScript = path.join(wppPath, 'whatsapp-server.js')
  
  whatsappProcess = utilityProcess.fork(waScript, [], {
    cwd: wppPath,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: isProd ? 'production' : 'development' }
  })

  whatsappProcess.stdout.on('data', (d) => console.log(`[WA] ${d.toString().trim()}`))
  whatsappProcess.stderr.on('data', (d) => {
    const msg = d.toString().trim()
    if (msg) console.log(`[WA] ${msg}`)
  })
  whatsappProcess.on('exit', (code) => console.log(`[WA] Process exited with code ${code}`))
}

// ─────────────────────────────────────────────
// 5. إيقاف الخدمات
// ─────────────────────────────────────────────
function killBackends() {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill('SIGTERM')
    console.log('[OMR] Stopped.')
  }
  if (whatsappProcess && !whatsappProcess.killed) {
    whatsappProcess.kill('SIGTERM')
    console.log('[WA] Stopped.')
  }
}

// ─────────────────────────────────────────────
// 6. التسلسل الرئيسي عند بدء التطبيق
// ─────────────────────────────────────────────
app.whenReady().then(async () => {
  // أظهر Splash أولاً
  createSplash()

  // ابدأ الخدمات
  startBackends()

  // انتظر OMR
  updateSplash(0, 'جاري تشغيل محرك التصحيح الآلي...')
  try {
    await waitForPort(8000, 40000)
    console.log('[OMR] ✅ Ready on port 8000')
    updateSplash(1, 'جاري تشغيل خادم WhatsApp...')
  } catch (e) {
    console.warn('[OMR] ⚠️ Timeout - continuing anyway')
    updateSplash(1, 'خادم WhatsApp...')
  }

  // انتظر WhatsApp (أقصر مهلة)
  try {
    await waitForPort(3001, 20000)
    console.log('[WA] ✅ Ready on port 3001')
    updateSplash(2, 'جاري تحميل واجهة التحكم...')
  } catch (e) {
    console.warn('[WA] ⚠️ Timeout - continuing anyway')
    updateSplash(2, 'جاري تحميل واجهة التحكم...')
  }

  // افتح النافذة الرئيسية
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  killBackends()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killBackends()
})
