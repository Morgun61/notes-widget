import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

function promptToInstall(): void {
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Guncelleme hazir',
      message: 'Yeni bir surum indirildi. Simdi yeniden baslatilsin mi?',
      buttons: ['Simdi yeniden baslat', 'Daha sonra'],
      defaultId: 0,
      cancelId: 1
    })
    .then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall()
    })
}

// electron-updater has no update feed in dev (no packaged app, no
// published release to compare against) and errors immediately if run
// there - only ever wire this up for a packaged build.
export function initAutoUpdate(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', promptToInstall)
  autoUpdater.on('error', (err) => {
    console.error('[autoUpdate] error:', err)
  })

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[autoUpdate] initial checkForUpdates failed:', err)
  })

  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[autoUpdate] periodic checkForUpdates failed:', err)
    })
  }, CHECK_INTERVAL_MS)
}
