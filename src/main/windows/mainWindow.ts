import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { appState } from '../appState'
import { loadRendererPage } from '../loadRenderer'

let mainWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/mainPreload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Behave like a tray app: closing the window hides it instead of quitting.
  // Only the tray's "Uygulamadan Cik" (or OS shutdown) actually quits.
  mainWindow.on('close', (event) => {
    if (!appState.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererPage(mainWindow, 'main-window')

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
