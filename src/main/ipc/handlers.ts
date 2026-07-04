import { randomUUID } from 'crypto'
import { ipcMain, session } from 'electron'
import { CommandChannels, DataEventChannels, InternalChannels } from '../../shared/ipc-channels'
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

  // Signing out of Firebase doesn't touch the Google account session left
  // behind by the sign-in popup. That session isn't reliably confined to a
  // single cookie domain (accounts.google.com, google.com, etc. all hold
  // pieces of it, and it varies by region), so a domain-scoped cookie clear
  // still let "Sign in with Google" silently reuse the old session on some
  // platforms. A full session wipe is the only reliable fix - nothing else
  // in the app depends on Chromium-session-level storage surviving sign-out.
  //
  // Clearing storage alone isn't enough either: the data window's Firebase
  // SDK instance and the main/overlay windows' in-memory note list keep
  // running with whatever they already loaded, so the previous account's
  // notes stay on screen (a real privacy leak on a shared machine) until
  // something forces them to re-read state from scratch. Reloading all
  // three windows after the wipe is what actually forces that.
  ipcMain.handle(CommandChannels.authSignOut, async (_event, payload) => {
    const result = await relayToDataWindow(CommandChannels.authSignOut, payload)
    await session.defaultSession.clearStorageData()
    // Deferred to the next tick: this handler's reply still has to reach
    // the invoking renderer (mainWindow itself, most of the time). Reloading
    // mainWindow's webContents in the same tick raced with delivery of that
    // reply, sometimes tearing the page down mid-navigation and leaving it
    // in an inconsistent state (stale content, or storage clearing skipped).
    setImmediate(() => {
      getDataWindow()?.webContents.reload()
      getMainWindow()?.webContents.reload()
      getOverlayWindow()?.webContents.reload()
    })
    return result
  })

  for (const channel of Object.values(CommandChannels)) {
    if (channel === CommandChannels.authSignOut) continue
    ipcMain.handle(channel, (_event, payload) => relayToDataWindow(channel, payload))
  }
}
