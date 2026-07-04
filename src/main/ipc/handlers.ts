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

  // Signing out of Firebase doesn't touch the Google account cookies left
  // behind by the sign-in popup - without clearing them, the next "Sign in
  // with Google" silently re-authenticates as the same account instead of
  // asking for credentials again.
  ipcMain.handle(CommandChannels.authSignOut, async (_event, payload) => {
    const result = await relayToDataWindow(CommandChannels.authSignOut, payload)
    const googleCookies = await session.defaultSession.cookies.get({ domain: 'google.com' })
    await Promise.all(
      googleCookies.map((cookie) =>
        session.defaultSession.cookies.remove(
          `https://${(cookie.domain ?? 'google.com').replace(/^\./, '')}${cookie.path ?? '/'}`,
          cookie.name
        )
      )
    )
    await session.defaultSession.clearStorageData({ origin: 'https://accounts.google.com' })
    return result
  })

  for (const channel of Object.values(CommandChannels)) {
    if (channel === CommandChannels.authSignOut) continue
    ipcMain.handle(channel, (_event, payload) => relayToDataWindow(channel, payload))
  }
}
