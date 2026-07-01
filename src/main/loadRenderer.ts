import { BrowserWindow } from 'electron'
import { getRendererServerPort } from './localServer'

// In dev, the Vite dev server already serves over http://localhost - load
// straight from it. In production, load from our own loopback server
// (see localServer.ts) instead of loadFile()/file://, since Firebase Auth
// (Google Sign-In) rejects a file:// origin.
export function loadRendererPage(win: BrowserWindow, page: string): void {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    win.loadURL(`${rendererUrl}/${page}/index.html`)
  } else {
    win.loadURL(`http://localhost:${getRendererServerPort()}/${page}/index.html`)
  }
}
