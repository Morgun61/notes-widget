import { app } from 'electron'
import { join } from 'path'
import { appState } from './appState'
import { registerIpcHandlers } from './ipc/handlers'
import { startRendererServer } from './localServer'
import { createTray } from './tray'
import { createDataWindow } from './windows/dataWindow'
import { createMainWindow, getMainWindow } from './windows/mainWindow'
import { createOverlayWindow, getOverlayWindow } from './windows/overlayWindow'

if (process.platform === 'win32') {
  // The overlay is reparented into Progman/WorkerW (see native/workerw.ts).
  // Chromium's GPU-accelerated windows present via a DirectComposition
  // swap chain that DWM composites using its own tracked Z-order, which
  // SetParent/SetWindowLongW don't update - so a hardware-accelerated
  // overlay keeps rendering on top regardless of its real place in the
  // window tree. Falling back to software rendering makes it obey normal
  // Win32 Z-order again. This is app-wide since Electron has no
  // per-window toggle, but this app's UI is simple enough that the perf
  // cost is negligible. Windows-only: macOS/Linux don't reparent at all.
  app.disableHardwareAcceleration()

  // Chromium's Native Window Occlusion tracker (Windows-only feature, a
  // no-op elsewhere) watches each window's on-screen rect and
  // automatically stops rendering / hides windows it thinks are occluded
  // or off-screen. Once the overlay is reparented it looks exactly like
  // that to Chromium, so it silently drops WS_VISIBLE - the window is
  // still "shown" from Electron's point of view but is invisible at the
  // Win32 level. Must disable this before app.whenReady() creates any
  // windows.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}

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

    // The overlay is forcibly reparented into Explorer's WorkerW (see
    // overlayWindow.ts) - a real Win32 window-tree relationship that
    // belongs to a process other than ours. Letting the OS tear it down
    // as a side effect of our whole process dying at once - rather than
    // closing it ourselves first while we're still alive to handle the
    // resulting messages - can leave Explorer without a repaint signal
    // for that screen region, so the last frame stays stuck on the
    // desktop after the app has fully quit.
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.hide()
      overlay.destroy()
    }
  })
}
