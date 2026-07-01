import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          mainPreload: resolve(__dirname, 'src/preload/mainPreload.ts'),
          dataPreload: resolve(__dirname, 'src/preload/dataPreload.ts'),
          overlayPreload: resolve(__dirname, 'src/preload/overlayPreload.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          'main-window': resolve(__dirname, 'src/renderer/main-window/index.html'),
          data: resolve(__dirname, 'src/renderer/data/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay/index.html')
        }
      }
    }
  }
})
