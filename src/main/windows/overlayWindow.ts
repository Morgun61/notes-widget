import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { loadRendererPage } from '../loadRenderer'

// The Progman/WorkerW reparenting trick (native/workerw.ts) is Windows-only
// Win32 API surface - koffi.load('user32.dll') runs as a module-level side
// effect there, so even importing that module on macOS/Linux would throw
// immediately. Load it lazily, and only on Windows.
type WorkerWModule = typeof import('../native/workerw')
let workerw: WorkerWModule | null = null
const IS_WINDOWS = process.platform === 'win32'

let overlayWindow: BrowserWindow | null = null
let workerWHandle: unknown | null = null
let watchdogTimer: NodeJS.Timeout | null = null
let attachFailureCount = 0

// The watchdog below exists to force the overlay back on screen whenever
// Chromium/Windows hides it behind our back. That same logic would just as
// happily undo an intentional hideOverlayWindow() call (e.g. on sign-out)
// within one watchdog tick, since forceShowWindow doesn't know the
// difference between "hidden by accident" and "hidden on purpose". This
// flag is what tells it to stand down.
let desiredVisible = true

const WATCHDOG_INTERVAL_MS = 5000
const MAX_ATTACH_FAILURES = 5

// Covers every connected display, not just the primary one - a monitor
// plugged in later (or swapped for one with a different resolution) is
// picked up automatically since this is recomputed on every
// display-added/removed/metrics-changed event below.
function computeBounds(): { x: number; y: number; width: number; height: number } {
  const displays = screen.getAllDisplays()
  const left = Math.min(...displays.map((d) => d.bounds.x))
  const top = Math.min(...displays.map((d) => d.bounds.y))
  const right = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
  const bottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function repositionOverlay(): void {
  if (!overlayWindow) return
  overlayWindow.setBounds(computeBounds())
}

function tryEmbedBehindDesktop(): void {
  if (!overlayWindow || overlayWindow.isDestroyed() || !workerw) return

  // Clear Chromium's own "always on top" intent through Electron's API
  // BEFORE reparenting. Chromium's HWNDMessageHandler actively re-asserts
  // HWND_TOPMOST on incoming window messages as long as its internal
  // always-on-top flag is true - so if we leave that flag set and only
  // clear WS_EX_TOPMOST ourselves via raw Win32 calls, Chromium immediately
  // fights back and puts it back the moment our own SetParent/SetWindowPos
  // calls generate window position messages.
  overlayWindow.setAlwaysOnTop(false)

  const handle = workerw.attachToDesktop(overlayWindow.getNativeWindowHandle())
  if (handle) {
    workerWHandle = handle
    attachFailureCount = 0
  } else {
    attachFailureCount++
    console.log('[workerw] attach FAILED, failure count =', attachFailureCount)
  }
}

function startWatchdog(): void {
  if (!IS_WINDOWS || watchdogTimer) return

  watchdogTimer = setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed() || !workerw) return
    if (!desiredVisible) return

    // Electron's own show() races with our reparenting: it appears to
    // succeed immediately but Chromium's internal native show handling
    // finishes asynchronously afterward and can clear WS_VISIBLE again on
    // its own. Re-asserting on every tick means whenever that race loses,
    // it self-heals within one interval instead of staying invisible.
    workerw.forceShowWindow(overlayWindow.getNativeWindowHandle())

    if (workerWHandle && workerw.isWindowHandleValid(workerWHandle)) return

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

// macOS/Linux have no equivalent of Progman/WorkerW reparenting reachable
// through Electron's public API - approximating "sits with the desktop"
// there would need a native Swift/Objective-C window-level helper that
// can't be built or verified without a real Mac. Instead, keep the panel
// visible above normal windows and every Space/full-screen app, still
// fully click-through - the closest equivalent achievable without native
// platform code.
function makeFloatingEverywhere(): void {
  if (!overlayWindow) return
  overlayWindow.setAlwaysOnTop(true, 'floating')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}

export async function createOverlayWindow(): Promise<BrowserWindow> {
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
    // Not alwaysOnTop at creation on Windows: Chromium latches this as an
    // internal flag it actively re-enforces (see tryEmbedBehindDesktop).
    // Only the watchdog's give-up path turns it on, for the floating
    // fallback case. On mac/Linux we want it on top from the start.
    alwaysOnTop: !IS_WINDOWS,
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

  // Always click-through, with no exceptions: the overlay renders in
  // front of the desktop icons (Windows) or every other window (mac/
  // Linux) and spans the whole screen, so any hover-triggered
  // interactivity would capture clicks window-wide, not just over the
  // hovered note, and could make icons/windows underneath unreachable.
  // Read-only display only.
  overlayWindow.setIgnoreMouseEvents(true)

  if (IS_WINDOWS) {
    workerw = await import('../native/workerw')
  } else {
    makeFloatingEverywhere()
  }

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show()

    if (!IS_WINDOWS || !overlayWindow || !workerw) return

    workerw.forceShowWindow(overlayWindow.getNativeWindowHandle())

    // Electron's native show handling finishes asynchronously and can
    // clear WS_VISIBLE shortly after our own call succeeds - reassert a
    // couple more times right away so the window doesn't sit invisible
    // for a full watchdog interval before self-healing.
    for (const delayMs of [300, 1000, 2000]) {
      setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed() && workerw) {
          workerw.forceShowWindow(overlayWindow.getNativeWindowHandle())
        }
      }, delayMs)
    }
  })

  loadRendererPage(overlayWindow, 'overlay')

  screen.on('display-metrics-changed', repositionOverlay)
  screen.on('display-added', repositionOverlay)
  screen.on('display-removed', repositionOverlay)

  if (IS_WINDOWS) {
    tryEmbedBehindDesktop()
    startWatchdog()
  }

  return overlayWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function showOverlayWindow(): void {
  desiredVisible = true
  overlayWindow?.showInactive()
  if (IS_WINDOWS && overlayWindow && workerw) {
    workerw.forceShowWindow(overlayWindow.getNativeWindowHandle())
  }
}

export function hideOverlayWindow(): void {
  desiredVisible = false
  overlayWindow?.hide()
}
