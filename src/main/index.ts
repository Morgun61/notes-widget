import { app } from 'electron'
import { join } from 'path'
import { appState } from './appState'
import { registerIpcHandlers } from './ipc/handlers'
import { startRendererServer } from './localServer'
import { createTray } from './tray'
import { createDataWindow } from './windows/dataWindow'
import { createMainWindow, getMainWindow } from './windows/mainWindow'
import { createOverlayWindow } from './windows/overlayWindow'

// The overlay is reparented into Progman/WorkerW to sit behind desktop
// icons (see native/workerw.ts). Chromium's GPU-accelerated windows
// present via a DirectComposition swap chain that DWM composites using
// its own tracked Z-order, which SetParent/SetWindowLongW don't update -
// so a hardware-accelerated overlay keeps rendering on top regardless of
// its real place in the window tree. Falling back to software rendering
// makes it obey normal Win32 Z-order again. This is app-wide since
// Electron has no per-window toggle, but this app's UI is simple enough
// that the perf cost is negligible.
app.disableHardwareAcceleration()

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    // Dev mode already serves the renderer over http:// via the Vite dev
    // server (ELECTRON_RENDERER_URL). In production there is no such
    // server, so start our own loopback one - Firebase Auth's Google
    // Sign-In popup refuses to run on a file:// origin.
    if (!process.env['ELECTRON_RENDERER_URL']) {
      await startRendererServer(join(__dirname, '../renderer'))
    }

    registerIpcHandlers()
    createDataWindow()
    createMainWindow()
    createOverlayWindow()
    createTray()
  })

  app.on('before-quit', () => {
    appState.isQuitting = true
  })
}
