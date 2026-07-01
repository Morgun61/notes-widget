import { contextBridge, ipcRenderer } from 'electron'
import type { AuthState, Note } from '../shared/types'

// Sandboxed preload scripts cannot `require()` bundler-generated shared
// chunks, so these channel names are duplicated from shared/ipc-channels.ts
// instead of imported, keeping this preload file fully self-contained.
const DataEventChannels = {
  authChanged: 'data:authChanged',
  notesChanged: 'data:notesChanged'
} as const

const api = {
  onAuthChanged: (callback: (state: AuthState) => void): void => {
    ipcRenderer.on(DataEventChannels.authChanged, (_event, state: AuthState) => callback(state))
  },
  onNotesChanged: (callback: (notes: Note[]) => void): void => {
    ipcRenderer.on(DataEventChannels.notesChanged, (_event, notes: Note[]) => callback(notes))
  }
}

export type OverlayBridgeApi = typeof api

contextBridge.exposeInMainWorld('overlayBridge', api)
