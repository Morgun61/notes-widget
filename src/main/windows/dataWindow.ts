import { BrowserWindow } from 'electron'
import { join } from 'path'
import { loadRendererPage } from '../loadRenderer'

let dataWindow: BrowserWindow | null = null

export function createDataWindow(): BrowserWindow {
  dataWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/dataPreload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  // Google Sign-In opens an OAuth popup via window.open(); allow it to
  // appear as a normal visible window even though dataWindow itself is hidden.
  dataWindow.webContents.setWindowOpenHandler(() => ({ action: 'allow' }))

  loadRendererPage(dataWindow, 'data')

  return dataWindow
}

export function getDataWindow(): BrowserWindow | null {
  return dataWindow
}
