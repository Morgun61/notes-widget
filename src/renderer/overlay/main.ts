import type { AuthState, Note } from '../../shared/types'

export {}

interface OverlayBridgeApi {
  onAuthChanged: (callback: (state: AuthState) => void) => void
  onNotesChanged: (callback: (notes: Note[]) => void) => void
}

declare global {
  interface Window {
    overlayBridge: OverlayBridgeApi
  }
}

const listEl = document.getElementById('notes-list') as HTMLUListElement

function render(notes: Note[]): void {
  listEl.innerHTML = ''

  if (notes.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = 'Henuz not yok'
    listEl.append(li)
    return
  }

  for (const note of notes) {
    const li = document.createElement('li')
    if (note.done) li.classList.add('done')
    if (note.pinned) {
      const pin = document.createElement('span')
      pin.className = 'pin'
      pin.textContent = '★'
      li.append(pin)
    }
    li.append(document.createTextNode(note.text))
    listEl.append(li)
  }
}

window.overlayBridge.onNotesChanged(render)
