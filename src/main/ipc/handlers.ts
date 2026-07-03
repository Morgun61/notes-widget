import { randomUUID } from 'crypto'
import { ipcMain } from 'electron'
import { CommandChannels, DataEventChannels, InternalChannels, OverlayChannels } from '../../shared/ipc-channels'
import type { AuthState } from '../../shared/types'
import { getDataWindow } from '../windows/dataWindow'
import { getMainWindow } from '../windows/mainWindow'
import { getOverlayWindow } from '../windows/overlayWindow'
import { updateTrayAuthState } from '../tray'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

const pending = new Map<string, PendingRequest>()

function relayToDataWindow(channel: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const dataWindow = getDataWindow()
    if (!dataWindow) {
      reject(new Error('Data window not ready'))
      return
    }
    const requestId = randomUUID()
    pending.set(requestId, { resolve, reject })
    dataWindow.webContents.send(InternalChannels.dataCommand, { requestId, channel, payload })
  })
}

export function sendCommandToDataWindow(channel: string, payload: unknown): Promise<unknown> {
  return relayToDataWindow(channel, payload)
}

export function registerIpcHandlers(): void {
  ipcMain.on(InternalChannels.dataCommandReply, (_event, message) => {
    const { requestId, ok, result, error } = message as {
      requestId: string
      ok: boolean
      result?: unknown
      error?: string
    }
    const req = pending.get(requestId)
    if (!req) return
    pending.delete(requestId)
    if (ok) req.resolve(result)
    else req.reject(new Error(error))
  })

  ipcMain.on(InternalChannels.dataEvent, (_event, message) => {
    const { channel, payload } = message as { channel: string; payload: unknown }
    if (channel === DataEventChannels.authChanged) {
      const state = payload as AuthState
      updateTrayAuthState(state)
      const overlay = getOverlayWindow()
      if (state.status === 'signedIn') {
        overlay?.showInactive()
      } else {
        overlay?.hide()
      }
    }
    getMainWindow()?.webContents.send(channel, payload)
    getOverlayWindow()?.webContents.send(channel, payload)
  })

  for (const channel of Object.values(CommandChannels)) {
    ipcMain.handle(channel, (_event, payload) => relayToDataWindow(channel, payload))
  }

  // The overlay is click-through by default (see overlayWindow.ts) so
  // desktop icons stay clickable underneath it. The renderer asks us to
  // temporarily disable that only while the mouse is actually over the
  // rendered notes panel, so scrolling/interacting with it works without
  // permanently blocking the rest of the desktop.
  ipcMain.on(OverlayChannels.setInteractive, (_event, interactive: boolean) => {
    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return
    if (interactive) {
      overlay.setIgnoreMouseEvents(false)
    } else {
      overlay.setIgnoreMouseEvents(true, { forward: true })
    }
  })
}
