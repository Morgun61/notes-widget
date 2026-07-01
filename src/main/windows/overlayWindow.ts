import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { loadRendererPage } from '../loadRenderer'
import { attachToDesktop, isWindowHandleValid } from '../native/workerw'

let overlayWindow: BrowserWindow | null = null
let workerWHandle: unknown | null = null
let watchdogTimer: NodeJS.Timeout | null = null
let attachFailureCount = 0

const WATCHDOG_INTERVAL_MS = 5000
const MAX_ATTACH_FAILURES = 5

function computeBounds(): { x: number; y: number; width: number; height: number } {
  const { bounds } = screen.getPrimaryDisplay()
  return bounds
}

function repositionOverlay(): void {
  if (!overlayWindow) return
  overlayWindow.setBounds(computeBounds())
}

function tryEmbedBehindDesktop(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  // Clear Chromium's own "always on top" intent through Electron's API
  // BEFORE reparenting. Chromium's HWNDMessageHandler actively re-asserts
  // HWND_TOPMOST on incoming window messages as long as its internal
  // always-on-top flag is true - so if we leave that flag set and only
  // clear WS_EX_TOPMOST ourselves via raw Win32 calls, Chromium immediately
  // fights back and puts it back the moment our own SetParent/SetWindowPos
  // calls generate window position messages.
  overlayWindow.setAlwaysOnTop(false)

  const handle = attachToDesktop(overlayWindow.getNativeWindowHandle())
  if (handle) {
    workerWHandle = handle
    attachFailureCount = 0
  } else {
    attachFailureCount++
    console.log('[workerw] attach FAILED, failure count =', attachFailureCount)
  }
}

function startWatchdog(): void {
  if (watchdogTimer) return

  watchdogTimer = setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return

    if (workerWHandle && isWindowHandleValid(workerWHandle)) return

    // The WorkerW we attached to is gone (e.g. Explorer restarted) or we
    // never managed to attach yet - retry.
    workerWHandle = null
    tryEmbedBehindDesktop()

    if (!workerWHandle && attachFailureCount >= MAX_ATTACH_FAILURES && watchdogTimer) {
      // Give up on desktop embedding for this session; degrade gracefully
      // to a normal floating always-on-top panel instead of staying broken.
      overlayWindow?.setAlwaysOnTop(true)
      clearInterval(watchdogTimer)
      watchdogTimer = null
    }
  }, WATCHDOG_INTERVAL_MS)
}

export function createOverlayWindow(): BrowserWindow {
  const { x, y, width, height } = computeBounds()

  overlayWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    // Not alwaysOnTop at creation: Chromium latches this as an internal
    // flag it actively re-enforces (see tryEmbedBehindDesktop). Only the
    // watchdog's give-up path turns it on, for the floating fallback case.
    alwaysOnTop: false,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/overlayPreload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  // Read-only display panel - never intercepts clicks from the desktop
  // or windows underneath it.
  overlayWindow.setIgnoreMouseEvents(true)

  loadRendererPage(overlayWindow, 'overlay')

  screen.on('display-metrics-changed', repositionOverlay)
  screen.on('display-added', repositionOverlay)
  screen.on('display-removed', repositionOverlay)

  tryEmbedBehindDesktop()
  startWatchdog()

  return overlayWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}
