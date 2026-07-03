import { createServer, Server } from 'http'
import { readFile } from 'fs/promises'
import { extname, join, normalize } from 'path'

// Firebase Auth (signInWithPopup/Google Sign-In) refuses to run on a
// file:// origin - "localhost" must be a real HTTP origin. In dev mode
// the Vite dev server already provides this; in production we serve the
// built renderer files ourselves on a loopback-only HTTP server so the
// windows load from http://localhost:<port> instead of file://.
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json'
}

let server: Server | null = null
let port = 0

// Fixed rather than OS-assigned (port 0): Firebase Auth's persisted
// session and Firestore's offline cache both live in IndexedDB, which is
// scoped to the page's origin (protocol+host+port). A random port would
// give every app launch a different origin, silently wiping that
// persistence and forcing a fresh login each time.
const FIXED_PORT = 51823

export function startRendererServer(rootDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
      const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
      const filePath = join(rootDir, safePath)

      readFile(filePath)
        .then((data) => {
          res.writeHead(200, {
            'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream'
          })
          res.end(data)
        })
        .catch(() => {
          res.writeHead(404)
          res.end('Not found')
        })
    })

    server.on('error', reject)
    server.listen(FIXED_PORT, '127.0.0.1', () => {
      const address = server?.address()
      port = typeof address === 'object' && address ? address.port : 0
      resolve(port)
    })
  })
}

export function getRendererServerPort(): number {
  return port
}
