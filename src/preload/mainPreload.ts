import { contextBridge, ipcRenderer } from 'electron'
import type { AuthState, Note } from '../shared/types'

// Sandboxed preload scripts cannot `require()` bundler-generated shared
// chunks, so these channel names are duplicated from shared/ipc-channels.ts
// instead of imported, keeping this preload file fully self-contained.
const CommandChannels = {
  authSignIn: 'cmd:auth:signIn',
  authSignUp: 'cmd:auth:signUp',
  authSignInGoogle: 'cmd:auth:signInGoogle',
  authSignOut: 'cmd:auth:signOut',
  notesAdd: 'cmd:notes:add',
  notesUpdate: 'cmd:notes:update',
  notesDelete: 'cmd:notes:delete'
} as const

const DataEventChannels = {
  authChanged: 'data:authChanged',
  notesChanged: 'data:notesChanged'
} as const

const api = {
  auth: {
    signIn: (email: string, password: string): Promise<void> =>
      ipcRenderer.invoke(CommandChannels.authSignIn, { email, password }),
    signUp: (email: string, password: string): Promise<void> =>
      ipcRenderer.invoke(CommandChannels.authSignUp, { email, password }),
    signInGoogle: (): Promise<void> => ipcRenderer.invoke(CommandChannels.authSignInGoogle),
    signOut: (): Promise<void> => ipcRenderer.invoke(CommandChannels.authSignOut),
    onChanged: (callback: (state: AuthState) => void): void => {
      ipcRenderer.on(DataEventChannels.authChanged, (_event, state: AuthState) => callback(state))
    }
  },
  notes: {
    add: (text: string, order: number): Promise<void> =>
      ipcRenderer.invoke(CommandChannels.notesAdd, { text, order }),
    update: (id: string, fields: Partial<Pick<Note, 'text' | 'done' | 'pinned' | 'order'>>): Promise<void> =>
      ipcRenderer.invoke(CommandChannels.notesUpdate, { id, ...fields }),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(CommandChannels.notesDelete, { id }),
    onChanged: (callback: (notes: Note[]) => void): void => {
      ipcRenderer.on(DataEventChannels.notesChanged, (_event, notes: Note[]) => callback(notes))
    }
  }
}

export type NotesWidgetApi = typeof api

contextBridge.exposeInMainWorld('notesWidget', api)
