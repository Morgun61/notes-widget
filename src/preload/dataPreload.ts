import { contextBridge, ipcRenderer } from 'electron'

// Sandboxed preload scripts cannot `require()` bundler-generated shared
// chunks, so these channel names are duplicated from shared/ipc-channels.ts
// instead of imported, keeping this preload file fully self-contained.
const InternalChannels = {
  dataEvent: 'data:event',
  dataCommand: 'data:command',
  dataCommandReply: 'data:commandReply'
} as const

type CommandHandler = (channel: string, payload: unknown) => Promise<unknown>

const api = {
  emit: (channel: string, payload: unknown): void => {
    ipcRenderer.send(InternalChannels.dataEvent, { channel, payload })
  },
  onCommand: (handler: CommandHandler): void => {
    ipcRenderer.on(InternalChannels.dataCommand, (_event, message) => {
      const { requestId, channel, payload } = message as {
        requestId: string
        channel: string
        payload: unknown
      }
      handler(channel, payload)
        .then((result) => {
          ipcRenderer.send(InternalChannels.dataCommandReply, { requestId, ok: true, result })
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          ipcRenderer.send(InternalChannels.dataCommandReply, { requestId, ok: false, error: message })
        })
    })
  }
}

export type DataBridgeApi = typeof api

contextBridge.exposeInMainWorld('dataBridge', api)
