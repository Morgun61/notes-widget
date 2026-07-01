import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { CommandChannels } from '../shared/ipc-channels'
import type { AuthState } from '../shared/types'
import { appState } from './appState'
import { getAutostartEnabled, setAutostartEnabled } from './autostart'
import { getMainWindow } from './windows/mainWindow'

let tray: Tray | null = null
let signedIn = false

function getTrayIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'tray-icon.png')
  }
  return join(__dirname, '../../build/tray-icon.png')
}

function rebuildMenu(): void {
  if (!tray) return

  const menu = Menu.buildFromTemplate([
    {
      label: 'Notlari Goster',
      click: () => {
        const win = getMainWindow()
        win?.show()
        win?.focus()
      }
    },
    {
      label: 'Windows ile Baslat',
      type: 'checkbox',
      checked: getAutostartEnabled(),
      click: (menuItem) => setAutostartEnabled(menuItem.checked)
    },
    { type: 'separator' },
    {
      label: 'Cikis Yap',
      enabled: signedIn,
      click: () => {
        import('./ipc/handlers').then(({ sendCommandToDataWindow }) => {
          sendCommandToDataWindow(CommandChannels.authSignOut, undefined).catch(() => {})
        })
      }
    },
    { type: 'separator' },
    {
      label: 'Uygulamadan Cik',
      click: () => {
        appState.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)
}

export function createTray(): Tray {
  const icon = nativeImage.createFromPath(getTrayIconPath())
  tray = new Tray(icon)
  tray.setToolTip('Notes Widget')

  tray.on('click', () => {
    const win = getMainWindow()
    win?.show()
    win?.focus()
  })

  rebuildMenu()
  return tray
}

export function updateTrayAuthState(state: AuthState): void {
  signedIn = state.status === 'signedIn'
  rebuildMenu()
}
